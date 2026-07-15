"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileText,
  Menu,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BrandLogo } from "@/components/app/brand-logo";
import { cn } from "@/lib/utils";
import type { Member, Workspace } from "@/lib/domain/types";

const nav = [
  { href: "/", label: "Today", icon: ClipboardCheck },
  { href: "/timeline", label: "Timeline", icon: Clock3 },
  { href: "/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/incidents", label: "Incidents", icon: ShieldAlert },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Navigation({ onNavigate, role }: { onNavigate?: () => void; role: Member["role"] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="space-y-1">
      {nav.filter((item) => role === "owner" || item.href !== "/settings").map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <item.icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  workspace,
  member,
}: {
  children: React.ReactNode;
  workspace: Workspace;
  member: Member;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--surface-glow),transparent_36rem)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-background/92 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col">
        <Link href="/" aria-label="Family Daybook home" className="mb-8 px-2 py-1">
          <BrandLogo decorative className="w-[208px]" />
        </Link>
        <Navigation role={member.role} />
        <div className="mt-auto rounded-2xl border bg-card p-3">
          <div className="flex items-center gap-3">
            {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
              <UserButton />
            ) : (
              <Avatar className="size-9">
                <AvatarFallback className="bg-primary/10 text-primary">DO</AvatarFallback>
              </Avatar>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{member.displayName}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">{member.role}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b bg-background/88 backdrop-blur-xl lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <Link href="/" aria-label="Family Daybook home">
              <BrandLogo decorative className="w-[164px]" />
            </Link>
            <Sheet>
              <SheetTrigger render={<Button variant="outline" size="icon" aria-label="Open navigation" />}>
                <Menu className="size-4" />
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-5">
                <SheetTitle className="mb-6">Navigation</SheetTitle>
                <Navigation role={member.role} />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {workspace.demo && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">
            Local demo workspace · Sample records are clearly marked and must not be used as evidence.
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-9">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden" aria-label="Mobile primary">
        {nav.slice(0, 5).map((item) => (
          <Link key={item.href} href={item.href} className="flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground">
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>}
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
      </div>
      {action}
    </div>
  );
}
