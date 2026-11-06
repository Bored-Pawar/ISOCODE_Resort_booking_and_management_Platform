/** Only same-site relative paths, to avoid open redirects after login. */
export function safeNext(next: unknown, fallback: string): string {
  return typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("\\")
    ? next
    : fallback;
}
