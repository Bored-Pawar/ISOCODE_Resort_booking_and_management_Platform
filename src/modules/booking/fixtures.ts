import { changedQuoteFixture, quoteFixture, FIXTURE_IDS } from "@/modules/pricing";
import type { Booking } from "./index";

export const bookingFixture: Booking = {
  id: "bk-0001",
  ref: "CA-7K3P9",
  guestId: FIXTURE_IDS.guestAsha,
  roomTypeId: quoteFixture.roomTypeId,
  ratePlanId: quoteFixture.ratePlanId,
  checkIn: quoteFixture.checkIn,
  checkOut: quoteFixture.checkOut,
  units: 1,
  adults: 2,
  children: 0,
  status: "HELD",
  holdExpiresAt: "2026-11-07T10:10:00.000Z",
  quoteHash: quoteFixture.quoteHash,
  promoCode: null,
  subtotalPaise: quoteFixture.subtotalPaise,
  discountPaise: quoteFixture.discountPaise,
  gstPaise: quoteFixture.gstPaise,
  totalPaise: quoteFixture.totalPaise,
  nights: quoteFixture.nights,
  createdAt: "2026-11-07T10:00:00.000Z",
  confirmedAt: null,
};

export const changedQuoteForHold = changedQuoteFixture;
