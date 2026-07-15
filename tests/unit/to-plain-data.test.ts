import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";

import { toPlainData } from "@/lib/repository/to-plain-data";

describe("toPlainData", () => {
  it("removes MongoDB metadata recursively and returns simple values", () => {
    const createdAt = new Date("2026-07-15T12:00:00.000Z");
    const source = {
      _id: new ObjectId("507f1f77bcf86cd799439011"),
      id: "workspace_1",
      createdAt,
      children: [
        {
          _id: new ObjectId("507f1f77bcf86cd799439012"),
          id: "child_1",
        },
      ],
    };

    expect(toPlainData(source)).toStrictEqual({
      id: "workspace_1",
      createdAt: "2026-07-15T12:00:00.000Z",
      children: [{ id: "child_1" }],
    });
    expect(source).toHaveProperty("_id");
    expect(source.children[0]).toHaveProperty("_id");
  });
});
