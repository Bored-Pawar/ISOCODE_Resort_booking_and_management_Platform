import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requireDevStaff } from "../_lib/access";

async function Gate({ children }: { children: React.ReactNode }) {
  await requireDevStaff();
  return children;
}

/** Wrap each /dev page's content. Every page checks for itself; a layout check alone is not enough. */
export function DevGate({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Skeleton className="m-8 h-9 w-64" />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
