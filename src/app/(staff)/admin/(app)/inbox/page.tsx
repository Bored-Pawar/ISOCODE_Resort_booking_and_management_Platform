import { Suspense } from "react";
import { listReviewQueue } from "@/modules/enquiries";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Forbidden } from "../_components/forbidden";
import { staffPage } from "../_lib/access";
import { RetryForm } from "./retry-form";
export const metadata = { title: "Unsorted enquiries" };
async function Queue() {
  // GM only: reservations and sales get the 403 screen (the nav does not link them here).
  const access = await staffPage("enquiries.unsorted");
  if ("forbidden" in access) return <Forbidden />;
  return (
    <>
      <h1 className="text-h1">Unsorted enquiries</h1>
      <p className="mt-2 mb-6 text-muted">
        Review enquiries that need attention. Failed processing can be retried by staff.
      </p>
      <QueueBody />
    </>
  );
}
async function QueueBody() {
  let rows: Awaited<ReturnType<typeof listReviewQueue>>;
  try {
    rows = await listReviewQueue();
  } catch {
    return (
      <Card>
        <p>Enquiries could not be loaded. Refresh to try again.</p>
      </Card>
    );
  }
  if (!rows.length)
    return (
      <Card>
        <EmptyState message="No unsorted enquiries need review." />
      </Card>
    );
  return <Rows rows={rows} />;
}
function Rows({ rows }: { rows: Awaited<ReturnType<typeof listReviewQueue>> }) {
  return (
    <div className="grid gap-4">
      {rows.map((row) => (
        <Card key={row.id}>
          <p className="font-semibold">
            {row.senderName} · {row.id}
          </p>
          <p className="mt-2">{row.summary}</p>
          <p className="mt-2 text-small text-muted">
            {row.aiStatus === "failed" ? "Needs staff review" : row.aiStatus} · {row.aiAttempts}{" "}
            attempts
          </p>
          {row.grounding && (
            <p className="mt-2 text-small text-muted">
              Verified details:{" "}
              {Object.entries(row.grounding)
                .map(([key, value]) => `${key}: ${value}`)
                .join(" · ")}
            </p>
          )}
          {row.canRetry && (
            <RetryForm id={row.id} updatedAt={row.updatedAt} attempts={row.aiAttempts} />
          )}
        </Card>
      ))}
    </div>
  );
}
export default function InboxRecovery() {
  return (
    <Suspense fallback={<Skeleton className="h-32 w-full" />}>
      <Queue />
    </Suspense>
  );
}
