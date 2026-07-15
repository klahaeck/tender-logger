import { describe, expect, it } from "vitest";

import { createSeedState } from "@/lib/repository/seed";

describe("workspace seed state", () => {
  it("creates deterministic, isolated identifiers for each authenticated owner", () => {
    const firstIdentity = {
      authUserId: "clerk_user_one",
      email: "One@Example.com",
      displayName: "Owner One",
    };
    const secondIdentity = {
      authUserId: "clerk_user_two",
      email: "two@example.com",
      displayName: "Owner Two",
    };

    const first = createSeedState(false, firstIdentity);
    const firstAgain = createSeedState(false, firstIdentity);
    const second = createSeedState(false, secondIdentity);

    expect(first.workspace.id).toBe(firstAgain.workspace.id);
    expect(first.members[0].id).toBe(firstAgain.members[0].id);
    expect(first.workspace.id).not.toBe(second.workspace.id);
    expect(first.members[0].id).not.toBe(second.members[0].id);
    expect(first.children[0].id).not.toBe(second.children[0].id);
    expect(first.members[0]).toMatchObject({
      authUserId: firstIdentity.authUserId,
      email: "one@example.com",
      displayName: firstIdentity.displayName,
      role: "owner",
      status: "active",
    });
    expect(first.children.every((item) => item.workspaceId === first.workspace.id)).toBe(
      true,
    );
    expect(
      first.caregivers.every((item) => item.workspaceId === first.workspace.id),
    ).toBe(true);
    expect(first.templates[0].workspaceId).toBe(first.workspace.id);
    expect(first.dailyLogs[0].workspaceId).toBe(first.workspace.id);
  });
});
