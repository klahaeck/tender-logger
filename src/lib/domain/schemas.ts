import { z } from "zod";

const idArray = z.array(z.string().min(1)).min(1, "Choose at least one option");
const isoDateTime = z.string().datetime({ local: true }).or(z.string().datetime());

export const careEntrySchema = z
  .object({
    localDate: z.string().date(),
    templateItemId: z.string().optional(),
    taskKey: z.enum([
      "wake_up",
      "get_dressed",
      "prepare_breakfast",
      "prepare_lunch",
      "school_dropoff",
      "school_pickup",
      "prepare_dinner",
      "time_together",
      "naptime",
      "bedtime_pajamas",
      "bedtime_teeth",
      "bedtime_story",
      "clean_spaces",
      "custom",
    ]),
    taskLabel: z.string().trim().min(2).max(100),
    childIds: idArray,
    caregiverIds: idArray,
    status: z.enum(["completed", "partial", "missed", "not_applicable"]),
    occurredAt: isoDateTime,
    durationMinutes: z.coerce.number().int().min(1).max(1440).optional(),
    activityType: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, context) => {
    if (value.taskKey === "time_together" && !value.durationMinutes) {
      context.addIssue({
        code: "custom",
        path: ["durationMinutes"],
        message: "Add the duration for time together",
      });
    }
  });

export const careEntryCorrectionSchema = z.object({
  recordId: z.string().min(1),
  childIds: idArray,
  caregiverIds: idArray,
  status: z.enum(["completed", "partial", "missed", "not_applicable"]),
  occurredAt: isoDateTime,
  durationMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  activityType: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
  reason: z.string().trim().min(5).max(500),
});

export const careEntryUpdateSchema = careEntryCorrectionSchema.omit({ reason: true });

export const careEntryTextUpdateSchema = z.object({
  recordId: z.string().min(1),
  notes: z.string().trim().min(1).max(2000),
});

export const appointmentSchema = z.object({
  childIds: idArray,
  title: z.string().trim().min(2).max(160),
  provider: z.string().trim().max(160).optional(),
  location: z.string().trim().max(200).optional(),
  scheduledAt: isoDateTime,
  responsibleCaregiverIds: idArray,
  status: z.enum([
    "scheduled",
    "attended",
    "late",
    "missed",
    "cancelled",
    "rescheduled",
  ]),
  arrivedAt: isoDateTime.optional().or(z.literal("")),
  cancellationDetails: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const incidentSchema = z.object({
  category: z.enum(["safety_hazard", "concerning_interaction", "other"]),
  occurredAt: isoDateTime,
  discoveredAt: isoDateTime.optional().or(z.literal("")),
  location: z.string().trim().max(200).optional(),
  childIds: idArray,
  peoplePresent: z.array(z.string().trim().max(100)).max(20),
  witnesses: z.array(z.string().trim().max(100)).max(20),
  observations: z
    .string()
    .trim()
    .min(10, "Describe only what was observed")
    .max(5000),
  exactQuotes: z.string().trim().max(3000).optional(),
  immediateActions: z.string().trim().max(3000).optional(),
  outcome: z.string().trim().max(3000).optional(),
});

export const correctionSchema = z.object({
  recordType: z.enum(["care_entry", "appointment", "incident"]),
  recordId: z.string().min(1),
  correctedText: z.string().trim().min(1).max(5000),
  reason: z.string().trim().min(5).max(500),
});

export const reportSchema = z
  .object({
    from: z.string().date(),
    to: z.string().date(),
    childIds: z.array(z.string()),
    includeCare: z.boolean(),
    includeAppointments: z.boolean(),
    includeIncidents: z.boolean(),
  })
  .refine((value) => value.from <= value.to, {
    message: "The start date must be before the end date",
    path: ["to"],
  })
  .refine(
    (value) =>
      value.includeCare || value.includeAppointments || value.includeIncidents,
    { message: "Include at least one record type", path: ["includeCare"] },
  );

export const inviteSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(2).max(100),
});

export const workspaceSettingsSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    timezone: z.string().trim().min(1).max(100),
    hardDeleteEnabled: z.boolean(),
    children: z
      .array(
        z.object({
          id: z.string().regex(/^child_[A-Za-z0-9-]+$/),
          displayName: z.string().trim().min(1).max(80),
          birthdate: z.string().date(),
        }),
      )
      .min(1, "Add at least one child"),
    caregivers: z
      .array(
        z.object({
          id: z.string().min(1).optional(),
          displayName: z.string().trim().min(1).max(80),
          relationship: z.string().trim().min(1).max(80),
        }),
      )
      .min(1),
    routineItems: z.array(
      z.object({
        id: z.string().min(1).optional(),
        label: z.string().trim().min(2).max(100),
        suggestedTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        childIds: z.array(z.string()),
        weekdays: z
          .array(z.number().int().min(0).max(6))
          .min(1, "Choose at least one day")
          .max(7)
          .refine((days) => new Set(days).size === days.length, {
            message: "Routine days must be unique",
          }),
        active: z.boolean(),
      }),
    ),
  })
  .superRefine((value, context) => {
    const childIds = new Set(value.children.map((child) => child.id));
    if (childIds.size !== value.children.length) {
      context.addIssue({
        code: "custom",
        path: ["children"],
        message: "Each child must be unique",
      });
    }
    value.routineItems.forEach((item, index) => {
      if (item.active && item.childIds.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["routineItems", index, "childIds"],
          message: "Choose at least one child for each active routine",
        });
      }
      if (item.childIds.some((childId) => !childIds.has(childId))) {
        context.addIssue({
          code: "custom",
          path: ["routineItems", index, "childIds"],
          message: "Routine children must belong to this workspace",
        });
      }
    });
  });

export const purgeSchema = z.object({
  recordType: z.enum(["care_entry", "appointment", "incident"]),
  recordId: z.string().min(1),
  reason: z.string().trim().min(10).max(500),
  confirmation: z.literal("PERMANENTLY DELETE"),
});

export type CareEntryInput = z.infer<typeof careEntrySchema>;
export type CareEntryUpdateInput = z.infer<typeof careEntryUpdateSchema>;
export type CareEntryCorrectionInput = z.infer<typeof careEntryCorrectionSchema>;
export type AppointmentInput = z.infer<typeof appointmentSchema>;
export type IncidentInput = z.infer<typeof incidentSchema>;
export type CorrectionInput = z.infer<typeof correctionSchema>;
export type ReportInput = z.infer<typeof reportSchema>;
export type WorkspaceSettingsInput = z.infer<typeof workspaceSettingsSchema>;
