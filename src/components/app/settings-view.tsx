"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, LockKeyhole, MailPlus, ShieldCheck, UserRoundX } from "lucide-react";

import { inviteReviewerAction, revokeReviewerAction, updateSettingsAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SettingsData } from "@/lib/domain/types";

export function SettingsView({ data }: { data: SettingsData }) {
  const [hardDeleteEnabled, setHardDeleteEnabled] = useState(data.workspace.hardDeleteEnabled);
  const [routineItems, setRoutineItems] = useState(
    data.template.items.map((item) => ({
      id: item.id,
      label: item.label,
      suggestedTime: item.suggestedTime,
      childIds: item.childIds,
      active: item.active,
    })),
  );
  const [message, setMessage] = useState<string>();
  const save = useMutation({
    mutationFn: async (formData: FormData) => {
      const result = await updateSettingsAction({
        name: formData.get("workspaceName")?.toString(),
        timezone: formData.get("timezone")?.toString(),
        hardDeleteEnabled,
        children: data.children.map((child) => ({ id: child.id, displayName: formData.get(`child-${child.id}`)?.toString() })),
        caregivers: data.caregivers.map((caregiver) => ({ id: caregiver.id, displayName: formData.get(`caregiver-${caregiver.id}`)?.toString(), relationship: formData.get(`relationship-${caregiver.id}`)?.toString() })),
        routineItems,
      });
      if (!result.ok) throw new Error(result.error ?? "Unable to save settings");
    },
    onSuccess: () => setMessage("Settings saved."),
    onError: (cause) => setMessage(cause.message),
  });
  const invite = useMutation({
    mutationFn: async (formData: FormData) => {
      const result = await inviteReviewerAction({ email: formData.get("email")?.toString(), displayName: formData.get("displayName")?.toString() });
      if (!result.ok) throw new Error(result.error ?? "Unable to invite reviewer");
    },
    onSuccess: () => setMessage("Reviewer invitation created."),
    onError: (cause) => setMessage(cause.message),
  });
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Family workspace</CardTitle><CardDescription>These names appear throughout the private app and generated reports.</CardDescription></CardHeader>
        <CardContent>
          <form action={(formData) => save.mutate(formData)} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="workspaceName">Workspace name</Label><Input id="workspaceName" name="workspaceName" defaultValue={data.workspace.name} required /></div><div className="space-y-2"><Label htmlFor="timezone">IANA timezone</Label><Input id="timezone" name="timezone" defaultValue={data.workspace.timezone} required /></div></div>
            <div><p className="mb-3 text-sm font-medium">Children</p><div className="grid gap-3 sm:grid-cols-2">{data.children.map((child) => <div key={child.id} className="space-y-2"><Label htmlFor={`child-${child.id}`}>Display name</Label><Input id={`child-${child.id}`} name={`child-${child.id}`} defaultValue={child.displayName} required /></div>)}</div></div>
            <div><p className="mb-3 text-sm font-medium">Caregivers</p><div className="space-y-3">{data.caregivers.map((caregiver) => <div key={caregiver.id} className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={`caregiver-${caregiver.id}`}>Name</Label><Input id={`caregiver-${caregiver.id}`} name={`caregiver-${caregiver.id}`} defaultValue={caregiver.displayName} required /></div><div className="space-y-2"><Label htmlFor={`relationship-${caregiver.id}`}>Relationship</Label><Input id={`relationship-${caregiver.id}`} name={`relationship-${caregiver.id}`} defaultValue={caregiver.relationship} required /></div></div>)}</div></div>
            <div>
              <div className="mb-3 flex items-end justify-between"><div><p className="text-sm font-medium">Daily routine</p><p className="mt-1 text-xs text-muted-foreground">Saving changes creates template version {data.template.version + 1}; past days keep their original version.</p></div><Badge variant="outline">v{data.template.version}</Badge></div>
              <div className="max-h-96 space-y-2 overflow-y-auto rounded-xl border p-2">
                {routineItems.map((item, index) => (
                  <div key={item.id} className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-[auto_1fr_7rem] sm:items-center">
                    <Switch checked={item.active} onCheckedChange={(checked) => setRoutineItems((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, active: checked } : value))} aria-label={`Enable ${item.label}`} />
                    <Input value={item.label} onChange={(event) => setRoutineItems((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, label: event.target.value } : value))} aria-label="Routine label" />
                    <Input type="time" value={item.suggestedTime} onChange={(event) => setRoutineItems((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, suggestedTime: event.target.value } : value))} aria-label={`Suggested time for ${item.label}`} />
                    <div className="sm:col-start-2 sm:col-span-2 flex flex-wrap gap-2">{data.children.map((child) => { const selected = item.childIds.includes(child.id); return <Button key={child.id} type="button" size="xs" variant={selected ? "secondary" : "outline"} onClick={() => setRoutineItems((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, childIds: selected ? value.childIds.filter((id) => id !== child.id) : [...value.childIds, child.id] } : value))}>{child.displayName}</Button>; })}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-xl border p-4"><div><p className="flex items-center gap-2 text-sm font-medium"><LockKeyhole className="size-4" />Allow permanent deletion</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Disabled by default. Purges require owner access, MFA, a reason, and typed confirmation.</p></div><Switch checked={hardDeleteEnabled} onCheckedChange={setHardDeleteEnabled} aria-label="Allow permanent deletion" /></div>
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
            <Button type="submit" disabled={save.isPending}><Check className="size-4" />{save.isPending ? "Saving…" : "Save workspace"}</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle>Attorney reviewers</CardTitle><CardDescription>Reviewers can see finalized records and download reports but cannot change data or settings.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {data.members.filter((member) => member.role === "reviewer").map((member) => <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-medium">{member.displayName}</p><p className="text-xs text-muted-foreground">{member.email}</p></div><div className="flex items-center gap-2"><Badge variant="secondary" className="capitalize">{member.status}</Badge>{member.status !== "revoked" && <Button variant="ghost" size="icon-sm" aria-label={`Revoke ${member.displayName}`} onClick={async () => { await revokeReviewerAction(member.id); location.reload(); }}><UserRoundX className="size-4" /></Button>}</div></div>)}
            <form action={(formData) => invite.mutate(formData)} className="space-y-3 rounded-xl bg-muted/50 p-4"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="displayName">Reviewer name</Label><Input id="displayName" name="displayName" required /></div><div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div></div><Button type="submit" variant="outline" disabled={invite.isPending}><MailPlus className="size-4" />{invite.isPending ? "Inviting…" : "Invite reviewer"}</Button></form>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" />Security posture</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>Invitation-only access with owner and reviewer roles.</p><p>Server-side authorization on every read, mutation, file, and report route.</p><p>Original files stay private and are served with no-store browser caching.</p><p>Production infrastructure should require MFA and managed backups.</p></CardContent></Card>
      </div>
    </div>
  );
}
