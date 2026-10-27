"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { parseForm, safeAction, type ActionState } from "@/lib/actions";
import { checkRateLimit } from "@/lib/rate-limit";
import { fullRegistrationSchema, quickRegistrationSchema, registerClient } from "@/lib/services/client-registration";
import { getPublicOrganization } from "@/lib/services/public-org";

async function submit(channel: "CLIENT_QUICK" | "CLIENT_FULL", fd: FormData): Promise<ActionState> {
  if (!(await checkRateLimit("client-register", 5, 3600))) {
    return { ok: false, message: "Too many registrations from this connection. Please try again later or contact the office." };
  }
  const parsed = channel === "CLIENT_QUICK" ? parseForm(quickRegistrationSchema, fd) : parseForm(fullRegistrationSchema, fd);
  if (!parsed.success) return parsed.state;
  const org = await getPublicOrganization();
  if (!org) return { ok: false, message: "Online registration is not open. Please contact the office." };
  const r = await safeAction(async () => {
    await registerClient(org.id, channel, parsed.data, fd);
  });
  if (r.ok === false) return r;
  // Sign the new client in so they can follow the approval status.
  await auth.api.signInEmail({ body: { email: parsed.data.email, password: parsed.data.password }, headers: await headers() });
  redirect("/account/pending?registered=1");
}

export async function quickRegisterClientAction(_p: ActionState, fd: FormData) {
  return submit("CLIENT_QUICK", fd);
}

export async function fullRegisterClientAction(_p: ActionState, fd: FormData) {
  return submit("CLIENT_FULL", fd);
}
