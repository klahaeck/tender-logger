"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { History } from "lucide-react";

import { correctRecordAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RecordType } from "@/lib/domain/types";

export function CorrectionDialog({ recordType, recordId, currentText }: { recordType: RecordType; recordId: string; currentText: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const result = await correctRecordAction({
        recordType,
        recordId,
        correctedText: formData.get("correctedText")?.toString(),
        reason: formData.get("reason")?.toString(),
      });
      if (!result.ok) throw new Error(result.error ?? "Unable to save correction");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      setOpen(false);
    },
    onError: (cause) => setError(cause.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}><History className="size-3.5" /> Correct</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={(data) => mutation.mutate(data)}>
          <DialogHeader><DialogTitle>Add a correction</DialogTitle><DialogDescription>The prior version remains intact. This correction receives its own timestamp, reason, and integrity hash.</DialogDescription></DialogHeader>
          <div className="my-5 space-y-4">
            <div className="space-y-2"><Label htmlFor={`corrected-${recordId}`}>Corrected factual text</Label><Textarea id={`corrected-${recordId}`} name="correctedText" defaultValue={currentText} rows={6} required maxLength={5000} /></div>
            <div className="space-y-2"><Label htmlFor={`reason-${recordId}`}>Reason for correction</Label><Textarea id={`reason-${recordId}`} name="reason" rows={2} required minLength={5} maxLength={500} placeholder="For example: corrected the recorded time after checking the appointment notice." /></div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Append correction"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
