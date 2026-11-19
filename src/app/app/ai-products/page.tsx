import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requireCapability } from "@/lib/session";
import { AI_PRODUCTS } from "@/lib/ai-products";
import { PageHeader } from "@/components/ui";
import { ProductIcon } from "./product-icon";

export const metadata: Metadata = { title: "AI products" };

// The AI products, released to the demo login only (capability "ai_products.use").
export default async function AiProductsPage() {
  await requireCapability("ai_products.use");
  return (
    <>
      <PageHeader title="AI products" description="Workflow automation for accounting, tax and reconciliation. Each product keeps its own history, reports and AI chat, and emails its report when a run is made." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {AI_PRODUCTS.map((p) => (
          <Link
            key={p.slug}
            href={`/app/ai-products/${p.slug}`}
            className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgb(15_29_51/.04)] transition-colors hover:border-ink/25"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-night text-marigold">
                <ProductIcon name={p.icon} className="size-5" />
              </span>
              <ArrowUpRight className="size-4 text-muted transition-colors group-hover:text-ink" aria-hidden />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-muted">{p.category}</p>
              <h2 className="mt-1 font-medium text-ink">{p.name}</h2>
            </div>
            <p className="text-sm text-muted">{p.summary}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
