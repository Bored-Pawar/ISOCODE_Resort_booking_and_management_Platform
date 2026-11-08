"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { stayHref } from "../_lib/cart";
import { readStoredStay } from "../_lib/stay-storage";

/**
 * /rooms opened with no dates and no cart (for example from the header): if this browser has a
 * stay saved with dates, reopen it. Renders nothing.
 */
export function RestoreStay() {
  const router = useRouter();
  useEffect(() => {
    const s = readStoredStay();
    if (!s?.checkIn || !s.checkOut) return;
    const party = s.party.adults >= 1 ? s.party : { adults: 2, children: 0 };
    router.replace(stayHref({ checkIn: s.checkIn, checkOut: s.checkOut, ...party }, s.lines), {
      scroll: false,
    });
  }, [router]);
  return null;
}
