import { describe, expect, it } from "vitest";
import { pricing } from "@/modules/pricing";
import { inventory } from "@/modules/inventory";
import { booking } from "@/modules/booking";

// S0 stub-success assertions are superseded by pricing-inventory and booking Postgres suites.
// These boundary checks deliberately need no database connection.
describe("frozen service boundaries", () => {
  it("rejects malformed inputs before database work", async () => {
    expect(await pricing.quote({} as never)).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await inventory.availability({ checkIn: "bad", checkOut: "bad" })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(await booking.acquireHold({} as never)).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(await booking.confirmPayment({} as never)).toEqual({ ok: false, code: "INVALID_INPUT" });
  });
  it("keeps transaction helpers out of public module exports", async () => {
    const [p, i] = await Promise.all([import("@/modules/pricing"), import("@/modules/inventory")]);
    expect(Object.keys(p)).not.toContain("quoteInTx");
    expect(Object.keys(i)).not.toContain("lockNights");
    expect(Object.keys(i)).not.toContain("adjustNights");
  });
});
