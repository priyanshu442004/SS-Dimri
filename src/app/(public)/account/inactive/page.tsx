import type { Metadata } from "next";
import Link from "next/link";
import { Ban } from "lucide-react";
import { FIRM } from "@/lib/firm";
import { signOutAction } from "@/app/app/account-actions";
import { AuthShell } from "@/components/public/auth-shell";

export const metadata: Metadata = { title: "Account inactive" };

export default function InactiveAccountPage() {
  return (
    <AuthShell
      icon={<Ban className="size-7" aria-hidden />}
      tone="danger"
      eyebrow="Account status"
      title="Your account is not active"
      em={["not"]}
      description={
        <>Your login exists but access has been disabled or has not been set up yet. If you think this is a mistake, contact your administrator or the office at{" "}
          <a className="pub-link font-medium text-ink" href="tel:+911147094120">{FIRM.phone}</a>.</>
      }
    >
      <div className="flex flex-wrap gap-3">
        <Link href="/" transitionTypes={["nav-back"]} className="pub-btn">Back to website</Link>
        <form action={signOutAction}><button className="pub-btn pub-btn-ghost">Sign out</button></form>
      </div>
    </AuthShell>
  );
}
