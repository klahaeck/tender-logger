import { notFound } from "next/navigation";

import { AppShell, PageHeading } from "@/components/app/app-shell";
import { SettingsView } from "@/components/app/settings-view";
import { getPageRequestContext, getRepository } from "@/lib/repository";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const repository = await getRepository();
  const context = await getPageRequestContext();
  if (context.member.role !== "owner") notFound();
  const data = await repository.getSettings(context);
  const timezones = [
    ...new Set(["UTC", data.workspace.timezone, ...Intl.supportedValuesOf("timeZone")]),
  ].sort();
  return (
    <AppShell workspace={context.workspace} member={context.member}>
      <PageHeading
        eyebrow="Owner only"
        title="Workspace settings"
        description="Configure family labels, reviewer access, timezone, and irreversible deletion policy."
      />
      <SettingsView data={data} timezones={timezones} />
    </AppShell>
  );
}
