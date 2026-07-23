import { describe, expect, it } from "vitest";

import { createArrangementTasksForDate } from "@/lib/domain/arrangements";
import { createSeedState } from "@/lib/repository/seed";

describe("special arrangement task expansion", () => {
  it("splits shared routine items into one task per child on the selected weekday", () => {
    const state = createSeedState(true);
    const secondChild = {
      ...state.children[0],
      id: "child_two",
      displayName: "Child Two",
      sortOrder: 2,
    };
    state.children.push(secondChild);
    state.templates[0].items = state.templates[0].items.map((item) => ({
      ...item,
      childIds: [state.children[0].id, secondChild.id],
    }));

    const tasks = createArrangementTasksForDate(
      "2026-07-25",
      state.templates[0],
      state.children,
    );

    const scheduledItems = state.templates[0].items.filter((item) =>
      item.weekdays.includes(6),
    );
    expect(tasks.length).toBe(scheduledItems.length * 2);
    expect(
      tasks.filter(
        (task) =>
          task.sourceRoutineItemId === state.templates[0].items[0].id,
      ).map((task) => task.childId),
    ).toEqual([state.children[0].id, secondChild.id]);
  });

  it("excludes routine items that are not scheduled for the date", () => {
    const state = createSeedState(true);
    const schoolTask = state.templates[0].items.find((item) =>
      item.taskKey.includes("school"),
    );
    expect(schoolTask).toBeDefined();

    const saturday = createArrangementTasksForDate(
      "2026-07-25",
      state.templates[0],
      state.children,
    );

    expect(saturday.some((task) => task.sourceRoutineItemId === schoolTask?.id)).toBe(
      false,
    );
  });
});
