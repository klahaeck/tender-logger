import type {
  Appointment,
  CareEntry,
  Incident,
  TimelineItem,
} from "@/lib/domain/types";

export function requireOwner(role: string): void {
  if (role !== "owner") throw new Error("FORBIDDEN");
}

export function toTimelineItems(input: {
  entries: CareEntry[];
  appointments: Appointment[];
  incidents: Incident[];
}): TimelineItem[] {
  return [
    ...input.entries.map(
      (entry): TimelineItem => ({
        id: entry.id,
        kind: "care",
        occurredAt: entry.occurredAt,
        recordedAt: entry.recordedAt,
        title: entry.taskLabel,
        description: entry.notes,
        childIds: entry.childIds,
        caregiverIds: entry.caregiverIds,
        status: entry.status,
        lateEntry: entry.lateEntry,
        currentRevisionId: entry.currentRevisionId,
      }),
    ),
    ...input.appointments.map(
      (appointment): TimelineItem => ({
        id: appointment.id,
        kind: "appointment",
        occurredAt: appointment.scheduledAt,
        recordedAt: appointment.recordedAt,
        title: appointment.title,
        description: appointment.notes,
        childIds: appointment.childIds,
        caregiverIds: appointment.responsibleCaregiverIds,
        status: appointment.status,
        currentRevisionId: appointment.currentRevisionId,
      }),
    ),
    ...input.incidents.map(
      (incident): TimelineItem => ({
        id: incident.id,
        kind: "incident",
        occurredAt: incident.occurredAt,
        recordedAt: incident.recordedAt,
        title:
          incident.category === "safety_hazard"
            ? "Safety hazard"
            : incident.category === "concerning_interaction"
              ? "Concerning interaction"
              : "Factual incident",
        description: incident.observations,
        childIds: incident.childIds,
        caregiverIds: [],
        status: incident.category,
        currentRevisionId: incident.currentRevisionId,
      }),
    ),
  ].sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

export function recordPayload(
  record: CareEntry | Appointment | Incident,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
}
