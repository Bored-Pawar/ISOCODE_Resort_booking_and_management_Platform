import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Check, Users } from "lucide-react";
import { ButtonLink, Card, Skeleton } from "@/components/ui";
import { nightsBetween, todayIST } from "@/lib/dates";
import { catalog, type RoomType } from "@/modules/catalog";
import { inventory } from "@/modules/inventory";
import { pricing } from "@/modules/pricing";
import { enquiryHref } from "../_lib/enquiry";
import { guestsLabel, occupancyLabel } from "../_lib/format";
import { fitsParty } from "../_lib/rooms";
import { availabilityNote, toPlanView, type PlanView } from "../_lib/room-detail";
import {
  parseSearchParams,
  toSearchParams,
  validateSearch,
  type SearchValues,
} from "../_lib/search";
import { BookingPanel } from "./booking-panel";
import { Gallery } from "./gallery";
import { RetryError } from "./retry-error";
import { SearchForm } from "./search-form";
import { SearchSummary } from "./search-summary";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Server component for /rooms/[slug]. Reads the URL and the clock (so it renders inside
 * <Suspense>), then the catalog, availability and one quote per rate plan. The browser gets
 * prices as props; nothing is fetched client side.
 */
export async function RoomDetail({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const values = parseSearchParams(await searchParams);
  await connection();
  const today = todayIST();

  let room: RoomType | null;
  try {
    room = await catalog.getRoomTypeBySlug(slug);
  } catch (error) {
    console.error("room detail failed", error);
    return (
      <RetryError
        title="We could not load this room"
        message="Something went wrong on our side. Please try again."
      />
    );
  }
  if (!room) notFound();

  const issue = validateSearch(values, today);
  const query = issue ? "" : toSearchParams(values).toString();
  const listHref = query ? `/rooms?${query}` : "/rooms";
  const action = `/rooms/${room.slug}`;
  const aside = issue ? null : await stayPanel(room, values, listHref);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={listHref}
          className="inline-flex h-11 items-center gap-2 text-small font-semibold text-accent hover:underline"
        >
          <ArrowLeft className="size-[18px]" strokeWidth={1.5} aria-hidden />
          All rooms
        </Link>
        <div className="mt-2">
          <Gallery photos={room.photos} name={room.name} />
        </div>
      </div>

      <header>
        <h1 className="font-display text-display-sm font-medium md:text-display">{room.name}</h1>
        <p className="mt-2 flex items-center gap-2 text-small text-muted">
          <Users className="size-[18px]" strokeWidth={1.5} aria-hidden />
          {occupancyLabel(room.maxAdults, room.maxChildren)}
        </p>
        <p className="mt-3 max-w-read text-body text-muted">{room.description}</p>
      </header>

      {issue ? (
        <Card className="p-5 md:p-6" padded={false}>
          <h2 className="font-display text-h2 font-medium">See prices for your dates</h2>
          <p className="mt-1 mb-4 text-small text-muted">
            {issue.code === "missing-dates"
              ? "Choose your dates and guests to see what this room costs and whether it is free."
              : issue.message}
          </p>
          <SearchForm today={today} defaults={values} action={action} submitLabel="Show prices" />
        </Card>
      ) : (
        <SearchSummary values={values} today={today} action={action} />
      )}

      <div className={aside ? "grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]" : ""}>
        <div className="flex flex-col gap-10">
          <section aria-labelledby="amenities">
            <h2 id="amenities" className="font-display text-h1 font-medium">
              What is in the room
            </h2>
            <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {room.amenities.map((a) => (
                <li key={a} className="flex items-center gap-3 text-body">
                  <Check className="size-[18px] text-accent" strokeWidth={1.5} aria-hidden />
                  {a}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="good-to-know">
            <h2 id="good-to-know" className="font-display text-h1 font-medium">
              Good to know
            </h2>
            <ul className="mt-4 flex max-w-read flex-col gap-2 text-body text-muted">
              <li>Prices include GST at the rate for the tariff.</li>
              <li>
                We do not ask for passport details online. Foreign guests show a passport at
                check-in.
              </li>
              <li>Each plan says whether it is refundable.</li>
            </ul>
          </section>
        </div>

        {aside ? (
          <aside className="order-first lg:sticky lg:top-6 lg:order-none lg:self-start">
            {aside}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** Availability, quotes and the booking card for a valid stay. Never throws. */
async function stayPanel(room: RoomType, values: SearchValues, listHref: string) {
  const party = { adults: values.adults, children: values.children };

  if (!fitsParty(room, party)) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-h2 font-medium">Too many guests for this room</p>
        <p className="text-body text-muted">
          It takes {occupancyLabel(room.maxAdults, room.maxChildren).toLowerCase()}, and your group
          is {guestsLabel(values.adults, values.children)}. Booking for a group?
        </p>
        <ButtonLink
          href={enquiryHref({
            subject: `Group enquiry: ${room.name}`,
            body: `We are ${guestsLabel(values.adults, values.children)}, ${values.checkIn} to ${values.checkOut}.`,
          })}
        >
          Send a group enquiry
        </ButtonLink>
        <ButtonLink href={listHref} variant="secondary">
          See other rooms
        </ButtonLink>
      </Card>
    );
  }

  let plans: PlanView[];
  let units: number;
  try {
    const availability = await inventory.availability({
      roomTypeId: room.id,
      checkIn: values.checkIn,
      checkOut: values.checkOut,
    });
    if (!availability.ok) throw new Error(`availability: ${availability.code}`);
    const a = availability.rooms.find((r) => r.roomTypeId === room.id);
    units = a && !a.soldOut && !a.blackedOut ? a.availableUnits : 0;

    plans = [];
    if (units >= 1) {
      const results = await Promise.all(
        room.ratePlans.map(async (plan) => ({
          plan,
          result: await pricing.quote({
            roomTypeId: room.id,
            ratePlanId: plan.id,
            checkIn: values.checkIn,
            checkOut: values.checkOut,
            adults: values.adults,
            children: values.children,
          }),
        })),
      );
      plans = results.flatMap(({ plan, result }) =>
        result.ok ? [toPlanView(plan, result.quote)] : [],
      );
    }
  } catch (error) {
    console.error("room detail stay failed", error);
    return (
      <Card>
        <RetryError
          title="We could not check this room"
          message="Something went wrong on our side. Please try again."
        />
      </Card>
    );
  }

  if (units < 1 || plans.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-h2 font-medium">Not available for these dates</p>
        <p className="text-body text-muted">
          {units < 1
            ? "Try different dates with Change above, or look at our other rooms."
            : "We have not published prices for these dates yet. Try different dates, or look at our other rooms."}
        </p>
        <ButtonLink href={listHref} variant="secondary">
          See other rooms
        </ButtonLink>
      </Card>
    );
  }

  return (
    <BookingPanel
      plans={plans}
      base={{
        roomTypeId: room.id,
        checkIn: values.checkIn,
        checkOut: values.checkOut,
        adults: values.adults,
        children: values.children,
      }}
      nights={nightsBetween(values.checkIn, values.checkOut)}
      availability={availabilityNote(units)}
    />
  );
}

export function RoomDetailSkeleton() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label="Loading room">
      <Skeleton className="aspect-[3/2] rounded-card md:aspect-auto md:h-[440px]" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-full max-w-read" />
      </div>
      <Skeleton className="h-14 rounded-card" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </div>
        <Skeleton className="h-96 rounded-card" />
      </div>
    </div>
  );
}
