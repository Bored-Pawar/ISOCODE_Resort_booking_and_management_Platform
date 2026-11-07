/**
 * Read-only catalog for UI fixtures (added in C1 so screens can build before F3).
 * Stub returns fixtures until the real implementation reads room_types and room_photos.
 */
import { roomTypesFixture } from "./fixtures";

export type RoomPhoto = { url: string; alt: string; width: number; height: number };

export type RoomType = {
  id: string;
  slug: string;
  name: string;
  description: string;
  totalUnits: number;
  maxAdults: number;
  maxChildren: number;
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

export const catalog = {
  async listRoomTypes(): Promise<RoomType[]> {
    return roomTypesFixture;
  },
  async getRoomTypeBySlug(slug: string): Promise<RoomType | null> {
    return roomTypesFixture.find((r) => r.slug === slug) ?? null;
  },
};
