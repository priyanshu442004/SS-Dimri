import "server-only";
import { prisma } from "@/lib/db";
import { BusinessRuleError } from "@/lib/actions";
import { isoDateInTz, minutesOfDayInTz, monthRange, formatTime, toIsoDate } from "@/lib/dates";
import { serverEnv } from "@/lib/env";
import { fillTemplate, type FillInput } from "@/lib/hr-letters/docx";
import { LETTERS, MEMOS, type FieldSpec, type LetterKind, type MemoFormat } from "@/lib/hr-letters/specs";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { storeGenerated } from "./files";
import { hrDocumentEmail, sendMail, type MailResult } from "./mailer";
import { notifyEmployees, notifyRoles } from "./notifications";

// Offer / appointment letters and memos, generated from the firm's own Word
// templates (Master Data pack sheets 8–10). The filled .docx is stored
// privately, attached to the staff member's email and shown in the portal,
// where they accept the letter or acknowledge (and reply to) the memo.

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TEMPLATE_FIRM_GSTIN = "07AGBPD7743C1ZT"; // S S Dimri & Associates, whose letterhead the templates carry

const longDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

/** "SUNIL DIMRI" → "Sunil Dimri"; mixed-case names are left alone. */
const nameCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : s);
const fullName = (e: { firstName: string; lastName: string | null }) => nameCase(`${e.firstName} ${e.lastName ?? ""}`.trim());

/** Indian financial year label, e.g. "2026-27". */
function financialYear(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

async function loadEmployee(organizationId: string, employeeId: string) {
  const e = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId },
    include: {
      designation: { select: { name: true } },
      department: { select: { name: true } },
      addresses: true,
      reportsTo: { orderBy: { isPrimary: "desc" }, include: { manager: { select: { firstName: true, lastName: true, designation: { select: { name: true } } } } } },
      salaryRecords: { orderBy: { effectiveFrom: "desc" }, take: 1 },
      membership: { select: { userId: true, user: { select: { email: true } } } },
    },
  });
  if (!e) throw new BusinessRuleError("Employee not found.");
  return e;
}

async function loadFirm(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      tradeName: true, address: true, gstin: true, contactEmail: true, contactPhone: true, defaultProbationDays: true,
      constitution: { select: { name: true } },
      memberships: { where: { role: "OWNER" }, take: 1, select: { user: { select: { name: true } } } },
    },
  });
  const role = /partner/i.test(org.constitution?.name ?? "") ? "Partner" : /company|llp|director/i.test(org.constitution?.name ?? "") ? "Director" : "Proprietor";
  const fill: FillInput["firm"] =
    org.gstin === TEMPLATE_FIRM_GSTIN
      ? null
      : {
          name: org.tradeName,
          letterhead: {
            name: org.tradeName,
            address: org.address,
            contact: [org.contactPhone && `Phone: ${org.contactPhone}`, org.contactEmail && `Email: ${org.contactEmail}`, org.gstin && `GSTIN: ${org.gstin}`].filter(Boolean).join("  |  "),
          },
        };
  return { org, fill, signatory: { name: nameCase(org.memberships[0]?.user.name ?? ""), designation: role } };
}

type Employee = Awaited<ReturnType<typeof loadEmployee>>;

function addressDefaults(e: Employee) {
  const a = e.addresses.find((x) => x.type === "CURRENT") ?? e.addresses[0];
  return { Address_Line_1: a?.line1 ?? "", Address_Line_2: a?.line2 ?? "", City: a?.city ?? "", State: a?.state ?? "", PIN: a?.pincode ?? "" };
}

// ------------------------------------------------------------- form defaults

/** Pre-filled form values (dates as YYYY-MM-DD, lists one per line) from the staff record. */
export async function letterDefaults(ctx: AppContext, employeeId: string, kind: LetterKind): Promise<Record<string, string>> {
  const [e, { org, signatory }] = await Promise.all([loadEmployee(ctx.organization.id, employeeId), loadFirm(ctx.organization.id)]);
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const joining = e.dateOfJoining ? toIsoDate(e.dateOfJoining) : "";
  const managers = e.reportsTo.map((r) => fullName(r.manager)).join(", ");
  const salary = e.salaryRecords[0] ? String(Number(e.salaryRecords[0].agreedSalary)) : "";
  const policy = await prisma.attendancePolicy.findUnique({ where: { organizationId: ctx.organization.id }, select: { paidLeavesPerMonth: true } });
  const common = {
    Date: today,
    ...addressDefaults(e),
    Salutation: e.gender === "MALE" ? "Mr." : e.gender === "FEMALE" ? "Ms." : "",
    Signatory_Name: signatory.name,
    Signatory_Designation: signatory.designation,
  };
  if (kind === "OFFER_LETTER") {
    return {
      ...common, Designation: e.designation?.name ?? "", Department: e.department?.name ?? "", Joining_Date: joining, Interview_Date: "",
      Acceptance_By_Date: "", Place_of_Posting: org.address ?? "", Reporting_To: managers, Monthly_Salary: salary, Probation_Period: `${org.defaultProbationDays} days`,
    };
  }
  if (kind === "APPOINTMENT_EMPLOYEE") {
    return {
      ...common, Designation: e.designation?.name ?? "", Joining_Date: joining, Reporting_To: managers, Place_of_Posting: org.address ?? "",
      Casual_Leave: policy ? String(Number(policy.paidLeavesPerMonth) * 12) : "", Sick_Leave: "", Basic_Salary: "", Gross_Salary: salary, Duty: "",
    };
  }
  const mentor = e.reportsTo[0]?.manager;
  return {
    ...common, Training_Position: e.designation?.name ?? "", Start_Date: joining, End_Date: "", Training_Period: "", Stipend: salary,
    Mentor_Name: mentor ? fullName(mentor) : "", Mentor_Designation: mentor?.designation?.name ?? "", Reporting_To: managers,
    Place_of_Training: org.address ?? "", Max_Training_Leave: "", Review_Frequency: "month", Trainee_Notice_Days: "", Training_Area: "",
  };
}

export async function memoDefaults(ctx: AppContext, employeeId: string, format: MemoFormat): Promise<Record<string, string>> {
  const tz = ctx.organization.timezone;
  const today = isoDateInTz(new Date(), tz);
  const [issuer, { signatory }] = await Promise.all([
    ctx.employee ? prisma.employee.findUnique({ where: { id: ctx.employee.id }, select: { designation: { select: { name: true } } } }) : null,
    loadFirm(ctx.organization.id),
  ]);
  const base = {
    Date: today, CC: "",
    Issued_By: nameCase(ctx.user.name),
    Issuer_Designation: ctx.role === "OWNER" ? signatory.designation : issuer?.designation?.name ?? "",
  };
  if (format !== "LATE_ATTENDANCE") return base;

  // Late arrivals / early departures this month, from the attendance register.
  const { start, end } = monthRange(today);
  const [records, policy] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { employeeId, attendanceDate: { gte: start, lte: end } }, orderBy: { attendanceDate: "asc" } }),
    prisma.attendancePolicy.findUnique({ where: { organizationId: ctx.organization.id }, select: { reportingGraceUntil: true, halfDayIfLeavingBefore: true } }),
  ]);
  const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const grace = mins(policy?.reportingGraceUntil ?? "09:45");
  const early = mins(policy?.halfDayIfLeavingBefore ?? "17:30");
  const rows = records.flatMap((r) => {
    const late = r.timeIn && minutesOfDayInTz(r.timeIn, tz) > grace;
    const left = r.timeOut && minutesOfDayInTz(r.timeOut, tz) < early;
    if (!late && !left && r.status !== "ABSENT") return [];
    const remark = [late && "Late arrival", left && "Left early", r.status === "ABSENT" && "Absent"].filter(Boolean).join(", ");
    const [y, m, d] = toIsoDate(r.attendanceDate).split("-");
    return [`${d}-${m}-${y} | ${r.timeIn ? formatTime(r.timeIn, tz) : "—"} | ${r.timeOut ? formatTime(r.timeOut, tz) : "—"} | ${remark}`];
  });
  return { ...base, Month: monthName.format(start), Attendance: rows.join("\n"), Deduction_Days: "" };
}

// ------------------------------------------------------------- validation

type Filled = { values: Record<string, string>; repeat: Record<string, number> };

/** Check the submitted form against the template's fields and turn it into printed values. */
export function prepareFields(fields: FieldSpec[], raw: Record<string, unknown>): Filled {
  const values: Record<string, string> = {};
  const repeat: Record<string, number> = {};
  const errors: string[] = [];
  for (const f of fields) {
    const v = typeof raw[f.key] === "string" ? (raw[f.key] as string).trim() : "";
    if (f.required && !v) {
      errors.push(f.label);
      continue;
    }
    if (v.length > 4000) throw new BusinessRuleError(`${f.label} is too long.`);
    switch (f.type) {
      case "date": {
        if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BusinessRuleError(`${f.label}: enter a valid date.`);
        values[f.key] = v ? longDate.format(new Date(`${v}T00:00:00Z`)) : "";
        break;
      }
      case "money": {
        const n = Number(v.replace(/[,₹\s]/g, ""));
        if (!v || /^n\/?a$/i.test(v)) values[f.key] = "N/A";
        else if (!Number.isFinite(n) || n < 0) throw new BusinessRuleError(`${f.label}: enter an amount or leave it blank for N/A.`);
        else values[f.key] = money.format(n);
        break;
      }
      case "number": {
        if (v && !/^\d+(\.\d+)?$/.test(v)) throw new BusinessRuleError(`${f.label}: enter a number.`);
        values[f.key] = v;
        break;
      }
      case "list": {
        const items = v.split(/\r?\n/).map((x) => x.replace(/^[-•●*\d.)\s]+/, "").trim()).filter(Boolean);
        if (f.required && !items.length) errors.push(f.label);
        items.forEach((item, i) => (values[`${f.key}_${i + 1}`] = item));
        repeat[f.key] = items.length;
        break;
      }
      case "rows": {
        const cols = f.columns ?? [];
        const lines = v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        if (f.required && !lines.length) errors.push(f.label);
        lines.forEach((line, i) => {
          const cells = line.split("|").map((c) => c.trim());
          cols.forEach((c, j) => (values[`${c}_${i + 1}`] = cells[j] || "—"));
        });
        repeat[cols[0]] = lines.length;
        // Kept so the memo can be shown and re-filled as entered.
        values[f.key] = v;
        break;
      }
      default:
        values[f.key] = v;
    }
  }
  if (errors.length) throw new BusinessRuleError(`Fill in: ${errors.join(", ")}.`);
  return { values, repeat };
}

async function nextNumber(organizationId: string, prefix: string, model: "letter" | "memo") {
  const count =
    model === "letter"
      ? await prisma.employeeLetter.count({ where: { organizationId, referenceNo: { startsWith: `${prefix}/` } } })
      : await prisma.employeeMemo.count({ where: { employee: { organizationId }, memoNumber: { startsWith: `${prefix}/` } } });
  return `${prefix}/${String(count + 1).padStart(3, "0")}`;
}

const portalUrl = (id: string) => `${serverEnv().BETTER_AUTH_URL}/app/letters/${id}`;

async function emailDocument(ctx: AppContext, e: Employee, title: string, id: string, file: { name: string; bytes: Uint8Array }, action: string): Promise<MailResult> {
  const to = e.membership?.user.email ?? e.email;
  if (!to) return { status: "SKIPPED", error: "No email address on record." };
  const mail = hrDocumentEmail({ name: nameCase(e.firstName), firm: ctx.organization.tradeName, title, url: portalUrl(id), action });
  return sendMail({
    organizationId: ctx.organization.id, to, template: "staff.hr_document", relatedUserId: e.membership?.userId, ...mail,
    attachments: [{ filename: file.name, content: file.bytes, contentType: DOCX }],
  });
}

// ------------------------------------------------------------- issue

export async function issueLetter(ctx: AppContext, employeeId: string, kind: LetterKind, raw: Record<string, unknown>) {
  const spec = LETTERS[kind];
  const { values, repeat } = prepareFields(spec.fields, raw);
  const [e, firm] = await Promise.all([loadEmployee(ctx.organization.id, employeeId), loadFirm(ctx.organization.id)]);
  if (e.employmentStatus === "EXITED") throw new BusinessRuleError("This person has exited the firm.");
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const letterIso = typeof raw.Date === "string" && raw.Date ? raw.Date : today;
  const referenceNo = await nextNumber(ctx.organization.id, `${spec.refPrefix}/${financialYear(letterIso)}`, "letter");
  values[spec.nameKey] = fullName(e);
  values.Offer_Ref_No = referenceNo;

  const bytes = await fillTemplate({
    template: spec.file, values, repeat, firm: firm.fill,
    signatory: { name: values.Signatory_Name, designation: values.Signatory_Designation },
  });
  const fileName = `${spec.title} - ${fullName(e)}.docx`.replace(/[\\/:*?"<>|]/g, "-");
  const stored = await storeGenerated(ctx, bytes, { area: "employees", ownerId: e.id, fileName, mimeType: DOCX });
  const letter = await prisma.$transaction(async (tx) => {
    const l = await tx.employeeLetter.create({
      data: { organizationId: ctx.organization.id, employeeId: e.id, kind, referenceNo, letterDate: new Date(`${letterIso}T00:00:00Z`), fields: { ...values, _repeat: repeat }, fileId: stored.id, issuedById: ctx.user.id },
    });
    await audit(tx, ctx, "employee.letter_issued", "employee", e.id, { kind, referenceNo });
    await notifyEmployees(tx, ctx.organization.id, [e.id], { type: "employee.letter", title: `Your ${spec.title.toLowerCase()} has been issued`, body: "Read and accept it in the portal.", link: `/app/letters/${l.id}` });
    return l;
  });
  const mail = await emailDocument(ctx, e, spec.title, letter.id, { name: fileName, bytes }, "accept it");
  return { letter, mail };
}

export async function issueMemo(ctx: AppContext, employeeId: string, format: MemoFormat, raw: Record<string, unknown>) {
  const spec = MEMOS[format];
  const { values, repeat } = prepareFields(spec.fields, raw);
  const e = await loadEmployee(ctx.organization.id, employeeId);
  if (e.id === ctx.employee?.id) throw new BusinessRuleError("You cannot issue a memo to yourself.");
  const firm = await loadFirm(ctx.organization.id);
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const memoIso = typeof raw.Date === "string" && raw.Date ? raw.Date : today;
  const memoNumber = await nextNumber(ctx.organization.id, `MEMO/${financialYear(memoIso)}`, "memo");
  Object.assign(values, {
    Memo_No: memoNumber, Employee_Name: fullName(e), Designation: e.designation?.name ?? "—", Department: e.department?.name ?? "—", CC: values.CC || "—",
  });

  const bytes = await fillTemplate({ template: "memo-formats.docx", values, repeat, section: spec.heading, firm: firm.fill });
  const fileName = `Memo ${memoNumber.replaceAll("/", "-")} - ${fullName(e)}.docx`;
  const stored = await storeGenerated(ctx, bytes, { area: "employees", ownerId: e.id, fileName, mimeType: DOCX });
  const replyBy = (format === "GENERAL" ? raw.Action_By_Date : raw.Reply_By_Date) as string | undefined;
  const subject = format === "LATE_ATTENDANCE" ? `Late arrival / attendance – ${values.Month}` : format === "SHOW_CAUSE" ? `Show cause notice – ${values.Subject}` : values.Subject;
  const memo = await prisma.$transaction(async (tx) => {
    const m = await tx.employeeMemo.create({
      data: {
        employeeId: e.id, memoDate: new Date(`${memoIso}T00:00:00Z`), category: spec.category, subject, description: values.Details ?? null,
        actionRequired: values.Action_Required ?? null, replyByDate: replyBy ? new Date(`${replyBy}T00:00:00Z`) : null,
        issuedByEmployeeId: ctx.employee?.id ?? null, memoNumber, fileId: stored.id, fields: { ...values, _repeat: repeat },
      },
    });
    await audit(tx, ctx, "employee.memo_issued", "employee", e.id, { memoNumber, category: spec.category });
    await notifyEmployees(tx, ctx.organization.id, [e.id], { type: "employee.memo", title: `Memo ${memoNumber}: ${subject}`, body: "Read and acknowledge it in the portal.", link: `/app/letters/${m.id}` });
    return m;
  });
  const mail = await emailDocument(ctx, e, "Memo", memo.id, { name: fileName, bytes }, "acknowledge it");
  return { memo, mail };
}

// ------------------------------------------------------------- staff responses

export async function acceptLetter(ctx: AppContext, letterId: string) {
  const l = await prisma.employeeLetter.findFirst({ where: { id: letterId, organizationId: ctx.organization.id } });
  if (!l || l.employeeId !== ctx.employee?.id) throw new BusinessRuleError("Letter not found.");
  if (l.acceptedAt) throw new BusinessRuleError("You have already accepted this letter.");
  const title = LETTERS[l.kind].title;
  await prisma.$transaction(async (tx) => {
    const res = await tx.employeeLetter.updateMany({ where: { id: l.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (res.count !== 1) throw new BusinessRuleError("You have already accepted this letter.");
    if (l.kind === "OFFER_LETTER") {
      await tx.employee.update({ where: { id: l.employeeId }, data: { offerAcceptedOn: new Date(`${isoDateInTz(new Date(), ctx.organization.timezone)}T00:00:00Z`) } });
    }
    await audit(tx, ctx, "employee.letter_accepted", "employee", l.employeeId, { kind: l.kind, referenceNo: l.referenceNo });
    await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN"], { type: "employee.letter_accepted", title: `${nameCase(ctx.user.name)} accepted the ${title.toLowerCase()}`, link: `/app/letters/${l.id}` }, ctx.user.id);
  });
}

export async function acknowledgeMemo(ctx: AppContext, memoId: string, reply: string | undefined) {
  const m = await prisma.employeeMemo.findFirst({ where: { id: memoId, employee: { organizationId: ctx.organization.id } }, include: { issuedBy: { select: { id: true } } } });
  if (!m || m.employeeId !== ctx.employee?.id) throw new BusinessRuleError("Memo not found.");
  if (m.acknowledgedAt) throw new BusinessRuleError("You have already acknowledged this memo.");
  const text = reply?.trim() || null;
  if (m.category === "SHOW_CAUSE" && !text) throw new BusinessRuleError("A show cause memo needs your written explanation.");
  await prisma.$transaction(async (tx) => {
    const res = await tx.employeeMemo.updateMany({ where: { id: m.id, acknowledgedAt: null }, data: { acknowledgedAt: new Date(), employeeReply: text, repliedAt: text ? new Date() : null } });
    if (res.count !== 1) throw new BusinessRuleError("You have already acknowledged this memo.");
    await audit(tx, ctx, "employee.memo_acknowledged", "employee", m.employeeId, { memoNumber: m.memoNumber, replied: !!text });
    const note = { type: "employee.memo_acknowledged", title: `${nameCase(ctx.user.name)} ${text ? "replied to" : "acknowledged"} memo ${m.memoNumber ?? ""}`.trim(), link: `/app/letters/${m.id}` };
    await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN"], note, ctx.user.id);
    if (m.issuedBy) await notifyEmployees(tx, ctx.organization.id, [m.issuedBy.id], note);
  });
}

// ------------------------------------------------------------- reading

/** A letter or memo by id, if the viewer is its recipient or an HR administrator. */
export async function loadHrDocument(ctx: AppContext, id: string, canManage: boolean) {
  const letter = await prisma.employeeLetter.findFirst({
    where: { id, organizationId: ctx.organization.id },
    include: { employee: { select: { id: true, firstName: true, lastName: true } }, issuedBy: { select: { name: true } }, file: { select: { id: true, objectKey: true, originalFileName: true } } },
  });
  if (letter) return canManage || letter.employeeId === ctx.employee?.id ? ({ type: "letter", ...letter } as const) : null;
  const memo = await prisma.employeeMemo.findFirst({
    where: { id, employee: { organizationId: ctx.organization.id } },
    include: { employee: { select: { id: true, firstName: true, lastName: true } }, issuedBy: { select: { firstName: true, lastName: true } }, file: { select: { id: true, objectKey: true, originalFileName: true } } },
  });
  if (memo) return canManage || memo.employeeId === ctx.employee?.id ? ({ type: "memo", ...memo } as const) : null;
  return null;
}

export type HrDocument = NonNullable<Awaited<ReturnType<typeof loadHrDocument>>>;
