/**
 * Inbox SQL: visibility and lane predicates in the database, never in the UI (runbook hard rule 1).
 * Mirrors `rules.ts`; the PostgreSQL tests hold them together.
 */
import { sql, type SQL } from "drizzle-orm";
import { can, enquiryVisibility } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/types";
import { enquiries as e } from "@/db/schema";
import type { Lane } from "./rules";

const complaint = sql`(${e.isComplaint} OR COALESCE(${e.category}, '') = 'complaint')`;

/** Rows the role may work (its own lanes; complaints GM only). Same decision as `canSeeEnquiry`. */
export function workSql(role: Role | null | undefined): SQL {
  const v = enquiryVisibility(role);
  const parts: SQL[] = [];
  if (v.complaints) parts.push(complaint);
  if (v.lanes.includes("unsorted"))
    parts.push(sql`(NOT ${complaint} AND (${e.lane} = 'unsorted' OR ${e.category} IS NULL))`);
  const cats = v.categories.filter((c) => c !== "complaint");
  if (v.lanes.includes("sorted") && cats.length)
    parts.push(
      sql`(NOT ${complaint} AND ${e.lane} = 'sorted' AND ${e.category} IN (${sql.join(
        cats.map((c) => sql`${c}`),
        sql`, `,
      )}))`,
    );
  return parts.length ? sql`(${sql.join(parts, sql` OR `)})` : sql`false`;
}

const requested = sql`EXISTS (SELECT 1 FROM enquiry_events r WHERE r.enquiry_id = ${e.id}
  AND r.action = 'rerouted' AND r.to_value = 'attention')`;

/** Latest attention request has no resolve at or after it (a later request reopens). */
export const attentionOpenSql = sql`EXISTS (SELECT 1 FROM enquiry_events r WHERE r.enquiry_id = ${e.id}
  AND r.action = 'rerouted' AND r.to_value = 'attention'
  AND NOT EXISTS (SELECT 1 FROM enquiry_events s WHERE s.enquiry_id = ${e.id}
    AND s.action = 'rerouted' AND s.from_value = 'attention'
    AND (s.to_value = 'seen' OR s.to_value LIKE 'seen: %') AND s.at >= r.at))`;

/** Rows the role may open: `workSql`, plus attention requests for `attention.resolve` holders. */
export function viewSql(role: Role | null | undefined): SQL {
  if (!can(role, "attention.resolve")) return workSql(role);
  return sql`(${workSql(role)} OR (NOT ${complaint} AND ${requested}))`;
}

export function laneSql(lane: Lane, userId: string): SQL {
  switch (lane) {
    case "mine":
      return sql`${e.ownerId} = ${userId}::uuid`;
    case "room":
    case "wedding":
    case "offsite":
    case "other":
      return sql`(${e.lane} = 'sorted' AND ${e.category} = ${lane} AND NOT ${complaint})`;
    case "complaints":
      return complaint;
    case "unsorted":
      return sql`${e.lane} = 'unsorted'`;
    case "attention":
      return attentionOpenSql;
    case "failed":
      // A staff re-route during processing ends AI with STAFF_CHANGED: staff already sorted it,
      // so it is not "Failed AI" work (review minor 5).
      return sql`(${e.aiStatus} = 'failed' AND ${e.aiLastError} IS DISTINCT FROM 'STAFF_CHANGED')`;
  }
}

export { complaint as complaintSql };
