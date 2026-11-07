import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { booking } from "@/modules/booking";

const inputSchema = z.object({
  authorization: z.string().regex(/^Bearer \S+$/),
  query: z.object({}).strict(),
});

/** Machine endpoint: the explicitly assigned CRON_SECRET authentication replaces a user session. */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_NOT_CONFIGURED" }, { status: 503 });
  const input = inputSchema.safeParse({
    authorization: request.headers.get("authorization"),
    query: Object.fromEntries(new URL(request.url).searchParams),
  });
  if (!input.success) return Response.json({ error: "INVALID_REQUEST" }, { status: 401 });
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(input.data.authorization), digest(`Bearer ${secret}`))) {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  return Response.json(await booking.releaseExpiredHolds());
}
