import Image from "next/image";
import type { RoomPhoto } from "@/modules/catalog";
import { cn } from "@/lib/utils";

/**
 * Room photos without JavaScript: one large and two small on desktop, a swipeable strip on
 * mobile (scroll snap). The first photo loads eagerly because it is the page's largest image.
 */
export function Gallery({ photos, name }: { photos: RoomPhoto[]; name: string }) {
  if (photos.length === 0) {
    return <div className="aspect-[3/2] rounded-card bg-surface-2 md:aspect-[16/6]" aria-hidden />;
  }
  const shown = photos.slice(0, 3);
  return (
    <div
      role="group"
      aria-label={`${name} photos`}
      className={cn(
        "-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 md:mx-0 md:grid md:h-[440px] md:grid-cols-[2fr_1fr] md:grid-rows-2 md:overflow-visible md:px-0",
        shown.length === 1 && "md:grid-cols-1 md:grid-rows-1",
      )}
    >
      {shown.map((photo, i) => (
        <div
          key={photo.url}
          className={cn(
            "relative aspect-[3/2] w-[88%] shrink-0 snap-center overflow-hidden rounded-card bg-surface-2 md:aspect-auto md:w-auto",
            i === 0 && shown.length > 1 && "md:row-span-2",
          )}
        >
          <Image
            src={photo.url}
            alt={photo.alt}
            fill
            priority={i === 0}
            fetchPriority={i === 0 ? "high" : undefined}
            loading={i === 0 ? undefined : "lazy"}
            sizes={
              i === 0
                ? "(min-width: 1120px) 720px, (min-width: 768px) 60vw, 88vw"
                : "(min-width: 1120px) 360px, (min-width: 768px) 30vw, 88vw"
            }
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}
