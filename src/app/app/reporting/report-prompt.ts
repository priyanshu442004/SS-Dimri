export const REPORT_TITLE = "Business 360° report";

export const REPORT_PROMPT = `REPORT REQUEST — build the full "Business 360° Dashboard" report. This overrides the "concise" style rule; still no narration and no working shown.
First fetch in parallel: sheet_overview, read_sheet for "Client Profit", "Team Profit", "Tracker", "Client Pending Report" and "Retainers", and attendance_report for THIS month (1st to today; earlier months have no ERP attendance). Use ONLY figures from these results.
KPI definitions (match the firm's Business 360° report exactly):
- Revenue = TOTAL revenue of the "Client Profit" tab (all streams), NOT the Dashboard / Data Checks figure.
- Net profit = TOTAL net profit of the "Team Profit" tab (after internal time); hint "<x>% margin after internal time" where x = net profit ÷ revenue.
- Active clients = clients in "Client Profit"; hint "<n> retainer · <m> one-time".
- Revenue per billable hour = revenue ÷ total billable hours (Client Profit / Team Profit); hint "Utilisation <u>%" (billable ÷ total hours).
- Work items = items in "Tracker"; hint "<k> completed (<p>%)".
- Pending from client = Tracker items waiting on client documents ("Client Pending Report"); hint "% of items".
- Overdue items = Tracker items past the team due date; hint "% of items past due".
- On-time attendance = on-time % of days present this month from attendance_report; hint "<late> late · <leave> leave days".
Then, in ONE final step, call the presentation tools in this order:
1. show_kpis with these 8 cards (format set: inr / count / percent).
2. show_chart column "Client revenue, cost & profit": labels = clients, series Revenue / Cost / Profit, format inr, no Total row.
3. show_chart bar "Net profit by team member", format inr, losses negative.
4. show_chart donut "Revenue share by client", format inr.
5. show_chart bar "Work pipeline by status" (Tracker item counts).
6. show_chart bar "Items by client" (Tracker item counts).
7. show_table "Client scorecard": Client, Nature, Revenue, Cost, Profit, Margin %, Share %, Tracker items, with a Total row (table only).
8. show_table "Team scorecard": Member, Role, Net profit, Margin %, Late days, Leave days.
9. suggest_follow_up.
Your LAST message must be the report text itself — start it directly with "## 360° health check" (never "Let me compile…"). Report text (markdown, ## headings): "## 360° health check" (6 one-line bullets with the key number: Financial, Client mix, Delivery, Client data flow, People, Team economics), "## People insights" (3–5 bullets), "## Key risks & recommended actions" (4–6 bullets, each a risk with its number and a concrete action). Add "(sample)" after figures from tabs marked SAMPLE / SYNTHETIC.`;
