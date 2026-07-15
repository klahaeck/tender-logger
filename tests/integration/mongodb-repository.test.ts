import { afterAll, beforeAll, describe, expect, it } from "vitest";

const configured = Boolean(process.env.TEST_MONGODB_URI);

describe.skipIf(!configured)("MongoDB repository integration", () => {
  beforeAll(() => {
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
    process.env.MONGODB_DB = `parenting_log_test_${Date.now()}`;
    process.env.APP_OWNER_EMAIL = "mongo-owner@example.test";
  });

  afterAll(async () => {
    const { getDatabase } = await import("@/lib/db/mongodb");
    await (await getDatabase()).dropDatabase();
  });

  it("bootstraps an isolated workspace and writes a transactional care revision", async () => {
    const { MongoParentingRepository } = await import("@/lib/repository/mongo-repository");
    const repository = new MongoParentingRepository();
    const context = await repository.resolveContext({
      authUserId: "mongo-owner",
      email: "mongo-owner@example.test",
      displayName: "Mongo Owner",
      mfaEnabled: true,
      demo: false,
    });
    const dashboard = await repository.getDashboard(context, "2026-07-14");
    const entry = await repository.createCareEntry(context, {
      localDate: "2026-07-14",
      taskKey: "custom",
      taskLabel: "Prepared school materials",
      childIds: [dashboard.children[0].id],
      caregiverIds: [dashboard.caregivers[0].id],
      status: "completed",
      occurredAt: "2026-07-14T12:00:00.000Z",
    });
    const bundle = await repository.getRecordBundle(context, "care_entry", entry.id);
    expect(bundle?.revisions).toHaveLength(1);
    expect(bundle?.revisions[0].hash).toHaveLength(64);
  });
});
