import type { Metadata } from "next";
import { Suspense } from "react";
import { Clock } from "lucide-react";
import { ButtonLink, Card, Skeleton, StepIndicator } from "@/components/ui";
import { parseCartParams, stayHref } from "../../../_lib/cart";

export const metadata: Metadata = { title: "Your details" };

/** Placeholder until B6 steps 2 and 3 land: no hold is taken and nothing is charged here. */
async function BackToRooms({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cart = parseCartParams(await searchParams);
  const href = cart.checkIn
    ? stayHref({ checkIn: cart.checkIn, checkOut: cart.checkOut, ...cart.party }, cart.lines)
    : "/rooms";
  return (
    <ButtonLink href={href} variant="secondary" className="self-start">
      Back to your stay
    </ButtonLink>
  );
}

export default function BookDetailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="mx-auto max-w-page px-4 py-8 md:px-8 md:py-12">
      <StepIndicator current={2} />
      <h1 className="mt-3 font-display text-h1 font-medium">Your details</h1>
      <Card className="mt-6 flex max-w-read flex-col gap-3">
        <p className="flex items-center gap-2 text-h2 font-medium">
          <Clock className="size-[18px] text-muted" strokeWidth={1.5} aria-hidden />
          This step is coming next
        </p>
        <p className="text-body text-muted">
          Guest details and test payment are still being built. Your rooms are not held and nothing
          has been charged. Your room choices are kept in the link, so you can come back to them.
        </p>
        <Suspense fallback={<Skeleton className="h-11 w-48" />}>
          <BackToRooms searchParams={searchParams} />
        </Suspense>
      </Card>
    </main>
  );
}
