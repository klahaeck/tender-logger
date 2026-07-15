import { describe, expect, it } from "vitest";

import { lateEntryFor, localDateInTimezone } from "@/lib/domain/dates";

describe("date handling", () => {
  it("uses the workspace timezone for the local date", () => {
    const instant = new Date("2026-07-15T02:00:00.000Z");
    expect(localDateInTimezone(instant, "America/Chicago")).toBe("2026-07-14");
  });

  it("marks entries recorded more than 24 hours later", () => {
    expect(lateEntryFor("2026-07-10T12:00:00.000Z", "2026-07-12T12:00:00.000Z")).toBe(true);
    expect(lateEntryFor("2026-07-10T12:00:00.000Z", "2026-07-10T13:00:00.000Z")).toBe(false);
  });
});
