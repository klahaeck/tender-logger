import { beforeEach, describe, expect, it } from "vitest";

import { MemoryParentingRepository, resetMemoryRepository } from "@/lib/repository/memory-repository";
import type { Identity } from "@/lib/auth/identity";
import type { Attachment } from "@/lib/domain/types";
import { generateEvidencePackage } from "@/lib/reporting/generate-package";
import { getPrivateFile } from "@/lib/storage/private-files";
import { localDateInTimezone } from "@/lib/domain/dates";

const identity: Identity = {
  authUserId: "demo_owner",
  email: "owner@example.local",
  displayName: "Demo owner",
  mfaEnabled: true,
  demo: true,
};

describe("memory repository integration", () => {
  beforeEach(() => resetMemoryRepository());

  it("creates an append-only correction revision", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const dashboard = await repository.getDashboard(context, "2026-07-14");
    const entry = await repository.createCareEntry(context, {
      localDate: "2026-07-14",
      taskKey: "custom",
      taskLabel: "Prepared snack",
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed",
      occurredAt: "2026-07-14T12:00:00.000Z",
      notes: "Prepared fruit.",
    });
    await repository.correctRecord(context, {
      recordType: "care_entry",
      recordId: entry.id,
      correctedText: "Prepared sliced fruit.",
      reason: "Added a more precise description.",
    });
    const bundle = await repository.getRecordBundle(context, "care_entry", entry.id);
    expect(bundle?.revisions).toHaveLength(2);
    expect(bundle?.revisions[1].previousRevisionId).toBe(bundle?.revisions[0].id);
    expect(bundle?.revisions[1].hash).not.toBe(bundle?.revisions[0].hash);
  });

  it("blocks reviewer mutations at the repository boundary", async () => {
    const repository = new MemoryParentingRepository();
    const owner = await repository.resolveContext(identity);
    const reviewer = await repository.inviteReviewer(owner, {
      email: "attorney@example.com",
      displayName: "Attorney Reviewer",
    });
    reviewer.status = "active";
    reviewer.authUserId = "reviewer_user";
    const reviewerContext = await repository.resolveContext({
      ...identity,
      authUserId: "reviewer_user",
      email: reviewer.email,
    });
    await expect(
      repository.createIncident(reviewerContext, {
        category: "other",
        occurredAt: "2026-07-14T12:00:00.000Z",
        childIds: ["child_one"],
        peoplePresent: [],
        witnesses: [],
        observations: "A directly observed factual sequence.",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("does not expose attachments from an unfinalized care day to reviewers", async () => {
    const repository = new MemoryParentingRepository();
    const owner = await repository.resolveContext(identity);
    const dashboard = await repository.getDashboard(owner, "2026-07-15");
    const entry = await repository.createCareEntry(owner, {
      localDate: "2026-07-15",
      taskKey: "custom",
      taskLabel: "Prepared snack",
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed",
      occurredAt: "2026-07-15T12:00:00.000Z",
    });
    const attachment: Attachment = {
      id: "attachment_private_test",
      workspaceId: owner.workspace.id,
      recordType: "care_entry",
      recordId: entry.id,
      revisionId: entry.currentRevisionId,
      originalName: "note.png",
      contentType: "image/png",
      size: 12,
      sha256: "a".repeat(64),
      pathname: "attachments/private-test.png",
      uploadedAt: new Date().toISOString(),
      uploadedBy: owner.member.id,
    };
    await repository.addAttachment(owner, attachment);
    const reviewer = await repository.inviteReviewer(owner, {
      email: "private-review@example.com",
      displayName: "Private Review",
    });
    reviewer.status = "active";
    reviewer.authUserId = "private_review_user";
    const reviewerContext = await repository.resolveContext({
      ...identity,
      authUserId: "private_review_user",
      email: reviewer.email,
    });

    expect(await repository.getAttachment(reviewerContext, attachment.id)).toBeNull();
    expect((await repository.getTimeline(reviewerContext)).attachments).toHaveLength(0);

    await repository.finalizeDailyLog(owner, "2026-07-15");
    expect((await repository.getAttachment(reviewerContext, attachment.id))?.id).toBe(attachment.id);
    expect((await repository.getTimeline(reviewerContext)).attachments).toHaveLength(1);
  });

  it("keeps historical days bound to their original routine version", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const historicalDate = "2026-07-13";
    const historical = await repository.getDashboard(context, historicalDate);
    const originalLabel = historical.tasks[0].label;
    const settings = await repository.getSettings(context);

    await repository.updateSettings(context, {
      name: settings.workspace.name,
      timezone: settings.workspace.timezone,
      hardDeleteEnabled: settings.workspace.hardDeleteEnabled,
      children: settings.children.map((child) => ({
        id: child.id,
        displayName: child.displayName,
      })),
      caregivers: settings.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: settings.template.items.map((item, index) => ({
        id: item.id,
        label: index === 0 ? "Updated routine label" : item.label,
        suggestedTime: item.suggestedTime,
        childIds: item.childIds,
        active: item.active,
      })),
    });

    const reopenedHistorical = await repository.getDashboard(context, historicalDate);
    const nextDay = await repository.getDashboard(context, "2026-07-15");
    expect(reopenedHistorical.tasks[0].label).toBe(originalLabel);
    expect(nextDay.tasks[0].label).toBe("Updated routine label");
    expect(reopenedHistorical.dailyLog.templateVersion).toBe(1);
    expect(nextDay.dailyLog.templateVersion).toBe(2);
  });

  it("generates a PDF and checksum evidence package from finalized records", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const date = localDateInTimezone(new Date(), context.workspace.timezone);
    await repository.finalizeDailyLog(context, date);
    const report = await repository.createReport(context, {
      from: date,
      to: date,
      childIds: [],
      includeCare: true,
      includeAppointments: true,
      includeIncidents: true,
    });
    const source = await repository.getReportSource(context, report.id);
    expect(source).not.toBeNull();
    const artifacts = await generateEvidencePackage(source!);
    const pdf = await getPrivateFile(artifacts.pdfPathname);
    const zip = await getPrivateFile(artifacts.zipPathname);
    expect(pdf?.contentType).toBe("application/pdf");
    expect(pdf?.body.length).toBeGreaterThan(500);
    expect(zip?.contentType).toBe("application/zip");
    expect(artifacts.manifestHash).toHaveLength(64);
  });

  it("cascades an enabled hard purge and retains a content-free tombstone", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const settings = await repository.getSettings(context);
    await repository.updateSettings(context, {
      name: settings.workspace.name,
      timezone: settings.workspace.timezone,
      hardDeleteEnabled: true,
      children: settings.children.map((child) => ({ id: child.id, displayName: child.displayName })),
      caregivers: settings.caregivers.map((caregiver) => ({ id: caregiver.id, displayName: caregiver.displayName, relationship: caregiver.relationship })),
      routineItems: settings.template.items.map((item) => ({ id: item.id, label: item.label, suggestedTime: item.suggestedTime, childIds: item.childIds, active: item.active })),
    });
    const entry = await repository.createCareEntry(context, {
      localDate: "2026-07-14",
      taskKey: "custom",
      taskLabel: "Prepared snack",
      childIds: [settings.children[0].id],
      caregiverIds: [settings.caregivers[0].id],
      status: "completed",
      occurredAt: "2026-07-14T12:00:00.000Z",
    });
    const tombstone = await repository.hardPurge(context, {
      recordType: "care_entry",
      recordId: entry.id,
      reason: "Created only to verify permanent deletion behavior.",
    });
    expect(tombstone.priorHashes).toHaveLength(1);
    expect(await repository.getRecordBundle(context, "care_entry", entry.id)).toBeNull();
  });
});
