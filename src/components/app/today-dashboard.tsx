"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, Clock3, LockKeyhole, Users } from "lucide-react";

import { finalizeDailyLogAction } from "@/app/actions";
import { CareEntryDialog } from "@/components/forms/care-entry-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDay, formatTime } from "@/lib/domain/dates";
import { fetchDashboard } from "@/lib/fetchers";
import type { DashboardData } from "@/lib/domain/types";

function childNames(ids: string[], data: DashboardData) {
  return ids.map((id) => data.children.find((child) => child.id === id)?.displayName).filter(Boolean).join(" + ");
}

export function TodayDashboard({ date, initialData }: { date: string; initialData: DashboardData }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["dashboard", date], queryFn: () => fetchDashboard(date), initialData });
  const finalize = useMutation({
    mutationFn: () => finalizeDailyLogAction(date),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard", date] }),
  });

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Daily care log</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{formatDay(date)}</h1>
          <p className="mt-2 text-sm text-muted-foreground">A clear, factual view of today’s care for both children.</p>
        </div>
        <CareEntryDialog date={date} childOptions={data.children} caregivers={data.caregivers} />
      </div>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden border-0 bg-primary text-primary-foreground shadow-lg shadow-primary/10">
          <CardContent className="p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-primary-foreground/70">Routine progress</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight">{data.completion.percent}%</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3"><CheckCircle2 className="size-6" /></div>
            </div>
            <Progress
              value={data.completion.percent}
              aria-label="Routine completion"
              className="mt-6 bg-white/15 [&_[data-slot=progress-indicator]]:bg-white"
            />
            <p className="mt-3 text-sm text-primary-foreground/75">{data.completion.completed} of {data.completion.total} routine items recorded</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col justify-between p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground"><Users className="size-5" /></span>
              <div>
                <p className="font-medium">{data.children.map((child) => child.displayName).join(" & ")}</p>
                <p className="text-sm text-muted-foreground">{data.caregivers.length} caregivers configured</p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between border-t pt-4 text-sm">
              <span className="text-muted-foreground">Day status</span>
              <Badge variant={data.dailyLog.status === "finalized" ? "default" : "secondary"}>
                {data.dailyLog.status === "finalized" ? "Finalized" : "Open"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="routine-heading">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 id="routine-heading" className="text-xl font-semibold tracking-tight">Today’s routine</h2>
            <p className="mt-1 text-sm text-muted-foreground">Tap an item to record who handled it and when.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.tasks.map((task) => {
            const recorded = Boolean(task.entry);
            const trigger = (
              <button className="group flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${recorded ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                  {recorded ? <CheckCircle2 className="size-5" /> : <Clock3 className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{task.label}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {recorded && task.entry
                      ? `${childNames(task.entry.childIds, data)} · ${formatTime(task.entry.occurredAt, data.workspace.timezone)}`
                      : `${childNames(task.childIds, data)} · around ${task.suggestedTime}`}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
              </button>
            );
            return recorded ? <div key={task.id}>{trigger}</div> : (
              <CareEntryDialog key={task.id} task={task} date={date} childOptions={data.children} caregivers={data.caregivers} trigger={trigger} />
            );
          })}
        </div>
      </section>

      {data.dailyLog.status === "open" && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted"><LockKeyhole className="size-4" /></span>
              <div>
                <p className="font-medium">Ready to close the day?</p>
                <p className="mt-1 text-sm text-muted-foreground">Finalizing locks the routine snapshot. Later additions remain possible and are labeled with their entry time.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => finalize.mutate()} disabled={finalize.isPending}>
              <LockKeyhole className="size-4" /> {finalize.isPending ? "Finalizing…" : "Finalize day"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
