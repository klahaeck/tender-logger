"use client";

import { useId } from "react";
import { Paperclip } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function MultiCheck({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: Array<{ id: string; displayName: string; secondary?: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const groupId = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {values.map((value) => {
          const checked = selected.includes(value.id);
          return (
            <label
              key={value.id}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition",
                checked ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/50",
              )}
            >
              <Checkbox
                id={`${groupId}-${value.id}`}
                checked={checked}
                onCheckedChange={(next) =>
                  onChange(
                    next
                      ? [...selected, value.id]
                      : selected.filter((item) => item !== value.id),
                  )
                }
              />
              <span>
                <span className="block text-sm font-medium">{value.displayName}</span>
                {value.secondary && <span className="block text-xs text-muted-foreground">{value.secondary}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs font-medium text-destructive">{errors[0]}</p>;
}

export function AttachmentPicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Supporting files (optional)</Label>
      <label
        htmlFor={id}
        className="flex min-h-20 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 px-4 text-center text-sm text-muted-foreground hover:bg-muted/60"
      >
        <Paperclip className="size-4" />
        {files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected` : "Add JPEG, PNG, HEIC, or PDF · up to 15 MB each"}
      </label>
      <input
        id={id}
        className="sr-only"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/heic,application/pdf"
        onChange={(event) => onChange(Array.from(event.target.files ?? []).slice(0, 5))}
      />
    </div>
  );
}

export async function uploadFiles(files: File[], recordType: string, recordId: string) {
  const { uploadAttachmentAction } = await import("@/app/actions");
  for (const file of files) {
    const formData = new FormData();
    formData.set("recordType", recordType);
    formData.set("recordId", recordId);
    formData.set("file", file);
    const result = await uploadAttachmentAction(formData);
    if (!result.ok) throw new Error(result.error ?? "Attachment upload failed");
  }
}
