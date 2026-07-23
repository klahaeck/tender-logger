import { weekdayForLocalDate } from "@/lib/domain/dates";
import type {
  Child,
  RoutineTemplate,
  SpecialArrangementTask,
} from "@/lib/domain/types";

export type NewSpecialArrangementTask = Omit<
  SpecialArrangementTask,
  "id" | "sortOrder"
>;

export function createArrangementTasksForDate(
  localDate: string,
  template: RoutineTemplate,
  children: Pick<Child, "id">[],
): NewSpecialArrangementTask[] {
  const activeChildIds = new Set(children.map((child) => child.id));
  const weekday = weekdayForLocalDate(localDate);
  return template.items
    .filter((item) => item.active && item.weekdays.includes(weekday))
    .flatMap((item) =>
      item.childIds
        .filter((childId) => activeChildIds.has(childId))
        .map((childId) => ({
          sourceRoutineItemId: item.id,
          taskKey: item.taskKey,
          childId,
          label: item.label,
          suggestedTime: item.suggestedTime,
        })),
    );
}
