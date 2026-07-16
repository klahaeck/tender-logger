import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  allowedBillingPlanSlugs,
  assertWorkspaceBillingAccess,
  hasAllowedBillingPlan,
  privateMetadataGrantsComplimentaryAccess,
  subscriptionItemGrantsAccess,
} from "@/lib/auth/billing";
import type { RequestContext } from "@/lib/repository/repository";

const { getUser, getUserBillingSubscription } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserBillingSubscription: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    billing: { getUserBillingSubscription },
    users: { getUser },
  }),
}));

const now = Date.parse("2026-07-16T12:00:00.000Z");

function item({
  slug,
  status = "active",
  periodEnd = null,
  isDefault = slug === "free_user",
}: {
  slug: string;
  status?: string;
  periodEnd?: number | null;
  isDefault?: boolean;
}) {
  return { status, periodEnd, plan: { slug, isDefault } };
}

const reviewerContext: RequestContext = {
  identity: {
    authUserId: "reviewer_user",
    email: "reviewer@example.test",
    displayName: "Reviewer",
    mfaEnabled: true,
    demo: false,
  },
  workspace: {
    id: "workspace_one",
    name: "Family workspace",
    timezone: "America/Chicago",
    ownerId: "member_owner",
    hardDeleteEnabled: false,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    demo: false,
  },
  member: {
    id: "member_reviewer",
    workspaceId: "workspace_one",
    authUserId: "reviewer_user",
    email: "reviewer@example.test",
    displayName: "Reviewer",
    role: "reviewer",
    status: "active",
  },
  billingOwnerAuthUserId: "owner_user",
};

describe("billing access", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_example");
    vi.stubEnv("CLERK_ALLOWED_PLAN_SLUGS", "general");
    getUser.mockReset();
    getUser.mockResolvedValue({ privateMetadata: {} });
    getUserBillingSubscription.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("defaults to the paid General subscriber Plan", () => {
    expect([...allowedBillingPlanSlugs("")]).toEqual(["general"]);
  });

  it("accepts an active General subscription and rejects active Free", () => {
    const allowed = allowedBillingPlanSlugs("");

    expect(
      subscriptionItemGrantsAccess(item({ slug: "free_user" }), allowed, now),
    ).toBe(false);
    expect(
      subscriptionItemGrantsAccess(item({ slug: "general" }), allowed, now),
    ).toBe(true);
  });

  it("never grants access through Clerk's default Free Plan", () => {
    const misconfigured = allowedBillingPlanSlugs("free_user,general");

    expect(
      subscriptionItemGrantsAccess(
        item({ slug: "free_user", isDefault: true }),
        misconfigured,
        now,
      ),
    ).toBe(false);
  });

  it("rejects unrelated, upcoming, ended, and past-due Plans", () => {
    const allowed = allowedBillingPlanSlugs("");

    expect(
      hasAllowedBillingPlan(
        [
          item({ slug: "enterprise" }),
          item({ slug: "free_user", status: "upcoming" }),
          item({ slug: "general", status: "ended" }),
          item({ slug: "general", status: "past_due" }),
        ],
        allowed,
        now,
      ),
    ).toBe(false);
  });

  it("keeps a canceled subscriber active through the paid period", () => {
    const allowed = allowedBillingPlanSlugs("");

    expect(
      subscriptionItemGrantsAccess(
        item({ slug: "general", status: "canceled", periodEnd: now + 1 }),
        allowed,
        now,
      ),
    ).toBe(true);
    expect(
      subscriptionItemGrantsAccess(
        item({ slug: "general", status: "canceled", periodEnd: now }),
        allowed,
        now,
      ),
    ).toBe(false);
  });

  it("supports an explicit comma-separated Plan allowlist", () => {
    expect([...allowedBillingPlanSlugs(" subscriber, team ")]).toEqual([
      "subscriber",
      "team",
    ]);
  });

  it("requires a literal true complimentary access value", () => {
    expect(
      privateMetadataGrantsComplimentaryAccess({ complimentaryAccess: true }),
    ).toBe(true);
    expect(
      privateMetadataGrantsComplimentaryAccess({ complimentaryAccess: "true" }),
    ).toBe(false);
    expect(privateMetadataGrantsComplimentaryAccess({})).toBe(false);
  });

  it("checks a reviewer against the workspace owner's active Plan", async () => {
    getUserBillingSubscription.mockResolvedValue({
      subscriptionItems: [item({ slug: "general" })],
    });

    await expect(
      assertWorkspaceBillingAccess(reviewerContext),
    ).resolves.toBeUndefined();
    expect(getUserBillingSubscription).toHaveBeenCalledWith("owner_user");
    expect(getUserBillingSubscription).not.toHaveBeenCalledWith("reviewer_user");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("gives owners and their reviewers complimentary access through owner metadata", async () => {
    getUserBillingSubscription.mockResolvedValue({
      subscriptionItems: [item({ slug: "free_user" })],
    });
    getUser.mockResolvedValue({
      privateMetadata: { complimentaryAccess: true },
    });

    await expect(
      assertWorkspaceBillingAccess(reviewerContext),
    ).resolves.toBeUndefined();
    expect(getUser).toHaveBeenCalledWith("owner_user");
    expect(getUser).not.toHaveBeenCalledWith("reviewer_user");
  });

  it("denies a workspace whose owner has no allowed active Plan", async () => {
    getUserBillingSubscription.mockResolvedValue({
      subscriptionItems: [item({ slug: "other" })],
    });

    await expect(assertWorkspaceBillingAccess(reviewerContext)).rejects.toThrow(
      "SUBSCRIPTION_REQUIRED",
    );
    expect(getUser).toHaveBeenCalledWith("owner_user");
  });

  it("accepts complimentary access when billing verification is unavailable", async () => {
    getUserBillingSubscription.mockRejectedValue(new Error("billing unavailable"));
    getUser.mockResolvedValue({
      privateMetadata: { complimentaryAccess: true },
    });

    await expect(
      assertWorkspaceBillingAccess(reviewerContext),
    ).resolves.toBeUndefined();
  });

  it("fails closed when Clerk cannot verify billing access", async () => {
    getUserBillingSubscription.mockRejectedValue(new Error("network unavailable"));

    await expect(assertWorkspaceBillingAccess(reviewerContext)).rejects.toThrow(
      "BILLING_ACCESS_UNAVAILABLE",
    );
  });
});
