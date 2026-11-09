import { Suspense } from "react";
import Image, { type StaticImageData } from "next/image";
import { Card, ButtonLink } from "@/components/ui";
import { site } from "@/lib/site";
import { RoomHighlights, RoomHighlightsSkeleton } from "../_components/room-highlights";
import { enquiryHref } from "../_lib/enquiry";
import { SearchSection, SearchSkeleton } from "../_components/search-section";
import heroImg from "../../../../public/images/hero-estate.jpg";
import estateImg from "../../../../public/images/story-estate.jpg";
import roomsImg from "../../../../public/images/story-rooms.jpg";
import eventsImg from "../../../../public/images/story-events.jpg";

const stories: {
  id: string;
  title: string;
  body: string;
  image: StaticImageData;
  alt: string;
}[] = [
  {
    id: "estate",
    title: "A working coffee estate",
    body: "Coffee has grown on these hills for generations. Walk the rows at first light, watch the cherries ripen, and taste the harvest at breakfast.",
    image: estateImg,
    alt: "Red coffee cherries on a branch",
  },
  {
    id: "stay",
    title: "Rooms that face the plantation",
    body: "Rooms, suites and villas with wooden floors and white linen. Every one looks out on green, and the quiet does the rest.",
    image: roomsImg,
    alt: "Wooden verandah with two chairs facing the plantation",
  },
  {
    id: "events",
    title: "Weddings and offsites",
    body: "A lawn under string lights for the evening, a bright hall for the day, and the whole estate to ourselves.",
    image: eventsImg,
    alt: "Lawn set for an evening event with warm string lights",
  },
];

export default function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main>
      {/* Hero: the one image that loads eagerly. */}
      <section className="relative isolate flex min-h-[560px] items-end md:min-h-[640px]">
        <Image
          src={heroImg}
          alt="Mist over coffee plantation hills at sunrise"
          fill
          priority
          fetchPriority="high"
          quality={60}
          sizes="100vw"
          placeholder="blur"
          className="-z-20 object-cover object-[62%_50%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-black/65 via-black/20 to-transparent"
        />
        <div className="mx-auto w-full max-w-page px-4 pb-24 md:px-8 md:pb-28">
          <h1 className="max-w-[18ch] font-display text-display-sm text-white md:text-display">
            Slow mornings in coffee country
          </h1>
          <p className="mt-3 max-w-read text-body text-white/90">{site.tagline}</p>
        </div>
      </section>

      {/* Search card overlaps the bottom of the hero. */}
      <section aria-label="Search availability" className="relative z-10 -mt-12 md:-mt-14">
        <div className="mx-auto max-w-page px-4 md:px-8">
          <Card padded={false} className="p-5 md:p-6">
            <Suspense fallback={<SearchSkeleton />}>
              <SearchSection searchParams={searchParams} />
            </Suspense>
          </Card>
        </div>
      </section>

      {/* Story blocks: photo and text, sides alternate on desktop. */}
      <div className="mx-auto mt-16 flex max-w-page flex-col gap-16 px-4 md:mt-24 md:gap-24 md:px-8">
        {stories.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            className="grid items-center gap-6 md:grid-cols-2 md:gap-12"
          >
            <Image
              src={s.image}
              alt={s.alt}
              sizes="(min-width: 1120px) 540px, (min-width: 768px) 45vw, 92vw"
              placeholder="blur"
              className={`aspect-[3/2] w-full rounded-card object-cover ${i % 2 === 1 ? "md:order-2" : ""}`}
            />
            <div>
              <h2 className="font-display text-h1 font-medium">{s.title}</h2>
              <p className="mt-3 max-w-read text-body text-muted">{s.body}</p>
            </div>
          </section>
        ))}
      </div>

      {/* Room highlights. */}
      <section id="rooms" className="mx-auto mt-16 max-w-page px-4 md:mt-24 md:px-8">
        <h2 className="font-display text-h1 font-medium">Our rooms</h2>
        <p className="mt-2 max-w-read text-body text-muted">
          Choose your dates above to see what is free and what it costs.
        </p>
        <div className="mt-8">
          <Suspense fallback={<RoomHighlightsSkeleton />}>
            <RoomHighlights />
          </Suspense>
        </div>
      </section>

      {/* Quiet enquiry band. */}
      <section id="enquire" className="mt-16 bg-surface-2 md:mt-24">
        <div className="mx-auto flex max-w-page flex-col items-start gap-4 px-4 py-12 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <h2 className="font-display text-h2 font-medium">Planning a wedding or offsite?</h2>
            <p className="mt-1 max-w-read text-body text-muted">
              Tell us the dates and the size of your group. We reply within a day.
            </p>
          </div>
          <ButtonLink href={enquiryHref()} variant="secondary">
            Send an enquiry
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}
