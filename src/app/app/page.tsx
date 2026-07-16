import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { TodayDashboard } from "@/components/app/today-dashboard";
import { isValidLocalDate, localDateInTimezone } from "@/lib/domain/dates";
import { makeQueryClient } from "@/lib/query-client";
import { getRepository, getRequestContext } from "@/lib/repository";

export default async function Home({ searchParams }: PageProps<"/app">) {
  const repository = await getRepository();
  const context = await getRequestContext();
  if (context.member.role === "reviewer") redirect("/app/timeline");
  const today = localDateInTimezone(new Date(), context.workspace.timezone);
  const requestedDate = (await searchParams).date;
  const requested = Array.isArray(requestedDate) ? requestedDate[0] : requestedDate;
  if (requested && (!isValidLocalDate(requested) || requested > today)) {
    redirect("/app");
  }
  const date = requested ?? today;
  const data = await repository.getDashboard(context, date);
  const queryClient = makeQueryClient();
  queryClient.setQueryData(["dashboard", date], data);

  return (
    <AppShell workspace={context.workspace} member={context.member}>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <TodayDashboard date={date} today={today} initialData={data} />
      </HydrationBoundary>
    </AppShell>
  );
}
