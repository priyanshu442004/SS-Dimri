# AI products (demo login only)

The nine products of aiproducts.analytx4t.com run inside the ERP for the login **demo@gmail.com**
only. Code, ports, secrets and deploy steps: [ai-products/README.md](../ai-products/README.md).

## How access is enforced
1. **Sidebar / pages:** capability `ai_products.use` (`src/lib/permissions.ts`). `can()` refuses it to
   any login not in `AI_PRODUCTS_EMAILS`, whatever the role. It is not a grantable right, so an
   administrator cannot hand it out. Clients never have it.
2. **The product sites and their APIs** (`/ai-products/<slug>/…`): nginx `auth_request` → `GET /api/ai-products/auth`
   (204 / 401 / 403). Refused page requests are redirected to `/app/ai-products` (sign-in or "no access");
   refused API requests get 401 JSON.
3. **Backends** listen on 127.0.0.1 only, so nothing reaches them except through nginx.

To release the products to another login, add its email to `AI_PRODUCTS_EMAILS` and deploy.

## Tests
- Unit: `tests/ai-products.test.ts` (access rule, sidebar, nginx/PM2 routes for every product).
- End to end: `tests/e2e-ai-products/`, run through nginx exactly as in production. Every product
  processes its sample files (real DeepSeek calls), its PDF/XLSX are downloaded and checked, and the
  report email must come back `sent`. Two AI chats stream through nginx. Signed-out visitors and
  another login are refused on every product page and API.
  - Local: throw-away test DB (docs/testing-strategy.md), `scripts/ai/seed-demo.ts` + `create-demo-login.ts`,
    `next dev` on :3000 with `BETTER_AUTH_URL=http://localhost:8088`, the backends on 8100–8109, and nginx
    in Docker on :8088 with `ai-products/deploy/nginx-ai-products*.conf` (127.0.0.1 → host.docker.internal).
    `npx playwright test -c tests/e2e-ai-products/playwright.ai-products.config.ts`
  - Live: `AIP_BASE=https://officeerp.analytx4t.com AIP_OTHER_EMAIL=… AIP_OTHER_PASSWORD=… npx playwright test -c …`.
    This sends the real report emails to `MAIL_TO`. A product sends only once per unique set of files,
    so a repeat run with the same samples shows the earlier mail status.

## Operations
- PM2 processes `aip-*` (`pm2 ls`, `pm2 logs aip-tds-return`). Data lives in
  `~/SS-Dimri/ai-products/apps/<slug>/backend/data` on the server (gitignored, survives deploys).
- Memory: the server has 1.9 GB RAM + 2 GB swap. The backends together use a few hundred MB; the
  ERP build (`--max-old-space-size=3072`) still fits with swap.
