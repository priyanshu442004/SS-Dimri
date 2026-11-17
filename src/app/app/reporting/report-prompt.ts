export const REPORT_TITLE = "Business 360° report";

export const REPORT_PROMPT = `REPORT REQUEST — build the full "Business 360° Dashboard" report. This overrides the "concise" style rule; still no narration and no working shown.
First fetch in parallel: sheet_overview, read_sheet for "Client Profit", "Team Profit", "Dashboard", "Tracker", "Client Pending Report" and "Retainers", and attendance_report for last month. Use ONLY figures from these results.
Then, in ONE final step, write the report text and call the presentation tools in this order:
1. show_kpis (8 cards, format set): Revenue, Net profit (margin % in hint), Active clients (retainer · one-time in hint), Revenue per billable hour, Work items (completed % in hint), Pending from client, Overdue items, On-time attendance %.
2. show_chart column "Client revenue, cost & profit": labels = clients, series Revenue / Cost / Profit, format inr, no Total row.
3. show_chart bar "Net profit by team member", format inr, losses negative.
4. show_chart donut "Revenue share by client", format inr.
5. show_chart bar "Work pipeline by status" (Tracker item counts).
6. show_chart bar "Items by client" (Tracker item counts).
7. show_table "Client scorecard": Client, Nature, Revenue, Cost, Profit, Margin %, Share %, Tracker items, with a Total row (table only).
8. show_table "Team scorecard": Member, Role, Net profit, Margin %, Late days, Leave days.
9. suggest_follow_up.
Report text (markdown, ## headings): "## 360° health check" (6 one-line bullets with the key number: Financial, Client mix, Delivery, Client data flow, People, Team economics), "## People insights" (3–5 bullets), "## Key risks & recommended actions" (4–6 bullets, each a risk with its number and a concrete action). Add "(sample)" after figures from tabs marked SAMPLE / SYNTHETIC.`;
