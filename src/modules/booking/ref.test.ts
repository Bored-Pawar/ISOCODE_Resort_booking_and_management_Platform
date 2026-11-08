import { describe, expect, it } from "vitest";
import { isRefCollision, newBookingRef, REF_PATTERN } from "./ref";

describe("booking ref generator", () => {
  it("produces CA- plus 5 unambiguous characters", () => {
    for (let i = 0; i < 200; i++) expect(newBookingRef()).toMatch(REF_PATTERN);
  });
  it("is deterministic for a seeded source and covers both ends of the alphabet", () => {
    expect(newBookingRef(() => 0)).toBe("CA-AAAAA");
    expect(newBookingRef(() => 0.9999999)).toBe("CA-99999");
  });
  it("recognises only a unique violation on the ref constraint, also when wrapped", () => {
    const pg = { code: "23505", constraint_name: "bookings_ref_unique" };
    expect(isRefCollision(pg)).toBe(true);
    expect(isRefCollision({ message: "wrapped", cause: pg })).toBe(true);
    expect(isRefCollision({ code: "23505", constraint_name: "payments_provider_payment_id_unique" })).toBe(false);
    expect(isRefCollision({ code: "23514" })).toBe(false);
    expect(isRefCollision(null)).toBe(false);
  });
});
