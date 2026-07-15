import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";

export function localDateInTimezone(
  date = new Date(),
  timezone = "America/Chicago",
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function formatDateTime(value: string, timezone: string): string {
  const date = parseISO(value);
  if (!isValid(date)) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function formatTime(value: string, timezone: string): string {
  const date = parseISO(value);
  if (!isValid(date)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDay(value: string): string {
  const date = parseISO(value);
  return isValid(date) ? format(date, "EEEE, MMMM d") : value;
}

export function relativeTime(value: string): string {
  const date = parseISO(value);
  return isValid(date)
    ? formatDistanceToNowStrict(date, { addSuffix: true })
    : "unknown";
}

export function toDateTimeLocal(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function lateEntryFor(occurredAt: string, recordedAt: string): boolean {
  return (
    new Date(recordedAt).getTime() - new Date(occurredAt).getTime() >
    24 * 60 * 60 * 1000
  );
}
