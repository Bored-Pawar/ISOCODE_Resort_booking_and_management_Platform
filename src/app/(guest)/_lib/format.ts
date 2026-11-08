/** Small guest-facing text helpers shared by the home, rooms and room pages. */

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** B10 rule 1: "Up to 3 guests, at most 2 adults" (children fill the rest). */
export function occupancyLabel(room: { maxAdults: number; maxOccupancy: number }): string {
  return room.maxOccupancy > room.maxAdults
    ? `Up to ${plural(room.maxOccupancy, "guest")}, at most ${plural(room.maxAdults, "adult")}`
    : `Up to ${plural(room.maxAdults, "adult")}`;
}

/** "2 adults · 1 child" */
export function guestsLabel(adults: number, children: number): string {
  const a = plural(adults, "adult");
  return children > 0 ? `${a} · ${plural(children, "child", "children")}` : a;
}
