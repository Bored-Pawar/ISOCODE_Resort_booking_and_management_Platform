import { formatInr } from "@/lib/money";
import { formatNightDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";

export type PriceNight = {
  date: string;
  ratePaise: number;
  discountPaise: number;
  gstPaise: number;
};

/**
 * Total in the display font, then "incl. ₹x GST" in small muted text.
 * With `nights`, an expandable per-night breakdown (native <details>, no JS).
 */
export function PriceBlock({
  totalPaise,
  gstPaise,
  nights,
  className,
}: {
  totalPaise: number;
  gstPaise: number;
  nights?: PriceNight[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div>
        <span className="font-display text-h1 font-medium tabular-nums">
          {formatInr(totalPaise)}
        </span>{" "}
        <span className="text-small text-muted">incl. {formatInr(gstPaise)} GST</span>
      </div>
      {nights && nights.length > 0 ? (
        <details className="group text-small">
          <summary className="cursor-pointer text-accent underline-offset-2 hover:underline">
            Price per night
          </summary>
          <table className="mt-2 w-full tabular-nums">
            <tbody>
              {nights.map((n) => (
                <tr key={n.date} className="border-t border-border">
                  <td className="py-1 text-muted">{formatNightDate(n.date)}</td>
                  <td className="py-1 text-right">
                    {formatInr(n.ratePaise - n.discountPaise)}
                    <span className="text-muted"> + {formatInr(n.gstPaise)} GST</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}

export function PriceBlockSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-4 w-28" />
    </div>
  );
}
