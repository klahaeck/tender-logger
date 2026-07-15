import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";

import { clerkConfigured } from "@/lib/auth/identity";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  if (!clerkConfigured()) redirect("/");
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,var(--surface-glow),transparent_34rem)] p-4">
      <div className="space-y-5 text-center">
        <div>
          <p className="text-2xl font-semibold tracking-tight">Family Daybook</p>
          <p className="mt-1 text-sm text-muted-foreground">Invitation-only family records</p>
        </div>
        <SignIn />
      </div>
    </main>
  );
}
