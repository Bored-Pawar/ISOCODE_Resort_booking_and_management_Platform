import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Card } from "@/components/ui/card";

/** 403 screen for a staff page the signed-in role cannot use (the nav never links here). */
export function Forbidden() {
  return (
    <Card className="mx-auto mt-8 flex max-w-lg flex-col items-start gap-3">
      <ShieldX className="size-6 text-danger" strokeWidth={1.5} aria-hidden />
      <h1 className="text-h2">Your role doesn&apos;t include this page</h1>
      <p className="text-small text-muted">
        Error 403. Ask the GM if you need access. Everything your role can use is in the menu.
      </p>
      <Link href="/admin" className="text-small font-semibold text-accent hover:underline">
        Back to overview
      </Link>
    </Card>
  );
}
