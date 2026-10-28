"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { parseForm, safeAction, type ActionState } from "@/lib/actions";
import { setFlash } from "@/lib/flash";
import { checkRateLimit } from "@/lib/rate-limit";
import { fullRegistrationSchema, registerClient } from "@/lib/services/client-registration";
import { getPublicOrganization } from "@/lib/services/public-org";

export async function fullRegisterClientAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await checkRateLimit("client-register", 5, 3600))) {
    return { ok: false, message: "Too many registrations from this connection. Please try again later or contact the office." };
  }
  const parsed = parseForm(fullRegistrationSchema, fd);
  if (!parsed.success) return parsed.state;
  const org = await getPublicOrganization();
  if (!org) return { ok: false, message: "Online registration is not open. Please contact the office." };
  const r = await safeAction(async () => {
    await registerClient(org.id, "CLIENT_FULL", parsed.data, fd);
  });
  if (r.ok === false) return r;
  // Sign the new client in so they can follow the approval status. The registration is
  // already saved, so a sign-in failure sends them to the login page instead of an error.
  try {
    await auth.api.signInEmail({ body: { email: parsed.data.email, password: parsed.data.password }, headers: await headers() });
  } catch (e) {
    console.error("Sign-in after client registration failed", e instanceof Error ? e.message : "unknown");
    await setFlash("Registration received. Please sign in to follow its status.");
    redirect("/login");
  }
  redirect("/account/pending?registered=1");
}
