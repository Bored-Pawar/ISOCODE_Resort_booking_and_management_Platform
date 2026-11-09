/**
 * Production QA-01 / QA-02: the enquiry facts -> quote -> approval lifecycle against real
 * PostgreSQL, real pricing, stock and GST. The catalog list is scoped to this file's own three room
 * types so seeded rooms in the test database cannot change which room is cheapest.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { catalog, type RoomType } from "@/modules/catalog";
import { inbox, type InboxDetail } from "@/modules/enquiries";
import { formatInr } from "@/lib/money";
import { connect, ensureMigrated, testUrl } from "./helpers";
import { inboxFixture } from "./inbox-fixture";
import { testSlabs } from "./core-fixture";

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: () => undefined,
}));
vi.mock("next/cache", async (orig) => ({
  ...(await orig<typeof import("next/cache")>()),
  cacheLife: vi.fn(),
}));

const sql = connect();
const { db, client } = dbModule.createDb(testUrl(), { max: 8 });
let f: Awaited<ReturnType<typeof inboxFixture>>;
const rooms: RoomType[] = [];
let byName: Record<"Plantation Room" | "Garden Villa" | "Pool Villa", RoomType>;
const roomIds: string[] = [];
let dropSlabs: (() => Promise<unknown>) | undefined;
let listRooms: ReturnType<typeof vi.spyOn>;

const NIGHTS = ["2099-12-14", "2099-12-15", "2099-12-16", "2099-12-17"];
// Plantation is the cheapest and fits 2 adults + 1 child: the room QA-01 wrongly fell back to.
const TYPES = [
  { name: "Plantation Room", rate: 400_000, maxAdults: 2, maxOccupancy: 3, nights: NIGHTS },
  {
    name: "Garden Villa",
    rate: 1_500_000,
    maxAdults: 4,
    maxOccupancy: 5,
    nights: NIGHTS.slice(0, 3),
  },
  { name: "Pool Villa", rate: 2_500_000, maxAdults: 4, maxOccupancy: 6, nights: NIGHTS },
] as const;

beforeAll(async () => {
  await ensureMigrated(sql);
  dropSlabs = await testSlabs(db);
  const tag = randomUUID().slice(0, 8);
  for (const type of TYPES) {
    const [room] = await db
      .insert(t.roomTypes)
      .values({
        slug: `qa-${tag}-${type.name.toLowerCase().replace(/ /g, "-")}`,
        name: `${type.name} ${tag}`,
        description: "QA lifecycle test",
        totalUnits: 4,
        maxAdults: type.maxAdults,
        maxChildren: 2,
        maxOccupancy: type.maxOccupancy,
      })
      .returning();
    const [plan] = await db
      .insert(t.ratePlans)
      .values({ roomTypeId: room.id, code: "EP", name: "Room only", inclusions: "none" })
      .returning();
    await db.insert(t.dailyRates).values(
      NIGHTS.map((date) => ({
        roomTypeId: room.id,
        ratePlanId: plan.id,
        date,
        pricePaise: type.rate,
      })),
    );
    // Garden Villa has no stock on 17 Dec: a stay over that night is unavailable.
    await db
      .insert(t.inventory)
      .values(type.nights.map((date) => ({ roomTypeId: room.id, date, allotment: 2 })));
    roomIds.push(room.id);
    rooms.push({
      id: room.id,
      slug: room.slug,
      name: type.name,
      description: room.description,
      totalUnits: room.totalUnits,
      maxAdults: room.maxAdults,
      maxChildren: room.maxChildren,
      maxOccupancy: room.maxOccupancy,
      amenities: [],
      photos: [],
      ratePlans: [
        { id: plan.id, code: "EP", name: plan.name, inclusions: plan.inclusions, refundable: true },
      ],
    });
  }
  byName = Object.fromEntries(rooms.map((r) => [r.name, r])) as typeof byName;
}, 90_000);
beforeEach(async () => {
  vi.spyOn(dbModule, "getDb").mockReturnValue(db);
  listRooms = vi.spyOn(catalog, "listRoomTypes").mockResolvedValue(rooms);
  vi.stubEnv("AI_PROVIDER", "rules"); // Regenerate makes no provider call
  f = await inboxFixture(db);
}, 60_000);
afterEach(async () => {
  await f?.clean();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
}, 60_000);
afterAll(async () => {
  if (roomIds.length) await db.delete(t.roomTypes).where(inArray(t.roomTypes.id, roomIds));
  await dropSlabs?.();
  await client.end();
  await sql.end();
}, 60_000);

const GARDEN_TEXT = "Is a Garden Villa free 14-16 Dec 2099 for 2 adults and 1 child?";
const grounded = { dates: "ok", guests: "ok", room: "ok" };

/** A room enquiry as R2 leaves it: grounded extraction, owned by reservations. */
async function villaEnquiry(rawText = GARDEN_TEXT) {
  return f.enquiry({
    category: "room",
    ownerId: f.by.reservations.id,
    rawText,
    extracted: {
      summary: `${f.tag} villa enquiry`,
      dates: { from: "2099-12-14", to: "2099-12-16" },
      guests: { adults: 2, children: 1, total: 3 },
      budget: {},
      language: "en",
      grounding: grounded,
    },
  });
}

async function detail(id: string, role: "reservations" | "gm" = "reservations") {
  const res = await inbox.detail(id, f.actor(role));
  if (!res.ok) throw new Error(res.code);
  return res.detail;
}

/** Save fields the way the form does: every field as shown, with `over` changed. */
async function save(
  id: string,
  over: Record<string, unknown>,
  role: "reservations" | "gm" = "reservations",
) {
  const d = await detail(id, role);
  const x = d.extracted;
  return inbox.saveFields(
    {
      enquiryId: id,
      dates: { from: x.dates!.from, to: x.dates!.to },
      guests: { adults: x.guests!.adults, children: x.guests!.children ?? 0 },
      budgetInr: x.budget?.amountInr ?? null,
      room: d.room.text,
      language: x.language ?? null,
      ...over,
    },
    f.actor(role),
  );
}

type Q = { checkIn: string; checkOut: string; totalPaise: number; lines: { roomTypeId: string }[] };
const quoteOf = (d: InboxDetail) => d.draft?.quote as Q | null;
const roomOf = (d: InboxDetail) => quoteOf(d)?.lines.map((l) => l.roomTypeId);

function send(d: InboxDetail, role: "reservations" | "gm" = "reservations", body?: string) {
  return inbox.approveAndSend(
    {
      enquiryId: d.enquiry.id,
      draftId: d.draft!.id,
      body: body ?? d.draft!.body,
      version: d.draft!.version,
    },
    f.actor(role),
  );
}

async function sentCount(id: string) {
  const drafts = await db.select().from(t.replyDrafts).where(eq(t.replyDrafts.enquiryId, id));
  const events = await db
    .select()
    .from(t.enquiryEvents)
    .where(and(eq(t.enquiryEvents.enquiryId, id), eq(t.enquiryEvents.action, "sent")));
  const outbox = (await inbox.sentReplies(f.actor("reservations"), 50)).filter(
    (r) => r.enquiryId === id,
  );
  return { drafts: drafts.filter((d) => d.sentAt).length, events: events.length, outbox };
}

/** First draft priced from the guest's message. */
async function priced(rawText = GARDEN_TEXT) {
  const id = await villaEnquiry(rawText);
  expect(await inbox.rebuildQuote({ enquiryId: id }, f.actor("reservations"))).toEqual({
    ok: true,
  });
  const d = await detail(id);
  expect(d.draft?.quoteState).toBe("current");
  return { id, d };
}

describe("1. date-only and guest-only edits keep the named villa", { timeout: 120_000 }, () => {
  it("Garden Villa: the message's villa is quoted, not the cheaper Plantation Room", async () => {
    const { id, d } = await priced();
    expect(roomOf(d)).toEqual([byName["Garden Villa"].id]);
    expect(d.room).toEqual({ text: "Garden Villa", source: "message" });

    // Only check-in moves to 15 Dec.
    expect(await save(id, { dates: { from: "2099-12-15", to: "2099-12-16" } })).toMatchObject({
      ok: true,
      changed: ["dates"],
      requote: true,
      draft: "ok",
    });
    const afterDates = await detail(id);
    expect(roomOf(afterDates)).toEqual([byName["Garden Villa"].id]);
    expect(afterDates.draft!.body).toContain("Garden Villa");
    expect(afterDates.draft!.body).not.toContain("Plantation");
    expect(afterDates.draft!.builtOn).toMatchObject({
      dates: { from: "2099-12-15", to: "2099-12-16" },
      room: { text: "Garden Villa", source: "message" },
    });

    // Only the party changes.
    expect(await save(id, { guests: { adults: 3, children: 1 } })).toMatchObject({
      changed: ["guests"],
      draft: "ok",
    });
    const afterGuests = await detail(id);
    expect(roomOf(afterGuests)).toEqual([byName["Garden Villa"].id]);
    expect(afterGuests.draft!.quoteState).toBe("current");
  });

  it("Pool Villa is kept the same way", async () => {
    const { id } = await priced(
      "Do you have a Pool Villa 14-16 Dec 2099 for 2 adults and 1 child?",
    );
    expect(await save(id, { dates: { from: "2099-12-15", to: "2099-12-17" } })).toMatchObject({
      draft: "ok",
    });
    const d = await detail(id);
    expect(roomOf(d)).toEqual([byName["Pool Villa"].id]);
    expect(d.draft!.body).toContain("Pool Villa");
  });

  it("the named villa unavailable for the new dates: the draft says so and quotes nothing", async () => {
    const { id } = await priced();
    expect(await save(id, { dates: { from: "2099-12-16", to: "2099-12-18" } })).toMatchObject({
      draft: "ok",
    });
    const d = await detail(id);
    expect(d.draft!.quote).toBeNull();
    expect(d.draft!.body).toContain("Garden Villa is not available for 2099-12-16 to 2099-12-18");
    expect(d.draft!.body).not.toMatch(/₹|Plantation/);
  });
});

describe("2. staff room replacement and explicit clear", { timeout: 120_000 }, () => {
  it("a staff room wins over the message; clearing it asks instead of quoting", async () => {
    const { id } = await priced();
    expect(await save(id, { room: "Pool Villa" })).toMatchObject({
      changed: ["room"],
      draft: "ok",
    });
    const replaced = await detail(id);
    expect(replaced.room).toEqual({ text: "Pool Villa", source: "staff" });
    expect(roomOf(replaced)).toEqual([byName["Pool Villa"].id]);

    expect(await save(id, { room: null })).toMatchObject({ changed: ["room"], draft: "ok" });
    const cleared = await detail(id);
    expect(cleared.room).toEqual({ text: null, source: "cleared" });
    expect(cleared.draft!.quote).toBeNull();
    expect(cleared.draft!.body).toContain("Which room type would you prefer?");
    expect(cleared.draft!.quoteState).toBe("current");
  });

  it("absent room (never touched) still quotes the message's villa: different from cleared", async () => {
    const { id } = await priced();
    await save(id, { guests: { adults: 2, children: 0 } });
    const d = await detail(id);
    expect(d.room.source).toBe("message");
    expect(roomOf(d)).toEqual([byName["Garden Villa"].id]);
  });

  it("a typed room matching no catalog type asks; it never quotes the cheapest room", async () => {
    const { id } = await priced();
    await save(id, { room: "Treehouse" });
    const d = await detail(id);
    expect(d.draft!.quote).toBeNull();
    expect(d.draft!.body).toContain("Please confirm the room type");
  });
});

describe(
  "3. a room-only edit rebuilds; the old room cannot be approved",
  { timeout: 120_000 },
  () => {
    it("not after reload, not from a second session", async () => {
      const { id, d: tabA } = await priced();
      const tabB = await detail(id, "gm"); // a second session holding the Garden Villa draft
      const garden = quoteOf(tabA)!;
      expect(await save(id, { room: "Pool Villa" })).toMatchObject({ draft: "ok" });

      expect(await send(tabA)).toEqual({ ok: false, code: "STALE_DRAFT" });
      expect(await send(tabB, "gm")).toEqual({ ok: false, code: "STALE_DRAFT" });
      expect(await sentCount(id)).toMatchObject({ drafts: 0, events: 0, outbox: [] });

      const reloaded = await detail(id);
      expect(reloaded.draft!.quoteState).toBe("current");
      expect(roomOf(reloaded)).toEqual([byName["Pool Villa"].id]);
      expect(quoteOf(reloaded)!.totalPaise).not.toBe(garden.totalPaise);
      expect((await send(reloaded)).ok).toBe(true);
      const [sent] = (await sentCount(id)).outbox;
      expect(sent.body).toContain("Pool Villa");
      expect(sent.body).not.toContain(formatInr(garden.totalPaise));
    });

    it("a draft left by the old code after a room edit (no basis) is refused until rebuilt", async () => {
      const { id, d } = await priced();
      // Production state from before this fix: Room saved as Pool Villa, Garden draft never rebuilt.
      const [row] = await db.select().from(t.enquiries).where(eq(t.enquiries.id, id));
      const legacy = { ...(row.extracted as Record<string, unknown>) };
      delete legacy.quoteBasis;
      await db
        .update(t.enquiries)
        .set({ extracted: { ...legacy, room: "Pool Villa", staffEdited: ["room"] } })
        .where(eq(t.enquiries.id, id));
      const stale = await detail(id);
      expect(stale.draft!.version).toBe(d.draft!.version);
      expect(stale.draft!.quoteState).toBe("stale");
      expect(await send(stale)).toEqual({ ok: false, code: "QUOTE_STALE" });

      expect(await inbox.rebuildQuote({ enquiryId: id }, f.actor("reservations"))).toEqual({
        ok: true,
      });
      const fresh = await detail(id);
      expect(roomOf(fresh)).toEqual([byName["Pool Villa"].id]);
      expect((await send(fresh)).ok).toBe(true);
    });

    it("a legacy intake draft with no staff quote edits stays approvable", async () => {
      const id = await villaEnquiry();
      await db.insert(t.replyDrafts).values({
        enquiryId: id,
        body: "Thank you. Our reservations team will review your request.",
        provider: "rules",
        promptVersion: "v",
      });
      await save(id, { budgetInr: 50_000 }); // not quote-affecting
      const d = await detail(id);
      expect(d.draft!.quoteState).toBe("current");
      expect((await send(d)).ok).toBe(true);
    });
  },
);

describe(
  "4. a failed rebuild leaves nothing sendable at the old price",
  { timeout: 120_000 },
  () => {
    it("forced pricing failure during a room edit", async () => {
      const { id, d } = await priced();
      listRooms.mockRejectedValueOnce(new Error("forced isolated failure"));
      const res = await save(id, { room: "Pool Villa" });
      expect(res).toMatchObject({ ok: true, changed: ["room"], draft: "failed" });

      const failed = await detail(id);
      // The Garden draft is still shown (same version) but is marked out of date.
      expect(failed.draft!.version).toBe(d.draft!.version);
      expect(failed.draft!.quoteState).toBe("failed");
      expect(await send(failed)).toEqual({ ok: false, code: "QUOTE_FAILED" });
      expect(await send(failed, "gm")).toEqual({ ok: false, code: "QUOTE_FAILED" });
      expect(await sentCount(id)).toMatchObject({ drafts: 0, events: 0, outbox: [] });

      // Retry rebuilds from the saved facts.
      expect(await inbox.rebuildQuote({ enquiryId: id }, f.actor("reservations"))).toEqual({
        ok: true,
      });
      const retried = await detail(id);
      expect(retried.draft!.quoteState).toBe("current");
      expect(roomOf(retried)).toEqual([byName["Pool Villa"].id]);
      expect((await send(retried)).ok).toBe(true);
    });

    it("a failed Regenerate or Retry is reported and refuses approval too", async () => {
      const { id } = await priced();
      await save(id, { dates: { from: "2099-12-15", to: "2099-12-16" } });
      listRooms.mockRejectedValueOnce(new Error("forced isolated failure"));
      expect(await inbox.rebuildQuote({ enquiryId: id }, f.actor("reservations"))).toEqual({
        ok: false,
        code: "REBUILD_FAILED",
      });
      const d = await detail(id);
      expect(d.draft!.quoteState).toBe("failed");
      expect(await send(d)).toEqual({ ok: false, code: "QUOTE_FAILED" });
    });
  },
);

describe("5. send racing a field edit, and send during a rebuild", { timeout: 180_000 }, () => {
  it("during a rebuild in flight the old draft is refused; the rebuild then lands", async () => {
    const { id, d } = await priced();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls = listRooms.mock.calls.length;
    listRooms.mockImplementationOnce(async () => {
      await gate;
      return rooms;
    });
    const saving = save(id, { room: "Pool Villa" });
    while (listRooms.mock.calls.length === calls) await new Promise((r) => setTimeout(r, 20));

    // The field edit is committed, its rebuild is waiting on pricing.
    const during = await detail(id);
    expect(during.draft!.version).toBe(d.draft!.version);
    expect(during.draft!.quoteState).toBe("rebuilding");
    expect(await send(d)).toEqual({ ok: false, code: "QUOTE_REBUILDING" });
    expect(await send(during, "gm")).toEqual({ ok: false, code: "QUOTE_REBUILDING" });

    release();
    expect(await saving).toMatchObject({ draft: "ok" });
    const after = await detail(id);
    expect(roomOf(after)).toEqual([byName["Pool Villa"].id]);
    expect(await sentCount(id)).toMatchObject({ drafts: 0, events: 0 });
  });

  it("a newer edit supersedes an older rebuild still in flight", async () => {
    const { id } = await priced();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls = listRooms.mock.calls.length;
    listRooms.mockImplementationOnce(async () => {
      await gate;
      return rooms;
    });
    const older = save(id, { room: "Pool Villa" });
    while (listRooms.mock.calls.length === calls) await new Promise((r) => setTimeout(r, 20));
    // While Pool Villa is being priced, someone sets the party; that rebuild finishes first.
    const newer = await inbox.saveFields(
      {
        enquiryId: id,
        dates: { from: "2099-12-14", to: "2099-12-16" },
        guests: { adults: 3, children: 1 },
        budgetInr: null,
        room: "Pool Villa",
        language: "en",
      },
      f.actor("gm"),
    );
    expect(newer).toMatchObject({ changed: ["guests"], draft: "ok" });
    release();
    expect(await older).toMatchObject({ draft: "superseded" });
    const d = await detail(id);
    expect(d.draft!.quoteState).toBe("current");
    expect(d.draft!.builtOn).toMatchObject({ guests: { adults: 3, children: 1 } });
  });

  it("send and a room edit at the same time: the result always matches the facts at send time", async () => {
    for (let i = 0; i < 4; i++) {
      const { id, d } = await priced();
      const [edit, sent] = await Promise.all([save(id, { room: "Pool Villa" }), send(d)]);
      const counts = await sentCount(id);
      if (sent.ok) {
        // Send won the enquiry lock: it sent the Garden quote while Garden was the saved room,
        // and the edit afterwards could not rebuild a sent reply.
        expect(edit).toMatchObject({ draft: "locked" });
        expect(counts).toMatchObject({ drafts: 1, events: 1 });
        expect(counts.outbox[0].body).toContain("Garden Villa");
      } else {
        expect(["QUOTE_REBUILDING", "STALE_DRAFT"]).toContain(sent.code);
        expect(counts).toMatchObject({ drafts: 0, events: 0, outbox: [] });
        expect(roomOf(await detail(id))).toEqual([byName["Pool Villa"].id]);
      }
    }
  });

  it("send then edit, and edit then send, in order", async () => {
    const first = await priced();
    expect((await send(first.d)).ok).toBe(true);
    expect(await save(first.id, { room: "Pool Villa" })).toMatchObject({ draft: "locked" });
    const [kept] = (await sentCount(first.id)).outbox;
    expect(kept.body).toContain("Garden Villa"); // the sent reply is a historical snapshot

    const second = await priced();
    await save(second.id, { room: "Pool Villa" });
    expect(await send(second.d)).toEqual({ ok: false, code: "STALE_DRAFT" });
  });
});

describe("6. normal save, regenerate, edit and approve still work", { timeout: 120_000 }, () => {
  it("exactly one sent event and one mock-outbox record", async () => {
    const { id } = await priced();
    expect(await save(id, { budgetInr: 40_000 })).toMatchObject({
      changed: ["budget"],
      requote: false,
      draft: "unchanged",
    });
    expect((await detail(id)).draft!.quoteState).toBe("current");

    expect(await inbox.regenerateDraft({ enquiryId: id }, f.actor("reservations"))).toEqual({
      ok: true,
    });
    const regenerated = await detail(id);
    expect(regenerated.draft!.quoteState).toBe("current");
    expect(roomOf(regenerated)).toEqual([byName["Garden Villa"].id]);

    const body = `${regenerated.draft!.body}\nWarm regards, Reservations`;
    expect(
      await inbox.saveDraft(
        { enquiryId: id, body, version: regenerated.draft!.version },
        f.actor("reservations"),
      ),
    ).toMatchObject({ ok: true });
    const edited = await detail(id);
    expect(edited.draft!.quoteState).toBe("current");
    expect((await send(edited)).ok).toBe(true);
    expect(await send(edited)).toEqual({ ok: false, code: "ALREADY_SENT" });

    const counts = await sentCount(id);
    expect(counts).toMatchObject({ drafts: 1, events: 1 });
    expect(counts.outbox).toHaveLength(1);
    expect(counts.outbox[0].body).toBe(body);
    const sentDetail = await detail(id);
    expect(sentDetail.draft).toMatchObject({ quoteState: null, sentAt: expect.any(String) });
  });
});
