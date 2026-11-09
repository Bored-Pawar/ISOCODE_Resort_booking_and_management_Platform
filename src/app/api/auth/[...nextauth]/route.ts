import { handlers } from "@/lib/auth/config";

export const { GET } = handlers;

/**
 * Sign in and out happen only through the server actions in `lib/auth/actions.ts`, which call
 * Auth.js in process and are rate limited. The HTTP credentials endpoints would run `authorize`
 * with no limit, so POSTs to them are refused (H2). Other POSTs (e.g. a session update) pass.
 */
export async function POST(request: Request) {
  // Same split as Auth.js (empty segments dropped), so `//callback` cannot slip past.
  const action = new URL(request.url).pathname
    .slice("/api/auth".length)
    .split("/")
    .filter(Boolean)[0];
  if (action === "callback" || action === "signin")
    return new Response("Not found", { status: 404 });
  return handlers.POST(request as Parameters<typeof handlers.POST>[0]);
}
