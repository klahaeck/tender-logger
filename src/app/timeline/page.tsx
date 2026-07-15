import { AppShell, PageHeading } from "@/components/app/app-shell";
import { TimelineView } from "@/components/app/timeline-view";
import { getRepository, getRequestContext } from "@/lib/repository";

export const metadata = { title: "Timeline" };

export default async function TimelinePage() {
  const repository = await getRepository();
  const context = await getRequestContext();
  const data = await repository.getTimeline(context);
  return <AppShell workspace={context.workspace} member={context.member}><PageHeading eyebrow="Review" title="Parenting timeline" description="Search and filter caregiving, appointments, and factual incidents in chronological order." /><TimelineView initialData={data} canPurge={context.member.role === "owner" && context.workspace.hardDeleteEnabled} /></AppShell>;
}
