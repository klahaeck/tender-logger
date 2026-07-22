// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { TodayDashboard } from "@/components/app/today-dashboard";
import { createSeedState } from "@/lib/repository/seed";
import type { DashboardData } from "@/lib/domain/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/app/actions", () => ({
  correctCareEntryAction: vi.fn(),
  createCareEntryAction: vi.fn(),
  finalizeDailyLogAction: vi.fn(),
}));

vi.mock("@/lib/fetchers", () => ({
  fetchDashboard: vi.fn(),
}));

function renderDashboard() {
  const state = createSeedState(true);
  const dailyLog = state.dailyLogs[0];
  const template = state.templates[0];
  const tasks = template.items.map((item) => ({
    ...item,
    entry: state.careEntries.find((entry) => entry.templateItemId === item.id),
  }));
  const completedCount = tasks.filter(
    (task) => task.entry?.status === "completed" || task.entry?.status === "not_applicable",
  ).length;
  const data: DashboardData = {
    workspace: state.workspace,
    member: state.members[0],
    date: dailyLog.localDate,
    dailyLog,
    children: state.children,
    caregivers: state.caregivers,
    tasks,
    completion: {
      completed: completedCount,
      total: tasks.length,
      percent: Math.round((completedCount / tasks.length) * 100),
    },
    recentEntries: state.careEntries,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <TodayDashboard
        date={dailyLog.localDate}
        today={dailyLog.localDate}
        initialData={data}
      />
    </QueryClientProvider>,
  );

  return { tasks };
}

describe("TodayDashboard", () => {
  it("opens a completed routine item with its existing values", () => {
    const { tasks } = renderDashboard();
    const completed = tasks.find((task) => task.entry);
    if (!completed?.entry) throw new Error("Expected a completed seed routine");

    fireEvent.click(screen.getByRole("button", { name: `Change ${completed.label}` }));

    expect(screen.getByRole("heading", { name: `Change ${completed.label}` })).toBeInTheDocument();
    expect(screen.getByLabelText("Factual notes (optional)")).toHaveValue(completed.entry.notes);
    expect(screen.getByRole("checkbox", { name: /Parent A/ })).toBeChecked();
    expect(screen.getByLabelText("Reason for change")).toBeRequired();
  });

  it("does not preselect a caregiver for an unrecorded routine item", () => {
    const { tasks } = renderDashboard();
    const unrecorded = tasks.find((task) => !task.entry);
    if (!unrecorded) throw new Error("Expected an unrecorded seed routine");

    fireEvent.click(screen.getByRole("button", { name: `Record ${unrecorded.label}` }));

    expect(screen.getByRole("checkbox", { name: /Parent A/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Parent B/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save record" })).toBeDisabled();
  });
});
