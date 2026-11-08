import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, CalendarX, Check, Users } from "lucide-react";
import { Badge, ButtonLink, Card, Skeleton } from "@/components/ui";
import { nightsBetween, todayIST } from "@/lib/dates";
import { catalog, type RoomType } from "@/modules/catalog";
import { inventory } from "@/modules/inventory";
import { pricing } from "@/modules/pricing";
import { enquiryHref } from "../_lib/enquiry";
import { occupancyLabel } from "../_lib/format";
import { parseCartParams, stayHref, type CartLine } from "../_lib/cart";
import { availabilityView, EXPLORE_ROOMS, toPlanView, type PlanView } from "../_lib/room-detail";
import { partyForRoom } from "../_lib/stay";
import {
  parseSearchParams,
  toSearchParams,
  validateSearch,
  type SearchValues,
} from "../_lib/search";
import { RoomStayPanel } from "./room-stay-panel";
import { StayNavLink, StayNavText } from "./stay-nav-link";
import { Gallery } from "./gallery";
import { RetryError } from "./retry-error";
import { SearchForm } from "./search-form";
import { SearchSummary } from "./search-summary";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Server component for /rooms/[slug]. Reads the URL and the clock (so it renders inside
 * <Suspense>), then the catalog, fresh availability and a one-room quote per rate plan. The browser gets
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
  const raw = await searchParams;
  const values = parseSearchParams(raw);
  const cart = { lines: parseCartParams(raw).lines, hasCartParam: raw.room !== undefined };
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
  const listHref = issue
    ? "/rooms"
    : cart.hasCartParam
      ? stayHref(
          {
            checkIn: values.checkIn,
            checkOut: values.checkOut,
            adults: values.adults,
            children: values.children,
          },
          cart.lines,
        )
      : `/rooms?${query}`;
  const action = `/rooms/${room.slug}`;
  const aside = issue ? null : await stayPanel(room, values, cart);

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
          {occupancyLabel(room)}
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
          <p className="mt-4 text-small text-muted">
            Plans and Add to my stay appear once your dates are set. Not sure about this room yet?
          </p>
          <StayNavText nav={EXPLORE_ROOMS} />
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

/** Availability, one-room quotes and the view-only booking card for a valid stay. Never throws. */
async function stayPanel(
  room: RoomType,
  values: SearchValues,
  cart: { lines: CartLine[]; hasCartParam: boolean },
) {
  const party = { adults: values.adults, children: values.children };
  const roomParty = partyForRoom(room, party);
  const group = enquiryHref({
    room: room.slug,
    checkIn: values.checkIn,
    checkOut: values.checkOut,
    adults: values.adults,
    children: values.children,
  });

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
    units = a && !a.soldOut && !a.blackedOut ? Math.max(a.availableUnits, 0) : 0;
    // One room per plan. The room price does not depend on the party; the party only has to fit.
    const results = await Promise.all(
      room.ratePlans.map(async (plan) => ({
        plan,
        result: await pricing.quote({
          checkIn: values.checkIn,
          checkOut: values.checkOut,
          rooms: [{ roomTypeId: room.id, ratePlanId: plan.id, ...roomParty }],
        }),
      })),
    );
    plans = results.flatMap(({ plan, result }) =>
      result.ok ? [toPlanView(plan, result.quote)] : [],
    );
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
        <Badge tone="warning" icon={<CalendarX strokeWidth={1.5} />} className="self-start">
          {availabilityView(0).label}
        </Badge>
        <p className="text-body text-muted">
          {units < 1
            ? "This room is sold out for these dates. Try other dates with Change above, or send us an enquiry with your dates and group and we will see what we can do."
            : "We have not published prices for these dates yet. Send us an enquiry with your dates and group, or try different dates."}
        </p>
        <ButtonLink href={group} variant="secondary">
          Send an enquiry
        </ButtonLink>
        <StayNavLink
          url={{
            hasCartParam: cart.hasCartParam,
            stay: { checkIn: values.checkIn, checkOut: values.checkOut, ...party },
            lines: cart.lines,
          }}
          className="-my-1 self-center"
        />
      </Card>
    );
  }

  return (
    <RoomStayPanel
      room={{
        id: room.id,
        name: room.name,
        maxAdults: room.maxAdults,
        maxOccupancy: room.maxOccupancy,
        freeUnits: units,
      }}
      plans={plans}
      stay={{ checkIn: values.checkIn, checkOut: values.checkOut, ...party }}
      initialParty={roomParty}
      urlLines={cart.lines}
      hasCartParam={cart.hasCartParam}
      nights={nightsBetween(values.checkIn, values.checkOut)}
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
