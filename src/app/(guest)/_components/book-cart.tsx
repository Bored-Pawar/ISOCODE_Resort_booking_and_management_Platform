import { CalendarSearch } from "lucide-react";
import { connection } from "next/server";
import { ButtonLink, EmptyState, Skeleton } from "@/components/ui";
import { todayIST } from "@/lib/dates";
import { catalog } from "@/modules/catalog";
import { inventory } from "@/modules/inventory";
import { pricing } from "@/modules/pricing";
import { lineIssues, toCartQuote, type CartQuote, type RoomOption } from "../_lib/book";
import { parseCartParams } from "../_lib/cart";
import { enquiryHref } from "../_lib/enquiry";
import { toSearchParams, validateSearch } from "../_lib/search";
import { CartEditor } from "./cart-editor";
import { RetryError } from "./retry-error";

type Params = Promise<Record<string, string | string[] | undefined>>;

/**
 * Server component for /book (B6 step 1). Reads the cart from the URL, then the catalog,
 * availability and the live quote for that cart. The editor changes the URL and this component
 * re-renders with a fresh quote, so prices only ever come from pricing on the server.
 */
export async function BookCart({ searchParams }: { searchParams: Params }) {
  const parsed = parseCartParams(await searchParams);
  await connection();
  const today = todayIST();
  // Without a party in the URL, the cart itself is the search.
  const party =
    parsed.party.adults >= 1
      ? parsed.party
      : {
          adults: parsed.lines.reduce((s, l) => s + l.adults, 0),
          children: parsed.lines.reduce((s, l) => s + l.children, 0),
        };
  const search = { checkIn: parsed.checkIn, checkOut: parsed.checkOut, ...party };
  const issue = validateSearch(search, today);

  if (issue) {
    const group = issue.code === "too-many-guests" || issue.code === "too-long";
    return (
      <EmptyState
        icon={<CalendarSearch strokeWidth={1.5} />}
        message={
          issue.code === "missing-dates" || issue.code === "no-adults"
            ? "Choose your dates and guests first, then pick your rooms."
            : issue.message
        }
        action={
          group ? (
            <ButtonLink href={enquiryHref(search)} variant="secondary">
              Send an enquiry
            </ButtonLink>
          ) : (
            <ButtonLink href="/rooms">Find rooms</ButtonLink>
          )
        }
      />
    );
  }

  let rooms: RoomOption[];
  let quote: CartQuote = null;
  try {
    const [types, availability] = await Promise.all([
      catalog.listRoomTypes(),
      inventory.availability({ checkIn: search.checkIn, checkOut: search.checkOut }),
    ]);
    if (!availability.ok) throw new Error(`availability: ${availability.code}`);
    rooms = types.map((t) => {
      const a = availability.rooms.find((r) => r.roomTypeId === t.id);
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        maxAdults: t.maxAdults,
        maxOccupancy: t.maxOccupancy,
        freeUnits: a && !a.soldOut && !a.blackedOut ? Math.max(a.availableUnits, 0) : 0,
        plans: t.ratePlans.map((p) => ({
          id: p.id,
          name: p.name,
          inclusions: p.inclusions,
          refundable: p.refundable,
        })),
      };
    });
    // Price only a cart that passes the local rules; the server is still the only price source.
    if (parsed.lines.length && lineIssues(rooms, parsed.lines, null).every((i) => i === null)) {
      quote = toCartQuote(
        await pricing.quote({
          checkIn: search.checkIn,
          checkOut: search.checkOut,
          rooms: parsed.lines,
        }),
      );
    }
  } catch (error) {
    console.error("book cart failed", error);
    return (
      <RetryError
        title="We could not load your rooms"
        message="Something went wrong on our side. Please try again."
      />
    );
  }

  return (
    <CartEditor
      rooms={rooms}
      stay={search}
      initialLines={parsed.lines}
      quote={quote}
      dropped={parsed.dropped}
      roomsHref={`/rooms?${toSearchParams(search).toString()}`}
      groupHref={enquiryHref(search)}
    />
  );
}

export function BookCartSkeleton() {
  return (
    <div
      className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]"
      role="status"
      aria-label="Loading your rooms"
    >
      <div className="flex flex-col gap-4">
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-11 w-48" />
      </div>
      <Skeleton className="h-80 rounded-card" />
    </div>
  );
}
