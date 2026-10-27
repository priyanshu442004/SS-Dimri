import { redirect } from "next/navigation";
import { landingPath } from "@/lib/permissions";
import { isAwaitingApproval, requireContext } from "@/lib/session";

// Automatic redirection by login identity (DFD).
export default async function AppIndex() {
  const ctx = await requireContext();
  redirect(isAwaitingApproval(ctx) ? "/app/onboarding" : landingPath(ctx.role));
}
