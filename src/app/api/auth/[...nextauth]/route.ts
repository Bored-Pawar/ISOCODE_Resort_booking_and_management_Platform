import { handlers } from "@/lib/auth/config";

export const { GET } = handlers;

/**
 * Sign in and out happen only through the server actions in `lib/auth/actions.ts`, which call
 * Auth.js in process and are rate limited. The HTTP credentials endpoints would run `authorize`
 * with no limit, so POSTs to them are refused (H2). Other POSTs (e.g. a session update) pass.
 */
const REFUSED = /^\/api\/auth\/(callback|signin)(\/|$)/;

export async function POST(request: Request) {
  if (REFUSED.test(new URL(request.url).pathname))
    return new Response("Not found", { status: 404 });
  return handlers.POST(request as Parameters<typeof handlers.POST>[0]);
}
