import {
  changedQuoteFixture,
  quoteFixture,
  twoRoomQuoteFixture,
  FIXTURE_IDS,
} from "@/modules/pricing";
import type { Quote } from "@/modules/pricing";
import type { Booking } from "./index";

function fromQuote(q: Quote, id: string, ref: string): Booking {
  return {
    id,
    ref,
    guestId: FIXTURE_IDS.guestAsha,
    checkIn: q.checkIn,
    checkOut: q.checkOut,
    status: "HELD",
    holdExpiresAt: "2026-11-07T10:10:00.000Z",
    quoteHash: q.quoteHash,
    promoCode: q.promo?.code ?? null,
    subtotalPaise: q.subtotalPaise,
    discountPaise: q.discountPaise,
    gstPaise: q.gstPaise,
    totalPaise: q.totalPaise,
    rooms: q.lines.map((l) => ({
      lineNo: l.lineNo,
      roomTypeId: l.roomTypeId,
      ratePlanId: l.ratePlanId,
      adults: l.adults,
      children: l.children,
      subtotalPaise: l.subtotalPaise,
      discountPaise: l.discountPaise,
      gstPaise: l.gstPaise,
      totalPaise: l.totalPaise,
      nights: l.nights,
    })),
    createdAt: "2026-11-07T10:00:00.000Z",
    confirmedAt: null,
  };
}

/** 1-line booking: one Plantation Room. */
export const bookingFixture: Booking = fromQuote(quoteFixture, "bk-0001", "CA-7K3P9");

/** 2-line booking: Plantation Room + Estate Suite on one order, one hold, one total. */
export const twoRoomBookingFixture: Booking = fromQuote(twoRoomQuoteFixture, "bk-0002", "CA-M4R2T");

export const changedQuoteForHold = changedQuoteFixture;
