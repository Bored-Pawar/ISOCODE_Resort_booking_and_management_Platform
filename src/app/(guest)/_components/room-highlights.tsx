import Image from "next/image";
import Link from "next/link";
import { Users } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { connection } from "next/server";
import { catalog } from "@/modules/catalog";
import { occupancyLabel } from "../_lib/format";

/** Server component: reads the catalog and renders one card per room type. Photos load lazily. */
export async function RoomHighlights() {
  // Request time: the catalog comes from the database, which `next build` must not need.
  await connection();
  const rooms = await catalog.listRoomTypes();
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {rooms.map((room) => {
        const photo = room.photos[0];
        return (
          <li key={room.id}>
            <Link href={`/rooms/${room.slug}`} className="group block">
              <div className="overflow-hidden rounded-card border border-border bg-surface-2">
                {photo ? (
                  <Image
                    src={photo.url}
                    alt={photo.alt}
                    width={photo.width}
                    height={photo.height}
                    sizes="(min-width: 1120px) 262px, (min-width: 640px) 45vw, 92vw"
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover transition-transform duration-150 ease-out group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="aspect-[4/3]" />
                )}
              </div>
              <h3 className="mt-3 font-display text-h2 font-medium">{room.name}</h3>
              <p className="mt-1 text-small text-muted">{room.description}</p>
              <p className="mt-2 flex items-center gap-2 text-small text-muted">
                <Users className="size-[18px]" strokeWidth={1.5} aria-hidden />
                {occupancyLabel(room.maxAdults, room.maxChildren)}
              </p>
              <span className="mt-3 inline-flex h-11 items-center text-small font-semibold text-accent group-hover:underline">
                View room
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function RoomHighlightsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading rooms"
      className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="aspect-[4/3] rounded-card" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
