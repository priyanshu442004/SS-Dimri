// Accounting Workflow Tracker and Team Daily Work Log (pure): the workbook's dropdown values
// and formulas. The two sheets share column names and values; that is what links them.

export const TYPES_OF_WORK = [
  "Bank Statement Posting", "Purchase Invoice Posting", "Sale Invoice Posting", "Expense Posting", "Journal / Adjustment Entries",
  "Bank Reconciliation", "Credit Card Reconciliation", "Creditors Reconciliation", "Debtors Reconciliation", "Data Reconciliation",
  "Ledger Scrutiny / Clean-up", "Making of Accounts / Final Accounts", "GST Work", "TDS Work", "Balance Confirmation",
  "Client Meeting / Discussion", "Income Tax Work", "Payroll / Salary Work", "Fixed Assets / Depreciation", "Stock / Inventory Work",
  "Loan Accounting", "Opening Balances / Carry Forward", "Capital / Partners' Accounts", "Other",
] as const;
export const PLACES_OF_WORK = ["Client Office", "Our Office", "Work from Home", "Other"] as const;
export const BRANCHES = ["Delhi HO", "Gurugram", "Both", "Firm", "NA"] as const;
export const STATUSES_OF_WORK = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED"] as const;
export type StatusOfWork = (typeof STATUSES_OF_WORK)[number];
export const STATUS_OF_WORK_LABEL: Record<string, string> = { NOT_STARTED: "Not Started", IN_PROGRESS: "In Progress", ON_HOLD: "On Hold", COMPLETED: "Completed", PENDING: "Pending" };
export const PENDING_STATUSES = ["Open", "Partial", "Cleared"] as const;
export const ISSUE_LEVELS = ["Low", "Medium", "High", "Critical"] as const;
export const ISSUE_LEVEL_HINT: Record<string, string> = {
  Low: "Small inconvenience",
  Medium: "Slows the work",
  High: "Work blocked or client not cooperating",
  Critical: "Needs a senior's immediate involvement",
};
export const ISSUE_STATUSES = ["Open", "Resolved"] as const;
export const CHECKER_STATUSES = ["Not Started", "Checking", "Rework Required", "Approved"] as const;
export const PRIORITIES = ["High", "Medium", "Low"] as const;

export const WORK_STATUSES = ["Awaiting Data", "Partial Data", "Not Started", "Maker In Progress", "On Hold", "Ready for Check", "Under Check", "Rework", "Completed"] as const;
export type WorkStatusLabel = (typeof WORK_STATUSES)[number];
export const TIMELINE_FLAGS = ["OVERDUE", "CLIENT DELAY", "FOLLOW-UP DUE", "On Track", "Done"] as const;
export type TimelineFlag = (typeof TIMELINE_FLAGS)[number];

/** Bank Name is compulsory for bank posting, reconciliation and card work. */
export const needsBankName = (typeOfWork?: string | null) => /bank|credit card/i.test(typeOfWork ?? "");

export type LineFacts = {
  statusOfWork?: string | null;
  checkerStatus?: string | null;
  clientPendingItem?: string | null;
  clientPendingStatus?: string | null;
  clientDueBy?: Date | null;
  teamPendingItem?: string | null;
  teamPendingStatus?: string | null;
  teamDueBy?: Date | null;
  nextFollowUpOn?: Date | null;
  issueLevel?: string | null;
  issueDetails?: string | null;
  issueStatus?: string | null;
};

/** The workbook's "Work Status (auto)". */
export function workStatusOf(l: LineFacts): WorkStatusLabel {
  if (l.clientPendingItem) {
    if (!l.clientPendingStatus || l.clientPendingStatus === "Open") return "Awaiting Data";
    if (l.clientPendingStatus === "Partial" && (!l.statusOfWork || l.statusOfWork === "NOT_STARTED") && l.checkerStatus !== "Approved") return "Partial Data";
  }
  if (l.checkerStatus === "Approved") return "Completed";
  if (l.checkerStatus === "Rework Required") return "Rework";
  if (l.checkerStatus === "Checking") return "Under Check";
  if (l.statusOfWork === "COMPLETED") return "Ready for Check";
  if (l.statusOfWork === "ON_HOLD") return "On Hold";
  if (l.statusOfWork === "IN_PROGRESS") return "Maker In Progress";
  return "Not Started";
}

/** The workbook's "Timeline Flag (auto)". A team item already cleared is no longer overdue. */
export function timelineFlagOf(l: LineFacts, today: Date): TimelineFlag {
  if (workStatusOf(l) === "Completed") return "Done";
  if (l.teamDueBy && l.teamPendingStatus !== "Cleared" && l.teamDueBy < today) return "OVERDUE";
  if (l.clientPendingItem && l.clientPendingStatus !== "Cleared" && l.clientDueBy && l.clientDueBy < today) return "CLIENT DELAY";
  if (l.nextFollowUpOn && l.nextFollowUpOn <= today) return "FOLLOW-UP DUE";
  return "On Track";
}

const DAY = 86_400_000;
const days = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY);

/** Tracker "Days Pending": the days allowed, Due By − Raised On. */
export function daysAllowed(raisedOn?: Date | null, dueBy?: Date | null) {
  return raisedOn && dueBy ? days(raisedOn, dueBy) : null;
}

/** Log "Days Pending": today − Raised On, or "Cleared". Deliberately not the same as the tracker's. */
export function daysOpen(raisedOn: Date | null | undefined, status: string | null | undefined, today: Date): number | "Cleared" | null {
  if (status === "Cleared") return "Cleared";
  return raisedOn ? days(raisedOn, today) : null;
}

export type DueState = "OVERDUE" | "Due today" | "On time" | "Cleared";
export function dueStateOf(dueBy: Date | null | undefined, status: string | null | undefined, today: Date): DueState {
  if (status === "Cleared") return "Cleared";
  if (!dueBy) return "On time";
  const left = days(today, dueBy);
  return left < 0 ? "OVERDUE" : left === 0 ? "Due today" : "On time";
}

export const isOpenItem = (item?: string | null, status?: string | null) => !!item && status !== "Cleared";
export const isOpenIssue = (l: LineFacts) => l.issueStatus === "Open" && !!(l.issueLevel || l.issueDetails);

/** Client initials for the Ref No.: "Roshan Di Kulfi & Sons" → RDK. */
export function refPrefix(clientName: string) {
  const words = clientName.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  if (!words.length) return "REF";
  if (words.length === 1) return words[0].slice(0, 3);
  return words.slice(0, 3).map((w) => w[0]).join("");
}

/** Lines the Client Pending Report shows: an item filled in and not Cleared. */
export const onClientReport = (l: LineFacts) => isOpenItem(l.clientPendingItem, l.clientPendingStatus);

export type DashboardLine = LineFacts & { clientName: string; typeOfWork: string; makerName?: string | null; checkerName?: string | null };

function bump<T>(map: Map<string, T>, key: string, blank: () => T) {
  if (!map.has(key)) map.set(key, blank());
  return map.get(key)!;
}

/** The Dashboard sheet: summary counts, by client, by type of work, team workload. */
export function trackerDashboard(lines: DashboardLine[], today: Date) {
  const statusCounts = Object.fromEntries(WORK_STATUSES.map((s) => [s, 0])) as Record<WorkStatusLabel, number>;
  const summary = { total: lines.length, pendingFromClient: 0, received: 0, overdue: 0, clientDelay: 0, followUpDue: 0, openIssues: 0, openIssuesSerious: 0 };
  const byClient = new Map<string, { total: number; pendingFromClient: number; completed: number; open: number; overdue: number; openIssues: number }>();
  const byType = new Map<string, { total: number; pendingFromClient: number }>();
  const team = new Map<string, { openMaker: number; openChecker: number; overdue: number; completedMaker: number }>();
  const blankTeam = () => ({ openMaker: 0, openChecker: 0, overdue: 0, completedMaker: 0 });

  for (const l of lines) {
    const status = workStatusOf(l);
    const flag = timelineFlagOf(l, today);
    const pending = onClientReport(l);
    const done = status === "Completed";
    const issue = isOpenIssue(l);
    statusCounts[status]++;
    if (pending) summary.pendingFromClient++;
    if (l.clientPendingItem && l.clientPendingStatus === "Cleared") summary.received++;
    if (flag === "OVERDUE") summary.overdue++;
    if (flag === "CLIENT DELAY") summary.clientDelay++;
    if (flag === "FOLLOW-UP DUE") summary.followUpDue++;
    if (issue) summary.openIssues++;
    if (issue && (l.issueLevel === "High" || l.issueLevel === "Critical")) summary.openIssuesSerious++;

    const c = bump(byClient, l.clientName, () => ({ total: 0, pendingFromClient: 0, completed: 0, open: 0, overdue: 0, openIssues: 0 }));
    c.total++;
    if (pending) c.pendingFromClient++;
    if (done) c.completed++; else c.open++;
    if (flag === "OVERDUE") c.overdue++;
    if (issue) c.openIssues++;

    const t = bump(byType, l.typeOfWork, () => ({ total: 0, pendingFromClient: 0 }));
    t.total++;
    if (pending) t.pendingFromClient++;

    if (l.makerName) {
      const m = bump(team, l.makerName, blankTeam);
      if (done) m.completedMaker++; else m.openMaker++;
      if (flag === "OVERDUE") m.overdue++;
    }
    if (l.checkerName) {
      const m = bump(team, l.checkerName, blankTeam);
      if (!done) m.openChecker++;
      if (flag === "OVERDUE" && l.checkerName !== l.makerName) m.overdue++;
    }
  }
  const sorted = <T,>(m: Map<string, T>) => [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => a.name.localeCompare(b.name));
  return { summary, statusCounts, byClient: sorted(byClient), byType: sorted(byType), team: sorted(team) };
}
