import { createHash, randomUUID } from "node:crypto";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createRevisionHash(input: {
  payload: Record<string, unknown>;
  previousHash?: string;
  authorId: string;
  recordedAt: string;
}): string {
  return sha256(
    canonicalJson({
      payload: input.payload,
      previousHash: input.previousHash ?? null,
      authorId: input.authorId,
      recordedAt: input.recordedAt,
    }),
  );
}

export function createAuditHash(input: {
  event: Record<string, unknown>;
  previousHash?: string;
}): string {
  return sha256(
    canonicalJson({
      event: input.event,
      previousHash: input.previousHash ?? null,
    }),
  );
}

export function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
