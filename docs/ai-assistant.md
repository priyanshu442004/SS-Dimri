# AI assistant "Aanya" (`/app/assistant`)

A chat that answers questions about the firm's data in plain language. It reads two sources:

1. **The ERP database**: staff, attendance, leave, payroll, clients, tasks, timesheets, pending items, compliance and more.
2. **The firm's live Google Sheet** (`AI_SHEET_URL`): the accounting tracker and finance model (revenue, fees, retainers, staff rates, client and team profit).

The model is DeepSeek (`deepseek-v4-pro`, OpenAI-compatible API).

## Who can use it

| | Owner / Admin | Manager | Senior | Staff |
|---|---|---|---|---|
| Assistant (`assistant.use`) | yes | yes | yes | only if granted |
| Attendance, tasks, clients, timesheets | yes | yes | yes | — |
| Payroll for everyone (`payroll_month`) | yes | — | — | — |
| Salaries (`salary_overview`) | everyone | their team | — | — |
| Google Sheet (needs `reports.client`) | yes | yes | — | — |
| Day reports, audit log | yes | — | — | — |

The assistant has **no data rights of its own**. Every query runs with the rights of the person asking, and module restrictions still apply.

## How a question is answered

```
browser ──POST /api/assistant/chat (NDJSON stream)──▶ route.ts
  route: auth (assistant.use) → rate limit → save question → runAgent()
  agent: system prompt + history → DeepSeek (streamed)
         ↳ tool calls run in parallel → results go back to the model → …
         ↳ show_kpis / show_chart / show_table / suggest_follow_up → sent to the browser as blocks
  route: save answer (text, blocks, follow-up, data note) → "done"
```

The agent loop is in `src/lib/ai/agent.ts`. When the model writes the answer text in the same step as its visuals, the loop stops there, which saves a round trip.

### Tools

| Tool | What it does |
|---|---|
| `query_database` | Read-only Prisma `findMany` / `count` / `aggregate` / `groupBy`, checked against an allow-list (`src/lib/ai/db-query.ts`) |
| `attendance_report` | Attendance scored by the office rules (late beyond grace, very late, absent, leave, reasons). It reuses `teamAttendanceRows`, the same code the Attendance page uses |
| `payroll_month` / `salary_overview` | Reuse the Payroll page's services |
| `sheet_overview` / `read_sheet` | The live Google Sheet (`src/lib/ai/sheet.ts`) |
| `show_kpis` / `show_chart` / `show_table` / `suggest_follow_up` | Visual blocks, validated with zod (`src/lib/ai/blocks.ts`) |

### Database safety (`db-query.ts`)

- **Read-only.** There is no write operation.
- **Allow-listed models.** Each model needs a capability.
- **Scoped to the firm.** `organizationId`, or the parent's, is ANDed into every top-level and nested list query.
- **Secret columns blocked.** Passwords, tokens, Aadhaar, bank account numbers, locations and storage keys can be neither read nor filtered on, at any depth.
- **No hidden columns through relations.** `relation: true` expands to an explicit list of allowed columns.
- **Size and depth caps.**

Tests: `tests/assistant.test.ts`.

### The Google Sheet

- **Fetched only when a sheet tool is called.** It is never fetched on every question.
- **Nothing is hard-coded.** Tabs come from the sheet itself and the header row of each tab is detected, so added, renamed or deleted tabs, columns and rows are picked up automatically.
- **Caching.** A fetched tab counts as fresh for `AI_SHEET_FRESH_SECONDS` (default 60). After that it is fetched again. The old copy is served only if Google is unreachable, and the answer says so. The model can force a fresh read with `refresh: true`, for example when the user asks for the latest figures.
- **Access.** Only firms listed in `AI_SHEET_ORGANIZATION_IDS` can read it, because the portal is multi-firm.

### Caching and speed

- **Streaming.** Tokens are streamed and the browser batches them per animation frame.
- **Stable prompt prefix.** The system prompt is ordered so it stays the same from call to call: instructions, then the schema, then the firm, then today's dates. DeepSeek's automatic prefix cache then covers most of it.
- **Two-tier cache** (`src/lib/ai/cache.ts`):
  - **L1:** an in-process LRU.
  - **L2:** Upstash Redis, which survives restarts. It holds only the **public** sheet data and rate-limit counters. Firm database results are never sent to Redis; identical queries are reused from memory for 20 s.
  - Redis failures fall back to L1, with a 30 s circuit breaker.
- **Chat titles.** They are generated in parallel with the answer.
- **Fewer round trips.** `groupBy` results get readable names (e.g. `makerName`) attached, so the model does not need a second query.

### Conversation memory

- Each answer stores a compact `[Data used]` note: its tool calls and trimmed results. The last four answers send these notes back to the model, so follow-ups like "why were *they* late?" resolve correctly.
- Selected text (**Ask AI**) is sent as a `SELECTED EXCERPT`. The prompt tells the model the question concerns only that excerpt.

## UI features

- **History:** grouped by date, with search across titles and message text. You can rename, pin or delete a chat, or clear all chats.
- **While answering:** the answer streams with a live tool-progress chip. **Stop** works with the button or Esc, and keeps the partial answer.
- **On each answer:** KPI cards with count-up, charts (bar, column, line, area, pie, donut, stacked) with a table view, and tables with CSV download. One follow-up chip suggests a next question.
- **Answer actions:**
  - **Copy:** puts rich HTML (pastes formatted into Word, Gmail or Docs) and Markdown on the clipboard.
  - **Regenerate**, **Edit and resend**, and **👍 / 👎** feedback.
- **Ask AI on a selection:** select any text in an answer to ask about just that part.
- **Shortcuts:** Enter sends, Shift+Enter starts a new line, Ctrl/⌘+Shift+O opens a new chat, `/` focuses the input, Esc stops the answer.
- **Layout:** works on phones (history opens as a drawer). Animations respect reduced-motion settings.

## The client's Business Questionnaire

The client's test questions (Business_Questionnaire.pdf, Parts A–C) refer to sheet tabs by friendly names, which the system prompt maps to the real tabs: Team and Hourly Cost → Staff Rates, Client List → Clients, Services and Pricing → Service Fees, Work Tracker → Tracker, Documents Pending → Client Pending Report, Business Summary → Dashboard / Client Profit / Data Checks, Team Hours → Timesheet, Monthly Fee Clients → Retainers, Accuracy Check → Data Checks.

- **Part B (attendance and leave) is answered from the ERP**, not the workbook. One `attendance_report` call returns:
  - attendance % and on-time %
  - best → weakest per person
  - lateness per role
  - not marked vs on leave, with the return date
  - automatic absences
  - timesheet time logged on unmarked days
- **When the ERP and the sheet disagree**, for example staff headcount, the ERP figure leads and the sheet's figure is mentioned.
- **Checking it:** `scripts/ai/questionnaire-check.ts` runs, for each question, the tool call the assistant would make, against the live sheet and the local demo firm.
- **A real inconsistency in the workbook:** Data Checks reports total revenue of ₹7,92,800, while the Client Profit tab totals ₹8,84,000 (the figure in the client's 360° PDF). Question 13.1, "Do my numbers tally?", should surface this.

## Configuration (`.env.local`)

| Variable | Default | |
|---|---|---|
| `DEEPSEEK_API_KEY` | — | required |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | |
| `DEEPSEEK_MODEL` | `deepseek-v4-pro` | |
| `DEEPSEEK_THINKING` | `disabled` | `enabled` gives deeper but slower answers. Reasoning is stored and sent back, as DeepSeek requires when tools are used |
| `DEEPSEEK_REASONING_EFFORT` | `high` | `low` / `high` / `max` (thinking only) |
| `AI_MAX_TOOL_ROUNDS` / `AI_MAX_OUTPUT_TOKENS` | 8 / 4000 | |
| `AI_SHEET_URL`, `AI_SHEET_ORGANIZATION_IDS`, `AI_SHEET_FRESH_SECONDS` | | see above |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | optional | |

Rate limits are 15 questions a minute and 400 a day per person.

## Data

The migration `20261117120000_ai_assistant` is additive. It creates two tables:

- `ai_conversations`: id, firm, user, title, pinned.
- `ai_messages`: role, content, quote, blocks, follow_up, context, reasoning, status, feedback, model, duration.

## After a schema change

Run `npx tsx scripts/generate-ai-catalog.ts`. It regenerates `src/lib/ai/catalog.generated.ts`, which the query tool validates against. If a new model should be queryable, also add it to `MODEL_POLICY` in `db-query.ts` with the capability that guards it.

## Testing without a real model

1. Start the scripted, OpenAI-compatible stand-in: `node tests/fixtures/mock-deepseek.mjs 4555`.
2. Run the app with `DEEPSEEK_BASE_URL=http://localhost:4555` and `DEEPSEEK_API_KEY=mock-key`, against the local test database. Seed it first with `scripts/ai/seed-demo.ts`; the script refuses to run against any other database.
3. Run `npx playwright test -c tests/e2e-assistant/playwright.assistant.config.ts`.
