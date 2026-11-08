import { expect, it } from "vitest";
import { hasComplaint } from "./complaints";
import { route } from "./routing";
import { classificationFixtures } from "./fixtures";
const c = classificationFixtures["ENQ-4411"].classification;
it.each([
  "Please refund the overcharged amount",
  "Dirty room; also need another room",
  "शिकायत है: कमरा गंदा था",
  "Room ganda tha, AC kharab hai",
  "AC was broken. Worst stay.",
])("alerts GM independently of room owner: %s", (raw) => {
  expect(route(c, "ok", raw)).toMatchObject({ ownerRole: "reservations", notifyGm: true });
});
it("ordinary room enquiry and unrelated substrings do not alert", () => {
  expect(hasComplaint("Book a room at Gandalf's estate with unbroken views")).toBe(false);
  expect(route(c, "ok", "Need a villa for two adults").notifyGm).toBe(false);
});
it("supported model flag alerts without replacing sales ownership", () => {
  expect(route({ ...c, category: "wedding" }, "ok", "Venue enquiry", true)).toMatchObject({
    ownerRole: "sales",
    notifyGm: true,
  });
});
