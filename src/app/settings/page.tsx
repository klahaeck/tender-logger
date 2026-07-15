import { notFound } from "next/navigation";
import { AppShell, PageHeading } from "@/components/app/app-shell";
import { SettingsView } from "@/components/app/settings-view";
import { getRepository, getRequestContext } from "@/lib/repository";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const repository = await getRepository();
  const context = await getRequestContext();
  if (context.member.role !== "owner") notFound();
  const data = await repository.getSettings(context);
  return <AppShell workspace={context.workspace} member={context.member}><PageHeading eyebrow="Owner only" title="Workspace settings" description="Configure family labels, reviewer access, timezone, and irreversible deletion policy." /><SettingsView data={data} /></AppShell>;
}
