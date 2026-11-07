import { Suspense } from "react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { enquiries } from "@/modules/enquiries";
import { DevGate } from "../_components/dev-gate";
import { Simulator } from "./simulator";

export const metadata = { title: "Inbound simulator" };

async function Recent() {
  const rows = await enquiries.list({ limit: 10 });
  if (rows.length === 0) return <EmptyState message="No enquiries yet." />;
  return (
    <ul className="divide-y divide-border">
      {rows.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{e.id}</span>
            <Badge>{e.channel}</Badge>
            <Badge tone={e.aiStatus === "pending" ? "warning" : "success"}>{e.aiStatus}</Badge>
            <span className="text-small text-muted">{e.senderName}</span>
            <time className="ml-auto text-xs text-muted" dateTime={e.receivedAt}>
              {new Date(e.receivedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
            </time>
          </div>
          <p className="line-clamp-2 text-small text-muted">{e.rawText}</p>
        </li>
      ))}
    </ul>
  );
}

export default function TestPage() {
  return (
    <DevGate>
      <main className="mx-auto max-w-page px-4 py-10 md:px-8">
        <h1 className="text-h1 font-medium">Inbound simulator</h1>
        <p className="mt-1 max-w-read text-body text-muted">
          Sends a provider-shaped payload to the real <code>/api/inbound/*</code> endpoint with the
          secret added on the server. Rows stay <code>pending</code> until the AI router (R1/R2)
          exists.
        </p>
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <Card>
            <Simulator />
          </Card>
          <Card>
            <h2 className="mb-2 text-h2 font-medium">Last 10 enquiries</h2>
            <Suspense fallback={<p className="text-small text-muted">Loading...</p>}>
              <Recent />
            </Suspense>
          </Card>
        </div>
      </main>
    </DevGate>
  );
}
