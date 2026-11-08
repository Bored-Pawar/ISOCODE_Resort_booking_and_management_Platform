import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { CalendarX, CircleAlert } from "lucide-react";
import { ButtonLink, Card, Skeleton, StepIndicator } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { AuthForm } from "@/lib/auth/auth-form";
import { guestSignUpAction } from "@/lib/auth/actions";
import { getGuestProfile } from "@/lib/auth/profile";
import { GUEST_CONSENT_NOTICE, GUEST_SIGN_UP_FIELDS } from "@/lib/auth/sign-up-fields";
import { BOOKING_WINDOW_MESSAGE } from "@/lib/booking-window";
import { todayIST } from "@/lib/dates";
import { formatInr } from "@/lib/money";
import { catalog } from "@/modules/catalog";
import { pricing } from "@/modules/pricing";
import { parseCartParams, stayHref, stayQuery } from "../../../_lib/cart";
import { enquiryHref } from "../../../_lib/enquiry";
import { parseSearchParams, validateSearch } from "../../../_lib/search";
import { HoldForm } from "../../../_components/hold-form";
import { RetryError } from "../../../_components/retry-error";
import { StaySummary } from "../../../_components/stay-summary";

export const metadata: Metadata = { title: "Your details" };

type Params = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function holdMinutes(): number {
  const n = Number(process.env.HOLD_MINUTES ?? "10");
  return Number.isSafeInteger(n) && n > 0 ? n : 10;
}

/**
 * B6 step 2. Reads the cart, dates, group, promo and quoteHash from the URL with the /rooms
 * parser and re-prices on the server. The hold is taken by the holdStay action with the URL's
 * quoteHash, so a price change since /rooms is caught there (or shown here first).
 */
async function Details({ searchParams }: { searchParams: Params }) {
  const raw = await searchParams;
  await connection();
  const today = todayIST();
  const values = parseSearchParams(raw);
  const cart = parseCartParams(raw);
  const quoteHash = first(raw.quoteHash);
  const stay = { checkIn: cart.checkIn, checkOut: cart.checkOut, ...cart.party, promo: cart.promo };
  const back = cart.checkIn && cart.checkOut ? stayHref(stay, cart.lines) : "/rooms";
  const issue = validateSearch(values, today);
  const enquiry = enquiryHref({
    checkIn: cart.checkIn,
    checkOut: cart.checkOut,
    adults: cart.party.adults,
    children: cart.party.children,
    rooms: cart.lines.length || undefined,
  });

  if (issue?.code === "too-far") {
    return (
      <Card className="mt-6 flex max-w-read flex-col items-start gap-3">
        <p className="flex items-start gap-2 text-body">
          <CalendarX className="mt-0.5 size-[18px] shrink-0 text-muted" strokeWidth={1.5} />
          {BOOKING_WINDOW_MESSAGE}
        </p>
        <ButtonLink href={enquiry}>Send us an enquiry</ButtonLink>
      </Card>
    );
  }
  // Anything else wrong with the stay is explained by the stay builder.
  if (issue || !cart.lines.length || cart.dropped || !quoteHash) redirect(back);

  let types;
  let result;
  try {
    [types, result] = await Promise.all([
      catalog.listRoomTypes(),
      pricing.quote({
        checkIn: cart.checkIn,
        checkOut: cart.checkOut,
        promoCode: cart.promo || undefined,
        rooms: cart.lines,
      }),
    ]);
  } catch (error) {
    console.error("details step failed", error);
    return (
      <RetryError
        title="We could not load your stay"
        message="Something went wrong on our side. Nothing was held or charged. Please try again."
      />
    );
  }
  // Price problems (refused promo, missing rate, zero total) are shown on the stay builder.
  if (!result.ok || result.quote.totalPaise <= 0) redirect(back);
  const quote = result.quote;
  const priceMoved = quote.quoteHash !== quoteHash;
  const query = stayQuery(stay, cart.lines);
  query.set("quoteHash", quoteHash);
  const selfHref = `/book/details?${query.toString()}`;
  const acceptHref = (() => {
    const q = new URLSearchParams(query);
    q.set("quoteHash", quote.quoteHash);
    return `/book/details?${q.toString()}`;
  })();

  const user = await getSessionUser();
  const profile = user?.role === "guest" ? await getGuestProfile(user.id) : null;

  const summary = {
    types,
    checkIn: quote.checkIn,
    checkOut: quote.checkOut,
    lines: quote.lines,
    totalPaise: quote.totalPaise,
    gstPaise: quote.gstPaise,
    discountPaise: quote.discountPaise,
    promoCode: quote.promo?.code,
  };

  return (
    <>
      <div className="mt-6">
        <StaySummary placement="mobile" {...summary} />
      </div>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Link
            href={back}
            className="inline-flex min-h-11 items-center self-start text-small font-semibold text-accent hover:underline"
          >
            Change rooms
          </Link>
          {priceMoved ? (
            <Card className="flex flex-col items-start gap-3 border-warning" role="alert">
              <p className="flex items-start gap-2 text-body">
                <CircleAlert className="mt-1 size-[18px] shrink-0 text-warning" strokeWidth={1.5} />
                The price for these rooms changed since you chose them. It is now{" "}
                {formatInr(quote.totalPaise)} incl. {formatInr(quote.gstPaise)} GST. Nothing is held
                yet.
              </p>
              <ButtonLink href={acceptHref} replace>
                Continue at {formatInr(quote.totalPaise)}
              </ButtonLink>
            </Card>
          ) : user && user.role !== "guest" ? (
            <Card className="flex flex-col gap-2">
              <p className="text-body">
                You are signed in with a staff account, which cannot book online.
              </p>
              <p className="text-small text-muted">
                Sign out from the staff area, then sign in or create a guest account to book.
              </p>
            </Card>
          ) : profile ? (
            <Card>
              <h2 className="mb-4 font-display text-h2 font-medium">Your details</h2>
              <HoldForm
                query={query.toString()}
                name={profile.name}
                email={profile.email}
                phone={profile.phone}
                consentLine={
                  profile.consentAt
                    ? `Privacy consent on file since ${new Date(profile.consentAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}.`
                    : "We use your details only to manage this booking."
                }
                totalPaise={quote.totalPaise}
                enquiryHref={enquiry}
                holdMinutes={holdMinutes()}
              />
            </Card>
          ) : (
            <Card>
              <h2 className="font-display text-h2 font-medium">Create an account</h2>
              <p className="mt-1 mb-4 text-small text-muted">
                We only ask for what we need for your stay. Passport details for foreign guests are
                taken at check in. Your rooms are held on the next screen.
              </p>
              <AuthForm
                action={guestSignUpAction}
                next={selfHref}
                submitLabel="Create account and continue"
                fields={GUEST_SIGN_UP_FIELDS}
                consent={GUEST_CONSENT_NOTICE}
              />
              <p className="mt-4 text-small text-muted">
                Already have an account?{" "}
                <Link
                  href={`/login?next=${encodeURIComponent(selfHref)}`}
                  className="font-semibold text-accent hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </Card>
          )}
        </div>
        <StaySummary placement="desktop" {...summary} />
      </div>
    </>
  );
}

function DetailsSkeleton() {
  return (
    <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]" role="status">
      <Skeleton className="h-96 rounded-card" />
      <Skeleton className="hidden h-80 rounded-card lg:block" />
    </div>
  );
}

export default function BookDetailsPage({ searchParams }: { searchParams: Params }) {
  return (
    <main className="mx-auto max-w-page px-4 py-8 md:px-8 md:py-12">
      <StepIndicator current={2} />
      <h1 className="mt-3 font-display text-h1 font-medium">Your details</h1>
      <Suspense fallback={<DetailsSkeleton />}>
        <Details searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
