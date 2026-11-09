import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import * as t from "@/db/schema";
import type { Db } from "@/lib/db";
import type { InboxActor } from "@/modules/enquiries";

/**
 * Inbox tests: three staff users and enquiries of their own, received in 2099 so they are the
 * newest rows in every lane, each summary carrying the fixture tag for the search filter.
 */
export async function inboxFixture(db: Db) {
  const tag = randomUUID().replace(/-/g, "").slice(0, 10);
  const staff = await db
    .insert(t.users)
    .values(
      (["reservations", "sales", "gm"] as const).map((role) => ({
        email: `inbox-${role}-${tag}@test.example`,
        name: `${role} ${tag}`,
        role,
        passwordHash: "x",
      })),
    )
    .returning();
  const by = Object.fromEntries(staff.map((u) => [u.role, u])) as Record<
    "reservations" | "sales" | "gm",
    (typeof staff)[number]
  >;
  const actor = (role: "reservations" | "sales" | "gm"): InboxActor => ({
    userId: by[role].id,
    role,
  });
  const ids: string[] = [];
  let n = 0;
  async function enquiry(over: Partial<typeof t.enquiries.$inferInsert> = {}) {
    const id = `ENQ-T${tag}${n++}`;
    ids.push(id);
    const category = over.category === undefined ? "room" : over.category;
    await db.insert(t.enquiries).values({
      id,
      channel: "email",
      senderName: "Test Guest",
      senderContact: "guest@test.example",
      rawText: "Is a villa free 14-16 Nov for 2 adults and a child?",
      receivedAt: new Date(Date.UTC(2099, 0, 1, 0, n)),
      category,
      confidence: "0.91",
      aiStatus: "ok",
      lane: "sorted",
      status: "assigned",
      extracted: {
        summary: `${tag} ${category ?? "unsorted"} enquiry`,
        dates: { from: "2026-11-14", to: "2026-11-16" },
        guests: { adults: 2, children: 1, total: 3 },
        budget: {},
        language: "en",
        grounding: { dates: "ok", guests: "ok", room: "ok" },
      },
      ...over,
    });
    return id;
  }
  async function clean() {
    if (ids.length) await db.delete(t.enquiries).where(inArray(t.enquiries.id, ids));
    await db.delete(t.users).where(
      inArray(
        t.users.id,
        staff.map((u) => u.id),
      ),
    );
  }
  return { tag, by, actor, enquiry, ids, clean };
}
