import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyCredentials } from "./credentials";
import { STAFF_ROLES, type Role } from "./types";

const fields = { email: {}, password: {} };

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "guest",
      credentials: fields,
      authorize: (c) => verifyCredentials(c, ["guest"]),
    }),
    Credentials({
      id: "staff",
      credentials: fields,
      authorize: (c) => verifyCredentials(c, STAFF_ROLES),
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.role = token.role as Role;
      return session;
    },
  },
});
