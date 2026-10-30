// The firm's HR templates (Master Data pack, sheets 8–10) and the merge fields
// each one needs. Field keys are the template placeholders without braces:
// "Joining_Date" fills {Joining_Date}. Shared by the forms and the generator.

export type LetterKind = "OFFER_LETTER" | "APPOINTMENT_EMPLOYEE" | "APPOINTMENT_TRAINEE";
export type MemoFormat = "GENERAL" | "LATE_ATTENDANCE" | "SHOW_CAUSE";

export type FieldType = "text" | "date" | "money" | "number" | "textarea" | "list" | "rows";

export type FieldSpec = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  /** For "rows": the column placeholders of one repeated table row. */
  columns?: string[];
  /** Half-width field in the form grid. */
  half?: boolean;
};

const RECIPIENT: FieldSpec[] = [
  { key: "Address_Line_1", label: "Address line 1", type: "text", required: true },
  { key: "Address_Line_2", label: "Address line 2", type: "text" },
  { key: "City", label: "City", type: "text", half: true },
  { key: "State", label: "State", type: "text", half: true },
  { key: "PIN", label: "PIN", type: "text", half: true },
];

const SIGNATORY: FieldSpec[] = [
  { key: "Signatory_Name", label: "Signed for the firm by", type: "text", required: true, half: true },
  { key: "Signatory_Designation", label: "Signatory designation", type: "text", required: true, half: true },
];

export const LETTERS: Record<LetterKind, { title: string; file: string; nameKey: string; refPrefix: string; fields: FieldSpec[] }> = {
  OFFER_LETTER: {
    title: "Offer letter",
    file: "offer-letter.docx",
    nameKey: "Candidate_Name",
    refPrefix: "OL",
    fields: [
      { key: "Date", label: "Letter date", type: "date", required: true, half: true },
      { key: "Interview_Date", label: "Interview held on", type: "date", required: true, half: true },
      ...RECIPIENT,
      { key: "Designation", label: "Designation", type: "text", required: true, half: true },
      { key: "Department", label: "Department", type: "text", required: true, half: true },
      { key: "Joining_Date", label: "Date of joining", type: "date", required: true, half: true },
      { key: "Acceptance_By_Date", label: "Confirm acceptance by", type: "date", required: true, half: true },
      { key: "Place_of_Posting", label: "Place of posting", type: "text", required: true },
      { key: "Reporting_To", label: "Reporting to", type: "text", required: true, half: true },
      { key: "Monthly_Salary", label: "Monthly salary (gross, ₹)", type: "money", required: true, half: true },
      { key: "Probation_Period", label: "Probation period", type: "text", required: true, hint: "e.g. 3 months", half: true },
      ...SIGNATORY,
    ],
  },
  APPOINTMENT_EMPLOYEE: {
    title: "Appointment letter – Employee",
    file: "appointment-employee.docx",
    nameKey: "Employee_Name",
    refPrefix: "AL",
    fields: [
      { key: "Date", label: "Letter date", type: "date", required: true, half: true },
      { key: "Salutation", label: "Salutation", type: "text", required: true, hint: "Mr. / Ms.", half: true },
      ...RECIPIENT,
      { key: "Designation", label: "Designation", type: "text", required: true, half: true },
      { key: "Joining_Date", label: "Employment effective from", type: "date", required: true, half: true },
      { key: "Reporting_To", label: "Reporting to", type: "text", required: true, half: true },
      { key: "Place_of_Posting", label: "Place of posting", type: "text", required: true, half: true },
      { key: "Casual_Leave", label: "Casual leave (days)", type: "number", required: true, half: true },
      { key: "Sick_Leave", label: "Paid sick leave (working days)", type: "number", required: true, half: true },
      { key: "Basic_Salary", label: "Basic salary (₹ per month)", type: "money", required: true, half: true, hint: "Schedule I" },
      { key: "HRA", label: "House rent allowance", type: "money", half: true, hint: "Blank = N/A" },
      { key: "Medical_Allowance", label: "Medical allowance", type: "money", half: true },
      { key: "Other_Allowance", label: "Conveyance / other allowance", type: "money", half: true },
      { key: "Incentive", label: "Performance incentive", type: "money", half: true },
      { key: "PF", label: "PF contribution", type: "money", half: true },
      { key: "ESI", label: "ESI contribution", type: "money", half: true },
      { key: "Gross_Salary", label: "Gross salary", type: "money", required: true, half: true },
      { key: "Duty", label: "Duties & responsibilities (Schedule II)", type: "list", required: true, hint: "One duty per line" },
      ...SIGNATORY,
    ],
  },
  APPOINTMENT_TRAINEE: {
    title: "Appointment letter – Trainee",
    file: "appointment-trainee.docx",
    nameKey: "Trainee_Name",
    refPrefix: "TL",
    fields: [
      { key: "Date", label: "Letter date", type: "date", required: true, half: true },
      { key: "Salutation", label: "Salutation", type: "text", required: true, hint: "Mr. / Ms.", half: true },
      ...RECIPIENT,
      { key: "Training_Position", label: "Training position", type: "text", required: true },
      { key: "Start_Date", label: "Training starts", type: "date", required: true, half: true },
      { key: "End_Date", label: "Training ends", type: "date", required: true, half: true },
      { key: "Training_Period", label: "Training period", type: "text", required: true, hint: "e.g. 6 months", half: true },
      { key: "Stipend", label: "Monthly stipend (₹)", type: "money", required: true, half: true },
      { key: "Mentor_Name", label: "Mentor", type: "text", required: true, half: true },
      { key: "Mentor_Designation", label: "Mentor's designation", type: "text", required: true, half: true },
      { key: "Reporting_To", label: "Reporting to", type: "text", required: true, half: true },
      { key: "Place_of_Training", label: "Place of training", type: "text", required: true, half: true },
      { key: "Max_Training_Leave", label: "Leave allowed before extension (days)", type: "number", required: true, half: true },
      { key: "Review_Frequency", label: "Progress reviewed every", type: "text", required: true, hint: "e.g. month", half: true },
      { key: "Trainee_Notice_Days", label: "Notice period (days)", type: "number", required: true, half: true },
      { key: "Training_Area", label: "Areas of training", type: "list", required: true, hint: "One area per line" },
      ...SIGNATORY,
    ],
  },
};

const MEMO_HEAD: FieldSpec[] = [
  { key: "Date", label: "Memo date", type: "date", required: true, half: true },
  { key: "CC", label: "CC", type: "text", half: true, hint: "Blank = —" },
  { key: "Issued_By", label: "From (issued by)", type: "text", required: true, half: true },
  { key: "Issuer_Designation", label: "Issuer's designation", type: "text", required: true, half: true },
];

export const MEMOS: Record<MemoFormat, { title: string; heading: string; category: "GENERAL" | "LATE_ATTENDANCE" | "SHOW_CAUSE"; fields: FieldSpec[] }> = {
  GENERAL: {
    title: "Office memo (general)",
    heading: "FORMAT A",
    category: "GENERAL",
    fields: [
      ...MEMO_HEAD,
      { key: "Subject", label: "Subject", type: "text", required: true },
      { key: "Details", label: "This is to inform you that …", type: "textarea", required: true },
      { key: "Action_Required", label: "You are requested to …", type: "textarea", required: true },
      { key: "Action_By_Date", label: "… by", type: "date", required: true, half: true },
      { key: "Contact_Person", label: "For clarification, contact", type: "text", required: true, half: true },
    ],
  },
  LATE_ATTENDANCE: {
    title: "Memo for late arrival / attendance",
    heading: "FORMAT B",
    category: "LATE_ATTENDANCE",
    fields: [
      ...MEMO_HEAD,
      { key: "Month", label: "Month", type: "text", required: true, hint: "e.g. October 2026", half: true },
      { key: "Deduction_Days", label: "Day(s) adjusted in salary", type: "number", required: true, half: true },
      {
        key: "Attendance",
        label: "Observed attendance",
        type: "rows",
        required: true,
        columns: ["Date", "In", "Out", "Remark"],
        hint: "One day per line: date | in time | out time | remark",
      },
      { key: "Reply_By_Date", label: "Explanation to team lead by", type: "date", required: true, half: true },
    ],
  },
  SHOW_CAUSE: {
    title: "Show cause memo (misconduct)",
    heading: "FORMAT C",
    category: "SHOW_CAUSE",
    fields: [
      ...MEMO_HEAD,
      { key: "Subject", label: "Show cause notice – subject", type: "text", required: true },
      { key: "Incident_Date", label: "Incident date", type: "date", required: true, half: true },
      { key: "Reply_By_Date", label: "Written explanation by", type: "date", required: true, half: true },
      { key: "Details", label: "It has been brought to the notice of the management that on that date, …", type: "textarea", required: true },
      { key: "Policy_or_Clause", label: "This conduct is in violation of …", type: "text", required: true, hint: "e.g. clause 9.2 of your appointment letter" },
    ],
  },
};

export function memoFormatOf(category: string): MemoFormat | null {
  return category === "GENERAL" || category === "LATE_ATTENDANCE" || category === "SHOW_CAUSE" ? category : null;
}
