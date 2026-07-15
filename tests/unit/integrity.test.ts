import { describe, expect, it } from "vitest";

import { canonicalJson, createRevisionHash, sha256 } from "@/lib/domain/integrity";

describe("record integrity", () => {
  it("canonicalizes object keys recursively", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe(
      '{"a":{"b":3,"y":2},"z":1}',
    );
  });

  it("produces the same hash for equivalent payload ordering", () => {
    const shared = { authorId: "member_1", recordedAt: "2026-07-14T12:00:00.000Z" };
    expect(createRevisionHash({ ...shared, payload: { b: 2, a: 1 } })).toBe(
      createRevisionHash({ ...shared, payload: { a: 1, b: 2 } }),
    );
  });

  it("changes the chain when the previous hash changes", () => {
    const shared = {
      payload: { notes: "Observed fact" },
      authorId: "member_1",
      recordedAt: "2026-07-14T12:00:00.000Z",
    };
    expect(createRevisionHash({ ...shared, previousHash: sha256("one") })).not.toBe(
      createRevisionHash({ ...shared, previousHash: sha256("two") }),
    );
  });
});
