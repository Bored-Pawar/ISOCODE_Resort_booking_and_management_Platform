import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
/** Vercel serves only https; a local `pnpm start` over plain http (e.g. a phone on the LAN) must not upgrade. */
const onVercel = !!process.env.VERCEL;

/**
 * H2 security headers. Next's App Router streams inline bootstrap scripts, and per-request nonces
 * would make every page dynamic (no partial prerendering), so scripts allow 'self' plus inline;
 * the rest is locked down. next/font is self hosted (font-src 'self'); next/image serves from
 * /_next/image ('self', plus data:/blob: for blur placeholders). Dev adds 'unsafe-eval' for
 * React's dev tooling and ws: for hot reload.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(onVercel ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The stay builder on /rooms replaced the /book cart; old links keep their query (dates, cart).
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [{ source: "/book", destination: "/rooms", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
