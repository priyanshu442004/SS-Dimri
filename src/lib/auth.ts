import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";

const signInLimit = Number(process.env.AUTH_SIGNIN_LIMIT_PER_MINUTE) || 5;

// Authentication is kept separate from business data: Better Auth owns the
// users / sessions / accounts / verifications tables and hashes passwords.
// Organization access and roles live in organization_memberships.
export const auth = betterAuth({
  secret: serverEnv().BETTER_AUTH_SECRET,
  baseURL: serverEnv().BETTER_AUTH_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // Staff accounts are created by the admin; public sign-up is only the
    // owner's "Create account" flow, which is handled by a server action.
    disableSignUp: false,
  },
  session: {
    expiresIn: 60 * 60 * 12, // 12 hours
    updateAge: 60 * 60, // refresh hourly while active
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    // Per-IP sign-in attempts per minute. Default 5; only raise it for automated tests.
    customRules: {
      "/sign-in/email": { window: 60, max: signInLimit },
      "/sign-in/username": { window: 60, max: signInLimit },
      "/sign-up/email": { window: 60, max: 3 },
    },
  },
  advanced: {
    database: {
      // Primary keys are PostgreSQL uuid columns.
      generateId: "uuid",
    },
  },
  // Staff log in with the ID the admin created for them ("Create ID & Pass").
  plugins: [username({ minUsernameLength: 3, maxUsernameLength: 40 }), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;

/** Hash a password exactly as Better Auth does (used when an admin issues credentials). */
export async function hashPassword(password: string) {
  const ctx = await auth.$context;
  return ctx.password.hash(password);
}
