/**
 * The whole /dev area (UI kit, inbound simulator, dev login) exists only when
 * DEV_TOOLS_ENABLED=true. Anything else, including unset, means 404.
 */
export function isDevToolsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEV_TOOLS_ENABLED === "true";
}
