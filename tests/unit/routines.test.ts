import { describe, expect, it } from "vitest";

import { sortRoutineItemsByTime } from "@/lib/domain/routines";

describe("routine ordering", () => {
  it("orders routine items by suggested time without mutating the source", () => {
    const items = [
      { id: "evening", suggestedTime: "19:00" },
      { id: "morning", suggestedTime: "07:15" },
      { id: "afternoon", suggestedTime: "13:00" },
    ];

    expect(sortRoutineItemsByTime(items).map((item) => item.id)).toEqual([
      "morning",
      "afternoon",
      "evening",
    ]);
    expect(items.map((item) => item.id)).toEqual(["evening", "morning", "afternoon"]);
  });
});
