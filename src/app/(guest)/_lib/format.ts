/** Small guest-facing text helpers shared by the home, rooms and room pages. */

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Up to 2 adults, 1 child" */
export function occupancyLabel(adults: number, children: number): string {
  const a = plural(adults, "adult");
  return children > 0 ? `Up to ${a}, ${plural(children, "child", "children")}` : `Up to ${a}`;
}

/** "2 adults · 1 child" */
export function guestsLabel(adults: number, children: number): string {
  const a = plural(adults, "adult");
  return children > 0 ? `${a} · ${plural(children, "child", "children")}` : a;
}
