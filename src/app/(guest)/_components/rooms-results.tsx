import { CalendarSearch, Users } from "lucide-react";
import { connection } from "next/server";
import { ButtonLink, EmptyState, RoomCardSkeleton, Skeleton } from "@/components/ui";
import { nightsBetween, todayIST } from "@/lib/dates";
import { catalog } from "@/modules/catalog";
import { inventory } from "@/modules/inventory";
import { pricing } from "@/modules/pricing";
import { enquiryHref } from "../_lib/enquiry";
import { guestsLabel } from "../_lib/format";
import {
  classifyRoom,
  needsQuote,
  partyFitsNoRoom,
  type PlanQuote,
  type RoomAvailabilityView,
  type RoomListItem,
} from "../_lib/rooms";
import { parseSearchParams, toSearchParams, validateSearch } from "../_lib/search";
import { RetryError } from "./retry-error";
import { RoomCard } from "./room-card";
import { SearchForm } from "./search-form";
import { SearchSummary } from "./search-summary";

type Params = Promise<Record<string, string | string[] | undefined>>;

/**
 * Server component: reads the URL and the clock (so it renders inside <Suspense>), then asks
 * inventory for availability and pricing for a quote per rate plan. All states are decided here.
 */
export async function RoomsResults({ searchParams }: { searchParams: Params }) {
  const values = parseSearchParams(await searchParams);
  await connection();
  const today = todayIST();
  const issue = validateSearch(values, today);

  if (issue) {
    const group = issue.code === "too-many-guests" || issue.code === "too-long";
    return (
      <div className="flex flex-col gap-8">
        <EmptyState
          icon={<CalendarSearch strokeWidth={1.5} />}
          message={
            issue.code === "missing-dates"
              ? "Choose your dates to see which rooms are free."
              : issue.message
          }
          action={
            group ? (
              <ButtonLink
                href={enquiryHref({ subject: "Group or long stay enquiry" })}
                variant="secondary"
              >
                Send an enquiry
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

  const summary = <SearchSummary values={values} today={today} />;
  const nights = nightsBetween(values.checkIn, values.checkOut);
  const party = { adults: values.adults, children: values.children };
  const query = toSearchParams(values).toString();

  let items: RoomListItem[];
  let noRooms = false;
  try {
    const rooms = await catalog.listRoomTypes();
    noRooms = rooms.length === 0;
    const availability = await inventory.availability({
      checkIn: values.checkIn,
      checkOut: values.checkOut,
    });
    if (!availability.ok) throw new Error(`availability: ${availability.code}`);
    const byRoom = new Map<string, RoomAvailabilityView>(
      availability.rooms.map((a) => [a.roomTypeId, a]),
    );

    items = await Promise.all(
      rooms.map(async (room) => {
        const a = byRoom.get(room.id);
        let quotes: PlanQuote[] = [];
        if (needsQuote(room, a, party)) {
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
          quotes = results.flatMap(({ plan, result }) =>
            result.ok ? [{ planId: plan.id, planName: plan.name, quote: result.quote }] : [],
          );
        }
        return classifyRoom({ room, availability: a, party, quotes });
      }),
    );
  } catch (error) {
    console.error("rooms list failed", error);
    return (
      <div className="flex flex-col gap-6">
        {summary}
        <RetryError
          title="We could not load the rooms"
          message="Something went wrong on our side. Please try again."
        />
      </div>
    );
  }

  const nothingFree = items.length > 0 && items.every((i) => i.kind !== "available");
  const tooManyGuests = partyFitsNoRoom(
    items.map((i) => i.room),
    party,
  );
  const guests = guestsLabel(values.adults, values.children);

  return (
    <div className="flex flex-col gap-6">
      {summary}

      {noRooms ? (
        <EmptyState message="No rooms are listed yet. Please check back soon." />
      ) : tooManyGuests ? (
        <EmptyState
          icon={<Users strokeWidth={1.5} />}
          message={`No single room takes ${guests}. Booking for a group?`}
          action={
            <ButtonLink
              href={enquiryHref({
                subject: "Group enquiry",
                body: `We are ${guests}, ${values.checkIn} to ${values.checkOut}.`,
              })}
            >
              Send a group enquiry
            </ButtonLink>
          }
        />
      ) : (
        <>
          {nothingFree ? (
            <EmptyState
              icon={<CalendarSearch strokeWidth={1.5} />}
              message="Nothing is free for these dates. Try different dates with Change above."
              className="py-6"
            />
          ) : null}
          <ul className="flex flex-col gap-6">
            {items.map((item, i) => (
              <li key={item.room.id}>
                <RoomCard item={item} nights={nights} query={query} priority={i === 0} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function RoomsSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading rooms">
      <Skeleton className="h-14 rounded-card" />
      <RoomCardSkeleton />
      <RoomCardSkeleton />
      <RoomCardSkeleton />
    </div>
  );
}
