"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, Plus } from "lucide-react";

import { createCareEntryAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { localDateTimeToUtc, toDateTimeLocalInTimezone } from "@/lib/domain/dates";
import type { Caregiver, Child, TodayTask } from "@/lib/domain/types";
import { AttachmentPicker, FieldError, MultiCheck, uploadFiles } from "./form-parts";

export function CareEntryDialog({
  task,
  date,
  today,
  timezone,
  childOptions,
  caregivers,
  trigger,
}: {
  task?: TodayTask;
  date: string;
  today: string;
  timezone: string;
  childOptions: Child[];
  caregivers: Caregiver[];
  trigger?: React.ReactElement;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedChildren, setSelectedChildren] = useState<string[]>(task?.childIds ?? childOptions.map((child) => child.id));
  const [selectedCaregivers, setSelectedCaregivers] = useState<string[]>([caregivers.find((item) => item.isOwner)?.id ?? caregivers[0]?.id].filter(Boolean));
  const [status, setStatus] = useState("completed");
  const [files, setFiles] = useState<File[]>([]);
  const [serverError, setServerError] = useState<string>();

  const defaultTime = useMemo(() => {
    const now = new Date();
    if (date === today) return toDateTimeLocalInTimezone(now, timezone);
    return `${date}T${task?.suggestedTime ?? "12:00"}`;
  }, [date, task?.suggestedTime, timezone, today]);

  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      setServerError(undefined);
      const taskKey = task?.taskKey ?? "custom";
      const result = await createCareEntryAction({
        localDate: date,
        templateItemId: task?.id,
        taskKey,
        taskLabel: task?.label ?? formData.get("taskLabel")?.toString(),
        childIds: selectedChildren,
        caregiverIds: selectedCaregivers,
        status,
        occurredAt: localDateTimeToUtc(formData.get("occurredAt")!.toString(), timezone),
        durationMinutes:
          formData.get("durationMinutes")?.toString()
            ? Number(formData.get("durationMinutes"))
            : undefined,
        activityType: formData.get("activityType")?.toString() || undefined,
        notes: formData.get("notes")?.toString() || undefined,
      });
      if (!result.ok || !result.data) throw new Error(result.error ?? "Unable to save record");
      await uploadFiles(files, "care_entry", result.data.id);
      return result.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard", date] });
      await queryClient.invalidateQueries({ queryKey: ["timeline"] });
      setOpen(false);
      setFiles([]);
    },
    onError: (error) => setServerError(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger render={trigger} />
      ) : (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus className="size-4" /> Add record
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <form action={(data) => mutation.mutate(data)}>
          <DialogHeader>
            <DialogTitle>{task?.label ?? "Add caregiving record"}</DialogTitle>
            <DialogDescription>
              Record what occurred. The app adds a separate, server-controlled entry time.
            </DialogDescription>
          </DialogHeader>
          <div className="my-5 space-y-5">
            {!task && (
              <div className="space-y-2">
                <Label htmlFor="taskLabel">Activity</Label>
                <Input id="taskLabel" name="taskLabel" required maxLength={100} placeholder="Describe the caregiving activity" />
              </div>
            )}
            <MultiCheck label="Children" values={childOptions} selected={selectedChildren} onChange={setSelectedChildren} />
            <MultiCheck
              label="Who provided the care?"
              values={caregivers.map((caregiver) => ({ ...caregiver, secondary: caregiver.relationship }))}
              selected={selectedCaregivers}
              onChange={setSelectedCaregivers}
            />
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Outcome</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["completed", "Completed"],
                  ["partial", "Partial"],
                  ["missed", "Missed"],
                  ["not_applicable", "N/A"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={status === value ? "default" : "outline"}
                    onClick={() => setStatus(value)}
                  >
                    {status === value && <Check className="size-3" />}
                    {label}
                  </Button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="occurredAt">When did it occur?</Label>
                <Input id="occurredAt" name="occurredAt" type="datetime-local" required defaultValue={defaultTime} />
              </div>
              {(task?.taskKey === "time_together" || !task) && (
                <div className="space-y-2">
                  <Label htmlFor="durationMinutes">Duration in minutes</Label>
                  <Input id="durationMinutes" name="durationMinutes" type="number" min={1} max={1440} required={task?.taskKey === "time_together"} placeholder="30" />
                </div>
              )}
            </div>
            {task?.taskKey === "time_together" && (
              <div className="space-y-2">
                <Label htmlFor="activityType">Activity type</Label>
                <Input id="activityType" name="activityType" maxLength={100} placeholder="Reading, homework, playing outside…" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="notes">Factual notes (optional)</Label>
              <Textarea id="notes" name="notes" maxLength={2000} rows={4} placeholder="Record observable details without conclusions or inferred motives." />
            </div>
            <AttachmentPicker files={files} onChange={setFiles} />
            {serverError && <FieldError errors={[serverError]} />}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending || selectedChildren.length === 0 || selectedCaregivers.length === 0}>
              {mutation.isPending ? <Clock3 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {mutation.isPending ? "Saving…" : "Save record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
