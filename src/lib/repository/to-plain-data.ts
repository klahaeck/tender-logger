/**
 * Convert database results into the plain domain data exposed by repositories.
 * MongoDB adds `_id` values that are not part of the domain model and cannot be
 * passed through a React Server Component boundary.
 */
export function toPlainData<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;

  if (value instanceof Date) {
    return value.toISOString() as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toPlainData(item)) as T;
  }

  const plain: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key !== "_id") plain[key] = toPlainData(nestedValue);
  }
  return plain as T;
}
