import "server-only";

import { lateEntryFor, localDateInTimezone } from "@/lib/domain/dates";
import {
  createAuditHash,
  createRevisionHash,
  id,
} from "@/lib/domain/integrity";
import type {
  Appointment,
  Attachment,
  AuditEvent,
  CareEntry,
  DailyLog,
  Incident,
  Member,
  PurgeTombstone,
  RecordRevision,
  RecordType,
  ReportSnapshot,
  SettingsData,
} from "@/lib/domain/types";
import type {
  AppointmentInput,
  CareEntryCorrectionInput,
  CareEntryInput,
  CorrectionInput,
  IncidentInput,
  ReportInput,
  WorkspaceSettingsInput,
} from "@/lib/domain/schemas";
import { createSeedState, type ParentingState } from "./seed";
import {
  createNextRoutineItems,
  recordPayload,
  requireOwner,
  toTimelineItems,
} from "./helpers";
import type {
  ParentingRepository,
  RecordBundle,
  ReportSource,
  RequestContext,
} from "./repository";
import type { Identity } from "@/lib/auth/identity";

declare global {
  var __parentingLogState: ParentingState | undefined;
}

function state(): ParentingState {
  globalThis.__parentingLogState ??= createSeedState(true);
  return globalThis.__parentingLogState;
}

function latestTemplate(data: ParentingState) {
  return [...data.templates].sort((a, b) => b.version - a.version)[0];
}

function ensureDailyLog(data: ParentingState, date: string): DailyLog {
  const existing = data.dailyLogs.find((log) => log.localDate === date);
  const latestVersion = latestTemplate(data).version;
  if (existing) {
    const hasEntries = data.careEntries.some((entry) => entry.dailyLogId === existing.id);
    if (existing.status === "open" && !hasEntries) {
      existing.templateVersion = latestVersion;
    }
    return existing;
  }
  const created: DailyLog = {
    id: id("daily"),
    workspaceId: data.workspace.id,
    localDate: date,
    templateVersion: latestVersion,
    status: "open",
  };
  data.dailyLogs.push(created);
  return created;
}

function findRecord(data: ParentingState, type: RecordType, recordId: string) {
  if (type === "care_entry")
    return data.careEntries.find((item) => item.id === recordId);
  if (type === "appointment")
    return data.appointments.find((item) => item.id === recordId);
  return data.incidents.find((item) => item.id === recordId);
}

export class MemoryParentingRepository implements ParentingRepository {
  async resolveContext(identity: Identity): Promise<RequestContext> {
    const data = state();
    const member =
      data.members.find(
        (item) =>
          item.status === "active" &&
          (item.authUserId === identity.authUserId ||
            item.email.toLowerCase() === identity.email.toLowerCase()),
      ) ?? data.members.find((item) => item.role === "owner" && item.status === "active");
    if (!member) throw new Error("FORBIDDEN");
    const owner = data.members.find(
      (item) => item.id === data.workspace.ownerId && item.status === "active",
    );
    if (!owner?.authUserId) throw new Error("BILLING_OWNER_REQUIRED");
    return {
      identity,
      workspace: data.workspace,
      member,
      billingOwnerAuthUserId: owner.authUserId,
    };
  }

  async getDashboard(context: RequestContext, date: string) {
    const data = state();
    const dailyLog = ensureDailyLog(data, date);
    const template =
      data.templates.find((item) => item.version === dailyLog.templateVersion) ??
      latestTemplate(data);
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const tasks = template.items
      .filter((item) => item.active && item.weekdays.includes(weekday))
      .map((item) => ({
        ...item,
        entry: data.careEntries
          .filter((entry) => entry.dailyLogId === dailyLog.id)
          .find((entry) => entry.templateItemId === item.id),
      }));
    const completed = tasks.filter(
      (task) => task.entry?.status === "completed" || task.entry?.status === "not_applicable",
    ).length;

    return {
      workspace: context.workspace,
      member: context.member,
      date,
      dailyLog,
      children: data.children.filter((child) => child.active),
      caregivers: data.caregivers.filter((caregiver) => caregiver.active),
      tasks,
      completion: {
        completed,
        total: tasks.length,
        percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
      },
      recentEntries: data.careEntries
        .filter((entry) => entry.dailyLogId === dailyLog.id)
        .sort(
          (a, b) =>
            new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        ),
    };
  }

  async getTimeline(context: RequestContext) {
    const data = state();
    const visibleEntries =
      context.member.role === "reviewer"
        ? data.careEntries.filter((entry) =>
            data.dailyLogs.some(
              (log) => log.id === entry.dailyLogId && log.status === "finalized",
            ),
          )
        : data.careEntries;
    const visibleRecordIds = new Set([
      ...visibleEntries.map((entry) => entry.id),
      ...data.appointments.map((appointment) => appointment.id),
      ...data.incidents.map((incident) => incident.id),
    ]);
    return {
      workspace: context.workspace,
      children: data.children,
      caregivers: data.caregivers.filter((caregiver) => caregiver.active),
      items: toTimelineItems({
        entries: visibleEntries,
        appointments: data.appointments,
        incidents: data.incidents,
      }),
      attachments: data.attachments.filter((attachment) =>
        visibleRecordIds.has(attachment.recordId),
      ),
      revisions: data.revisions.filter((revision) =>
        visibleRecordIds.has(revision.recordId),
      ),
    };
  }

  async getAppointments() {
    return [...state().appointments].sort(
      (a, b) =>
        new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
    );
  }

  async getIncidents() {
    return [...state().incidents].sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  }

  async getReports() {
    return [...state().reports].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async getSettings(context: RequestContext): Promise<SettingsData> {
    const data = state();
    return {
      workspace: context.workspace,
      members: data.members,
      children: data.children.filter((child) => child.active),
      caregivers: data.caregivers,
      template: latestTemplate(data),
    };
  }

  async getRecordBundle(
    context: RequestContext,
    recordType: RecordType,
    recordId: string,
  ): Promise<RecordBundle | null> {
    const data = state();
    const record = findRecord(data, recordType, recordId);
    if (!record) return null;
    if (
      context.member.role === "reviewer" &&
      recordType === "care_entry" &&
      !data.dailyLogs.some(
        (log) => log.id === (record as CareEntry).dailyLogId && log.status === "finalized",
      )
    ) {
      return null;
    }
    return {
      record,
      revisions: data.revisions
        .filter(
          (revision) =>
            revision.recordType === recordType && revision.recordId === recordId,
        )
        .sort((a, b) => a.revisionNumber - b.revisionNumber),
      attachments: data.attachments.filter(
        (attachment) =>
          attachment.recordType === recordType && attachment.recordId === recordId,
      ),
    };
  }

  async getReportSource(
    _context: RequestContext,
    reportId: string,
  ): Promise<ReportSource | null> {
    const data = state();
    const snapshot = data.reports.find((report) => report.id === reportId);
    if (!snapshot) return null;
    const from = new Date(`${snapshot.filters.from}T00:00:00`).getTime();
    const to = new Date(`${snapshot.filters.to}T23:59:59.999`).getTime();
    const inRange = (value: string) => {
      const time = new Date(value).getTime();
      return time >= from && time <= to;
    };
    const includesChildren = (childIds: string[]) =>
      snapshot.filters.childIds.length === 0 ||
      childIds.some((childId) => snapshot.filters.childIds.includes(childId));
    return {
      snapshot,
      workspace: data.workspace,
      children: data.children,
      caregivers: data.caregivers,
      entries: snapshot.filters.includeCare
        ? data.careEntries.filter(
            (entry) => inRange(entry.occurredAt) && includesChildren(entry.childIds),
          )
        : [],
      appointments: snapshot.filters.includeAppointments
        ? data.appointments.filter(
            (item) => inRange(item.scheduledAt) && includesChildren(item.childIds),
          )
        : [],
      incidents: snapshot.filters.includeIncidents
        ? data.incidents.filter(
            (item) => inRange(item.occurredAt) && includesChildren(item.childIds),
          )
        : [],
      revisions: data.revisions.filter((revision) =>
        snapshot.recordRevisionIds.includes(revision.id),
      ),
      attachments: data.attachments.filter((attachment) =>
        snapshot.attachmentIds.includes(attachment.id),
      ),
    };
  }

  async createCareEntry(context: RequestContext, input: CareEntryInput) {
    requireOwner(context.member.role);
    const data = state();
    const recordedAt = new Date().toISOString();
    const dailyLog = ensureDailyLog(data, input.localDate);
    const recordId = id("care");
    const payload: Record<string, unknown> = { ...input };
    const revision = this.createRevision(
      data,
      "care_entry",
      recordId,
      payload,
      context.member.id,
      recordedAt,
    );
    const entry: CareEntry = {
      id: recordId,
      workspaceId: data.workspace.id,
      dailyLogId: dailyLog.id,
      templateItemId: input.templateItemId,
      taskKey: input.taskKey,
      taskLabel: input.taskLabel,
      childIds: input.childIds,
      caregiverIds: input.caregiverIds,
      status: input.status,
      occurredAt: new Date(input.occurredAt).toISOString(),
      recordedAt,
      durationMinutes: input.durationMinutes,
      activityType: input.activityType,
      notes: input.notes,
      currentRevisionId: revision.id,
      createdBy: context.member.id,
      lateEntry:
        lateEntryFor(input.occurredAt, recordedAt) ||
        input.localDate < localDateInTimezone(new Date(recordedAt), context.workspace.timezone),
    };
    data.careEntries.push(entry);
    await this.audit(context, "created", "care_entry", entry.id);
    return entry;
  }

  async correctCareEntry(context: RequestContext, input: CareEntryCorrectionInput) {
    requireOwner(context.member.role);
    const data = state();
    const entry = data.careEntries.find((item) => item.id === input.recordId);
    if (!entry) throw new Error("NOT_FOUND");
    if (entry.taskKey === "time_together" && !input.durationMinutes) {
      throw new Error("DURATION_REQUIRED");
    }
    const previous = data.revisions.find(
      (revision) => revision.id === entry.currentRevisionId,
    );
    if (!previous) throw new Error("REVISION_NOT_FOUND");

    const recordedAt = new Date().toISOString();
    const occurredAt = new Date(input.occurredAt).toISOString();
    const { reason } = input;
    const correction = {
      childIds: input.childIds,
      caregiverIds: input.caregiverIds,
      status: input.status,
      durationMinutes: input.durationMinutes,
      activityType: input.activityType,
      notes: input.notes,
    };
    const payload = { ...recordPayload(entry), ...correction, occurredAt };
    const revision: RecordRevision = {
      id: id("rev"),
      workspaceId: data.workspace.id,
      recordType: "care_entry",
      recordId: entry.id,
      previousRevisionId: previous.id,
      revisionNumber: previous.revisionNumber + 1,
      payload,
      reason,
      authorId: context.member.id,
      recordedAt,
      hash: createRevisionHash({
        payload,
        previousHash: previous.hash,
        authorId: context.member.id,
        recordedAt,
      }),
    };

    data.revisions.push(revision);
    Object.assign(entry, correction, {
      occurredAt,
      currentRevisionId: revision.id,
      lateEntry: entry.lateEntry || lateEntryFor(occurredAt, entry.recordedAt),
    });
    await this.audit(
      context,
      "corrected",
      "care_entry",
      entry.id,
      { revisionNumber: revision.revisionNumber },
      previous.hash,
    );
    return revision;
  }

  async createAppointment(context: RequestContext, input: AppointmentInput) {
    requireOwner(context.member.role);
    const data = state();
    const recordedAt = new Date().toISOString();
    const recordId = id("appointment");
    const payload: Record<string, unknown> = { ...input };
    const revision = this.createRevision(
      data,
      "appointment",
      recordId,
      payload,
      context.member.id,
      recordedAt,
    );
    const appointment: Appointment = {
      id: recordId,
      workspaceId: data.workspace.id,
      ...input,
      arrivedAt: input.arrivedAt || undefined,
      scheduledAt: new Date(input.scheduledAt).toISOString(),
      recordedAt,
      currentRevisionId: revision.id,
      createdBy: context.member.id,
    };
    data.appointments.push(appointment);
    await this.audit(context, "created", "appointment", appointment.id);
    return appointment;
  }

  async createIncident(context: RequestContext, input: IncidentInput) {
    requireOwner(context.member.role);
    const data = state();
    const recordedAt = new Date().toISOString();
    const recordId = id("incident");
    const payload: Record<string, unknown> = { ...input };
    const revision = this.createRevision(
      data,
      "incident",
      recordId,
      payload,
      context.member.id,
      recordedAt,
    );
    const incident: Incident = {
      id: recordId,
      workspaceId: data.workspace.id,
      ...input,
      occurredAt: new Date(input.occurredAt).toISOString(),
      discoveredAt: input.discoveredAt
        ? new Date(input.discoveredAt).toISOString()
        : undefined,
      recordedAt,
      currentRevisionId: revision.id,
      createdBy: context.member.id,
    };
    data.incidents.push(incident);
    await this.audit(context, "created", "incident", incident.id);
    return incident;
  }

  async correctRecord(context: RequestContext, input: CorrectionInput) {
    requireOwner(context.member.role);
    const data = state();
    const record = findRecord(data, input.recordType, input.recordId);
    if (!record) throw new Error("NOT_FOUND");
    const previous = data.revisions.find(
      (revision) => revision.id === record.currentRevisionId,
    );
    if (!previous) throw new Error("REVISION_NOT_FOUND");
    const recordedAt = new Date().toISOString();
    const payload = {
      ...recordPayload(record),
      [input.recordType === "incident" ? "observations" : "notes"]:
        input.correctedText,
    };
    const revision: RecordRevision = {
      id: id("rev"),
      workspaceId: data.workspace.id,
      recordType: input.recordType,
      recordId: input.recordId,
      previousRevisionId: previous.id,
      revisionNumber: previous.revisionNumber + 1,
      payload,
      reason: input.reason,
      authorId: context.member.id,
      recordedAt,
      hash: createRevisionHash({
        payload,
        previousHash: previous.hash,
        authorId: context.member.id,
        recordedAt,
      }),
    };
    data.revisions.push(revision);
    record.currentRevisionId = revision.id;
    if (input.recordType === "incident") {
      (record as Incident).observations = input.correctedText;
    } else {
      (record as CareEntry | Appointment).notes = input.correctedText;
    }
    await this.audit(context, "corrected", input.recordType, input.recordId, {
      revisionNumber: revision.revisionNumber,
    }, previous.hash);
    return revision;
  }

  async finalizeDailyLog(context: RequestContext, localDate: string) {
    requireOwner(context.member.role);
    const data = state();
    const log = ensureDailyLog(data, localDate);
    if (log.status === "finalized") return log;
    log.status = "finalized";
    log.finalizedAt = new Date().toISOString();
    log.finalizedBy = context.member.id;
    await this.audit(context, "finalized", "daily_log", log.id);
    return log;
  }

  async createReport(context: RequestContext, input: ReportInput) {
    requireOwner(context.member.role);
    const data = state();
    const revisionIds = data.revisions
      .filter((revision) => {
        const record = findRecord(data, revision.recordType, revision.recordId);
        if (!record) return false;
        const when =
          "occurredAt" in record
            ? record.occurredAt
            : (record as Appointment).scheduledAt;
        const date = when.slice(0, 10);
        const includedType =
          (revision.recordType === "care_entry" && input.includeCare) ||
          (revision.recordType === "appointment" && input.includeAppointments) ||
          (revision.recordType === "incident" && input.includeIncidents);
        const finalizedCare =
          revision.recordType !== "care_entry" ||
          (record &&
            "dailyLogId" in record &&
            data.dailyLogs.some(
              (log) => log.id === record.dailyLogId && log.status === "finalized",
            ));
        const childIds = record.childIds;
        return (
          includedType &&
          finalizedCare &&
          date >= input.from &&
          date <= input.to &&
          (input.childIds.length === 0 ||
            childIds.some((childId) => input.childIds.includes(childId)))
        );
      })
      .map((revision) => revision.id);
    const attachments = data.attachments.filter((attachment) =>
      revisionIds.includes(attachment.revisionId),
    );
    const report: ReportSnapshot = {
      id: id("report"),
      workspaceId: data.workspace.id,
      createdBy: context.member.id,
      createdAt: new Date().toISOString(),
      status: "pending",
      filters: input,
      recordRevisionIds: revisionIds,
      attachmentIds: attachments.map((attachment) => attachment.id),
    };
    data.reports.push(report);
    return report;
  }

  async markReportReady(
    context: RequestContext,
    reportId: string,
    artifacts: {
      manifestHash: string;
      pdfPathname: string;
      zipPathname: string;
      workflowRunId?: string;
    },
  ) {
    const report = state().reports.find((item) => item.id === reportId);
    if (!report) throw new Error("NOT_FOUND");
    Object.assign(report, artifacts, { status: "ready" as const });
    await this.audit(context, "report_generated", "report", reportId);
  }

  async markReportFailed(
    _context: RequestContext,
    reportId: string,
    error: string,
  ) {
    const report = state().reports.find((item) => item.id === reportId);
    if (!report) throw new Error("NOT_FOUND");
    Object.assign(report, { status: "failed" as const, error });
  }

  async updateSettings(
    context: RequestContext,
    input: WorkspaceSettingsInput,
  ) {
    requireOwner(context.member.role);
    const data = state();
    data.workspace.name = input.name;
    data.workspace.timezone = input.timezone;
    data.workspace.hardDeleteEnabled = input.hardDeleteEnabled;
    data.workspace.updatedAt = new Date().toISOString();
    const activeChildIds = new Set(input.children.map((child) => child.id));
    for (const child of data.children) {
      if (!activeChildIds.has(child.id)) child.active = false;
    }
    const childColors = ["sage", "blue", "amber", "violet"] as const;
    for (const [index, childInput] of input.children.entries()) {
      const child = data.children.find((item) => item.id === childInput.id);
      if (child) {
        child.displayName = childInput.displayName;
        child.birthdate = childInput.birthdate;
        child.active = true;
        child.sortOrder = index + 1;
      } else {
        data.children.push({
          id: childInput.id,
          workspaceId: data.workspace.id,
          displayName: childInput.displayName,
          birthdate: childInput.birthdate,
          color: childColors[index % childColors.length],
          active: true,
          sortOrder: index + 1,
        });
      }
    }
    for (const caregiverInput of input.caregivers) {
      if (caregiverInput.id) {
        const caregiver = data.caregivers.find(
          (item) =>
            item.id === caregiverInput.id &&
            item.workspaceId === context.workspace.id,
        );
        if (!caregiver) throw new Error("INVALID_CAREGIVER");
        caregiver.displayName = caregiverInput.displayName;
        caregiver.relationship = caregiverInput.relationship;
      } else {
        data.caregivers.push({
          id: id("caregiver"),
          workspaceId: context.workspace.id,
          displayName: caregiverInput.displayName,
          relationship: caregiverInput.relationship,
          isOwner: false,
          active: true,
        });
      }
    }
    const currentTemplate = latestTemplate(data);
    const nextItems = createNextRoutineItems(currentTemplate.items, input.routineItems);
    const templateChanged = JSON.stringify(nextItems) !== JSON.stringify(currentTemplate.items);
    if (templateChanged) {
      const effectiveFrom = localDateInTimezone(new Date(), data.workspace.timezone);
      const nextTemplate = {
        ...currentTemplate,
        id: id("template"),
        version: currentTemplate.version + 1,
        effectiveFrom,
        createdAt: new Date().toISOString(),
        items: nextItems,
      };
      data.templates.push(nextTemplate);
      const todayLog = data.dailyLogs.find(
        (log) => log.localDate === effectiveFrom && log.status === "open",
      );
      if (todayLog) todayLog.templateVersion = nextTemplate.version;
    }
    await this.audit(context, "settings_changed", "workspace", data.workspace.id);
    context.workspace = data.workspace;
    return this.getSettings(context);
  }

  async inviteReviewer(
    context: RequestContext,
    input: { email: string; displayName: string },
  ) {
    requireOwner(context.member.role);
    const data = state();
    const existing = data.members.find(
      (member) => member.email.toLowerCase() === input.email.toLowerCase(),
    );
    if (existing && existing.status !== "revoked") throw new Error("ALREADY_INVITED");
    const member: Member = existing ?? {
      id: id("member"),
      workspaceId: data.workspace.id,
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      role: "reviewer",
      status: "invited",
      invitedAt: new Date().toISOString(),
    };
    member.status = "invited";
    member.invitedAt = new Date().toISOString();
    if (!existing) data.members.push(member);
    await this.audit(context, "invited", "member", member.id);
    return member;
  }

  async revokeReviewer(context: RequestContext, memberId: string) {
    requireOwner(context.member.role);
    const member = state().members.find((item) => item.id === memberId);
    if (!member || member.role !== "reviewer") throw new Error("NOT_FOUND");
    member.status = "revoked";
    await this.audit(context, "revoked", "member", member.id);
  }

  async hardPurge(
    context: RequestContext,
    input: { recordType: RecordType; recordId: string; reason: string },
  ) {
    requireOwner(context.member.role);
    const data = state();
    if (!data.workspace.hardDeleteEnabled) throw new Error("HARD_DELETE_DISABLED");
    const bundle = await this.getRecordBundle(context, input.recordType, input.recordId);
    if (!bundle) throw new Error("NOT_FOUND");
    const priorHashes = bundle.revisions.map((revision) => revision.hash);
    const revisionIds = bundle.revisions.map((revision) => revision.id);
    const attachmentIds = bundle.attachments.map((attachment) => attachment.id);
    data.careEntries = data.careEntries.filter((item) => item.id !== input.recordId);
    data.appointments = data.appointments.filter((item) => item.id !== input.recordId);
    data.incidents = data.incidents.filter((item) => item.id !== input.recordId);
    data.revisions = data.revisions.filter(
      (revision) => !revisionIds.includes(revision.id),
    );
    data.attachments = data.attachments.filter(
      (attachment) => !attachmentIds.includes(attachment.id),
    );
    data.reports = data.reports.filter(
      (report) =>
        !report.recordRevisionIds.some((revisionId) => revisionIds.includes(revisionId)),
    );
    const tombstone: PurgeTombstone = {
      id: id("purge"),
      workspaceId: data.workspace.id,
      recordType: input.recordType,
      recordId: input.recordId,
      priorHashes,
      reason: input.reason,
      purgedBy: context.member.id,
      purgedAt: new Date().toISOString(),
    };
    data.tombstones.push(tombstone);
    await this.audit(context, "purged", input.recordType, input.recordId, {
      revisionCount: revisionIds.length,
      attachmentCount: attachmentIds.length,
    });
    return tombstone;
  }

  async addAttachment(context: RequestContext, attachment: Attachment) {
    requireOwner(context.member.role);
    state().attachments.push(attachment);
    await this.audit(context, "created", "attachment", attachment.id);
  }

  async getAttachment(
    context: RequestContext,
    attachmentId: string,
  ): Promise<Attachment | null> {
    const data = state();
    const attachment = data.attachments.find((item) => item.id === attachmentId);
    if (!attachment) return null;
    if (context.member.role === "reviewer" && attachment.recordType === "care_entry") {
      const entry = data.careEntries.find((item) => item.id === attachment.recordId);
      const finalized = entry && data.dailyLogs.some(
        (log) => log.id === entry.dailyLogId && log.status === "finalized",
      );
      if (!finalized) return null;
    }
    return attachment;
  }

  async recordAuditEvent(
    context: RequestContext,
    event: Omit<AuditEvent, "id" | "workspaceId" | "occurredAt" | "eventHash">,
  ) {
    await this.audit(
      context,
      event.action,
      event.targetType,
      event.targetId,
      event.metadata,
      event.previousHash,
    );
  }

  private createRevision(
    data: ParentingState,
    recordType: RecordType,
    recordId: string,
    payload: Record<string, unknown>,
    authorId: string,
    recordedAt: string,
  ) {
    const revision: RecordRevision = {
      id: id("rev"),
      workspaceId: data.workspace.id,
      recordType,
      recordId,
      revisionNumber: 1,
      payload,
      reason: "Initial record",
      authorId,
      recordedAt,
      hash: createRevisionHash({ payload, authorId, recordedAt }),
    };
    data.revisions.push(revision);
    return revision;
  }

  private async audit(
    context: RequestContext,
    action: AuditEvent["action"],
    targetType: string,
    targetId: string,
    metadata?: Record<string, string | number | boolean>,
    previousHash?: string,
  ) {
    const data = state();
    const occurredAt = new Date().toISOString();
    const last = data.auditEvents.at(-1);
    const base = {
      actorId: context.member.id,
      action,
      targetType,
      targetId,
      occurredAt,
      metadata,
    };
    data.auditEvents.push({
      id: id("audit"),
      workspaceId: data.workspace.id,
      ...base,
      previousHash: previousHash ?? last?.eventHash,
      eventHash: createAuditHash({
        event: base,
        previousHash: previousHash ?? last?.eventHash,
      }),
    });
  }
}

export function resetMemoryRepository(): void {
  globalThis.__parentingLogState = createSeedState(true);
}
