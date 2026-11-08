import { afterEach, describe, expect, it, vi } from "vitest";
import { catalog } from "@/modules/catalog";
import { inventory } from "@/modules/inventory";
import { pricing, quoteFixture, type QuoteInput } from "@/modules/pricing";
import { roomTypesFixture } from "@/modules/catalog/fixtures";
import { classificationFixtures } from "./fixtures";
import { matchingRooms, selectQuote } from "./quote-selection";
vi.mock("@/modules/catalog", () => ({ catalog: { listRoomTypes: vi.fn() } }));
vi.mock("@/modules/inventory", () => ({ inventory: { availability: vi.fn() } }));
vi.mock("@/modules/pricing", async (original) => ({
  ...(await original<typeof import("@/modules/pricing")>()),
  pricing: { quote: vi.fn() },
}));
const villa = classificationFixtures["ENQ-4411"].classification;
afterEach(() => vi.resetAllMocks());
function setup(units = 3) {
  vi.mocked(catalog.listRoomTypes).mockResolvedValue(roomTypesFixture);
  vi.mocked(inventory.availability).mockResolvedValue({
    ok: true,
    rooms: roomTypesFixture.map((r) => ({
      roomTypeId: r.id,
      availableUnits: units,
      soldOut: units === 0,
      blackedOut: false,
    })),
  });
  const costs = new Map(roomTypesFixture.map((r, i) => [r.id, (i + 1) * 100000]));
  vi.mocked(pricing.quote).mockImplementation(async (input: QuoteInput) => ({
    ok: true,
    quote: {
      ...quoteFixture,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      lines: input.rooms.map((line, i) => ({
        ...quoteFixture.lines[0],
        ...line,
        children: line.children ?? 0,
        lineNo: i + 1,
        totalPaise: costs.get(line.roomTypeId)!,
      })),
      totalPaise: input.rooms.reduce((n, line) => n + costs.get(line.roomTypeId)!, 0),
    },
  }));
}
describe("deterministic quote choice", () => {
  it("a more specific named room never broadens to a shorter name it contains", () => {
    const specific = {
      ...roomTypesFixture[2],
      id: "specific",
      name: "Garden Villa North Wing",
      slug: "garden-villa-north-wing",
    };
    expect(
      matchingRooms([...roomTypesFixture, specific], "Garden Villa North Wing").map((r) => r.id),
    ).toEqual(["specific"]);
    expect(
      matchingRooms(roomTypesFixture, "Garden Villa or Pool Villa").map((r) => r.name),
    ).toEqual(["Garden Villa", "Pool Villa"]);
  });
  it("villa preference excludes cheaper plantation rooms", async () => {
    setup();
    const quote = await selectQuote(villa, "Is a villa free 14-16 Nov for 2 adults and a child?");
    expect(quote?.lines[0].roomTypeId).toBe(roomTypesFixture[2].id);
  });
  it("respects a specific Pool Villa request", async () => {
    setup();
    expect((await selectQuote(villa, "Pool Villa please"))?.lines[0].roomTypeId).toBe(
      roomTypesFixture[3].id,
    );
  });
  it("an unavailable requested villa never substitutes a plantation room", async () => {
    setup(0);
    expect(await selectQuote(villa, "a villa")).toBeNull();
    expect(pricing.quote).not.toHaveBeenCalled();
  });
  it("checks repeated units for a two-room request", async () => {
    setup(1);
    expect(
      await selectQuote(
        { ...villa, guests: { adults: 4, children: 0 } },
        "2 rooms, Plantation Room",
      ),
    ).toBeNull();
    setup(2);
    expect(
      (
        await selectQuote(
          { ...villa, guests: { adults: 4, children: 0 } },
          "2 rooms, Plantation Room",
        )
      )?.lines,
    ).toHaveLength(2);
  });
  it("missing rates never generate a price", async () => {
    setup();
    vi.mocked(pricing.quote).mockResolvedValue({ ok: false, code: "NO_RATE" });
    expect(await selectQuote(villa, "a villa")).toBeNull();
  });
  it("stable tie-break survives catalog order changes", async () => {
    setup();
    vi.mocked(pricing.quote).mockImplementation(async (input) => ({
      ok: true,
      quote: {
        ...quoteFixture,
        lines: input.rooms.map((line, i) => ({
          ...quoteFixture.lines[0],
          ...line,
          children: line.children ?? 0,
          lineNo: i + 1,
        })),
        totalPaise: input.rooms.length * 10000,
      },
    }));
    const first = await selectQuote(villa, "a villa");
    vi.mocked(catalog.listRoomTypes).mockResolvedValue([...roomTypesFixture].reverse());
    expect(await selectQuote(villa, "a villa")).toEqual(first);
  });
  it("missing fields/non-room enquiries do not read stock or rates", async () => {
    setup();
    expect(await selectQuote({ ...villa, dates: {} }, "villa")).toBeNull();
    expect(await selectQuote({ ...villa, category: "offsite" }, "conference hall")).toBeNull();
    expect(inventory.availability).not.toHaveBeenCalled();
  });
  it("generic suites and private pool requests restrict types", () => {
    expect(matchingRooms(roomTypesFixture, "villa with private pool").map((r) => r.name)).toEqual([
      "Pool Villa",
    ]);
    expect(matchingRooms(roomTypesFixture, "a suite").map((r) => r.name)).toEqual(["Estate Suite"]);
  });
});
