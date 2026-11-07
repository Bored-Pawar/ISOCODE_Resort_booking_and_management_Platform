import Image from "next/image";
import Link from "next/link";
import { CircleSlash, Users } from "lucide-react";
import { Badge, ButtonLink, PriceBlock } from "@/components/ui";
import { cn } from "@/lib/utils";
import { enquiryHrefFromQuery } from "../_lib/enquiry";
import { occupancyLabel, plural } from "../_lib/format";
import type { RoomListItem } from "../_lib/rooms";

/** One room type in the rooms list. Photo left (top on mobile), details and state on the right. */
export function RoomCard({
  item,
  nights,
  query,
  priority = false,
}: {
  item: RoomListItem;
  nights: number;
  /** Search params carried to the room page so dates and guests stay put. */
  query: string;
  priority?: boolean;
}) {
  const { room } = item;
  const photo = room.photos[0];
  const href = `/rooms/${room.slug}?${query}`;
  const muted = item.kind !== "available";

  return (
    <article
      className={cn(
        "grid overflow-hidden rounded-card border border-border sm:grid-cols-[2fr_3fr]",
        muted ? "bg-surface-2" : "bg-surface",
      )}
    >
      <Link href={href} tabIndex={-1} aria-hidden className="block bg-surface-2">
        {photo ? (
          <Image
            src={photo.url}
            alt=""
            width={photo.width}
            height={photo.height}
            sizes="(min-width: 1120px) 448px, (min-width: 640px) 40vw, 92vw"
            priority={priority}
            loading={priority ? undefined : "lazy"}
            className={cn("aspect-[4/3] size-full object-cover", muted && "opacity-60 grayscale")}
          />
        ) : (
          <div className="aspect-[4/3]" />
        )}
      </Link>

      <div className="flex flex-col gap-3 p-5">
        <div>
          <h2 className={cn("font-display text-h1 font-medium", muted && "text-muted")}>
            <Link href={href} className="hover:underline">
              {room.name}
            </Link>
          </h2>
          <p className="mt-1 text-small text-muted">{room.description}</p>
        </div>
        <p className="flex items-center gap-2 text-small text-muted">
          <Users className="size-[18px]" strokeWidth={1.5} aria-hidden />
          {occupancyLabel(room.maxAdults, room.maxChildren)}
        </p>

        <div className="mt-auto flex flex-col gap-3 pt-2">
          {item.kind === "available" ? (
            <>
              <div>
                <PriceBlock
                  totalPaise={item.cheapest.quote.totalPaise}
                  gstPaise={item.cheapest.quote.gstPaise}
                />
                <p className="text-small text-muted">
                  {plural(nights, "night")} · {item.plansPriced > 1 ? "from " : ""}
                  {item.cheapest.planName}
                </p>
              </div>
              <ButtonLink href={href} className="self-start">
                View room
              </ButtonLink>
            </>
          ) : null}

          {item.kind === "sold-out" || item.kind === "no-rates" ? (
            <>
              <Badge tone="danger" icon={<CircleSlash strokeWidth={1.5} />} className="self-start">
                Not available for these dates
              </Badge>
              <ButtonLink href={href} variant="secondary" className="self-start">
                View room
              </ButtonLink>
            </>
          ) : null}

          {item.kind === "over-occupancy" ? (
            <>
              <p className="text-small text-muted">
                Too many guests for this room. Booking for a group?
              </p>
              <ButtonLink
                href={enquiryHrefFromQuery(query, room.slug)}
                variant="secondary"
                className="self-start"
              >
                Send a group enquiry
              </ButtonLink>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
