import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";

import { BrandLogo } from "@/components/app/brand-logo";
import { clerkConfigured } from "@/lib/auth/identity";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  if (!clerkConfigured()) redirect("/");
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,var(--surface-glow),transparent_34rem)] p-4">
      <div className="space-y-5 text-center">
        <div>
          <BrandLogo className="mx-auto w-64" />
          <p className="mt-1 text-sm text-muted-foreground">
            Create your private family workspace
          </p>
        </div>
        <SignUp />
      </div>
    </main>
  );
}
