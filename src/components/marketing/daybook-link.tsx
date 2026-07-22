import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DaybookLink({
  signedIn,
  className,
  signedOutLabel = "Start your daybook",
}: {
  signedIn: boolean;
  className?: string;
  signedOutLabel?: string;
}) {
  return (
    <Link
      href={signedIn ? "/app" : "/sign-up"}
      className={cn(buttonVariants({ size: "lg" }), className)}
    >
      {signedIn ? "View your daybook" : signedOutLabel}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}
