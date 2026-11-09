/**
 * S3 Phase 6 scripted acceptance walk of the brief's core slice, against a running app
 * (`DEV_TOOLS_ENABLED=true pnpm dev`, development database, provider from `.env.local`).
 *   pnpm exec tsx --tsconfig tsconfig.json --env-file=.env.local scripts/acceptance.mts http://localhost:3300
 * Writes docs/final-check-acceptance.json. Creates enquiries (synthetic text, `@acceptance.example`
 * contacts) through the real web form and the inbound webhooks; reads the database only to check
 * the outcome. The inbound secret is read from the environment and never printed.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { sql } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { buildPostmarkPayload, buildWhatsAppPayload } from "@/modules/enquiries/inbound";

const base = process.argv[2] ?? "http://localhost:3300";
if (!/^http:\/\/localhost:\d+$/.test(base)) throw new Error("local base URL only");
const secret = process.env.INBOUND_WEBHOOK_SECRET ?? "";
const checks: { id: string; check: string; pass: boolean; evidence: string }[] = [];
const record = (id: string, check: string, pass: boolean, evidence: string) => {
  checks.push({ id, check, pass, evidence });
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${check}: ${evidence}`);
};
const ist = (d: number) =>
  new Date(Date.now() + 5.5 * 3_600_000 + d * 86_400_000).toISOString().slice(0, 10);
const stay = `checkIn=${ist(21)}&checkOut=${ist(23)}&adults=2&children=0`;

// 1-2. Search and room pages: availability and price including GST, server rendered.
{
  const html = await (await fetch(`${base}/rooms?${stay}`)).text();
  record(
    "A1",
    "search shows rooms with prices incl. GST",
    /₹/.test(html) && /GST/i.test(html) && /\d+\s+left/.test(html.replace(/<[^>]*>/g, " ")),
    "/rooms with dates: rupee prices, GST, rooms left",
  );
  const room = await (await fetch(`${base}/rooms/garden-villa?${stay}`)).text();
  record(
    "A2",
    "room page shows availability and price incl. GST",
    /₹/.test(room) && /GST/i.test(room),
    "/rooms/garden-villa with dates",
  );
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
async function staff(role: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/admin/login`);
  await page.getByLabel("Work email").fill(`${role}@companya.example`);
  await page.getByRole("textbox", { name: "Password" }).fill("Demo@12345");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 120_000 });
  return { ctx, page };
}

// 3. Roles enforced (pages; services are covered by the integration suite).
{
  const { ctx, page } = await staff("sales");
  await page.goto(`${base}/admin/rates`, { timeout: 120_000 });
  const forbidden = await page.getByText("Your role doesn't include this page").count();
  await page.goto(`${base}/admin/inbox?lane=unsorted`, { timeout: 120_000 });
  const unsortedTab = await page.getByRole("link", { name: /^Unsorted/ }).count();
  // The page falls back to the role's first lane: the active lane (aria-current) must not be Unsorted.
  const active = (await page.locator('a[aria-current="page"]').allTextContents()).join(" ").trim();
  record(
    "A3",
    "roles: sales cannot open Rates or the Unsorted lane",
    forbidden > 0 && unsortedTab === 0 && !!active && !/Unsorted/.test(active),
    `rates 403 screen=${forbidden > 0}, unsorted tab shown=${unsortedTab > 0}, active lane "${active.slice(0, 40)}"`,
  );
  await ctx.close();
  const guest = await browser.newContext();
  const gp = await guest.newPage();
  await gp.goto(`${base}/admin`, { timeout: 120_000 });
  record(
    "A4",
    "roles: signed-out /admin goes to staff login",
    /\/admin\/login/.test(gp.url()),
    gp.url().replace(base, ""),
  );
  await guest.close();
}

// 4. Admin screens load for the GM (writes are covered by the admin integration tests).
{
  const { ctx, page } = await staff("gm");
  const loaded: string[] = [];
  for (const p of ["/admin/rates", "/admin/allotment", "/admin/promos", "/admin/bookings"]) {
    const r = await page.goto(`${base}${p}`, { timeout: 120_000 });
    if (r?.ok() && !(await page.getByText("Your role doesn't include this page").count()))
      loaded.push(p);
  }
  record(
    "A5",
    "GM pages load: rates, allotment, promos, bookings",
    loaded.length === 4,
    loaded.join(", "),
  );
  await ctx.close();
}

// 5. Enquiry from the web form.
const tag = randomUUID().slice(0, 8);
let webRef = "";
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/enquire`, { timeout: 120_000 });
  await page.getByLabel("Your name").fill("Acceptance Guest");
  await page.getByLabel("Email or phone").fill(`web-${tag}@acceptance.example`);
  await page
    .getByLabel("Your message")
    .fill("Do you have a garden villa for 2 adults next month? We would like breakfast included.");
  await page.getByRole("checkbox", { name: /I agree/ }).check();
  await page.getByRole("button", { name: /send/i }).click();
  await page.getByText("Thank you, we have your enquiry").waitFor({ timeout: 120_000 });
  webRef = (await page.locator("strong").filter({ hasText: /^ENQ-/ }).first().textContent()) ?? "";
  record("A6", "web form enquiry stored with a reference", /^ENQ-/.test(webRef), webRef);
  await ctx.close();
}
await browser.close();

// 6. Simulated email and WhatsApp: the three brief enquiries, a complaint, an ambiguous one.
const msgs = [
  {
    key: "ENQ-4410",
    via: "email",
    name: "Meera Nair",
    text: "Venue for my sister's wedding in Feb 2027, about 250 guests, 2 nights",
    expect: { category: "wedding", owner: "sales" },
  },
  {
    key: "ENQ-4411",
    via: "whatsapp",
    name: "Rohit Shetty",
    text: "Is a villa free 14-16 Nov for 2 adults and a child?",
    expect: { category: "room", owner: "reservations" },
  },
  {
    key: "ENQ-4412",
    via: "email",
    name: "Kavya Rao",
    text: "Team of 45 wants a January offsite with a conference hall",
    expect: { category: "offsite", owner: "sales" },
  },
  {
    key: "complaint",
    via: "email",
    name: "Upset Guest",
    text: "Our room was dirty and the AC did not work all night. Very disappointed with the stay, I want a refund.",
    expect: { category: "complaint", owner: "gm" },
  },
  {
    key: "ambiguous",
    via: "whatsapp",
    name: "Unknown",
    text: "Hello, can someone call me back about something please?",
    expect: { category: null, owner: null },
  },
] as const;
const ids = new Map<string, string>();
for (const [i, m] of msgs.entries()) {
  const messageId = `acc-${tag}-${i}`;
  const body =
    m.via === "email"
      ? buildPostmarkPayload({
          fromEmail: `${m.key.toLowerCase()}-${tag}@acceptance.example`,
          fromName: m.name,
          subject: "Enquiry",
          body: m.text,
          messageId,
        })
      : buildWhatsAppPayload({
          phone: `+91 98${String(Date.now()).slice(-6)}${i}${i}`,
          name: m.name,
          body: m.text,
          messageId: `wamid.${messageId}`,
        });
  const res = await fetch(`${base}/api/inbound/${m.via}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-inbound-secret": secret },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { enquiryIds?: string[] };
  const id = json.enquiryIds?.[0];
  if (id) ids.set(m.key, id);
  record(
    `A7.${i + 1}`,
    `inbound ${m.via} accepted (${m.key})`,
    res.status === 200 && !!id,
    `${res.status} ${id ?? "no id"}`,
  );
}
const wrong = await fetch(`${base}/api/inbound/email`, {
  method: "POST",
  headers: { "x-inbound-secret": "wrong" },
  body: "{}",
});
record(
  "A7.6",
  "inbound with a wrong secret is refused",
  wrong.status === 401,
  String(wrong.status),
);

// 7. Wait for the AI pipeline (persisted states, after()), then check each outcome.
const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
const all = [...ids.values(), ...(webRef ? [webRef] : [])];
const deadline = Date.now() + 240_000;
type Row = {
  id: string;
  aiStatus: string;
  category: string | null;
  lane: string;
  isComplaint: boolean;
  ownerRole: string | null;
  confidence: string | null;
};
let rows: Row[] = [];
while (Date.now() < deadline) {
  rows =
    (await db.execute(sql`SELECT e.id, e.ai_status AS "aiStatus", e.category, e.lane, e.is_complaint AS "isComplaint", u.role AS "ownerRole", e.confidence::text AS confidence
    FROM enquiries e LEFT JOIN users u ON u.id = e.owner_id WHERE e.id IN (${sql.join(
      all.map((x) => sql`${x}`),
      sql`, `,
    )})`)) as unknown as Row[];
  if (
    rows.length === all.length &&
    rows.every((r) => !["pending", "processing"].includes(r.aiStatus))
  )
    break;
  await new Promise((r) => setTimeout(r, 5000));
}
const byKey = (k: string) => rows.find((r) => r.id === ids.get(k));
const drafts = (await db.execute(
  sql`SELECT enquiry_id AS "enquiryId", quote, sent_at AS "sentAt", approved_by AS "approvedBy" FROM reply_drafts WHERE enquiry_id IN (${sql.join(
    all.map((x) => sql`${x}`),
    sql`, `,
  )})`,
)) as unknown as {
  enquiryId: string;
  quote: unknown;
  sentAt: string | null;
  approvedBy: string | null;
}[];
const notes = (await db.execute(
  sql`SELECT n.enquiry_id AS "enquiryId", n.kind, u.role FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.enquiry_id IN (${sql.join(
    all.map((x) => sql`${x}`),
    sql`, `,
  )})`,
)) as unknown as { enquiryId: string; kind: string; role: string }[];
for (const m of msgs) {
  const r = byKey(m.key);
  if (!r) {
    record(`A8 ${m.key}`, "processed", false, "no row");
    continue;
  }
  const draft = drafts.find((d) => d.enquiryId === r.id);
  const ev = `ai=${r.aiStatus} category=${r.category} confidence=${r.confidence} lane=${r.lane} owner=${r.ownerRole} draft=${draft ? (draft.quote ? "with server quote" : "no quote") : "none"}`;
  if (m.key === "ambiguous")
    record(
      "A8 ambiguous",
      "low confidence goes to unsorted (no owner)",
      r.lane === "unsorted" && !r.ownerRole,
      ev,
    );
  else if (m.key === "complaint") {
    const gm = notes.some((n) => n.enquiryId === r.id && n.kind === "complaint" && n.role === "gm");
    record(
      "A8 complaint",
      "complaint flagged and alerts the GM",
      r.isComplaint && gm,
      `${ev} gmAlert=${gm}`,
    );
  } else
    record(
      `A8 ${m.key}`,
      `brief enquiry: ${m.expect.category} to ${m.expect.owner}`,
      r.category === m.expect.category && r.ownerRole === m.expect.owner && r.lane === "sorted",
      ev,
    );
  if (m.key === "ENQ-4411")
    record("A9", "room enquiry draft carries a server quote", !!draft?.quote, ev);
  record(
    `A10 ${m.key}`,
    "a draft exists and is not sent or approved",
    !!draft && draft.sentAt === null && draft.approvedBy === null,
    draft ? `sentAt=${draft.sentAt} approvedBy=${draft.approvedBy}` : "no draft",
  );
}
const web = rows.find((r) => r.id === webRef);
record(
  "A11",
  "web form enquiry processed",
  !!web && !["pending", "processing"].includes(web.aiStatus),
  web
    ? `ai=${web.aiStatus} category=${web.category} lane=${web.lane} owner=${web.ownerRole}`
    : "no row",
);
await client.end();

writeFileSync(
  "docs/final-check-acceptance.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      base,
      provider: process.env.AI_PROVIDER ?? null,
      model: process.env.AI_MODEL ?? null,
      checks,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\n${checks.filter((c) => c.pass).length}/${checks.length} passed`);
