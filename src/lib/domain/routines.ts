export function sortRoutineItemsByTime<T extends { suggestedTime: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));
}
