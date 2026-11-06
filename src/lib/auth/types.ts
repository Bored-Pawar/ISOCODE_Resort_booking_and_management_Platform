import type { DefaultSession } from "next-auth";

export const ROLES = ["guest", "reservations", "sales", "gm"] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES = ["reservations", "sales", "gm"] as const satisfies readonly Role[];

export type SessionUser = { id: string; email: string; name: string; role: Role };

/** Thrown by the guards. Route handlers turn it into 401/403 with `accessErrorResponse`. */
export class AccessError extends Error {
  constructor(public readonly code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code);
    this.name = "AccessError";
  }
}

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
  interface User {
    role?: Role;
  }
}
