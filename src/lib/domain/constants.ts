import type { CareStatus, CareTaskKey, IncidentCategory } from "./types";

export const CARE_TASKS: Array<{
  key: CareTaskKey;
  label: string;
  suggestedTime: string;
}> = [
  { key: "wake_up", label: "Wake up", suggestedTime: "07:00" },
  { key: "get_dressed", label: "Get dressed", suggestedTime: "07:15" },
  { key: "prepare_breakfast", label: "Prepare breakfast", suggestedTime: "07:30" },
  { key: "prepare_lunch", label: "Prepare lunch", suggestedTime: "07:45" },
  { key: "school_dropoff", label: "School drop-off", suggestedTime: "08:15" },
  { key: "school_pickup", label: "School pick-up", suggestedTime: "15:15" },
  { key: "time_together", label: "Time together", suggestedTime: "16:00" },
  { key: "naptime", label: "Naptime", suggestedTime: "13:00" },
  { key: "prepare_dinner", label: "Prepare dinner", suggestedTime: "18:00" },
  { key: "clean_spaces", label: "Clean child spaces", suggestedTime: "19:00" },
  { key: "bedtime_pajamas", label: "Bedtime · pajamas", suggestedTime: "19:30" },
  { key: "bedtime_teeth", label: "Bedtime · brush teeth", suggestedTime: "19:40" },
  { key: "bedtime_story", label: "Bedtime · story", suggestedTime: "19:50" },
];

export const CARE_STATUS_LABELS: Record<CareStatus, string> = {
  completed: "Completed",
  partial: "Partial",
  missed: "Missed",
  not_applicable: "Not applicable",
};

export const ROUTINE_WEEKDAYS = [
  { value: 0, shortLabel: "Sun", label: "Sunday" },
  { value: 1, shortLabel: "Mon", label: "Monday" },
  { value: 2, shortLabel: "Tue", label: "Tuesday" },
  { value: 3, shortLabel: "Wed", label: "Wednesday" },
  { value: 4, shortLabel: "Thu", label: "Thursday" },
  { value: 5, shortLabel: "Fri", label: "Friday" },
  { value: 6, shortLabel: "Sat", label: "Saturday" },
] as const;

export const EVERY_DAY = ROUTINE_WEEKDAYS.map((day) => day.value);
export const WEEKDAYS_ONLY = [1, 2, 3, 4, 5];
export const WEEKENDS_ONLY = [0, 6];

export const CAREGIVER_RELATIONSHIPS = [
  "Parent",
  "Mother",
  "Father",
  "Co-parent",
  "Stepparent",
  "Legal guardian",
  "Foster parent",
  "Grandparent",
  "Adult sibling",
  "Aunt or uncle",
  "Other relative",
  "Nanny or babysitter",
  "Family friend",
  "Other caregiver",
] as const;

export const INCIDENT_LABELS: Record<IncidentCategory, string> = {
  safety_hazard: "Safety hazard",
  concerning_interaction: "Concerning interaction",
  other: "Other factual incident",
};

export const RECORD_DISCLAIMER =
  "This application is a factual recordkeeping aid. It does not provide legal advice or guarantee that a record will be admitted or given any particular weight by a court.";
