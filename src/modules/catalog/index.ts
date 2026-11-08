/**
 * Read-only catalog: room types, their photos and their active rate plans, read from the database.
 * Public signatures are unchanged from C1 (fixtures remain in ./fixtures for UI work and tests).
 *
 * Callers on a prerendered path should `await connection()` first so `next build` never needs a
 * database; the read itself is cached because room content changes rarely.
 */
import { asc, eq } from "drizzle-orm";
import { cacheLife } from "next/cache";
import { ratePlans, roomPhotos, roomTypes } from "@/db/schema";
import { getDb } from "@/lib/db";

export type RoomPhoto = { url: string; alt: string; width: number; height: number };

export type RoomType = {
  id: string;
  slug: string;
  name: string;
  description: string;
  totalUnits: number;
  maxAdults: number;
  /** Stored, not enforced (B10 rule 1). */
  maxChildren: number;
  /** B10: a line fits when 1 <= adults <= maxAdults and adults + children <= maxOccupancy. */
  maxOccupancy: number;
  amenities: string[];
  photos: RoomPhoto[];
  ratePlans: {
    id: string;
    code: "EP" | "CP" | "MAP";
    name: string;
    inclusions: string;
    refundable: boolean;
  }[];
};

const PLAN_ORDER: Record<string, number> = { EP: 0, CP: 1, MAP: 2 };

async function loadRoomTypes(): Promise<RoomType[]> {
  "use cache";
  cacheLife("hours");

  const db = getDb();
  const [types, photos, plans] = await Promise.all([
    db.select().from(roomTypes).orderBy(asc(roomTypes.sort), asc(roomTypes.name)),
    db.select().from(roomPhotos).orderBy(asc(roomPhotos.sort)),
    db.select().from(ratePlans).where(eq(ratePlans.active, true)),
  ]);

  return types.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    totalUnits: t.totalUnits,
    maxAdults: t.maxAdults,
    maxChildren: t.maxChildren,
    maxOccupancy: t.maxOccupancy,
    amenities: t.amenities,
    photos: photos
      .filter((p) => p.roomTypeId === t.id)
      .map((p) => ({ url: p.url, alt: p.alt, width: p.width, height: p.height })),
    ratePlans: plans
      .filter((p) => p.roomTypeId === t.id)
      .sort((a, b) => (PLAN_ORDER[a.code] ?? 9) - (PLAN_ORDER[b.code] ?? 9))
      .map((p) => ({
        id: p.id,
        code: p.code as "EP" | "CP" | "MAP",
        name: p.name,
        inclusions: p.inclusions,
        refundable: p.refundable,
      })),
  }));
}

export const catalog = {
  async listRoomTypes(): Promise<RoomType[]> {
    return loadRoomTypes();
  },
  async getRoomTypeBySlug(slug: string): Promise<RoomType | null> {
    return (await loadRoomTypes()).find((r) => r.slug === slug) ?? null;
  },
};
