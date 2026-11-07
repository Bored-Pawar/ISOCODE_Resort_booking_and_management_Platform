import { NextResponse, type NextRequest } from "next/server";
import { isDevToolsEnabled } from "@/lib/dev-tools";

/**
 * Redirect only. Real authorization happens in layouts, pages, server actions and route handlers
 * (requireRole / requireGuestOwner). This sends signed-out visitors to the right login and
 * answers 404 for /dev while DEV_TOOLS_ENABLED is off (pages check too, so this is not the only gate).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const inDev = pathname === "/dev" || pathname.startsWith("/dev/");

  if (inDev && !isDevToolsEnabled()) {
    return NextResponse.rewrite(new URL("/_dev-disabled", request.url), { status: 404 });
  }

  const signedIn =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");
  if (signedIn) return NextResponse.next();

  const dev = inDev && pathname !== "/dev/login";
  const staff = pathname.startsWith("/admin") && pathname !== "/admin/login";
  const guest = pathname.startsWith("/account");
  if (dev || staff || guest) {
    const login = new URL(dev ? "/dev/login" : staff ? "/admin/login" : "/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/account/:path*", "/dev", "/dev/:path*"] };
