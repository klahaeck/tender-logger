import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

import { clerkConfigured } from "@/lib/auth/identity";

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!clerkConfigured()) return children;
  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      {children}
    </ClerkProvider>
  );
}
