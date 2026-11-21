import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/session";
import { aiProductBySlug, aiProductUrl } from "@/lib/ai-products";
import { ProductFrame } from "./product-frame";

export async function generateMetadata({ params }: PageProps<"/app/ai-products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: aiProductBySlug(slug)?.name ?? "Workflow automation" };
}

// One AI product, embedded full-size. Its site is served by nginx at /ai-products/<slug>/, which
// checks the same rule (GET /api/ai-products/auth) on every page and API request.
export default async function AiProductPage({ params }: PageProps<"/app/ai-products/[slug]">) {
  await requireCapability("ai_products.use");
  const { slug } = await params;
  const product = aiProductBySlug(slug);
  if (!product) notFound();
  return <ProductFrame name={product.name} icon={product.icon} src={aiProductUrl(product)} />;
}
