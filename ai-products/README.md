# AI products inside the Office ERP

The nine AI products of **aiproducts.analytx4t.com** (repo `Desktop/miscellaneous/AI-Products`), copied into
this project and served from **officeerp.analytx4t.com**. The original site keeps running on its own; this
copy has its own backends, data and history.

## Who can use them
Only the login **demo@gmail.com** (`AI_PRODUCTS_EMAILS` in `src/lib/permissions.ts`, capability
`ai_products.use`). Everyone else, including new sign-ups, owners, other admins and client logins, sees
no sidebar section, gets "no access" on `/app/ai-products/*`, and nginx refuses `/ai-products/*`.

| URL | What |
|---|---|
| `/app/ai-products` | ERP page listing the products (sidebar section **AI products**) |
| `/app/ai-products/<slug>` | ERP page embedding the product (iframe, same origin) |
| `/ai-products/<slug>/` | the product's own site, built from `apps/<slug>` (nginx static) |
| `/ai-products/<slug>/api/*` | nginx → the product's backend on `127.0.0.1:81xx/api/*` |
| `/api/ai-products/auth` | nginx `auth_request`: 204 demo login, 401 signed out, 403 anyone else |

Every page and API request under `/ai-products/` is checked against the ERP session. Only the hashed
JS/CSS bundles (`/ai-products/<slug>/assets/`) skip the check, because they contain no data. Backends
listen on 127.0.0.1 only (`HOST` in the PM2 file).

| Product | slug | backend port |
|---|---|---|
| Trial Balance | financial-reporting | 8100 |
| Financial Statement Analysis | virtual-cfo | 8101 |
| Bank Reconciliation | bank-reconciliation | 8102 |
| Invoice Automation | invoice-automation | 8103 |
| GST Reconciliation (FastAPI) | gst-reconciliation | 8104 |
| TDS Returns | tds-return | 8105 |
| Vendor Ledger | vendor-ledger | 8106 |
| Customer Ledger | customer-ledger | 8107 |
| Payroll & Compliance, switched off as on the original site | payroll-compliance | 8108 |
| Fixed Assets & Depreciation | fixed-asset-register | 8109 |

Changes from the original: Vite `base` is `/ai-products/<slug>/` (was `/app/<slug>/`, which is the ERP's
app path here); ports 80xx → 81xx; the "Workflow Automation" back link goes to `/app/ai-products`;
backends accept `HOST`; Trial Balance allows this site's origin in CORS. `ai-products/tsconfig.json`
keeps Vite from inheriting the ERP's tsconfig (custom JSX runtime), and the ERP's tsconfig/eslint ignore
`ai-products/`.

## Secrets (never committed)
Copied by hand from the original project, and to the server with scp:
`apps/*/backend/.env` (DeepSeek, Hostinger SMTP, `MAIL_TO`), `apps/financial-reporting/.env*`,
`apps/financial-reporting/backend/services/firebaseServiceAccount.json`, `apps/gst-reconciliation/backend/.env`.
On the server set `PYTHON_BIN=report/.venv/bin/python` in the .env files (PM2 sets it as well).
Runtime data (`apps/*/backend/data`, uploads) is gitignored and stays on the server.

## Deploy (officeerp server, after the usual ERP deploy steps)
One-time: `sudo apt install -y python3.14-venv`; copy the secrets; `sudo cp ai-products/deploy/nginx-ai-products*.conf`
to `/etc/nginx/snippets/ss-dimri-ai-products.conf` and `…-proxy.conf`; add
`include /etc/nginx/snippets/ss-dimri-ai-products.conf;` to the HTTPS server block of `/etc/nginx/sites-available/officeerp`.

Every deploy that touches `ai-products/`:
```bash
bash ai-products/deploy/build.sh                    # npm ci + vite build + venvs, publish to /var/www/ss-dimri-ai-products
pm2 startOrReload ai-products/deploy/ecosystem.config.cjs --update-env && pm2 save
sudo cp ai-products/deploy/nginx-ai-products.conf /etc/nginx/snippets/ss-dimri-ai-products.conf
sudo cp ai-products/deploy/nginx-ai-products-proxy.conf /etc/nginx/snippets/ss-dimri-ai-products-proxy.conf
sudo nginx -t && sudo systemctl reload nginx
```
`ONLY="tds-return vendor-ledger" bash ai-products/deploy/build.sh` rebuilds just those products.

## Run locally
Backends: `cd apps/<slug>/backend && PORT=81xx node server.js` (GST: `.venv/Scripts/python -m uvicorn app.main:app --port 8104`).
Frontends: `cd apps/<slug>/frontend && npm run dev` (proxies its API to :81xx). To test the gate as in
production, run nginx in Docker with this snippet in front of `next dev` (see the testing notes in
`docs/ai-products.md`).

---

# Original product documentation (from AI-Products/README.md)

## Chat with your documents (every product)
Each product has **Ask AI**: pick a processed job and chat with it. DeepSeek (`DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`)
answers from the job's processed output **and** the text of the uploaded source files, streamed over SSE.
- Invoice / Bank / TDS / Vendor Ledger / Customer Ledger / Payroll / Fixed Assets: `apps/_shared/server/chat.js` (routes `/api/runs/:id/chat`, `…/chat/reset`, `…/transcript`, `/api/chat/suggestions`)
  + context builders in each backend's `lib/chatContext.js`. UI: `apps/_shared/src/Chat.jsx` (`ChatPage`, `DocChat`).
- GST: same contract in Python (`app/services/chat.py`, routes in `app/main.py`), same shared UI.
- Financial Statement Analysis and Trial Balance keep their existing DeepSeek chats (Ask AI in the sidebar).

## TDS Return Preparation & Reconciliation (`apps/tds-return/`)
- **Input** (Excel or CSV, any column order; headers matched loosely, DeepSeek maps unfamiliar ones; files are recognised from their headers, so a file dropped in the wrong box still works):
  Payment Ledger (`Payment_ID, Payment_Date, Vendor_ID, Vendor_Name, PAN, TDS_Section_As_Booked, Nature, Gross_Amount_INR, TDS_Deducted_INR, Net_Paid_INR, TDS_Deposit_Date`),
  Vendor Master (`Vendor_ID, Vendor_Name, PAN, Vendor_Type, PAN_Status`), TDS Challan Register (`Challan_ID, BSR_Code, Challan_Date, Challan_Serial_No, Amount_INR, Minor_Head, Assessment_FY, Quarter`),
  optional review-notes CSV (each note is matched to the exception that covers it).
- **Engine** (`backend/lib/tds.js`, deterministic): one review note per payment by priority — missing PAN → data errors → rate inconsistency within deductee+section+quarter → configured-rate mismatch (`RATE_RULES`, indicative only) → aggregation → section checks. Exceptions in the reference order (PAN, rate, challan per quarter, aggregation, extra data checks, filing schema). Month-wise challan allocation (a challan by the 7th settles the previous month).
- **Output** matches the client's reference exactly: Excel `Deduction Register · Challan Summary · Exceptions · Control Summary` (`lib/excel.js`), PDF "TDS Processing Summary" (`report/render_tds.py`, ReportLab). Sample files in `frontend/public/samples`; the sample run reproduces the reference workbook cell for cell.
- **Email:** the PDF only, to `MAIL_TO`, as soon as a run is generated (once per unique set of files; resend on the run page).
- Dev: backend `:8005` (`node server.js`, needs `report/.venv` with reportlab), frontend `:5179`.

## Vendor Ledger Reconciliation (`apps/vendor-ledger/`)
- **Input** (Excel or CSV, any column order; DeepSeek maps unfamiliar headers): Books Vendor Ledger (`Date, Reference, Description, Amount_INR, Side, Vendor_Code`),
  Supplier Statement (`Date, Reference, Description, Amount_INR, Side`), Vendor Master (`Vendor_Code, Vendor_Name, GSTIN, Opening_Balance_INR`), optional test-scenario CSV.
  Separate Debit/Credit columns work instead of Amount + Side. The master / notes are recognised wherever dropped; books and statement share a layout, so they come from their own boxes.
  A ledger with several vendor codes is reconciled for the main vendor only (others are listed as left out).
- **Engine** (`backend/lib/recon.js`, deterministic): same reference (punctuation / leading zeros ignored) → Matched / Amount mismatch / Side mismatch; leftovers with same amount + side within 7 days → Matched, "reference differs"; the rest → Books only / Statement only. Actions per open item; balance check (opening from the master) proves the open items explain the closing difference.
- **Output** matches the client's reference: Excel `Reconciliation · Summary · Actions`, PDF "Vendor Reconciliation Summary" (`report/render_vendor.py`, identical text and layout).
  One deliberate difference: the reference marks PAY-501 "description differs" but PAY-502 "Exact" although both are Payment vs Receipt — the engine flags both consistently.
- **Email:** the PDF only, to `MAIL_TO`, as soon as a run is generated (once per unique set of files; resend on the run page).
- Dev: backend `:8006`, frontend `:5180`.

## Customer Ledger Reconciliation (`apps/customer-ledger/`)
- **Input** (Excel or CSV, any column order; DeepSeek maps unfamiliar headers): Company Customer Ledger (`Date, Reference, Description, Amount_INR, Side`, optional `Customer_Code`, `Due_Date`),
  Customer Statement (`Date, Reference, Description, Amount_INR, Side`), Customer Master (`Customer_Code, Customer_Name, GSTIN, Credit_Terms_Days`, optional `Opening_Balance_INR`, `Statement_Date`), optional test-scenario CSV.
  Same file handling as Vendor Ledger (Debit/Credit columns, master/notes recognised wherever dropped, main customer code only).
- **Engine** (`backend/lib/recon.js`, deterministic): the Vendor Ledger passes with customer wording (Matched / Amount mismatch / Side mismatch / Company books only / Statement only), customer-side actions, balance check.
  Ageing input = every invoice in the company books; due date = invoice date + credit terms (or the ledger's `Due_Date`), aged only when the master gives a statement date — otherwise "Due date not calculable", as in the reference.
- **Output** matches the client's reference: Excel `Reconciliation · Ageing Input · Actions`, PDF "Customer Reconciliation Summary" (`report/render_customer.py`, identical text and layout).
  One deliberate difference, as in Vendor Ledger: the reference marks RC-801 "description differs" but RC-802 "Exact" although both are Receipt vs Payment — the engine flags both consistently.
- **Email:** the PDF only, to `MAIL_TO`, as soon as a run is generated (once per unique set of files; resend on the run page).
- Dev: backend `:8007`, frontend `:5181`.

## Payroll Processing & Statutory Compliance (`apps/payroll-compliance/`) — switched off for now
- **Input** (Excel or CSV, any column order, any upload box — each file is recognised from its headers; DeepSeek maps unfamiliar headers):
  Employee Salary Master (`Employee_ID, Employee_Name, Joining_Date, Department, Pay_Frequency, Basic_INR, HRA_INR, Special_Allowance_INR, Other_Allowance_INR, Monthly_PF_Basis_Input_INR, PF_Applicability_Flag`, optional `Exit_Date`, extra allowance columns),
  Attendance & Leave (`Employee_ID, Period, Calendar_Days, Weekly_Offs_Holidays, Paid_Leave_Days, Unpaid_Leave_Days, Present_Days, Overtime_Hours`),
  Payroll Inputs (`Employee_ID, Period, Incentive_INR, Reimbursement_INR, Advance_Recovery_INR, Other_Deduction_INR, Overtime_Rate_INR_Per_Hour`),
  Statutory Rule Configuration (`Rule_Name, Configured_Value, Notes`), optional test-notes CSV. Master + attendance are required.
- **Engine** (`backend/lib/payroll.js`, deterministic): fixed pay − LOP (fixed × (unpaid days + days not employed) ÷ `Salary_Proration_Denominator`, else calendar days) + incentive + reimbursement + OT (hours × rate) = gross; − advance − other deductions = net.
  Joining/exit inside the month prorated; joining after / exit before the period excluded. PF, ESI, PT and salary TDS are **never deducted** — each becomes an exception (illustrative PF/ESI figures when a PF flag is Yes or an ESI threshold is configured). Data gaps (no attendance, OT without a rate, IDs outside the master, other periods, duplicates) are exceptions too.
- **Output** matches the client's reference: Excel `Payroll Register · Exceptions · Control Summary`, PDF "Payroll Processing Summary" (`report/render_payroll.py`, identical text and layout; the long "Open checks" line wraps inside its cell).
  One deliberate difference: the reference shows E005's `Salary_Days_Basis` as 30000 (typo); the site writes 30.
- **Email:** the PDF only, to `MAIL_TO`, as soon as a run is generated (once per unique set of files; resend on the run page).
- Dev: backend `:8008`, frontend `:5182`.

## Fixed Asset Register & Depreciation (`apps/fixed-asset-register/`)
- **Input** (Excel or CSV, any column order, any box — recognised from headers; DeepSeek maps unfamiliar headers):
  Existing Fixed Asset Register (`Asset_ID, Asset_Description, Asset_Class, Purchase_Date, Original_Cost_INR, Available_For_Use_Date, Depreciation_Method, Useful_Life_Years_or_Rate, Residual_Value_INR, Status, Disposal_Date`, optional `Opening_Accumulated_Depreciation_INR`),
  Current Year Additions (`Invoice_No, Invoice_Date, Vendor, Asset_Description, Asset_Class, Cost_INR, Available_For_Use_Date, Proposed_Asset_ID`), Disposals (`Asset_ID, Disposal_Date, Sale_Proceeds_INR, Buyer, Approval_Reference`),
  Depreciation Policy (`Asset_Class, Book_Method, Useful_Life_Years, Residual_Value_Percent, Notes`, optional `Partial_Period_Convention`), and up to 10 capital invoice PDFs. Register + policy are required.
- **Invoices** (`backend/lib/invoice.js`): text PDFs read with pdf.js (`lib/pdfText.js`, same as Invoice Automation); labelled fields by rule, DeepSeek only if the number/total can't be found; agreed to the additions by invoice number (total vs cost, taxable + GST vs total). Scanned PDFs are reported, not guessed.
- **Engine** (`backend/lib/assets.js`, deterministic): period = the FY quarter of the additions/disposals. SLM per class policy: cost × (1 − residual %) ÷ (life × 12) per month, full-month convention, capped at the depreciable amount.
  Held (blank + exception): register method ≠ class policy (and additions in a class whose register uses another method), disposals without opening accumulated depreciation, additions after the quarter's first month with no convention, WDV without opening WDV, class without policy. Tax depreciation is never inferred.
- **Output**: Excel `Asset Rollforward · Exceptions · Additions Extract`, PDF "Fixed Asset Processing Summary" (`report/render_assets.py`) — same text, layout, statuses, notes and exceptions as the client's reference.
  Deliberate difference: the reference's Q1 figures for FA-001 / FA-002 / FA-005 (2,256.25 / 2,968.75 / 2,750) don't follow one consistent formula (0.95, 2.5 and 0.95 months of SLM); the engine gives the full-quarter SLM figures 7,125 / 3,562.50 / 8,708.33.
- **Email:** the PDF only, to `MAIL_TO`, as soon as a run is generated (once per unique set of files; resend on the run page).
- Dev: backend `:8009`, frontend `:5183`.

## GST Reconciliation (`apps/gst-reconciliation/`)
- Backend: FastAPI + LangGraph workflow (profile → map → normalize → validate → calculate → reports). The original
  OpenAI Responses/Batch calls were replaced by DeepSeek chat-completions (JSON mode, pydantic-validated); AI only
  maps layouts and explains exceptions — every figure is computed in `services/calculator.py`. The inward
  reconciliation also returns line-level books-only / 2B-only / mismatch invoices.
- `backend/.env`: `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `AI_ENABLED` (gitignored — copy to the server by hand). Data in `backend/data/` (SQLite + files).
- Frontend rebuilt on `apps/_shared` (same look as the other apps). Sample package: `frontend/public/samples`
  (regenerate with `backend/tests/make_samples.py`). Tests: `cd backend && .venv/Scripts/python -m pytest tests`.
- Dev: `cd apps/gst-reconciliation/backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt && .venv/Scripts/python -m uvicorn app.main:app --port 8004`; UI `:5178`.


LLM: Trial Balance's ledger classifier calls DeepSeek (`deepseek-v4-pro`, thinking off, JSON mode) via
`DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` / optional `DEEPSEEK_BASE_URL` in `apps/financial-reporting/backend/.env`
(`apps/financial-reporting/backend/services/classifierService.js`). The AI assistant and document RAG go through n8n webhooks — their model is configured inside n8n.

### Report emails (client format — keep identical across products)
All products email `MAIL_TO` via Hostinger SMTP (`SMTP_*`, `MAIL_FROM`, `MAIL_TO` in each backend's `.env`). Sender name: **AI Reporting System**. Every subject ends with `– Dated: DD-MM-YYYY` (send date, India time). Same body everywhere:

> Dear Sir/Mam, / Please find attached the requested **<report>** for your reference. / Regards, AI Products Team

| Product | Trigger | Subject | Attachments |
|---|---|---|---|
| Trial Balance | trial balance uploaded (TB Summary, or BS/P&L page upload) | `Trial Balance – Financial Report Generated – Dated: …` | Balance Sheet .xlsx + Profit & Loss .xlsx — nothing else |
| Bank Reconciliation | each new reconciliation | `AI Summary Report – Bank Reconciliation – Dated: …` | Final review report .pdf |
| Financial Statement Analysis | all four statements uploaded | `AI Summary Report – Company Health CFO Intelligence – Dated: …` | Financial Health Summary .pdf |
| Invoice Automation | each new batch | `Extracted Invoice Report Generated – Dated: …` | Review report .pdf + register .xlsx |
| TDS Returns | each new run | `AI Summary Report – TDS Return Preparation & Reconciliation – Dated: …` | TDS Processing Summary .pdf |
| Vendor Ledger | each new run | `AI Summary Report – Vendor Ledger Reconciliation – Dated: …` | Vendor Reconciliation Summary .pdf |
| Customer Ledger | each new run | `AI Summary Report – Customer Ledger Reconciliation – Dated: …` | Customer Reconciliation Summary .pdf |
| Payroll & Compliance | each new run | `AI Summary Report – Payroll Processing – Dated: …` | Payroll Processing Summary .pdf |
| Fixed Assets | each new run | `AI Summary Report – Fixed Asset Register – Dated: …` | Fixed Asset Processing Summary .pdf |

- Trial Balance: after upload the browser builds both statements (same builders as the Download buttons, `src/formats/infraStatements.js` / `src/utils/sohnaExportUtils.js`) and posts them to `POST /api/mail/financial-report`; one email per trial-balance file per 12 h (`backend/data/mail-log.json`). The AI-summary email is handled by the client.
- Bank Reconciliation: identical files + settings produce the same report id, so re-running does not resend.

## Bank Reconciliation (`apps/bank-reconciliation/`)
- **Input:** bank statement + books ledger (CSV or .xlsx), opening balance, date tolerance, books sign convention (auto-detected).
- **Engine** (`backend/lib/match.js`, deterministic): exact ref+amount → duplicate → ref with amount mismatch → amount+date → one-to-many / many-to-one groups → classify leftovers. A difference bridge proves the exceptions explain the closing difference (residual shown, never plugged).
- **Report:** `backend/report/render_brs.py` (ReportLab) reproduces the reference layout; ₹ is drawn with bundled DejaVu Sans. API `POST /api/reconcile`, `GET /api/reports/:id/pdf`.
- Dev: backend `:8002` (`node server.js`), frontend `:5176` (`npm run dev`), portal proxies `/app/bank-reconciliation`.


## Product websites (apps/*/frontend) — shared structure
Invoice Automation, Bank Reconciliation, Financial Statement Analysis, GST Reconciliation, TDS Returns, Vendor Ledger, Customer Ledger, Payroll & Compliance and Fixed Assets are complete sites built on `apps/_shared` (shell, design tokens, components; imported as `@shared` via a Vite alias with `resolve.dedupe`). Each has: **Overview · New run · History · Run detail (on-screen output + PDF/Excel/CSV downloads, email status + resend) · Help (formats, sample files, FAQ) · Settings**. Runs are stored under `backend/data/` with their inputs.

| App | Port (API / dev UI) | Notes |
|---|---|---|
| Financial Statement Analysis | 8001 / 5175 | DeepSeek extracts statement lines; ratios, score and report text computed in `lib/metrics.js`; chat streams over SSE (`lib/chat.js`, nginx `proxy_buffering off`). PDF via `report/render_report.py` (ReportLab + matplotlib). |
| Bank Reconciliation | 8002 / 5176 | Deterministic matcher; PDF via `report/render_brs.py`. |
| Invoice Automation | 8003 / 5177 | Rule-based extraction with DeepSeek fallback; register matches `expected_invoice_ground_truth.csv` exactly; PDF via `report/render_inv.py`. |
| GST Reconciliation | 8004 / 5178 | FastAPI + LangGraph; DeepSeek maps layouts and explains exceptions; Python calculates GSTR-9 / 9C; PDFs via ReportLab. |
| TDS Returns | 8005 / 5179 | Deterministic PAN / rate / challan checks (`lib/tds.js`); DeepSeek only for header mapping fallback and chat; PDF via `report/render_tds.py`. |
| Vendor Ledger | 8006 / 5180 | Deterministic reference / amount matching (`lib/recon.js`); DeepSeek only for header mapping fallback and chat; PDF via `report/render_vendor.py`. |
| Customer Ledger | 8007 / 5181 | Same engine design as Vendor Ledger plus the ageing input (`lib/recon.js`); DeepSeek only for header mapping fallback and chat; PDF via `report/render_customer.py`. |
| Payroll & Compliance | 8008 / 5182 | Deterministic gross-to-net engine (`lib/payroll.js`); statutory items reported as exceptions, not deducted; DeepSeek only for header mapping fallback and chat; PDF via `report/render_payroll.py`. |
| Fixed Assets | 8009 / 5183 | Deterministic depreciation engine (`lib/assets.js`) + invoice PDF reader (`lib/invoice.js`, pdf.js); DeepSeek only for header/invoice fallback and chat; PDF via `report/render_assets.py`. |

## Adding another product

1. Build it in `apps/<slug>/` with Vite `base: "/app/<slug>/"`, a router `basename` from `import.meta.env.BASE_URL`, and API calls prefixed with the base (see `apps/financial-reporting/src/lib/apiPath.js`).
2. Give its backend a free port and add it to `deploy/ecosystem.config.cjs`.
3. Uncomment/copy the template `location` blocks in the nginx file; add the copy step to `deploy.sh`.
4. In `web/src/lib/products.js` set `status: "live"` and `appPath` — the sidebar and dashboard pick it up.

## Design system (web/ and every app)

- **Brand** — Agarwal & Saxena logo as vector SVG (`web/public/agarwal-saxena-logo*.svg`, `apps/_shared/src/assets/`), A&S favicon. Trial Balance was re-themed onto the shared tokens: its `index.css` imports `apps/_shared/src/theme.css` and remaps Tailwind's blue/indigo/purple/gray palettes to the brand scale.

- **Colour** — from the logo: navy ink `#0B1A33`, paper `#F3F5F1`, brand teal `#4FB3AC` (`#1D7A73` for text), lime `#B5D661` as a sparing signal colour. Tokens in `web/src/styles/index.css`.
- **Type** — Funnel Display (headlines), Instrument Sans (body), JetBrains Mono (labels/data), Newsreader italic (one accent word per headline). Self-hosted via Fontsource.
- **Motion** — Lenis inertial scroll (marketing pages only), word-mask headline reveals, blur-up reveals on scroll, scroll-linked text and process rail, View Transitions between routes, magnetic buttons, cursor spotlight borders. All honour `prefers-reduced-motion`.
- **Imagery** — no stock photos: the hero is a canvas "raw data → chart" field echoing the logo's node network; capability tiles and product previews are coded SVG/HTML that animate the actual mechanism.
- **Copy** — no invented stats, clients or testimonials. Product previews use real output from each product's sample run (labelled *sample data*; Trial Balance shows ledger counts only).
