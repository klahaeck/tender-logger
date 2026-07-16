import { beforeEach, describe, expect, it } from "vitest";

import { MemoryParentingRepository, resetMemoryRepository } from "@/lib/repository/memory-repository";
import type { Identity } from "@/lib/auth/identity";
import type { Attachment } from "@/lib/domain/types";
import { generateEvidencePackage } from "@/lib/reporting/generate-package";
import { getPrivateFile } from "@/lib/storage/private-files";
import { localDateInTimezone, shiftLocalDate } from "@/lib/domain/dates";

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
    expect(reviewerContext.billingOwnerAuthUserId).toBe(owner.identity.authUserId);
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

  it("starts with one child and persists a dynamic child list with birthdates", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const settings = await repository.getSettings(context);
    expect(settings.children).toHaveLength(1);

    const added = await repository.updateSettings(context, {
      name: settings.workspace.name,
      timezone: settings.workspace.timezone,
      hardDeleteEnabled: settings.workspace.hardDeleteEnabled,
      children: [
        ...settings.children.map((child) => ({
          id: child.id,
          displayName: child.displayName,
          birthdate: child.birthdate,
        })),
        {
          id: "child_added",
          displayName: "Child Added",
          birthdate: "2020-06-30",
        },
      ],
      caregivers: settings.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: settings.template.items.map((item) => ({
        id: item.id,
        label: item.label,
        suggestedTime: item.suggestedTime,
        childIds: item.childIds,
        weekdays: item.weekdays,
        active: item.active,
      })),
    });

    expect(added.children).toHaveLength(2);
    expect(added.children[1]).toMatchObject({
      id: "child_added",
      displayName: "Child Added",
      birthdate: "2020-06-30",
      active: true,
      sortOrder: 2,
    });

    const removed = await repository.updateSettings(context, {
      name: added.workspace.name,
      timezone: added.workspace.timezone,
      hardDeleteEnabled: added.workspace.hardDeleteEnabled,
      children: [{ id: "child_added", displayName: "Child Added", birthdate: "2020-06-30" }],
      caregivers: added.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: added.template.items.map((item) => ({
        id: item.id,
        label: item.label,
        suggestedTime: item.suggestedTime,
        childIds: ["child_added"],
        weekdays: item.weekdays,
        active: item.active,
      })),
    });

    expect(removed.children).toHaveLength(1);
    expect(removed.children[0].id).toBe("child_added");
    expect((await repository.getDashboard(context, "2026-07-15")).children).toHaveLength(1);
  });

  it("starts with two caregivers and persists additional caregivers", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const settings = await repository.getSettings(context);
    expect(settings.caregivers).toHaveLength(2);

    const updated = await repository.updateSettings(context, {
      name: settings.workspace.name,
      timezone: settings.workspace.timezone,
      hardDeleteEnabled: settings.workspace.hardDeleteEnabled,
      children: settings.children.map((child) => ({
        id: child.id,
        displayName: child.displayName,
        birthdate: child.birthdate,
      })),
      caregivers: [
        ...settings.caregivers.map((caregiver) => ({
          id: caregiver.id,
          displayName: caregiver.displayName,
          relationship: caregiver.relationship,
        })),
        { displayName: "Grandparent", relationship: "Grandparent" },
      ],
      routineItems: settings.template.items.map((item) => ({
        id: item.id,
        label: item.label,
        suggestedTime: item.suggestedTime,
        childIds: item.childIds,
        weekdays: item.weekdays,
        active: item.active,
      })),
    });

    expect(updated.caregivers).toHaveLength(3);
    expect(updated.caregivers[2]).toMatchObject({
      displayName: "Grandparent",
      relationship: "Grandparent",
      isOwner: false,
      active: true,
    });
    expect(updated.caregivers[2].id).toMatch(/^caregiver_/);
    expect((await repository.getDashboard(context, "2026-07-15")).caregivers).toHaveLength(3);
  });

  it("shows a routine item only on its selected weekdays", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const settings = await repository.getSettings(context);
    const naptime = settings.template.items.find((item) => item.taskKey === "naptime");
    expect(naptime).toBeDefined();

    const updated = await repository.updateSettings(context, {
      name: settings.workspace.name,
      timezone: settings.workspace.timezone,
      hardDeleteEnabled: settings.workspace.hardDeleteEnabled,
      children: settings.children.map((child) => ({
        id: child.id,
        displayName: child.displayName,
        birthdate: child.birthdate,
      })),
      caregivers: settings.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: settings.template.items.map((item) => ({
        id: item.id,
        label: item.label,
        suggestedTime: item.suggestedTime,
        childIds: item.childIds,
        weekdays: item.taskKey === "naptime" ? [0, 6] : item.weekdays,
        active: item.active,
      })),
    });

    expect(updated.template.items.find((item) => item.id === naptime?.id)?.weekdays).toEqual([0, 6]);
    expect((await repository.getDashboard(context, "2026-07-18")).tasks)
      .toContainEqual(expect.objectContaining({ id: naptime?.id, label: "Naptime" }));
    expect((await repository.getDashboard(context, "2026-07-20")).tasks)
      .not.toContainEqual(expect.objectContaining({ id: naptime?.id }));
  });

  it("uses the latest routine for empty historical days and freezes it after an entry", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const today = localDateInTimezone(new Date(), context.workspace.timezone);
    const historicalDate = shiftLocalDate(today, -1);
    const nextDayDate = shiftLocalDate(today, 1);
    const historical = await repository.getDashboard(context, historicalDate);
    const originalToday = await repository.getDashboard(context, today);
    const originalTodayVersion = originalToday.dailyLog.templateVersion;
    const settings = await repository.getSettings(context);

    const updatedSettings = await repository.updateSettings(context, {
      name: settings.workspace.name,
      timezone: settings.workspace.timezone,
      hardDeleteEnabled: settings.workspace.hardDeleteEnabled,
      children: settings.children.map((child) => ({
        id: child.id,
        displayName: child.displayName,
        birthdate: child.birthdate,
      })),
      caregivers: settings.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: [
        ...settings.template.items.slice(1).map((item, index) => ({
          id: item.id,
          label: index === 0 ? "Updated routine label" : item.label,
          suggestedTime: item.suggestedTime,
          childIds: item.childIds,
          weekdays: item.weekdays,
          active: item.active,
        })),
        {
          label: "Evening walk",
          suggestedTime: "18:30",
          childIds: settings.children.map((child) => child.id),
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          active: true,
        },
      ],
    });

    const savedAgain = await repository.updateSettings(context, {
      name: updatedSettings.workspace.name,
      timezone: updatedSettings.workspace.timezone,
      hardDeleteEnabled: updatedSettings.workspace.hardDeleteEnabled,
      children: updatedSettings.children.map((child) => ({
        id: child.id,
        displayName: child.displayName,
        birthdate: child.birthdate,
      })),
      caregivers: updatedSettings.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: updatedSettings.template.items.map((item) => ({
        id: item.id,
        label: item.label,
        suggestedTime: item.suggestedTime,
        childIds: item.childIds,
        weekdays: item.weekdays,
        active: item.active,
      })),
    });
    expect(savedAgain.template.version).toBe(2);

    const reopenedHistorical = await repository.getDashboard(context, historicalDate);
    const refreshedToday = await repository.getDashboard(context, today);
    const nextDay = await repository.getDashboard(context, nextDayDate);
    expect(reopenedHistorical.tasks.some((task) => task.id === settings.template.items[0].id)).toBe(false);
    expect(reopenedHistorical.tasks[0].label).toBe("Updated routine label");
    expect(reopenedHistorical.tasks.at(-1)?.label).toBe("Evening walk");
    expect(refreshedToday.tasks.some((task) => task.id === settings.template.items[0].id)).toBe(false);
    expect(refreshedToday.tasks.at(-1)?.label).toBe("Evening walk");
    expect(originalTodayVersion).toBe(1);
    expect(refreshedToday.dailyLog.templateVersion).toBe(2);
    expect(nextDay.tasks.some((task) => task.id === settings.template.items[0].id)).toBe(false);
    expect(nextDay.tasks[0].label).toBe("Updated routine label");
    expect(nextDay.tasks.at(-1)).toMatchObject({
      taskKey: "custom",
      label: "Evening walk",
      sortOrder: settings.template.items.length,
    });
    expect(nextDay.tasks.at(-1)?.id).toMatch(/^routine_/);
    expect(reopenedHistorical.dailyLog.templateVersion).toBe(2);
    expect(nextDay.dailyLog.templateVersion).toBe(2);

    const historicalEntry = await repository.createCareEntry(context, {
      localDate: historicalDate,
      taskKey: "custom",
      taskLabel: "Historical care",
      childIds: [historical.children[0].id],
      caregiverIds: [historical.caregivers[0].id],
      status: "completed",
      occurredAt: `${historicalDate}T12:00:00.000Z`,
    });
    expect(historicalEntry.dailyLogId).toBe(historical.dailyLog.id);
    expect(historicalEntry.lateEntry).toBe(true);

    const thirdVersion = await repository.updateSettings(context, {
      name: savedAgain.workspace.name,
      timezone: savedAgain.workspace.timezone,
      hardDeleteEnabled: savedAgain.workspace.hardDeleteEnabled,
      children: savedAgain.children.map((child) => ({
        id: child.id,
        displayName: child.displayName,
        birthdate: child.birthdate,
      })),
      caregivers: savedAgain.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: savedAgain.template.items.map((item, index) => ({
        id: item.id,
        label: index === 0 ? "Newest routine label" : item.label,
        suggestedTime: item.suggestedTime,
        childIds: item.childIds,
        weekdays: item.weekdays,
        active: item.active,
      })),
    });
    const lockedHistorical = await repository.getDashboard(context, historicalDate);
    expect(thirdVersion.template.version).toBe(3);
    expect(lockedHistorical.dailyLog.templateVersion).toBe(2);
    expect(lockedHistorical.tasks[0].label).toBe("Updated routine label");
  });

  it("keeps a finalized today log bound to its original routine version", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const today = localDateInTimezone(new Date(), context.workspace.timezone);
    const originalToday = await repository.getDashboard(context, today);
    const originalLabel = originalToday.tasks[0].label;
    await repository.finalizeDailyLog(context, today);
    const settings = await repository.getSettings(context);

    const updatedSettings = await repository.updateSettings(context, {
      name: settings.workspace.name,
      timezone: settings.workspace.timezone,
      hardDeleteEnabled: settings.workspace.hardDeleteEnabled,
      children: settings.children.map((child) => ({
        id: child.id,
        displayName: child.displayName,
        birthdate: child.birthdate,
      })),
      caregivers: settings.caregivers.map((caregiver) => ({
        id: caregiver.id,
        displayName: caregiver.displayName,
        relationship: caregiver.relationship,
      })),
      routineItems: settings.template.items.map((item, index) => ({
        id: item.id,
        label: index === 0 ? "Changed after finalizing" : item.label,
        suggestedTime: item.suggestedTime,
        childIds: item.childIds,
        weekdays: item.weekdays,
        active: item.active,
      })),
    });

    const finalizedToday = await repository.getDashboard(context, today);
    expect(updatedSettings.template.version).toBe(2);
    expect(finalizedToday.dailyLog.status).toBe("finalized");
    expect(finalizedToday.dailyLog.templateVersion).toBe(1);
    expect(finalizedToday.tasks[0].label).toBe(originalLabel);
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
      children: settings.children.map((child) => ({ id: child.id, displayName: child.displayName, birthdate: child.birthdate })),
      caregivers: settings.caregivers.map((caregiver) => ({ id: caregiver.id, displayName: caregiver.displayName, relationship: caregiver.relationship })),
      routineItems: settings.template.items.map((item) => ({ id: item.id, label: item.label, suggestedTime: item.suggestedTime, childIds: item.childIds, weekdays: item.weekdays, active: item.active })),
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
