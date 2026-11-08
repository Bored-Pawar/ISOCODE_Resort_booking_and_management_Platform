import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createDb } from "@/lib/db";
import * as t from "@/db/schema";
import {
  claimEnquiry,
  settleEnquiry,
  sweepCandidates,
  queueEligibility,
  failClaim,
  resetFailedEnquiry,
  claimSweep,
  type Claim,
  type Settlement,
} from "@/modules/enquiries/internal";
import { testUrl } from "./helpers";

const { db, client } = createDb(testUrl(), { max: 8 });
const ids: string[] = [];
let staff: (typeof t.users.$inferSelect)[];
const result: Settlement = {
  status: "ok",
  category: "complaint",
  confidence: 0.69,
  extracted: { category: "complaint", summary: "Synthetic complaint" },
  ownerRole: null,
  notifyGm: true,
  lastError: null,
  draft: {
    body: "Our team will review this.",
    quote: null,
    provider: "mock",
    model: "mock",
    promptVersion: "test",
  },
};
async function enquiry(over: Partial<typeof t.enquiries.$inferInsert> = {}) {
  const id = `ENQ-test-${randomUUID()}`;
  ids.push(id);
  await db.insert(t.enquiries).values({
    id,
    channel: "web",
    senderName: "Synthetic",
    senderContact: "synthetic@example.test",
    rawText: "Synthetic complaint about service",
    extracted: { source: { provider: "test", messageId: id }, consent: { version: "test" } },
    ...over,
  });
  return id;
}
async function claim(id: string): Promise<Claim> {
  const r = await claimEnquiry(id, db);
  if (r.kind !== "claimed") throw new Error(`Expected claim: ${r.kind}`);
  return r.claim;
}
beforeAll(async () => {
  staff = await db
    .insert(t.users)
    .values(
      ["gm", "sales", "reservations"].map((role) => ({
        email: `${randomUUID()}@ai.test`,
        name: "Synthetic",
        role,
        passwordHash: "unused",
        createdAt: new Date("1800-01-01"),
      })),
    )
    .returning();
}, 90_000);
beforeEach(() => {
  ids.length = 0;
});
afterEach(async () => {
  if (!ids.length) return;
  await db.delete(t.notifications).where(inArray(t.notifications.enquiryId, ids));
  await db.delete(t.replyDrafts).where(inArray(t.replyDrafts.enquiryId, ids));
  await db.delete(t.enquiryEvents).where(inArray(t.enquiryEvents.enquiryId, ids));
  await db.delete(t.enquiries).where(inArray(t.enquiries.id, ids));
}, 90_000);
afterAll(async () => {
  await db.delete(t.users).where(
    inArray(
      t.users.id,
      staff.map((s) => s.id),
    ),
  );
  await client.end();
}, 90_000);

describe("persistent AI queue", { timeout: 90_000 }, () => {
  it("concurrent SKIP LOCKED sweeps never double-claim, and skip active/terminal rows", async () => {
    const pending = await enquiry({ aiUpdatedAt: new Date("1900-01-01") });
    const stale = await enquiry({
      aiStatus: "processing",
      aiAttempts: 1,
      aiUpdatedAt: new Date("1900-01-02"),
    });
    const active = await enquiry({
      aiStatus: "processing",
      aiAttempts: 1,
      aiUpdatedAt: new Date(),
    });
    const terminal = await enquiry({
      aiStatus: "failed",
      aiAttempts: 3,
      aiLastError: "ATTEMPTS_EXHAUSTED",
    });
    const batches = await Promise.all([claimSweep(undefined, db), claimSweep(undefined, db)]);
    expect(batches.every((batch) => batch.length <= 5)).toBe(true);
    const claimedIds = batches.flat().map((c) => c.row.id);
    expect(new Set(claimedIds).size).toBe(claimedIds.length);
    expect(claimedIds).toContain(pending);
    expect(claimedIds).toContain(stale);
    expect(claimedIds).not.toContain(active);
    expect(claimedIds).not.toContain(terminal);
  });
  it("three actual failed attempts are terminal and a fourth claim is rejected", async () => {
    const id = await enquiry();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const current = await claim(id);
      expect(current.attempt).toBe(attempt);
      await failClaim(current, db);
      if (attempt < 3)
        await db
          .update(t.enquiries)
          .set({ aiUpdatedAt: sql`clock_timestamp() - interval '3 minutes'` })
          .where(eq(t.enquiries.id, id));
    }
    expect(await claimEnquiry(id, db)).toMatchObject({ kind: "busy" });
    const [row] = await db.select().from(t.enquiries).where(eq(t.enquiries.id, id));
    expect(row).toMatchObject({
      aiStatus: "failed",
      aiAttempts: 3,
      aiLastError: "ATTEMPTS_EXHAUSTED",
      lane: "unsorted",
    });
    expect(await sweepCandidates(db)).not.toContain(id);
  });
  it.each([0, 1, 2])(
    "eligible attempt after %i prior attempts settles normally",
    async (previous) => {
      const id = await enquiry({ aiAttempts: previous });
      const current = await claim(id);
      expect(current.attempt).toBe(previous + 1);
      expect(await settleEnquiry(current, result, db)).toMatchObject({ aiStatus: "ok" });
    },
  );
  it("sweep exhausts a stale final claim without retrying it", async () => {
    const id = await enquiry({
      aiStatus: "processing",
      aiAttempts: 3,
      aiUpdatedAt: new Date("2000-01-01"),
    });
    expect(await sweepCandidates(db)).not.toContain(id);
    expect((await db.select().from(t.enquiries).where(eq(t.enquiries.id, id)))[0]).toMatchObject({
      aiStatus: "failed",
      lane: "unsorted",
    });
  });
  it("concurrent manual retries reset once, log the actor, and reject stale settlement/retry", async () => {
    const id = await enquiry({ aiAttempts: 2 });
    const old = await claim(id);
    await failClaim(old, db);
    const input = {
      enquiryId: id,
      expectedUpdatedAt: old.updatedAt.toISOString(),
      expectedAttempts: 3,
    };
    const retries = await Promise.all([
      resetFailedEnquiry(input, staff[0].id, db),
      resetFailedEnquiry(input, staff[0].id, db),
    ]);
    expect(retries.sort()).toEqual([false, true]);
    const events = await db.select().from(t.enquiryEvents).where(eq(t.enquiryEvents.enquiryId, id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor: staff[0].id,
      action: "edited",
      toValue: "ai:pending:retry",
    });
    const fresh = await claim(id);
    expect(fresh.attempt).toBe(1);
    expect(await settleEnquiry(old, result, db)).toBeNull();
    expect(await settleEnquiry(fresh, result, db)).toMatchObject({ aiStatus: "ok" });
    expect(await resetFailedEnquiry(input, staff[0].id, db)).toBe(false);
    expect(await settleEnquiry(fresh, result, db)).toBeNull();
    expect(
      await db.select().from(t.notifications).where(eq(t.notifications.enquiryId, id)),
    ).toHaveLength(1);
    expect(
      await db.select().from(t.replyDrafts).where(eq(t.replyDrafts.enquiryId, id)),
    ).toHaveLength(1);
  });
  it("the actual queue predicate includes exactly two minutes and excludes one millisecond younger", async () => {
    const id = await enquiry({
      aiStatus: "processing",
      aiUpdatedAt: new Date("2000-01-01T00:00:00Z"),
    });
    const queryAt = (now: string) =>
      db
        .select({ id: t.enquiries.id })
        .from(t.enquiries)
        .where(and(eq(t.enquiries.id, id), queueEligibility(sql`${now}::timestamptz`)));
    expect(await queryAt("2000-01-01T00:02:00Z")).toHaveLength(1);
    expect(await queryAt("2000-01-01T00:01:59.999Z")).toHaveLength(0);
  });
  it("two concurrent claims have one winner and one increment", async () => {
    const id = await enquiry();
    const r = await Promise.all([claimEnquiry(id, db), claimEnquiry(id, db)]);
    expect(r.map((x) => x.kind).sort()).toEqual(["busy", "claimed"]);
    expect((await db.select().from(t.enquiries).where(eq(t.enquiries.id, id)))[0].aiAttempts).toBe(
      1,
    );
  });
  it("recovers interrupted processing; stale generations cannot settle", async () => {
    const id = await enquiry();
    const old = await claim(id);
    await db
      .update(t.enquiries)
      .set({ aiUpdatedAt: sql`clock_timestamp() - interval '2 minutes'` })
      .where(eq(t.enquiries.id, id));
    const fresh = await claim(id);
    expect(fresh.attempt).toBe(2);
    expect(await settleEnquiry(old, result, db)).toBeNull();
    expect(await settleEnquiry(fresh, result, db)).toMatchObject({
      aiStatus: "ok",
      lane: "unsorted",
      isComplaint: true,
    });
  });
  it("does not recover processing younger than two minutes", async () => {
    const id = await enquiry({
      aiStatus: "processing",
      aiUpdatedAt: new Date(Date.now() - 60_000),
    });
    expect(await claimEnquiry(id, db)).toEqual({ kind: "busy" });
  });
  it("sweep is bounded to five and excludes terminal/failed/owned rows", async () => {
    for (let i = 0; i < 7; i++) await enquiry({ aiUpdatedAt: new Date("1700-01-01") });
    const terminal = await enquiry({ aiStatus: "ok", aiUpdatedAt: new Date("1600-01-01") });
    const failed = await enquiry({ aiStatus: "failed", aiUpdatedAt: new Date("1600-01-01") });
    const owned = await enquiry({ ownerId: staff[0].id, aiUpdatedAt: new Date("1600-01-01") });
    const batch = await sweepCandidates(db);
    expect(batch).toHaveLength(5);
    expect(batch.every((id) => ids.includes(id))).toBe(true);
    expect(batch).not.toContain(terminal);
    expect(batch).not.toContain(failed);
    expect(batch).not.toContain(owned);
  });
  it("duplicate settle persists one draft, alert and event; metadata merged; never sent", async () => {
    const id = await enquiry();
    const c = await claim(id);
    const r = await Promise.all([settleEnquiry(c, result, db), settleEnquiry(c, result, db)]);
    expect(r.filter(Boolean)).toHaveLength(1);
    const drafts = await db.select().from(t.replyDrafts).where(eq(t.replyDrafts.enquiryId, id));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ edited: false, approvedBy: null, sentAt: null });
    expect(
      await db.select().from(t.notifications).where(eq(t.notifications.enquiryId, id)),
    ).toHaveLength(1);
    expect(
      await db.select().from(t.enquiryEvents).where(eq(t.enquiryEvents.enquiryId, id)),
    ).toHaveLength(1);
    expect(
      (await db.select().from(t.enquiries).where(eq(t.enquiries.id, id)))[0].extracted,
    ).toMatchObject({
      source: { messageId: id },
      consent: { version: "test" },
      summary: "Synthetic complaint",
    });
  });
  it.each(["draft", "notification"])(
    "rolls back classification when %s insert fails",
    async (failure) => {
      const id = await enquiry();
      const c = await claim(id);
      const broken =
        failure === "draft"
          ? { ...result, draft: { ...result.draft, body: null as never } }
          : result;
      if (failure === "notification") {
        // Inject a PostgreSQL error at the notification write, without changing shared schema.
        const wrapped = Object.create(db) as typeof db;
        wrapped.transaction = (async (fn: Parameters<typeof db.transaction>[0]) =>
          db.transaction(async (tx) => {
            const execute = tx.execute.bind(tx);
            const proxy = new Proxy(tx, {
              get(target, prop, receiver) {
                if (prop === "execute")
                  return async (query: Parameters<typeof tx.execute>[0]) => {
                    const compiled = new PgDialect().sqlToQuery(
                      query as Parameters<PgDialect["sqlToQuery"]>[0],
                    );
                    if (compiled.sql.includes("INSERT INTO notifications"))
                      return execute(sql`SELECT 1 / 0`);
                    return execute(query);
                  };
                return Reflect.get(target, prop, receiver);
              },
            });
            return fn(proxy);
          })) as typeof db.transaction;
        await expect(settleEnquiry(c, result, wrapped)).rejects.toThrow();
      } else await expect(settleEnquiry(c, broken, db)).rejects.toThrow();
      expect((await db.select().from(t.enquiries).where(eq(t.enquiries.id, id)))[0].aiStatus).toBe(
        "processing",
      );
      expect(
        await db.select().from(t.replyDrafts).where(eq(t.replyDrafts.enquiryId, id)),
      ).toHaveLength(0);
    },
  );
  it("late processing preserves a human reroute", async () => {
    const id = await enquiry();
    const c = await claim(id);
    await db
      .update(t.enquiries)
      .set({ ownerId: staff[1].id, lane: "sorted", status: "assigned" })
      .where(eq(t.enquiries.id, id));
    await db.insert(t.enquiryEvents).values({ enquiryId: id, actor: "staff", action: "rerouted" });
    expect(await settleEnquiry(c, result, db)).toBeNull();
    expect((await db.select().from(t.enquiries).where(eq(t.enquiries.id, id)))[0]).toMatchObject({
      ownerId: staff[1].id,
      aiStatus: "failed",
      aiLastError: "STAFF_CHANGED",
    });
  });
  it("does not overwrite an edited/approved draft", async () => {
    const id = await enquiry();
    const c = await claim(id);
    await db.insert(t.replyDrafts).values({
      enquiryId: id,
      body: "Human content",
      provider: "staff",
      promptVersion: "human",
      edited: true,
      approvedBy: staff[0].id,
    });
    expect(await settleEnquiry(c, result, db)).toBeNull();
    expect(
      (await db.select().from(t.replyDrafts).where(eq(t.replyDrafts.enquiryId, id)))[0].body,
    ).toBe("Human content");
  });
});
