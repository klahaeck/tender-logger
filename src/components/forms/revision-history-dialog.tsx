"use client";

import { History } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/domain/dates";
import type { RecordRevision } from "@/lib/domain/types";

function revisionText(revision: RecordRevision) {
  const value =
    revision.payload.observations ??
    revision.payload.notes ??
    revision.payload.taskLabel ??
    revision.payload.title;
  return typeof value === "string" && value ? value : "No factual note was recorded.";
}

export function RevisionHistoryDialog({
  revisions,
  timezone,
}: {
  revisions: RecordRevision[];
  timezone: string;
}) {
  const ordered = [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber);
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <History className="size-3.5" /> History ({ordered.length})
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Immutable revision history</DialogTitle>
          <DialogDescription>
            Every saved version remains listed with its server timestamp, reason, and SHA-256 integrity hash.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {ordered.map((revision) => (
            <li key={revision.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Revision {revision.revisionNumber}</p>
                <time className="text-xs text-muted-foreground" dateTime={revision.recordedAt}>
                  {formatDateTime(revision.recordedAt, timezone)}
                </time>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{revisionText(revision)}</p>
              <p className="mt-3 text-xs text-muted-foreground">Reason: {revision.reason}</p>
              <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                SHA-256: {revision.hash}
              </p>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
