import { CalendarSearch, Users } from "lucide-react";
import { connection } from "next/server";
import { ButtonLink, EmptyState, Skeleton } from "@/components/ui";
import { nightsBetween, todayIST } from "@/lib/dates";
import { catalog, type RoomType } from "@/modules/catalog";
import { inventory } from "@/modules/inventory";
import { pricing, type Quote } from "@/modules/pricing";
import { lineIssues, toCartQuote, type CartQuote, type RoomCardView } from "../_lib/book";
import { parseCartParams } from "../_lib/cart";
import { enquiryHref } from "../_lib/enquiry";
import { guestsLabel } from "../_lib/format";
import { partyFitsNoRoom } from "../_lib/rooms";
import { parseSearchParams, validateSearch } from "../_lib/search";
import { roomsForEnquiry, suggestCart } from "../_lib/stay";
import { RestoreStay } from "./restore-stay";
import { RetryError } from "./retry-error";
import { SearchForm } from "./search-form";
import { SearchSummary } from "./search-summary";
import { StayEditor } from "./stay-editor";

type Params = Promise<Record<string, string | string[] | undefined>>;

/**
 * Server component for /rooms, the stay builder. Reads the URL (dates, group, cart) and the clock,
 * then the cached catalog, fresh availability ("N left" is never cached), a one-room price per type
 * and the live quote for the cart. The editor changes the URL; this re-renders with a new quote, so
 * every price comes from pricing on the server.
 */
export async function StayBuilder({ searchParams }: { searchParams: Params }) {
  const raw = await searchParams;
  const values = parseSearchParams(raw);
  const cart = parseCartParams(raw);
  const hasCartParam = raw.room !== undefined;
  await connection();
  const today = todayIST();
  const issue = validateSearch(values, today);

  if (issue) {
    const group = issue.code === "too-many-guests" || issue.code === "too-long";
    let rooms = 1;
    if (group) {
      try {
        rooms = roomsForEnquiry(await catalog.listRoomTypes(), values, cart.lines);
      } catch {
        rooms = cart.lines.length || 1; // context only for the enquiry
      }
    }
    return (
      <div className="flex flex-col gap-8">
        {issue.code === "missing-dates" && !hasCartParam ? <RestoreStay /> : null}
        <EmptyState
          icon={group ? <Users strokeWidth={1.5} /> : <CalendarSearch strokeWidth={1.5} />}
          message={
            issue.code === "missing-dates"
              ? "Choose your dates and group to see which rooms are free."
              : issue.message
          }
          action={
            group ? (
              <ButtonLink
                href={enquiryHref({
                  checkIn: values.checkIn,
                  checkOut: values.checkOut,
                  adults: values.adults,
                  children: values.children,
                  rooms,
                })}
              >
                Send a group enquiry
              </ButtonLink>
            ) : undefined
          }
          className="pb-0"
        />
        <div className="rounded-card border border-border bg-surface p-5 md:p-6">
          <SearchForm today={today} defaults={values} />
        </div>
      </div>
    );
  }

  const nights = nightsBetween(values.checkIn, values.checkOut);
  const party = { adults: values.adults, children: values.children };
  const stay = { checkIn: values.checkIn, checkOut: values.checkOut, ...party };

  let rooms: RoomCardView[];
  let types: RoomType[];
  let quote: CartQuote = null;
  try {
    const [listed, availability] = await Promise.all([
      catalog.listRoomTypes(),
      inventory.availability({ checkIn: values.checkIn, checkOut: values.checkOut }),
    ]);
    if (!availability.ok) throw new Error(`availability: ${availability.code}`);
    types = listed;
    rooms = await Promise.all(
      types.map(async (t) => {
        const a = availability.rooms.find((r) => r.roomTypeId === t.id);
        // One room, one adult: the room price does not depend on the party (pricing).
        const priced = await Promise.all(
          t.ratePlans.map(async (p) => ({
            plan: p,
            result: await pricing.quote({
              checkIn: values.checkIn,
              checkOut: values.checkOut,
              rooms: [{ roomTypeId: t.id, ratePlanId: p.id, adults: 1, children: 0 }],
            }),
          })),
        );
        let cheapest: { plan: RoomType["ratePlans"][number]; quote: Quote } | null = null;
        for (const { plan, result } of priced) {
          if (result.ok && (!cheapest || result.quote.totalPaise < cheapest.quote.totalPaise))
            cheapest = { plan, quote: result.quote };
        }
        return {
          id: t.id,
          slug: t.slug,
          name: t.name,
          description: t.description,
          photo: t.photos[0] ?? null,
          maxAdults: t.maxAdults,
          maxOccupancy: t.maxOccupancy,
          freeUnits: a && !a.soldOut && !a.blackedOut ? Math.max(a.availableUnits, 0) : 0,
          plans: t.ratePlans.map((p) => ({
            id: p.id,
            name: p.name,
            inclusions: p.inclusions,
            refundable: p.refundable,
          })),
          defaultPlanId: cheapest?.plan.id,
          from: cheapest
            ? {
                planName: cheapest.plan.name,
                totalPaise: cheapest.quote.totalPaise,
                gstPaise: cheapest.quote.gstPaise,
                // Display only: the stay price for one room spread over its nights.
                perNightPaise: Math.round(cheapest.quote.totalPaise / nights),
              }
            : null,
        };
      }),
    );
    // Price only a cart that passes the local rules; the server is still the only price source.
    if (cart.lines.length && lineIssues(rooms, cart.lines, null).every((i) => i === null)) {
      quote = toCartQuote(
        await pricing.quote({
          checkIn: values.checkIn,
          checkOut: values.checkOut,
          rooms: cart.lines,
        }),
      );
    }
  } catch (error) {
    console.error("stay builder failed", error);
    return (
      <div className="flex flex-col gap-6">
        <SearchSummary values={values} today={today} />
        <RetryError
          title="We could not load the rooms"
          message="Something went wrong on our side. Please try again."
        />
      </div>
    );
  }

  if (rooms.length === 0) {
    return <EmptyState message="No rooms are listed yet. Please check back soon." />;
  }

  const tooBig = partyFitsNoRoom(types, party);
  const suggested = tooBig ? null : suggestCart(rooms, party);
  const group = enquiryHref({
    checkIn: values.checkIn,
    checkOut: values.checkOut,
    adults: values.adults,
    children: values.children,
    rooms: roomsForEnquiry(rooms, party, cart.lines),
  });

  return (
    <div className="flex flex-col gap-6">
      <SearchSummary values={values} today={today} />
      {tooBig ? (
        <p className="flex items-start gap-2 text-body text-muted" role="status">
          <Users className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.5} aria-hidden />
          <span>
            Your group ({guestsLabel(values.adults, values.children)}) needs more than 4 rooms. We
            book bigger groups by enquiry.
          </span>
        </p>
      ) : null}
      <StayEditor
        rooms={rooms}
        stay={stay}
        initialLines={cart.lines}
        hasCartParam={hasCartParam}
        quote={quote}
        dropped={cart.dropped}
        nights={nights}
        suggested={suggested}
        groupTooBig={tooBig}
        groupHref={group}
      />
    </div>
  );
}

export function StayBuilderSkeleton() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label="Loading rooms">
      <Skeleton className="h-14 rounded-card" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="aspect-[4/3] rounded-card" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-48 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    </div>
  );
}
