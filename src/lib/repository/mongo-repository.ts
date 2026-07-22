import "server-only";

import type { ClientSession, Collection, Document } from "mongodb";

import { collection, ensureMongoIndexes, getMongoClient } from "@/lib/db/mongodb";
import { lateEntryFor, localDateInTimezone } from "@/lib/domain/dates";
import { createAuditHash, createRevisionHash, id } from "@/lib/domain/integrity";
import type {
  Appointment,
  Attachment,
  AuditEvent,
  CareEntry,
  Caregiver,
  Child,
  DailyLog,
  Incident,
  Member,
  PurgeTombstone,
  RecordRevision,
  RecordType,
  ReportSnapshot,
  RoutineTemplate,
  SettingsData,
  Workspace,
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
import type { Identity } from "@/lib/auth/identity";
import { createSeedState } from "./seed";
import {
  createNextRoutineItems,
  recordPayload,
  requireOwner,
  toTimelineItems,
} from "./helpers";
import { toPlainData } from "./to-plain-data";
import type {
  ParentingRepository,
  RecordBundle,
  ReportSource,
  RequestContext,
} from "./repository";

type AppDocument<T> = T & Document;

async function col<T>(name: string): Promise<Collection<AppDocument<T>>> {
  return collection<AppDocument<T>>(name);
}

function withinReport(report: ReportSnapshot, dateTime: string): boolean {
  const date = dateTime.slice(0, 10);
  return date >= report.filters.from && date <= report.filters.to;
}

export class MongoParentingRepository implements ParentingRepository {
  private indexesReady?: Promise<void>;

  private ensureReady() {
    this.indexesReady ??= ensureMongoIndexes();
    return this.indexesReady;
  }

  async resolveContext(identity: Identity): Promise<RequestContext> {
    await this.ensureReady();
    const members = await col<Member>("members");
    const normalizedEmail = identity.email.toLowerCase();
    let member = await members.findOne({
      authUserId: identity.authUserId,
      status: { $ne: "revoked" },
    });

    if (!member) {
      member = await members.findOne({
        email: normalizedEmail,
        status: { $ne: "revoked" },
        authUserId: { $exists: false },
      });
    }

    if (!member) {
      try {
        await this.bootstrap(identity);
      } catch (error) {
        member = await members.findOne({
          authUserId: identity.authUserId,
          status: { $ne: "revoked" },
        });
        if (!member) throw error;
      }
      member = await members.findOne({
        authUserId: identity.authUserId,
        status: { $ne: "revoked" },
      });
    }

    if (!member) throw new Error("FORBIDDEN");

    if (member.status === "invited" || !member.authUserId) {
      const result = await members.updateOne(
        {
          id: member.id,
          workspaceId: member.workspaceId,
          status: { $ne: "revoked" },
          $or: [
            { authUserId: identity.authUserId },
            { authUserId: { $exists: false } },
          ],
        },
        { $set: { status: "active", authUserId: identity.authUserId } },
      );
      if (!result.matchedCount) throw new Error("FORBIDDEN");
      member = { ...member, status: "active", authUserId: identity.authUserId };
    }

    const workspace = await (await col<Workspace>("workspaces")).findOne({
      id: member.workspaceId,
    });
    if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
    const owner =
      member.id === workspace.ownerId
        ? member
        : await members.findOne({
            id: workspace.ownerId,
            workspaceId: workspace.id,
            role: "owner",
            status: "active",
          });
    if (!owner?.authUserId) throw new Error("BILLING_OWNER_REQUIRED");
    return toPlainData({
      identity,
      workspace,
      member,
      billingOwnerAuthUserId: owner.authUserId,
    });
  }

  async getDashboard(context: RequestContext, date: string) {
    const [children, caregivers, entries] = await Promise.all([
      (await col<Child>("children"))
        .find({ workspaceId: context.workspace.id, active: true })
        .sort({ sortOrder: 1 })
        .toArray(),
      (await col<Caregiver>("caregivers"))
        .find({ workspaceId: context.workspace.id, active: true })
        .toArray(),
      (await col<CareEntry>("careEntries"))
        .find({ workspaceId: context.workspace.id })
        .sort({ occurredAt: -1 })
        .toArray(),
    ]);
    const dailyLog = await this.ensureDailyLog(context, date);
    const dailyTemplate = await (await col<RoutineTemplate>("routineTemplates")).findOne({
      workspaceId: context.workspace.id,
      version: dailyLog.templateVersion,
    });
    if (!dailyTemplate) throw new Error("ROUTINE_TEMPLATE_NOT_FOUND");
    const dayEntries = entries.filter((entry) => entry.dailyLogId === dailyLog.id);
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const tasks = dailyTemplate.items
      .filter((item) => item.active && item.weekdays.includes(weekday))
      .map((item) => ({
        ...item,
        entry: dayEntries.find((entry) => entry.templateItemId === item.id),
      }));
    const completed = tasks.filter(
      (task) => task.entry?.status === "completed" || task.entry?.status === "not_applicable",
    ).length;
    return toPlainData({
      workspace: context.workspace,
      member: context.member,
      date,
      dailyLog,
      children,
      caregivers,
      tasks,
      completion: {
        completed,
        total: tasks.length,
        percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
      },
      recentEntries: dayEntries,
    });
  }

  async getTimeline(context: RequestContext) {
    const [children, caregivers, allEntries, appointments, incidents, attachments, revisions, finalizedLogs] = await Promise.all([
      (await col<Child>("children")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<Caregiver>("caregivers")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<CareEntry>("careEntries")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<Appointment>("appointments")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<Incident>("incidents")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<Attachment>("attachments")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<RecordRevision>("recordRevisions")).find({ workspaceId: context.workspace.id }).toArray(),
      context.member.role === "reviewer"
        ? (await col<DailyLog>("dailyLogs"))
            .find({ workspaceId: context.workspace.id, status: "finalized" })
            .toArray()
        : Promise.resolve([]),
    ]);
    const entries =
      context.member.role === "reviewer"
        ? allEntries.filter((entry) => finalizedLogs.some((log) => log.id === entry.dailyLogId))
        : allEntries;
    const visibleRecordIds = new Set([
      ...entries.map((entry) => entry.id),
      ...appointments.map((appointment) => appointment.id),
      ...incidents.map((incident) => incident.id),
    ]);
    return toPlainData({
      workspace: context.workspace,
      children,
      caregivers,
      items: toTimelineItems({ entries, appointments, incidents }),
      attachments: attachments.filter((attachment) => visibleRecordIds.has(attachment.recordId)),
      revisions: revisions.filter((revision) => visibleRecordIds.has(revision.recordId)),
    });
  }

  async getAppointments(context: RequestContext) {
    return toPlainData(
      await (await col<Appointment>("appointments"))
        .find({ workspaceId: context.workspace.id })
        .sort({ scheduledAt: -1 })
        .toArray(),
    );
  }

  async getIncidents(context: RequestContext) {
    return toPlainData(
      await (await col<Incident>("incidents"))
        .find({ workspaceId: context.workspace.id })
        .sort({ occurredAt: -1 })
        .toArray(),
    );
  }

  async getReports(context: RequestContext) {
    return toPlainData(
      await (await col<ReportSnapshot>("reportSnapshots"))
        .find({ workspaceId: context.workspace.id })
        .sort({ createdAt: -1 })
        .toArray(),
    );
  }

  async getSettings(context: RequestContext): Promise<SettingsData> {
    const [members, children, caregivers, template] = await Promise.all([
      (await col<Member>("members")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<Child>("children")).find({ workspaceId: context.workspace.id, active: true }).sort({ sortOrder: 1 }).toArray(),
      (await col<Caregiver>("caregivers")).find({ workspaceId: context.workspace.id }).toArray(),
      (await col<RoutineTemplate>("routineTemplates")).findOne(
        { workspaceId: context.workspace.id },
        { sort: { version: -1 } },
      ),
    ]);
    if (!template) throw new Error("ROUTINE_TEMPLATE_NOT_FOUND");
    return toPlainData({ workspace: context.workspace, members, children, caregivers, template });
  }

  async getRecordBundle(
    context: RequestContext,
    recordType: RecordType,
    recordId: string,
  ): Promise<RecordBundle | null> {
    const record = await this.findRecord(context.workspace.id, recordType, recordId);
    if (!record) return null;
    if (context.member.role === "reviewer" && recordType === "care_entry") {
      const log = await (await col<DailyLog>("dailyLogs")).findOne({
        id: (record as CareEntry).dailyLogId,
        workspaceId: context.workspace.id,
        status: "finalized",
      });
      if (!log) return null;
    }
    const [revisions, attachments] = await Promise.all([
      (await col<RecordRevision>("recordRevisions"))
        .find({ workspaceId: context.workspace.id, recordType, recordId })
        .sort({ revisionNumber: 1 })
        .toArray(),
      (await col<Attachment>("attachments"))
        .find({ workspaceId: context.workspace.id, recordType, recordId })
        .toArray(),
    ]);
    return toPlainData({ record, revisions, attachments });
  }

  async getReportSource(
    context: RequestContext,
    reportId: string,
  ): Promise<ReportSource | null> {
    const snapshot = await (await col<ReportSnapshot>("reportSnapshots")).findOne({
      id: reportId,
      workspaceId: context.workspace.id,
    });
    if (!snapshot) return null;
    const [settings, children, entries, appointments, incidents, revisions, attachments] =
      await Promise.all([
        this.getSettings(context),
        (await col<Child>("children"))
          .find({ workspaceId: context.workspace.id })
          .sort({ sortOrder: 1 })
          .toArray(),
        (await col<CareEntry>("careEntries"))
          .find({ workspaceId: context.workspace.id })
          .toArray(),
        this.getAppointments(context),
        this.getIncidents(context),
        (await col<RecordRevision>("recordRevisions"))
          .find({
            workspaceId: context.workspace.id,
            id: { $in: snapshot.recordRevisionIds },
          })
          .toArray(),
        (await col<Attachment>("attachments"))
          .find({
            workspaceId: context.workspace.id,
            id: { $in: snapshot.attachmentIds },
          })
          .toArray(),
      ]);
    const includesChild = (ids: string[]) =>
      snapshot.filters.childIds.length === 0 ||
      ids.some((childId) => snapshot.filters.childIds.includes(childId));
    return toPlainData({
      snapshot,
      workspace: context.workspace,
      children,
      caregivers: settings.caregivers,
      entries: snapshot.filters.includeCare
        ? entries.filter((item) => withinReport(snapshot, item.occurredAt) && includesChild(item.childIds))
        : [],
      appointments: snapshot.filters.includeAppointments
        ? appointments.filter((item) => withinReport(snapshot, item.scheduledAt) && includesChild(item.childIds))
        : [],
      incidents: snapshot.filters.includeIncidents
        ? incidents.filter((item) => withinReport(snapshot, item.occurredAt) && includesChild(item.childIds))
        : [],
      revisions,
      attachments,
    });
  }

  async createCareEntry(context: RequestContext, input: CareEntryInput) {
    requireOwner(context.member.role);
    const log = await this.ensureDailyLog(context, input.localDate);
    const recordedAt = new Date().toISOString();
    const recordId = id("care");
    const revision = this.initialRevision(
      context,
      "care_entry",
      recordId,
      { ...input },
      recordedAt,
    );
    const entry: CareEntry = {
      id: recordId,
      workspaceId: context.workspace.id,
      dailyLogId: log.id,
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
    await this.transaction(async (session) => {
      await (await col<CareEntry>("careEntries")).insertOne(entry, { session });
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, { session });
      await this.insertAudit(context, "created", "care_entry", entry.id, session);
    });
    return toPlainData(entry);
  }

  async correctCareEntry(context: RequestContext, input: CareEntryCorrectionInput) {
    requireOwner(context.member.role);
    const entry = await (await col<CareEntry>("careEntries")).findOne({
      id: input.recordId,
      workspaceId: context.workspace.id,
    });
    if (!entry) throw new Error("NOT_FOUND");
    if (entry.taskKey === "time_together" && !input.durationMinutes) {
      throw new Error("DURATION_REQUIRED");
    }
    const previous = await (await col<RecordRevision>("recordRevisions")).findOne({
      id: entry.currentRevisionId,
      workspaceId: context.workspace.id,
    });
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
    const payload = { ...recordPayload(toPlainData(entry)), ...correction, occurredAt };
    const revision: RecordRevision = {
      id: id("rev"),
      workspaceId: context.workspace.id,
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
    const lateEntry = entry.lateEntry || lateEntryFor(occurredAt, entry.recordedAt);
    const optionalFields = ["durationMinutes", "activityType", "notes"] as const;
    const setFields: Record<string, unknown> = {
      childIds: correction.childIds,
      caregiverIds: correction.caregiverIds,
      status: correction.status,
      occurredAt,
      currentRevisionId: revision.id,
      lateEntry,
    };
    const unsetFields: Record<string, ""> = {};
    for (const field of optionalFields) {
      if (correction[field] === undefined) unsetFields[field] = "";
      else setFields[field] = correction[field];
    }

    await this.transaction(async (session) => {
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, { session });
      await (await col<CareEntry>("careEntries")).updateOne(
        { id: entry.id, workspaceId: context.workspace.id },
        {
          $set: setFields,
          ...(Object.keys(unsetFields).length ? { $unset: unsetFields } : {}),
        },
        { session },
      );
      await this.insertAudit(
        context,
        "corrected",
        "care_entry",
        entry.id,
        session,
        { revisionNumber: revision.revisionNumber },
      );
    });
    return toPlainData(revision);
  }

  async createAppointment(context: RequestContext, input: AppointmentInput) {
    requireOwner(context.member.role);
    const recordedAt = new Date().toISOString();
    const recordId = id("appointment");
    const revision = this.initialRevision(context, "appointment", recordId, { ...input }, recordedAt);
    const appointment: Appointment = {
      id: recordId,
      workspaceId: context.workspace.id,
      ...input,
      arrivedAt: input.arrivedAt || undefined,
      scheduledAt: new Date(input.scheduledAt).toISOString(),
      recordedAt,
      currentRevisionId: revision.id,
      createdBy: context.member.id,
    };
    await this.transaction(async (session) => {
      await (await col<Appointment>("appointments")).insertOne(appointment, { session });
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, { session });
      await this.insertAudit(context, "created", "appointment", recordId, session);
    });
    return toPlainData(appointment);
  }

  async createIncident(context: RequestContext, input: IncidentInput) {
    requireOwner(context.member.role);
    const recordedAt = new Date().toISOString();
    const recordId = id("incident");
    const revision = this.initialRevision(context, "incident", recordId, { ...input }, recordedAt);
    const incident: Incident = {
      id: recordId,
      workspaceId: context.workspace.id,
      ...input,
      occurredAt: new Date(input.occurredAt).toISOString(),
      discoveredAt: input.discoveredAt ? new Date(input.discoveredAt).toISOString() : undefined,
      recordedAt,
      currentRevisionId: revision.id,
      createdBy: context.member.id,
    };
    await this.transaction(async (session) => {
      await (await col<Incident>("incidents")).insertOne(incident, { session });
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, { session });
      await this.insertAudit(context, "created", "incident", recordId, session);
    });
    return toPlainData(incident);
  }

  async correctRecord(context: RequestContext, input: CorrectionInput) {
    requireOwner(context.member.role);
    const bundle = await this.getRecordBundle(context, input.recordType, input.recordId);
    if (!bundle) throw new Error("NOT_FOUND");
    const previous = bundle.revisions.at(-1);
    if (!previous) throw new Error("REVISION_NOT_FOUND");
    const recordedAt = new Date().toISOString();
    const payload = {
      ...recordPayload(bundle.record),
      [input.recordType === "incident" ? "observations" : "notes"]: input.correctedText,
    };
    const revision: RecordRevision = {
      id: id("rev"),
      workspaceId: context.workspace.id,
      recordType: input.recordType,
      recordId: input.recordId,
      previousRevisionId: previous.id,
      revisionNumber: previous.revisionNumber + 1,
      payload,
      reason: input.reason,
      authorId: context.member.id,
      recordedAt,
      hash: createRevisionHash({ payload, previousHash: previous.hash, authorId: context.member.id, recordedAt }),
    };
    const collectionName =
      input.recordType === "care_entry"
        ? "careEntries"
        : input.recordType === "appointment"
          ? "appointments"
          : "incidents";
    const correctedField = input.recordType === "incident" ? "observations" : "notes";
    await this.transaction(async (session) => {
      await (await col<RecordRevision>("recordRevisions")).insertOne(revision, { session });
      await (await col<Record<string, unknown>>(collectionName)).updateOne(
        { id: input.recordId, workspaceId: context.workspace.id },
        { $set: { currentRevisionId: revision.id, [correctedField]: input.correctedText } },
        { session },
      );
      await this.insertAudit(context, "corrected", input.recordType, input.recordId, session, {
        revisionNumber: revision.revisionNumber,
      });
    });
    return toPlainData(revision);
  }

  async finalizeDailyLog(context: RequestContext, localDate: string) {
    requireOwner(context.member.role);
    const log = await this.ensureDailyLog(context, localDate);
    if (log.status === "finalized") return toPlainData(log);
    const finalizedAt = new Date().toISOString();
    await this.transaction(async (session) => {
      await (await col<DailyLog>("dailyLogs")).updateOne(
        { id: log.id },
        { $set: { status: "finalized", finalizedAt, finalizedBy: context.member.id } },
        { session },
      );
      await this.insertAudit(context, "finalized", "daily_log", log.id, session);
    });
    return toPlainData({
      ...log,
      status: "finalized" as const,
      finalizedAt,
      finalizedBy: context.member.id,
    });
  }

  async createReport(context: RequestContext, input: ReportInput) {
    requireOwner(context.member.role);
    const [timeline, finalizedLogs] = await Promise.all([
      this.getTimeline(context),
      (await col<DailyLog>("dailyLogs"))
        .find({ workspaceId: context.workspace.id, status: "finalized" })
        .toArray(),
    ]);
    const finalizedCareEntries = await (await col<CareEntry>("careEntries"))
      .find({
        workspaceId: context.workspace.id,
        dailyLogId: { $in: finalizedLogs.map((log) => log.id) },
      })
      .toArray();
    const finalizedCareIds = new Set(finalizedCareEntries.map((entry) => entry.id));
    const included = timeline.items.filter((item) => {
      const date = item.occurredAt.slice(0, 10);
      const includeKind =
        (item.kind === "care" && input.includeCare) ||
        (item.kind === "appointment" && input.includeAppointments) ||
        (item.kind === "incident" && input.includeIncidents);
      return (
        includeKind &&
        (item.kind !== "care" || finalizedCareIds.has(item.id)) &&
        date >= input.from &&
        date <= input.to &&
        (input.childIds.length === 0 || item.childIds.some((id) => input.childIds.includes(id)))
      );
    });
    const recordIds = included.map((item) => item.id);
    const revisions = await (await col<RecordRevision>("recordRevisions"))
      .find({ workspaceId: context.workspace.id, recordId: { $in: recordIds } })
      .toArray();
    const attachments = await (await col<Attachment>("attachments"))
      .find({ workspaceId: context.workspace.id, recordId: { $in: recordIds } })
      .toArray();
    const report: ReportSnapshot = {
      id: id("report"),
      workspaceId: context.workspace.id,
      createdBy: context.member.id,
      createdAt: new Date().toISOString(),
      status: "pending",
      filters: input,
      recordRevisionIds: revisions.map((item) => item.id),
      attachmentIds: attachments.map((item) => item.id),
    };
    await (await col<ReportSnapshot>("reportSnapshots")).insertOne(report);
    return toPlainData(report);
  }

  async markReportReady(
    context: RequestContext,
    reportId: string,
    artifacts: { manifestHash: string; pdfPathname: string; zipPathname: string; workflowRunId?: string },
  ) {
    await this.transaction(async (session) => {
      await (await col<ReportSnapshot>("reportSnapshots")).updateOne(
        { id: reportId, workspaceId: context.workspace.id },
        { $set: { ...artifacts, status: "ready" } },
        { session },
      );
      await this.insertAudit(context, "report_generated", "report", reportId, session);
    });
  }

  async markReportFailed(context: RequestContext, reportId: string, error: string) {
    await (await col<ReportSnapshot>("reportSnapshots")).updateOne(
      { id: reportId, workspaceId: context.workspace.id },
      { $set: { status: "failed", error } },
    );
  }

  async updateSettings(context: RequestContext, input: WorkspaceSettingsInput) {
    requireOwner(context.member.role);
    await this.transaction(async (session) => {
      await (await col<Workspace>("workspaces")).updateOne(
        { id: context.workspace.id },
        { $set: { name: input.name, timezone: input.timezone, hardDeleteEnabled: input.hardDeleteEnabled, updatedAt: new Date().toISOString() } },
        { session },
      );
      const children = await col<Child>("children");
      const activeChildIds = input.children.map((child) => child.id);
      await children.updateMany(
        { workspaceId: context.workspace.id, id: { $nin: activeChildIds } },
        { $set: { active: false } },
        { session },
      );
      const childColors = ["sage", "blue", "amber", "violet"] as const;
      for (const [index, child] of input.children.entries()) {
        await children.updateOne(
          { id: child.id, workspaceId: context.workspace.id },
          {
            $set: {
              displayName: child.displayName,
              birthdate: child.birthdate,
              active: true,
              sortOrder: index + 1,
            },
            $setOnInsert: {
              id: child.id,
              workspaceId: context.workspace.id,
              color: childColors[index % childColors.length],
            },
          },
          { upsert: true, session },
        );
      }
      for (const caregiver of input.caregivers) {
        const caregivers = await col<Caregiver>("caregivers");
        if (caregiver.id) {
          const result = await caregivers.updateOne(
            { id: caregiver.id, workspaceId: context.workspace.id },
            { $set: { displayName: caregiver.displayName, relationship: caregiver.relationship } },
            { session },
          );
          if (!result.matchedCount) throw new Error("INVALID_CAREGIVER");
        } else {
          await caregivers.insertOne(
            {
              id: id("caregiver"),
              workspaceId: context.workspace.id,
              displayName: caregiver.displayName,
              relationship: caregiver.relationship,
              isOwner: false,
              active: true,
            },
            { session },
          );
        }
      }
      const currentTemplate = await (await col<RoutineTemplate>("routineTemplates")).findOne(
        { workspaceId: context.workspace.id },
        { sort: { version: -1 }, session },
      );
      if (currentTemplate) {
        const nextItems = createNextRoutineItems(currentTemplate.items, input.routineItems);
        if (JSON.stringify(nextItems) !== JSON.stringify(currentTemplate.items)) {
          const effectiveFrom = localDateInTimezone(new Date(), input.timezone);
          const nextVersion = currentTemplate.version + 1;
          await (await col<RoutineTemplate>("routineTemplates")).insertOne(
            {
              id: id("template"),
              workspaceId: currentTemplate.workspaceId,
              version: nextVersion,
              effectiveFrom,
              createdAt: new Date().toISOString(),
              items: nextItems,
            },
            { session },
          );
          await (await col<DailyLog>("dailyLogs")).updateOne(
            {
              workspaceId: context.workspace.id,
              localDate: effectiveFrom,
              status: "open",
            },
            { $set: { templateVersion: nextVersion } },
            { session },
          );
        }
      }
      await this.insertAudit(context, "settings_changed", "workspace", context.workspace.id, session);
    });
    context.workspace = {
      ...context.workspace,
      name: input.name,
      timezone: input.timezone,
      hardDeleteEnabled: input.hardDeleteEnabled,
    };
    return this.getSettings(context);
  }

  async inviteReviewer(context: RequestContext, input: { email: string; displayName: string }) {
    requireOwner(context.member.role);
    const members = await col<Member>("members");
    const existing = await members.findOne({ workspaceId: context.workspace.id, email: input.email.toLowerCase() });
    if (existing && existing.status !== "revoked") throw new Error("ALREADY_INVITED");
    const member: Member = {
      id: existing?.id ?? id("member"),
      workspaceId: context.workspace.id,
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      role: "reviewer",
      status: "invited",
      invitedAt: new Date().toISOString(),
    };
    await this.transaction(async (session) => {
      await members.updateOne(
        { workspaceId: context.workspace.id, email: member.email },
        { $set: member },
        { upsert: true, session },
      );
      await this.insertAudit(context, "invited", "member", member.id, session);
    });
    return toPlainData(member);
  }

  async revokeReviewer(context: RequestContext, memberId: string) {
    requireOwner(context.member.role);
    await this.transaction(async (session) => {
      const result = await (await col<Member>("members")).updateOne(
        { id: memberId, workspaceId: context.workspace.id, role: "reviewer" },
        { $set: { status: "revoked" } },
        { session },
      );
      if (!result.matchedCount) throw new Error("NOT_FOUND");
      await this.insertAudit(context, "revoked", "member", memberId, session);
    });
  }

  async hardPurge(
    context: RequestContext,
    input: { recordType: RecordType; recordId: string; reason: string },
  ) {
    requireOwner(context.member.role);
    if (!context.workspace.hardDeleteEnabled) throw new Error("HARD_DELETE_DISABLED");
    if (!context.identity.mfaEnabled) throw new Error("MFA_REQUIRED");
    const bundle = await this.getRecordBundle(context, input.recordType, input.recordId);
    if (!bundle) throw new Error("NOT_FOUND");
    const revisionIds = bundle.revisions.map((item) => item.id);
    const reportCollection = await col<ReportSnapshot>("reportSnapshots");
    const affectedReports = await reportCollection
      .find({ workspaceId: context.workspace.id, recordRevisionIds: { $in: revisionIds } })
      .toArray();
    const tombstone: PurgeTombstone = {
      id: id("purge"),
      workspaceId: context.workspace.id,
      recordType: input.recordType,
      recordId: input.recordId,
      priorHashes: bundle.revisions.map((item) => item.hash),
      reason: input.reason,
      purgedBy: context.member.id,
      purgedAt: new Date().toISOString(),
    };
    const collectionName =
      input.recordType === "care_entry" ? "careEntries" : input.recordType === "appointment" ? "appointments" : "incidents";
    await this.transaction(async (session) => {
      await (await col<Record<string, unknown>>(collectionName)).deleteOne({ id: input.recordId, workspaceId: context.workspace.id }, { session });
      await (await col<RecordRevision>("recordRevisions")).deleteMany(
        { workspaceId: context.workspace.id, id: { $in: revisionIds } },
        { session },
      );
      await (await col<Attachment>("attachments")).deleteMany({ recordId: input.recordId, workspaceId: context.workspace.id }, { session });
      await reportCollection.deleteMany(
        {
          workspaceId: context.workspace.id,
          id: { $in: affectedReports.map((report) => report.id) },
        },
        { session },
      );
      await (await col<PurgeTombstone>("purgeTombstones")).insertOne(tombstone, { session });
      await this.insertAudit(context, "purged", input.recordType, input.recordId, session, {
        revisionCount: revisionIds.length,
        reportCount: affectedReports.length,
      });
    });
    return toPlainData(tombstone);
  }

  async addAttachment(context: RequestContext, attachment: Attachment) {
    requireOwner(context.member.role);
    await this.transaction(async (session) => {
      await (await col<Attachment>("attachments")).insertOne(attachment, { session });
      await this.insertAudit(context, "created", "attachment", attachment.id, session);
    });
  }

  async getAttachment(context: RequestContext, attachmentId: string) {
    const attachment = await (await col<Attachment>("attachments")).findOne({
      id: attachmentId,
      workspaceId: context.workspace.id,
    });
    if (!attachment) return null;
    if (context.member.role === "reviewer" && attachment.recordType === "care_entry") {
      const entry = await (await col<CareEntry>("careEntries")).findOne({
        id: attachment.recordId,
        workspaceId: context.workspace.id,
      });
      if (!entry) return null;
      const log = await (await col<DailyLog>("dailyLogs")).findOne({
        id: entry.dailyLogId,
        workspaceId: context.workspace.id,
        status: "finalized",
      });
      if (!log) return null;
    }
    return toPlainData(attachment);
  }

  async recordAuditEvent(
    context: RequestContext,
    event: Omit<AuditEvent, "id" | "workspaceId" | "occurredAt" | "eventHash">,
  ) {
    await this.insertAudit(context, event.action, event.targetType, event.targetId, undefined, event.metadata, event.previousHash);
  }

  private async bootstrap(identity: Identity) {
    const state = createSeedState(false, identity);
    const client = await getMongoClient();
    await client.withSession(async (session) => {
      await session.withTransaction(async () => {
        await (await col<Workspace>("workspaces")).insertOne(state.workspace, { session });
        await (await col<Member>("members")).insertMany(state.members, { session });
        await (await col<Child>("children")).insertMany(state.children, { session });
        await (await col<Caregiver>("caregivers")).insertMany(state.caregivers, { session });
        await (await col<RoutineTemplate>("routineTemplates")).insertMany(state.templates, { session });
        await (await col<DailyLog>("dailyLogs")).insertMany(state.dailyLogs, { session });
        await (await col<AuditEvent>("auditEvents")).insertMany(state.auditEvents, { session });
      });
    });
  }

  private async ensureDailyLog(
    context: RequestContext,
    localDate: string,
  ) {
    const logs = await col<DailyLog>("dailyLogs");
    const latestTemplate = await (await col<RoutineTemplate>("routineTemplates")).findOne(
      { workspaceId: context.workspace.id },
      { sort: { version: -1 } },
    );
    if (!latestTemplate) throw new Error("ROUTINE_TEMPLATE_NOT_FOUND");
    const existing = await logs.findOne({ workspaceId: context.workspace.id, localDate });
    if (existing) {
      if (existing.status !== "open" || existing.templateVersion === latestTemplate.version) {
        return existing;
      }
      const hasEntry = await (await col<CareEntry>("careEntries")).findOne({
        workspaceId: context.workspace.id,
        dailyLogId: existing.id,
      });
      if (hasEntry) return existing;
      await logs.updateOne(
        { id: existing.id, workspaceId: context.workspace.id, status: "open" },
        { $set: { templateVersion: latestTemplate.version } },
      );
      return { ...existing, templateVersion: latestTemplate.version };
    }
    const log: DailyLog = {
      id: id("daily"),
      workspaceId: context.workspace.id,
      localDate,
      templateVersion: latestTemplate.version,
      status: "open",
    };
    try {
      await logs.insertOne(log);
      return log;
    } catch {
      const concurrent = await logs.findOne({ workspaceId: context.workspace.id, localDate });
      if (!concurrent) throw new Error("DAILY_LOG_CREATE_FAILED");
      return concurrent;
    }
  }

  private initialRevision(
    context: RequestContext,
    recordType: RecordType,
    recordId: string,
    payload: Record<string, unknown>,
    recordedAt: string,
  ): RecordRevision {
    return {
      id: id("rev"),
      workspaceId: context.workspace.id,
      recordType,
      recordId,
      revisionNumber: 1,
      payload,
      reason: "Initial record",
      authorId: context.member.id,
      recordedAt,
      hash: createRevisionHash({ payload, authorId: context.member.id, recordedAt }),
    };
  }

  private async insertAudit(
    context: RequestContext,
    action: AuditEvent["action"],
    targetType: string,
    targetId: string,
    session?: ClientSession,
    metadata?: Record<string, string | number | boolean>,
    suppliedPreviousHash?: string,
  ) {
    const audits = await col<AuditEvent>("auditEvents");
    const previous = await audits.findOne(
      { workspaceId: context.workspace.id },
      { sort: { occurredAt: -1 }, session },
    );
    const occurredAt = new Date().toISOString();
    const base = { actorId: context.member.id, action, targetType, targetId, occurredAt, metadata };
    const previousHash = suppliedPreviousHash ?? previous?.eventHash;
    await audits.insertOne(
      {
        id: id("audit"),
        workspaceId: context.workspace.id,
        ...base,
        previousHash,
        eventHash: createAuditHash({ event: base, previousHash }),
      },
      { session },
    );
  }

  private async findRecord(workspaceId: string, type: RecordType, idValue: string) {
    if (type === "care_entry")
      return (await col<CareEntry>("careEntries")).findOne({ id: idValue, workspaceId });
    if (type === "appointment")
      return (await col<Appointment>("appointments")).findOne({ id: idValue, workspaceId });
    return (await col<Incident>("incidents")).findOne({ id: idValue, workspaceId });
  }

  private async transaction(work: (session: ClientSession) => Promise<void>) {
    const client = await getMongoClient();
    await client.withSession(async (session) => {
      await session.withTransaction(() => work(session));
    });
  }
}
