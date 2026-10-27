// Upcoming statutory due dates for the public site, derived from the rules in
// the firm's compliance master (prisma/data/ssda-master-data.json → compliances).
// Standard dates only: extensions notified by the government are not applied here.

export type Deadline = {
  date: Date; // midnight IST, expressed as a UTC instant
  title: string;
  form: string;
  department: "GST" | "TDS" | "Income Tax" | "ROC" | "EPF / ESI" | "MSME";
};

type Rule = Omit<Deadline, "date"> & { day: number; months?: number[] };

const QUARTER_END_NEXT = [1, 4, 7, 10]; // Jan, Apr, Jul, Oct: month after a quarter ends
const QRMP_M1_M2_NEXT = [2, 3, 5, 6, 8, 9, 11, 12]; // month after month 1 or 2 of a quarter

// day = day of month; months = 1-based months the rule falls in (omitted = every month).
const RULES: Rule[] = [
  { day: 7, title: "TDS / TCS deposit", form: "Challan", department: "TDS", months: [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12] },
  { day: 30, title: "TDS / TCS deposit for March", form: "Challan", department: "TDS", months: [4] },
  { day: 10, title: "TDS & TCS under GST", form: "GSTR-7 / GSTR-8", department: "GST" },
  { day: 11, title: "GSTR-1 (monthly)", form: "GSTR-1", department: "GST" },
  { day: 13, title: "Invoice Furnishing Facility (QRMP)", form: "IFF", department: "GST", months: QRMP_M1_M2_NEXT },
  { day: 13, title: "GSTR-1 (quarterly, QRMP)", form: "GSTR-1", department: "GST", months: QUARTER_END_NEXT },
  { day: 15, title: "PF contribution & ECR, ESI contribution", form: "ECR + challan", department: "EPF / ESI" },
  { day: 18, title: "Composition quarterly payment", form: "CMP-08", department: "GST", months: QUARTER_END_NEXT },
  { day: 20, title: "GSTR-3B (monthly)", form: "GSTR-3B", department: "GST" },
  { day: 24, title: "GSTR-3B (quarterly, QRMP — Delhi)", form: "GSTR-3B", department: "GST", months: QUARTER_END_NEXT },
  { day: 25, title: "Monthly tax payment (QRMP)", form: "PMT-06", department: "GST", months: QRMP_M1_M2_NEXT },
  { day: 15, title: "Advance tax instalment", form: "Challan", department: "Income Tax", months: [3, 6, 9, 12] },
  { day: 31, title: "Quarterly TDS / TCS statements", form: "Forms 138 / 140 / 144 / 143", department: "TDS", months: [1, 5, 7, 10] },
  { day: 15, title: "Salary TDS certificates", form: "Form 130", department: "TDS", months: [6] },
  { day: 31, title: "Statement of financial transactions", form: "Form 61A (SFT)", department: "Income Tax", months: [5] },
  { day: 31, title: "ITR — non-audit (salary / other)", form: "ITR-1 / ITR-2", department: "Income Tax", months: [7] },
  { day: 31, title: "ITR — non-audit business / profession", form: "ITR-3 / ITR-4 / ITR-5", department: "Income Tax", months: [8] },
  { day: 30, title: "Tax audit report", form: "Form 3CA/3CB-3CD", department: "Income Tax", months: [9] },
  { day: 31, title: "ITR — audit cases", form: "ITR-3 / 5 / 6 / 7", department: "Income Tax", months: [10] },
  { day: 30, title: "ITR — transfer pricing cases", form: "ITR + Form 3CEB", department: "Income Tax", months: [11] },
  { day: 31, title: "GST annual return & reconciliation", form: "GSTR-9 / GSTR-9C", department: "GST", months: [12] },
  { day: 30, title: "Composition annual return", form: "GSTR-4", department: "GST", months: [4] },
  { day: 30, title: "LLP annual return", form: "LLP Form 11", department: "ROC", months: [5] },
  { day: 30, title: "Return of deposits", form: "DPT-3", department: "ROC", months: [6] },
  { day: 30, title: "Director KYC", form: "DIR-3 KYC", department: "ROC", months: [9] },
  { day: 30, title: "LLP statement of account & solvency", form: "LLP Form 8", department: "ROC", months: [10] },
  { day: 30, title: "MSME dues return", form: "MSME-1", department: "MSME", months: [4] },
  { day: 31, title: "MSME dues return", form: "MSME-1", department: "MSME", months: [10] },
];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's calendar date in India, as { y, m (1-12), d }. */
function todayIST(now: Date) {
  const t = new Date(now.getTime() + IST_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const istMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);

/** The next `count` standard due dates on or after today (IST). */
export function upcomingDeadlines(count = 6, now = new Date()): (Deadline & { daysLeft: number })[] {
  const today = todayIST(now);
  const start = istMidnight(today.y, today.m, today.d).getTime();
  const out: Deadline[] = [];
  for (let i = 0; i < 4; i++) {
    const m0 = today.m - 1 + i;
    const y = today.y + Math.floor(m0 / 12);
    const m = (m0 % 12) + 1;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (const r of RULES) {
      if (r.months && !r.months.includes(m)) continue;
      const date = istMidnight(y, m, Math.min(r.day, lastDay));
      if (date.getTime() >= start) out.push({ date, title: r.title, form: r.form, department: r.department });
    }
  }
  return out
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.title.localeCompare(b.title))
    .slice(0, count)
    .map((d) => ({ ...d, daysLeft: Math.round((d.date.getTime() - start) / 86_400_000) }));
}

export const formatDue = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d);
