import "server-only";

export interface Identity {
  authUserId: string;
  email: string;
  displayName: string;
  mfaEnabled: boolean;
  demo: boolean;
}

export function clerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
}

export async function getIdentity(): Promise<Identity> {
  if (!clerkConfigured()) {
    return {
      authUserId: "demo_owner",
      email: process.env.APP_OWNER_EMAIL ?? "owner@example.local",
      displayName: "Demo owner",
      mfaEnabled: true,
      demo: true,
    };
  }

  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const session = await auth();
  if (!session.userId) {
    const { redirect } = await import("next/navigation");
    redirect("/sign-in");
  }

  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");

  const primaryEmail =
    user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)
      ?.emailAddress ?? user.emailAddresses[0]?.emailAddress;

  if (!primaryEmail) throw new Error("EMAIL_REQUIRED");

  return {
    authUserId: user.id,
    email: primaryEmail.toLowerCase(),
    displayName:
      [user.firstName, user.lastName].filter(Boolean).join(" ") || primaryEmail,
    mfaEnabled: user.twoFactorEnabled,
    demo: false,
  };
}
