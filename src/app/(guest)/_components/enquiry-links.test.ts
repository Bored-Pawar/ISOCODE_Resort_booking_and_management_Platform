import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { roomTypesFixture } from "@/modules/catalog/fixtures";
import { quoteFixture } from "@/modules/pricing/fixtures";
import { toPlanView } from "../_lib/room-detail";
import { BookingPanel } from "./booking-panel";
import { RoomCard } from "./room-card";

const room = roomTypesFixture[0];
const query = "checkIn=2026-11-14&checkOut=2026-11-16&adults=5&children=1";
const card = (item: Parameters<typeof RoomCard>[0]["item"]) =>
  renderToStaticMarkup(createElement(RoomCard, { item, nights: 2, query }));
const enquiryHrefs = (html: string) =>
  [...html.matchAll(/href="(\/enquire[^"]*)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));

describe("F6: enquiry link when stock cannot fit the party", () => {
  const expected = `/enquire?checkIn=2026-11-14&checkOut=2026-11-16&adults=5&children=1&room=${room.slug}`;

  it("sold-out, no-rates and short room cards link to a prefilled enquiry", () => {
    for (const item of [
      { kind: "sold-out", room },
      { kind: "no-rates", room },
      { kind: "short", room, rooms: 3, availableUnits: 1 },
    ] as const) {
      expect(enquiryHrefs(card(item))).toEqual([expected]);
    }
  });

  it("the booking panel shows the enquiry link only when stock is short", () => {
    const plan = toPlanView(room.ratePlans[0], quoteFixture);
    const panel = (roomsNeeded: number) =>
      renderToStaticMarkup(
        createElement(BookingPanel, {
          plans: [plan],
          stay: { checkIn: "2026-11-14", checkOut: "2026-11-16", adults: 5, children: 1 },
          roomsNeeded,
          enquiryHref: expected,
          nights: 2,
          availability: { tone: "warning", text: "Only 1 left" },
        }),
      );
    expect(enquiryHrefs(panel(plan.lines.length + 2))).toContain(expected);
    expect(enquiryHrefs(panel(plan.lines.length))).toEqual([]);
  });
});
