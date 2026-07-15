"use client";

import { useQuery } from "@tanstack/react-query";
import { Quote, ShieldCheck } from "lucide-react";

import { CorrectionDialog } from "@/components/forms/correction-dialog";
import { IncidentDialog } from "@/components/forms/incident-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { INCIDENT_LABELS } from "@/lib/domain/constants";
import { formatDateTime } from "@/lib/domain/dates";
import { fetchIncidents } from "@/lib/fetchers";
import type { Child, Incident, Workspace } from "@/lib/domain/types";

export function IncidentsView({ initialData, childOptions, workspace }: { initialData: Incident[]; childOptions: Child[]; workspace: Workspace }) {
  const { data } = useQuery({ queryKey: ["incidents"], queryFn: fetchIncidents, initialData });
  return (
    <div className="space-y-5">
      <div className="flex justify-end"><IncidentDialog childOptions={childOptions} /></div>
      <div className="space-y-4">
        {data.map((incident) => (
          <Card key={incident.id}>
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-900"><ShieldCheck className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{INCIDENT_LABELS[incident.category]}</Badge><span className="text-xs text-muted-foreground">Occurred {formatDateTime(incident.occurredAt, workspace.timezone)}</span></div>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{incident.observations}</p>
                  {incident.exactQuotes && <blockquote className="mt-4 flex gap-3 rounded-xl bg-muted/60 p-4 text-sm italic"><Quote className="size-4 shrink-0 text-muted-foreground" />{incident.exactQuotes}</blockquote>}
                  {(incident.immediateActions || incident.outcome) && <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">{incident.immediateActions && <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Immediate actions</p><p className="mt-1 text-sm">{incident.immediateActions}</p></div>}{incident.outcome && <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outcome</p><p className="mt-1 text-sm">{incident.outcome}</p></div>}</div>}
                  <div className="mt-3 flex justify-end"><CorrectionDialog recordType="incident" recordId={incident.id} currentText={incident.observations} /></div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {data.length === 0 && <Card className="border-dashed"><CardContent className="p-12 text-center"><ShieldCheck className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">No incidents recorded</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">When needed, document observable facts, exact words, context, and response without diagnostic conclusions.</p></CardContent></Card>}
      </div>
    </div>
  );
}
