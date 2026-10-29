import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { landingPath } from "@/lib/permissions";
import { isFirmRegistrationOpen } from "@/lib/services/firm-registration";
import { Lock } from "lucide-react";
import { AuthShell } from "@/components/public/auth-shell";
import { RegisterFrame } from "@/components/public/register-frame";
import { CreateAccountForm } from "./create-account-form";

export const metadata: Metadata = { title: "Register a firm" };

export default async function CreateAccountPage() {
  await connection(); // depends on live database state (which firm exists); never prerender
  const ctx = await getContext();
  if (ctx) redirect(landingPath(ctx.role));
  if (!(await isFirmRegistrationOpen())) {
    return (
      <AuthShell
        icon={<Lock className="size-7" aria-hidden />}
        eyebrow="Practice portal"
        title="Firm registration is closed"
        em={["closed"]}
        description={
          <>New firm sign-ups are paused for now. Existing firms can sign in as usual; clients and staff receive their login from their firm.</>
        }
      >
        <Link href="/login" className="pub-btn">Sign in</Link>
      </AuthShell>
    );
  }
  const constitutions = await prisma.constitution.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, representativeRole: true, allowsMultiple: true } });
  return (
    <RegisterFrame
      eyebrow="Firm owner"
      title="Register the firm"
      em={["firm"]}
      description="For the firm owner or administrator. Each firm gets its own private portal: its clients, staff, tasks and documents are visible only to that firm."
      next={["Your owner login and your firm's private portal are created", "Departments, services and work types are set up from the master data", "Add employees and register your clients from the admin portal"]}
    >
      <CreateAccountForm constitutions={constitutions} />
      <p className="mt-6 text-sm text-muted">
        Already registered? <Link href="/login" className="pub-link font-medium text-stamp">Sign in</Link>
      </p>
    </RegisterFrame>
  );
}
