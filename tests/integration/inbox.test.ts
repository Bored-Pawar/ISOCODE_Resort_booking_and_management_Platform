import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as dbModule from "@/lib/db";
import * as t from "@/db/schema";
import { inbox, type Lane } from "@/modules/enquiries";
import { connect, ensureMigrated, testUrl } from "./helpers";
import { inboxFixture } from "./inbox-fixture";

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: () => undefined,
}));

const sql = connect();
const { db, client } = dbModule.createDb(testUrl(), { max: 6 });
let f: Awaited<ReturnType<typeof inboxFixture>>;

beforeAll(async () => {
  await ensureMigrated(sql);
});
beforeEach(async () => {
  vi.spyOn(dbModule, "getDb").mockReturnValue(db);
  f = await inboxFixture(db);
});
afterEach(async () => {
  await f?.clean();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await client.end();
  await sql.end();
});

/** Fixture ids a role sees across all its lanes. */
async function seen(role: "reservations" | "sales" | "gm", lanes: Lane[]) {
  const out = new Set<string>();
  for (const lane of lanes) {
    const res = await inbox.list({ lane, q: f.tag }, f.actor(role));
    if (!res.ok) throw new Error(res.code);
    res.rows.forEach((r) => out.add(r.id));
  }
  return out;
}
const ALL: Lane[] = ["room", "wedding", "offsite", "other", "complaints", "unsorted", "failed"];

describe("inbox visibility in SQL (test 1)", () => {
  it("sales never gets room or complaint rows, reservations never wedding, GM gets all", async () => {
    const room = await f.enquiry({ category: "room", ownerId: f.by.reservations.id });
    const other = await f.enquiry({ category: "other", ownerId: f.by.reservations.id });
    const wedding = await f.enquiry({ category: "wedding", ownerId: f.by.sales.id });
    const offsite = await f.enquiry({ category: "offsite", ownerId: f.by.sales.id });
    const complaint = await f.enquiry({
      category: "complaint",
      isComplaint: true,
      ownerId: f.by.gm.id,
    });
    const roomComplaint = await f.enquiry({ category: "room", isComplaint: true });
    const unsorted = await f.enquiry({
      category: null,
      lane: "unsorted",
      status: "new",
      confidence: "0.40",
    });
    const failed = await f.enquiry({
      category: null,
      lane: "unsorted",
      aiStatus: "failed",
      status: "new",
    });

    const sales = await seen("sales", ["mine", "wedding", "offsite"]);
    expect([...sales].sort()).toEqual([wedding, offsite].sort());
    const res = await seen("reservations", ["mine", "room", "other", "attention"]);
    expect([...res].sort()).toEqual([room, other].sort());
    const gm = await seen("gm", ALL);
    expect([...gm].sort()).toEqual(
      [room, other, wedding, offsite, complaint, roomComplaint, unsorted, failed].sort(),
    );
    // A lane outside the role is refused, not filtered to empty.
    expect(await inbox.list({ lane: "room" }, f.actor("sales"))).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await inbox.list({ lane: "unsorted" }, f.actor("reservations"))).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    // Detail answers not found across roles.
    expect((await inbox.detail(room, f.actor("sales"))).ok).toBe(false);
    expect((await inbox.detail(roomComplaint, f.actor("reservations"))).ok).toBe(false);
    expect((await inbox.detail(roomComplaint, f.actor("gm"))).ok).toBe(true);
  });

  it("filters by status, channel and search, and pages 25 at a time by keyset", async () => {
    for (let i = 0; i < 27; i++) await f.enquiry({ ownerId: f.by.reservations.id });
    await f.enquiry({ ownerId: f.by.reservations.id, channel: "whatsapp", status: "replied" });
    const a = await inbox.list({ lane: "room", q: f.tag }, f.actor("reservations"));
    if (!a.ok) throw new Error();
    expect(a.rows).toHaveLength(25);
    const b = await inbox.list(
      { lane: "room", q: f.tag, cursor: a.nextCursor! },
      f.actor("reservations"),
    );
    if (!b.ok) throw new Error();
    expect(b.rows).toHaveLength(3);
    expect(b.nextCursor).toBeNull();
    expect(new Set([...a.rows, ...b.rows].map((r) => r.id)).size).toBe(28);
    const w = await inbox.list(
      { lane: "room", q: f.tag, channel: "whatsapp", status: "replied" },
      f.actor("reservations"),
    );
    expect(w.ok && w.rows.length).toBe(1);
  });

  it("count badges count open items only", async () => {
    await f.enquiry({ category: null, lane: "unsorted", status: "new" });
    await f.enquiry({ category: null, lane: "unsorted", status: "closed" });
    const counts = await inbox.counts(f.actor("gm"));
    const before = counts.unsorted ?? 0;
    await f.enquiry({ category: null, lane: "unsorted", status: "new" });
    expect((await inbox.counts(f.actor("gm"))).unsorted).toBe(before + 1);
    expect(await inbox.counts(f.actor("sales"))).toEqual({});
  });
});

describe("re-route and field edits (tests 2, 4, 6)", () => {
  it("sales re-routing or editing a room enquiry is FORBIDDEN and writes nothing", async () => {
    const id = await f.enquiry({ category: "room", ownerId: f.by.reservations.id });
    expect(
      await inbox.reroute(
        { enquiryId: id, category: "wedding", ownerId: f.by.sales.id },
        f.actor("sales"),
      ),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(
      await inbox.saveFields(
        { enquiryId: id, dates: null, guests: null, budgetInr: 5, room: null, language: null },
        f.actor("sales"),
      ),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const [row] = await db.select().from(t.enquiries).where(eq(t.enquiries.id, id));
    expect(row.category).toBe("room");
    expect(row.ownerId).toBe(f.by.reservations.id);
    const events = await db.select().from(t.enquiryEvents).where(eq(t.enquiryEvents.enquiryId, id));
    expect(events).toHaveLength(0);
  });

  it("re-route logs one event and updates category, owner and lane together", async () => {
    const id = await f.enquiry({ category: null, lane: "unsorted", status: "new" });
    expect(
      await inbox.reroute(
        { enquiryId: id, category: "wedding", ownerId: f.by.sales.id },
        f.actor("gm"),
      ),
    ).toEqual({ ok: true, changed: true });
    const [row] = await db.select().from(t.enquiries).where(eq(t.enquiries.id, id));
    expect(row).toMatchObject({
      category: "wedding",
      ownerId: f.by.sales.id,
      lane: "sorted",
      status: "assigned",
    });
    const events = await db.select().from(t.enquiryEvents).where(eq(t.enquiryEvents.enquiryId, id));
    expect(events).toEqual([
      expect.objectContaining({
        action: "rerouted",
        fromValue: "unsorted",
        toValue: "wedding",
        actor: f.by.gm.id,
      }),
    ]);
    // The owner's role must be able to see the new category.
    expect(
      await inbox.reroute(
        { enquiryId: id, category: "room", ownerId: f.by.sales.id },
        f.actor("gm"),
      ),
    ).toEqual({ ok: false, code: "INVALID_OWNER" });
    // Reservations may move its own room enquiry to sales (it leaves their list).
    const own = await f.enquiry({ category: "room", ownerId: f.by.reservations.id });
    expect(
      await inbox.reroute(
        { enquiryId: own, category: "offsite", ownerId: f.by.sales.id },
        f.actor("reservations"),
      ),
    ).toMatchObject({ ok: true });
    expect((await inbox.detail(own, f.actor("reservations"))).ok).toBe(false);
  });

  it("a complaint re-routed to rooms keeps its GM notification and stays GM only", async () => {
    const id = await f.enquiry({ category: "complaint", isComplaint: true, ownerId: f.by.gm.id });
    await db
      .insert(t.notifications)
      .values({ userId: f.by.gm.id, enquiryId: id, kind: "complaint" });
    expect(
      await inbox.reroute(
        { enquiryId: id, category: "room", ownerId: f.by.reservations.id },
        f.actor("gm"),
      ),
    ).toEqual({ ok: false, code: "INVALID_OWNER" });
    expect(
      await inbox.reroute({ enquiryId: id, category: "room", ownerId: f.by.gm.id }, f.actor("gm")),
    ).toMatchObject({ ok: true });
    const [row] = await db.select().from(t.enquiries).where(eq(t.enquiries.id, id));
    expect(row).toMatchObject({ category: "room", isComplaint: true });
    const notes = await db
      .select()
      .from(t.notifications)
      .where(and(eq(t.notifications.enquiryId, id), eq(t.notifications.kind, "complaint")));
    expect(notes).toHaveLength(1);
    expect((await inbox.detail(id, f.actor("reservations"))).ok).toBe(false);
    // Making something a complaint alerts the GM.
    const plain = await f.enquiry({ category: "room", ownerId: f.by.reservations.id });
    await inbox.reroute(
      { enquiryId: plain, category: "complaint", ownerId: f.by.gm.id },
      f.actor("gm"),
    );
    const alerts = await db
      .select()
      .from(t.notifications)
      .where(eq(t.notifications.enquiryId, plain));
    expect(alerts.map((a) => a.kind)).toEqual(["complaint"]);
  });

  it("field edits merge into extracted, log edited and rebuild only the unsent draft", async () => {
    const id = await f.enquiry({ category: "wedding", ownerId: f.by.sales.id });
    await db.insert(t.replyDrafts).values({
      enquiryId: id,
      body: "Old draft",
      provider: "rules",
      promptVersion: "v",
    });
    const res = await inbox.saveFields(
      {
        enquiryId: id,
        dates: { from: "2027-02-10", to: "2027-02-12" },
        guests: { adults: 200, children: 0 },
        budgetInr: 2000000,
        room: null,
        language: "en",
      },
      f.actor("sales"),
    );
    // 200 adults is over the 40 limit for the room quote path: invalid input, nothing written.
    expect(res).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    const ok = await inbox.saveFields(
      {
        enquiryId: id,
        dates: { from: "2027-02-10", to: "2027-02-12" },
        guests: { adults: 30, children: 0 },
        budgetInr: 2000000,
        room: null,
        language: "en",
      },
      f.actor("sales"),
    );
    expect(ok).toMatchObject({ ok: true, requote: true, draft: "ok" });
    const [row] = await db.select().from(t.enquiries).where(eq(t.enquiries.id, id));
    expect(row.extracted).toMatchObject({
      summary: `${f.tag} wedding enquiry`,
      dates: { from: "2027-02-10", to: "2027-02-12" },
      guests: { adults: 30, children: 0, total: 30 },
      budget: { amountInr: 2000000 },
      staffEdited: expect.arrayContaining(["dates", "guests", "budget"]),
    });
    const [draft] = await db.select().from(t.replyDrafts).where(eq(t.replyDrafts.enquiryId, id));
    expect(draft.body).not.toBe("Old draft");
    expect(draft.body).not.toMatch(/₹/);
    const events = await db.select().from(t.enquiryEvents).where(eq(t.enquiryEvents.enquiryId, id));
    expect(events).toEqual([
      expect.objectContaining({
        action: "edited",
        fromValue: "fields",
        toValue: "dates,guests,budget",
      }),
    ]);
  });
});

describe("draft and send (tests 2, 3)", () => {
  async function withDraft(over: Parameters<typeof f.enquiry>[0] = {}) {
    const id = await f.enquiry({ category: "room", ownerId: f.by.reservations.id, ...over });
    const [d] = await db
      .insert(t.replyDrafts)
      .values({
        enquiryId: id,
        body: "From ₹24,800 (room only, including ₹2,657.14 GST).",
        quote: { totalPaise: 2_480_000, gstPaise: 265_714 },
        provider: "rules",
        promptVersion: "v",
      })
      .returning();
    return { id, draftId: d.id };
  }

  it("approve and send twice concurrently: one sent_at, one sent event, first_reply_at once", async () => {
    const { id, draftId } = await withDraft();
    const send = () =>
      inbox.approveAndSend(
        { enquiryId: id, draftId, body: "Final reply" },
        f.actor("reservations"),
      );
    const results = await Promise.all([send(), send(), send()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.code)).toEqual([
      "ALREADY_SENT",
      "ALREADY_SENT",
    ]);
    const [row] = await db.select().from(t.enquiries).where(eq(t.enquiries.id, id));
    const [draft] = await db.select().from(t.replyDrafts).where(eq(t.replyDrafts.id, draftId));
    expect(row.status).toBe("replied");
    expect(row.firstReplyAt?.getTime()).toBe(draft.sentAt?.getTime());
    expect(draft).toMatchObject({
      approvedBy: f.by.reservations.id,
      edited: true,
      body: "Final reply",
    });
    const sent = await db
      .select()
      .from(t.enquiryEvents)
      .where(and(eq(t.enquiryEvents.enquiryId, id), eq(t.enquiryEvents.action, "sent")));
    expect(sent).toHaveLength(1);
    // A later edit or regenerate cannot change a sent reply.
    expect(await inbox.saveDraft({ enquiryId: id, body: "x" }, f.actor("reservations"))).toEqual({
      ok: false,
      code: "ALREADY_SENT",
    });
    // The outbox lists it for the role that can see it, not for sales.
    expect((await inbox.sentReplies(f.actor("reservations"))).some((r) => r.enquiryId === id)).toBe(
      true,
    );
    expect((await inbox.sentReplies(f.actor("sales"))).some((r) => r.enquiryId === id)).toBe(false);
  });

  it("sales approving, editing or closing a room enquiry is FORBIDDEN and writes nothing", async () => {
    const { id, draftId } = await withDraft();
    const sales = f.actor("sales");
    expect(await inbox.approveAndSend({ enquiryId: id, draftId, body: "x" }, sales)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await inbox.saveDraft({ enquiryId: id, body: "x" }, sales)).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await inbox.close({ enquiryId: id }, sales)).toMatchObject({ code: "FORBIDDEN" });
    const [draft] = await db.select().from(t.replyDrafts).where(eq(t.replyDrafts.id, draftId));
    expect(draft).toMatchObject({ sentAt: null, approvedBy: null, edited: false });
    expect(
      await db.select().from(t.enquiryEvents).where(eq(t.enquiryEvents.enquiryId, id)),
    ).toEqual([]);
  });

  it("a typed rupee figure saves with a warning and is logged as edited", async () => {
    const { id } = await withDraft();
    const res = await inbox.saveDraft(
      { enquiryId: id, body: "From ₹24,800. For you, ₹20,000." },
      f.actor("reservations"),
    );
    expect(res).toEqual({ ok: true, priceWarning: true });
    const [ev] = await db.select().from(t.enquiryEvents).where(eq(t.enquiryEvents.enquiryId, id));
    expect(ev).toMatchObject({
      action: "edited",
      fromValue: "draft",
      toValue: "draft:price-warning",
    });
    expect(await inbox.close({ enquiryId: id }, f.actor("reservations"))).toEqual({ ok: true });
    const [row] = await db.select().from(t.enquiries).where(eq(t.enquiries.id, id));
    expect(row.status).toBe("closed");
  });
});

describe("GM bell (Q7)", () => {
  it("lists only my alerts, marks one and all read, and refuses other roles", async () => {
    const a = await f.enquiry({ category: "complaint", isComplaint: true, ownerId: f.by.gm.id });
    const b = await f.enquiry({ category: null, lane: "unsorted", status: "new" });
    const [na, nb] = await db
      .insert(t.notifications)
      .values([
        { userId: f.by.gm.id, enquiryId: a, kind: "complaint" },
        { userId: f.by.gm.id, enquiryId: b, kind: "unsorted" },
      ])
      .returning();
    // Another user's alert (a second GM) never shows and cannot be marked by this GM.
    const [other] = await db
      .insert(t.notifications)
      .values({ userId: f.by.sales.id, enquiryId: a, kind: "complaint" })
      .returning();
    const gm = f.actor("gm");
    const first = await inbox.bell(gm);
    if (!first.ok) throw new Error();
    expect(first.bell.unread).toBe(2);
    expect(first.bell.items.map((i) => i.id).sort()).toEqual([na.id, nb.id].sort());
    expect(await inbox.markRead({ id: other.id }, gm)).toEqual({ ok: true, changed: false });
    expect(await inbox.markRead({ id: na.id }, gm)).toEqual({ ok: true, changed: true });
    const second = await inbox.bell(gm);
    expect(second.ok && second.bell.unread).toBe(1);
    expect(second.ok && second.bell.items[0].id).toBe(nb.id); // unread first
    expect(await inbox.markAllRead(gm)).toEqual({ ok: true, count: 1 });
    const [o] = await db.select().from(t.notifications).where(eq(t.notifications.id, other.id));
    expect(o.readAt).toBeNull();
    expect(await inbox.bell(f.actor("reservations"))).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await inbox.markAllRead(f.actor("sales"))).toEqual({ ok: false, code: "FORBIDDEN" });
  });
});

describe("attention request (2.5, tests 2 and 5)", () => {
  it("request then resolve: lane membership follows; a second request reopens it", async () => {
    const id = await f.enquiry({ category: "wedding", ownerId: f.by.sales.id });
    const inLane = async (role: "reservations" | "gm") => {
      const res = await inbox.list({ lane: "attention", q: f.tag }, f.actor(role));
      return res.ok && res.rows.some((r) => r.id === id);
    };
    expect(await inLane("reservations")).toBe(false);
    expect((await inbox.detail(id, f.actor("reservations"))).ok).toBe(false);
    expect(
      await inbox.requestAttention(
        { enquiryId: id, note: "Can we hold 12 rooms?" },
        f.actor("sales"),
      ),
    ).toEqual({ ok: true });
    expect(
      await inbox.requestAttention({ enquiryId: id, note: "again" }, f.actor("sales")),
    ).toEqual({ ok: false, code: "ALREADY_OPEN" });
    expect(await inLane("reservations")).toBe(true);
    expect(await inLane("gm")).toBe(true);
    // Reservations can now open it (read only) and see the note, but not work it.
    const seen = await inbox.detail(id, f.actor("reservations"));
    expect(seen.ok && seen.detail.can).toMatchObject({ work: false, resolveAttention: true });
    expect(
      await inbox.reroute(
        { enquiryId: id, category: "room", ownerId: f.by.reservations.id },
        f.actor("reservations"),
      ),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    // Sales cannot resolve (test 2): nothing written.
    expect(await inbox.resolveAttention({ enquiryId: id, note: "ok" }, f.actor("sales"))).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(
      await inbox.resolveAttention(
        { enquiryId: id, note: "Yes, 12 rooms on hold" },
        f.actor("reservations"),
      ),
    ).toEqual({ ok: true });
    expect(await inLane("reservations")).toBe(false);
    expect(await inLane("gm")).toBe(false);
    expect(await inbox.resolveAttention({ enquiryId: id, note: "again" }, f.actor("gm"))).toEqual({
      ok: false,
      code: "NOT_OPEN",
    });
    expect(
      await inbox.requestAttention({ enquiryId: id, note: "Dates moved" }, f.actor("sales")),
    ).toEqual({ ok: true });
    expect(await inLane("reservations")).toBe(true);
    const events = await db.select().from(t.enquiryEvents).where(eq(t.enquiryEvents.enquiryId, id));
    expect(events.map((e) => [e.fromValue, e.toValue])).toEqual(
      expect.arrayContaining([
        ["Can we hold 12 rooms?", "attention"],
        ["attention", "seen: Yes, 12 rooms on hold"],
        ["Dates moved", "attention"],
      ]),
    );
    expect(events).toHaveLength(3);
    // Count badge for reservations.
    expect((await inbox.counts(f.actor("reservations"))).attention).toBeGreaterThanOrEqual(1);
  });

  it("no attention request on a complaint, and none from reservations", async () => {
    const c = await f.enquiry({ category: "complaint", isComplaint: true, ownerId: f.by.gm.id });
    expect(await inbox.requestAttention({ enquiryId: c, note: "x" }, f.actor("gm"))).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    const r = await f.enquiry({ category: "room", ownerId: f.by.reservations.id });
    expect(
      await inbox.requestAttention({ enquiryId: r, note: "x" }, f.actor("reservations")),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await db.select().from(t.enquiryEvents).where(eq(t.enquiryEvents.enquiryId, r))).toEqual(
      [],
    );
  });
});
