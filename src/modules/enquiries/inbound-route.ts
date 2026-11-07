import type { z } from "zod";
import { enquiries } from "./index";
import {
  INBOUND_SECRET_HEADER,
  MAX_INBOUND_BYTES,
  isValidInboundSecret,
  mapPostmarkEmail,
  mapWhatsApp,
  postmarkInboundSchema,
  whatsappInboundSchema,
  type InboundItem,
} from "./inbound";

type Provider = "email" | "whatsapp";

const json = (status: number, body: object) => Response.json(body, { status });

/** Field paths only, never values. */
function issuePaths(error: z.ZodError): string[] {
  return error.issues.slice(0, 10).map((i) => i.path.join(".") || "(root)");
}

/**
 * Shared body of /api/inbound/{email,whatsapp}. Webhooks are authenticated by the shared secret
 * header, not a session, so there is no requireRole() here. Content is never logged.
 */
export async function handleInbound(request: Request, provider: Provider): Promise<Response> {
  const secret = request.headers.get(INBOUND_SECRET_HEADER);
  if (!isValidInboundSecret(secret, process.env.INBOUND_WEBHOOK_SECRET)) {
    return json(401, { error: "UNAUTHORIZED" });
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_INBOUND_BYTES) return json(413, { error: "TOO_LARGE" });
  const text = await request.text();
  if (text.length > MAX_INBOUND_BYTES) return json(413, { error: "TOO_LARGE" });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  let items: InboundItem[];
  let skipped = 0;
  if (provider === "email") {
    const parsed = postmarkInboundSchema.safeParse(body);
    if (!parsed.success) {
      return json(400, { error: "INVALID_PAYLOAD", fields: issuePaths(parsed.error) });
    }
    items = [mapPostmarkEmail(parsed.data)];
  } else {
    const parsed = whatsappInboundSchema.safeParse(body);
    if (!parsed.success) {
      return json(400, { error: "INVALID_PAYLOAD", fields: issuePaths(parsed.error) });
    }
    ({ items, skipped } = mapWhatsApp(parsed.data));
  }

  const enquiryIds: string[] = [];
  let duplicates = 0;
  try {
    for (const item of items) {
      const r = await enquiries.ingestFrom(item.input, { source: item.source });
      if (!r.ok) {
        skipped++; // mapped but unusable (for example an empty email); a retry cannot fix it
        continue;
      }
      enquiryIds.push(r.enquiryId);
      if (r.duplicate) duplicates++;
    }
  } catch (err) {
    // Error name only: messages can echo query parameters, which hold contact details.
    console.error("inbound ingest failed", provider, err instanceof Error ? err.name : "unknown");
    return json(500, { error: "INGEST_FAILED" }); // safe to retry: ingest is idempotent
  }
  return json(200, { received: true, enquiryIds, duplicates, skipped });
}
