import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirect only. Real authorization happens in layouts, server actions and route handlers
 * (requireRole / requireGuestOwner). This just sends signed-out visitors to the right login.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");
  if (signedIn) return NextResponse.next();

  const staff = pathname.startsWith("/admin") && pathname !== "/admin/login";
  const guest = pathname.startsWith("/account");
  if (staff || guest) {
    const login = new URL(staff ? "/admin/login" : "/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/account/:path*"] };
