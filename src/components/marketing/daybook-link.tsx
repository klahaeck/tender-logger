import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DaybookLink({
  signedIn,
  className,
}: {
  signedIn: boolean;
  className?: string;
}) {
  return (
    <Link
      href={signedIn ? "/app" : "/sign-up"}
      className={cn(buttonVariants({ size: "lg" }), className)}
    >
      {signedIn ? "View your daybook" : "Start your daybook"}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}
