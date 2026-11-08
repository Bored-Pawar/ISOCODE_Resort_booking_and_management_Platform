import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { Card, PriceBlock } from "@/components/ui";
import { formatStay } from "@/lib/dates";
import { formatInr } from "@/lib/money";
import type { RoomType } from "@/modules/catalog";
import type { QuoteNight } from "@/modules/pricing";
import { guestsLabel } from "../_lib/format";
import { nightsByDate } from "../_lib/room-detail";

/** One priced room line: a quote line or a booking's frozen line. */
export type SummaryLine = {
  roomTypeId: string;
  ratePlanId: string;
  adults: number;
  children: number;
  totalPaise: number;
  nights: QuoteNight[];
};

export type SummaryProps = {
  types: RoomType[];
  checkIn: string;
  checkOut: string;
  lines: SummaryLine[];
  totalPaise: number;
  gstPaise: number;
  discountPaise: number;
  promoCode?: string | null;
  /** Extra content at the top of the card (the pay step puts its HoldTimer here). */
  top?: React.ReactNode;
};

function SummaryBody({
  types,
  checkIn,
  checkOut,
  lines,
  totalPaise,
  gstPaise,
  discountPaise,
  promoCode,
  top,
}: SummaryProps) {
  const byId = new Map(types.map((t) => [t.id, t]));
  const photo = byId.get(lines[0]?.roomTypeId ?? "")?.photos[0];
  return (
    <div className="flex flex-col gap-4">
      {top}
      <div className="flex items-center gap-3">
        {photo ? (
          <Image
            src={photo.url}
            alt=""
            width={photo.width}
            height={photo.height}
            sizes="80px"
            className="aspect-[4/3] w-20 shrink-0 rounded-control object-cover"
          />
        ) : null}
        <p className="text-body">{formatStay(checkIn, checkOut)}</p>
      </div>
      <ul className="flex flex-col gap-2 border-t border-border pt-4 text-small">
        {lines.map((line, i) => {
          const type = byId.get(line.roomTypeId);
          const plan = type?.ratePlans.find((p) => p.id === line.ratePlanId);
          return (
            <li key={i} className="flex items-baseline justify-between gap-3">
              <span>
                <span className="font-semibold">{type?.name ?? `Room ${i + 1}`}</span>
                <span className="text-muted">
                  {" "}
                  {guestsLabel(line.adults, line.children)}
                  {plan ? `, ${plan.name.toLowerCase()}` : ""}
                </span>
              </span>
              <span className="tabular-nums">{formatInr(line.totalPaise)}</span>
            </li>
          );
        })}
      </ul>
      {discountPaise > 0 ? (
        <p className="flex justify-between text-small text-muted tabular-nums">
          <span>Includes promo {promoCode ?? ""}</span>
          <span>you save {formatInr(discountPaise)}</span>
        </p>
      ) : null}
      <div className="border-t border-border pt-4">
        <PriceBlock totalPaise={totalPaise} gstPaise={gstPaise} nights={nightsByDate({ lines })} />
      </div>
    </div>
  );
}

/**
 * Booking step summary (05 screen 4): photo thumb, dates, one row per room line, PriceBlock.
 * Desktop: a sticky card on the right. Mobile: collapsed at the top of the page.
 */
export function StaySummary(props: SummaryProps & { placement: "mobile" | "desktop" }) {
  const { placement, ...rest } = props;
  if (placement === "mobile")
    return (
      <details className="group rounded-card border border-border bg-surface lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
          <span className="text-small font-semibold">Your stay</span>
          <span className="flex items-center gap-2 font-display text-h2 font-medium tabular-nums">
            {formatInr(rest.totalPaise)}
            <ChevronDown
              className="size-[18px] transition-transform duration-150 group-open:rotate-180"
              strokeWidth={1.5}
              aria-hidden
            />
          </span>
        </summary>
        <div className="border-t border-border p-4">
          <SummaryBody {...rest} />
        </div>
      </details>
    );
  return (
    <aside className="hidden lg:sticky lg:top-6 lg:block lg:self-start" aria-label="Stay summary">
      <Card>
        <SummaryBody {...rest} />
      </Card>
    </aside>
  );
}
