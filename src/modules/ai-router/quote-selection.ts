import { catalog, type RoomType } from "@/modules/catalog";
import { inventory } from "@/modules/inventory";
import { pricing, type Quote, type QuoteRoomInput } from "@/modules/pricing";
import { nightsBetween, todayIST } from "@/lib/dates";
import type { Classification } from "./schema";
import { groundExtraction } from "./grounding";

export type SelectedQuote = Quote & { roomNames?: string[] };

/** Respect specific type names first, then generic category words, never broaden a named request. */
export function matchingRooms(rooms: RoomType[], text: string): RoomType[] {
  const normalize = (value: string) => value.toLowerCase().replace(/[-_]/g, " ");
  const normalized = normalize(text);
  const named = rooms.flatMap((room) => {
    const term = [normalize(room.name), normalize(room.slug)].find((name) =>
      normalized.includes(name),
    );
    return term ? [{ room, term }] : [];
  });
  // A longer explicit type name must not also match a shorter name contained inside it.
  // Independent alternatives (e.g. Garden Villa or Pool Villa) remain eligible.
  if (named.length)
    return named
      .filter((a) => !named.some((b) => b.term.length > a.term.length && b.term.includes(a.term)))
      .map(({ room }) => room);
  const kind = /\b(?:pool|private pool)\b.*\bvilla\b|\bvilla\b.*\bprivate pool\b/i.test(normalized)
    ? "pool villa"
    : /\bvillas?\b/i.test(normalized)
      ? "villa"
      : /\bsuites?\b/i.test(normalized)
        ? "suite"
        : null;
  return kind ? rooms.filter((r) => r.name.toLowerCase().includes(kind)) : rooms;
}

function allocate(types: RoomType[], adults: number, children: number): QuoteRoomInput[] | null {
  if (
    adults < types.length ||
    types.reduce((n, r) => n + r.maxAdults, 0) < adults ||
    types.reduce((n, r) => n + r.maxOccupancy, 0) < adults + children
  )
    return null;
  const lines = types.map((r) => ({
    roomTypeId: r.id,
    ratePlanId: r.ratePlans.find((p) => p.code === "EP")!.id,
    adults: 1,
    children: 0,
  }));
  let left = adults - lines.length;
  for (let i = 0; i < types.length; i++) {
    const n = Math.min(left, types[i].maxAdults - 1);
    lines[i].adults += n;
    left -= n;
  }
  left = children;
  for (let i = 0; i < types.length; i++) {
    const n = Math.min(left, types[i].maxOccupancy - lines[i].adults);
    lines[i].children = n;
    left -= n;
  }
  return left ? null : lines;
}

/** Enumerate stable multisets of <=4 room lines (70 at seed scale), quote each through pricing. */
export async function selectQuote(
  classification: Classification,
  text: string,
  today = todayIST(),
): Promise<SelectedQuote | null> {
  const evidence = groundExtraction(text, classification, today);
  if (!evidence.eligible) return null;
  const { from, to } = evidence.dates!;
  const { adults, children } = evidence.guests!;
  if (
    classification.category !== "room" ||
    !from ||
    !to ||
    !adults ||
    adults > 40 ||
    children < 0 ||
    children > 40 ||
    nightsBetween(from, to) > 180
  )
    return null;
  const types = matchingRooms(await catalog.listRoomTypes(), text)
    .filter((r) => r.ratePlans.some((p) => p.code === "EP"))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!types.length) return null;
  const stock = await inventory.availability({ checkIn: from, checkOut: to });
  if (!stock.ok) return null;
  const units = new Map(
    stock.rooms
      .filter((r) => !r.blackedOut && !r.soldOut)
      .map((r) => [r.roomTypeId, r.availableUnits]),
  );
  const carts: QuoteRoomInput[][] = [];
  const requestedRooms = text.match(/\b(\d+)\s+rooms?\b/i);
  const exactRooms = requestedRooms ? Number(requestedRooms[1]) : null;
  if (exactRooms !== null && (exactRooms < 1 || exactRooms > 4)) return null;
  function visit(picked: RoomType[], start: number) {
    if (picked.length && (exactRooms === null || picked.length === exactRooms)) {
      const lines = allocate(picked, adults!, children);
      if (lines) carts.push(lines);
    }
    if (picked.length === 4 || picked.length >= adults!) return;
    for (let i = start; i < types.length; i++) {
      if (picked.filter((r) => r.id === types[i].id).length >= (units.get(types[i].id) ?? 0))
        continue;
      visit([...picked, types[i]], i);
    }
  }
  visit([], 0);
  if (!carts.length) return null;
  // No promo or occupancy surcharge: rank by base-plan snapshots from pricing, then obtain
  // the actual cart quote. This avoids 70+ serial database round trips for four seed types.
  const costs = new Map<string, number>();
  for (const room of types) {
    const result = await pricing.quote({
      checkIn: from,
      checkOut: to,
      rooms: [
        {
          roomTypeId: room.id,
          ratePlanId: room.ratePlans.find((p) => p.code === "EP")!.id,
          adults: 1,
          children: 0,
        },
      ],
    });
    if (result.ok) costs.set(room.id, result.quote.totalPaise);
  }
  const ranked = carts
    .filter((cart) => cart.every((line) => costs.has(line.roomTypeId)))
    .map((rooms) => ({
      rooms,
      total: rooms.reduce((n, r) => n + costs.get(r.roomTypeId)!, 0),
      key: JSON.stringify(rooms),
    }))
    .sort((a, b) => a.total - b.total || a.key.localeCompare(b.key));
  for (const cart of ranked) {
    const result = await pricing.quote({ checkIn: from, checkOut: to, rooms: cart.rooms });
    if (result.ok)
      return {
        ...result.quote,
        roomNames: cart.rooms.map((line) => types.find((r) => r.id === line.roomTypeId)!.name),
      };
  }
  return null;
}
