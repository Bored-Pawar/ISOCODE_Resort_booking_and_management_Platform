import { lanesFor, type Lane } from "@/modules/enquiries/staff/rules";
import type { Role } from "@/lib/auth";

export type SearchParams = Record<string, string | string[] | undefined>;
export type InboxQuery = {
  lane: Lane;
  status?: string;
  channel?: string;
  q?: string;
  cursor?: string;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** URL to list input. The service validates it again (Zod) and checks the lane for the role. */
export function parseQuery(sp: SearchParams, role: Role): InboxQuery {
  const lanes = lanesFor(role);
  const lane = one(sp.lane) as Lane | undefined;
  return {
    lane: lane && lanes.includes(lane) ? lane : (lanes[0] ?? "mine"),
    status: one(sp.status),
    channel: one(sp.channel),
    q: one(sp.q)?.slice(0, 100),
    cursor: one(sp.cursor),
  };
}

/** Query string for the list, without the cursor unless asked. */
export function queryString(q: Partial<InboxQuery>, keepCursor = false): string {
  const p = new URLSearchParams();
  if (q.lane) p.set("lane", q.lane);
  if (q.status) p.set("status", q.status);
  if (q.channel) p.set("channel", q.channel);
  if (q.q) p.set("q", q.q);
  if (keepCursor && q.cursor) p.set("cursor", q.cursor);
  const s = p.toString();
  return s ? `?${s}` : "";
}
