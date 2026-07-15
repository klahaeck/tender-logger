import { describe, expect, it } from "vitest";

import {
  careEntrySchema,
  incidentSchema,
  reportSchema,
  workspaceSettingsSchema,
} from "@/lib/domain/schemas";

describe("domain validation", () => {
  it("requires a duration for time together", () => {
    const result = careEntrySchema.safeParse({
      localDate: "2026-07-14",
      taskKey: "time_together",
      taskLabel: "Time together",
      childIds: ["child_1"],
      caregiverIds: ["caregiver_1"],
      status: "completed",
      occurredAt: "2026-07-14T18:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("requires observable incident detail", () => {
    const result = incidentSchema.safeParse({
      category: "concerning_interaction",
      occurredAt: "2026-07-14T18:00:00.000Z",
      childIds: ["child_1"],
      peoplePresent: [],
      witnesses: [],
      observations: "Upset",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reversed report ranges and empty content", () => {
    const result = reportSchema.safeParse({
      from: "2026-07-15",
      to: "2026-07-14",
      childIds: [],
      includeCare: false,
      includeAppointments: false,
      includeIncidents: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts new caregivers and routine items without persisted ids", () => {
    const result = workspaceSettingsSchema.safeParse({
      name: "Family workspace",
      timezone: "America/Chicago",
      hardDeleteEnabled: false,
      children: [
        { id: "child_1", displayName: "Child one", birthdate: "2018-01-15" },
        { id: "child_2", displayName: "Child two", birthdate: "2020-06-30" },
      ],
      caregivers: [
        { id: "caregiver_1", displayName: "Caregiver", relationship: "Parent" },
        { displayName: "Grandparent", relationship: "Grandparent" },
      ],
      routineItems: [
        {
          label: "Evening walk",
          suggestedTime: "18:30",
          childIds: ["child_1", "child_2"],
          active: true,
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.caregivers[1].id).toBeUndefined();
  });
});
