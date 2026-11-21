import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { can, type Member } from "@/lib/permissions";
import { AI_PRODUCTS, aiProductUrl } from "@/lib/ai-products";
import { navFor } from "@/app/app/nav";

const demo = (role: Member["role"], email = "demo@gmail.com"): Member => ({ role, user: { email } });

describe("AI products access", () => {
  it("is open only to the demo login", () => {
    expect(can(demo("ADMIN"), "ai_products.use")).toBe(true);
    expect(can(demo("STAFF"), "ai_products.use")).toBe(true);
    expect(can(demo("ADMIN", "DEMO@gmail.com"), "ai_products.use")).toBe(true);
    for (const role of ["OWNER", "ADMIN", "MANAGER", "SENIOR", "STAFF"] as const) {
      expect(can(demo(role, "owner@firm.in"), "ai_products.use")).toBe(false);
    }
    expect(can({ role: "OWNER" }, "ai_products.use")).toBe(false);
    expect(can(demo("CLIENT"), "ai_products.use")).toBe(false);
  });

  it("cannot be handed out as a per-person right", () => {
    expect(can({ role: "OWNER", user: { email: "owner@firm.in" }, grantedCapabilities: ["ai_products.use"] }, "ai_products.use")).toBe(false);
  });

  it("shows the Workflow automation (AI products) section in the sidebar for the demo login only", () => {
    const section = (m: Member) => navFor(m, false, false).filter((n) => n.section === "Workflow automation");
    expect(section(demo("ADMIN")).map((n) => n.href)).toEqual(AI_PRODUCTS.map((p) => `/app/ai-products/${p.slug}`));
    expect(section(demo("ADMIN", "someone@else.com"))).toEqual([]);
    expect(section({ role: "OWNER" })).toEqual([]);
  });

  it("lists the nine live products, each with an nginx route and a backend", () => {
    expect(AI_PRODUCTS).toHaveLength(9);
    const nginx = readFileSync("ai-products/deploy/nginx-ai-products.conf", "utf8");
    const pm2 = readFileSync("ai-products/deploy/ecosystem.config.cjs", "utf8");
    for (const p of AI_PRODUCTS) {
      expect(nginx).toContain(`location ^~ /ai-products/${p.slug}/api/`);
      expect(nginx).toContain(`location /ai-products/${p.slug}/ {`);
      expect(pm2).toMatch(new RegExp(`"${p.slug}"|${p.slug}/backend`));
      expect(aiProductUrl(p).startsWith(`/ai-products/${p.slug}/`)).toBe(true);
    }
  });
});
