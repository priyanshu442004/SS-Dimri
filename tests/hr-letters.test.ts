import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { fillTemplate, renderDocxHtml } from "@/lib/hr-letters/docx";
import { plainText, topLevelElements } from "@/lib/hr-letters/xml";
import { LETTERS, MEMOS } from "@/lib/hr-letters/specs";

const docText = (bytes: Uint8Array) => {
  const xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
  const body = xml.slice(xml.indexOf("<w:body>") + 8, xml.lastIndexOf("<w:sectPr"));
  return { xml, paras: topLevelElements(body).map(plainText) };
};

describe("HR letter templates", () => {
  it("fills the offer letter, keeps the template design and drops blank address lines", async () => {
    const bytes = await fillTemplate({
      template: LETTERS.OFFER_LETTER.file,
      values: { Offer_Ref_No: "OL/2026-27/001", Date: "30 October 2026", Candidate_Name: "Asha Verma", Address_Line_1: "12 Karol Bagh", Address_Line_2: "", City: "", State: "", PIN: "", Designation: "Accounts Executive", Monthly_Salary: "25,000" },
      firm: null,
      signatory: { name: "Sunil Dimri", designation: "Proprietor" },
    });
    const { xml, paras } = docText(bytes);
    expect(xml).not.toMatch(/\{[A-Za-z_]+\}/);
    expect(xml).not.toContain("C00000"); // filled values lose the template's red marker
    expect(paras).toContain("Ref. No.: OL/2026-27/001");
    expect(paras).toContain("Subject: Offer of employment for the post of Accounts Executive");
    expect(paras.filter((p) => p.trim() === ", –")).toHaveLength(0);
    expect(paras.join(" ")).toContain("Monthly Salary (Gross)₹ 25,000/- per month");
    const unzipped = unzipSync(bytes);
    expect(strFromU8(unzipped["word/header1.xml"])).toContain("S S DIMRI &amp; ASSOCIATES");
  });

  it("repeats duty lines and removes the template's example guidance", async () => {
    const bytes = await fillTemplate({
      template: LETTERS.APPOINTMENT_EMPLOYEE.file,
      values: { Duty_1: "Accounting", Duty_2: "Billing", Duty_3: "Follow-up" },
      repeat: { Duty: 3 },
      firm: null,
    });
    const { paras } = docText(bytes);
    expect(paras).toEqual(expect.arrayContaining(["Accounting", "Billing", "Follow-up"]));
    expect(paras.some((p) => p.startsWith("Example"))).toBe(false);
  });

  it("cuts one memo format and repeats every column of the attendance rows", async () => {
    const values: Record<string, string> = { Memo_No: "MEMO/2026-27/004", Month: "October 2026" };
    ["03-10", "09-10"].forEach((d, i) => Object.assign(values, { [`Date_${i + 1}`]: d, [`In_${i + 1}`]: `10:0${i}`, [`Out_${i + 1}`]: "18:30", [`Remark_${i + 1}`]: "Late" }));
    const bytes = await fillTemplate({ template: "memo-formats.docx", values, repeat: { Date: 2 }, section: MEMOS.LATE_ATTENDANCE.heading, firm: null });
    const { xml, paras } = docText(bytes);
    expect(paras[0]).toBe("MEMO FOR LATE ARRIVAL / ATTENDANCE");
    expect(xml).not.toContain("SHOW CAUSE");
    expect(xml).not.toContain("OFFICE MEMO (GENERAL)");
    expect(xml).toContain("10:00");
    expect(xml).toContain("10:01");
    expect(xml).not.toContain("{");
  });

  it("puts another firm's own name and letterhead on the letter", async () => {
    const bytes = await fillTemplate({
      template: LETTERS.OFFER_LETTER.file,
      values: {},
      firm: { name: "Gupta & Co", letterhead: { name: "Gupta & Co", address: "1 Main Road, Pune", contact: "Email: office@gupta.example" } },
      signatory: { name: "Ravi Gupta", designation: "Partner" },
    });
    const files = unzipSync(bytes);
    const header = strFromU8(files["word/header1.xml"]);
    const doc = strFromU8(files["word/document.xml"]);
    expect(header).toContain("GUPTA &amp; CO");
    expect(header).toContain("1 Main Road, Pune");
    expect(header).not.toContain("DIMRI");
    expect(doc).not.toContain("Dimri");
    expect(doc).toContain(">Ravi Gupta</w:t>");
  });

  it("renders the filled letter to HTML with the letterhead, tables and lists", async () => {
    const bytes = await fillTemplate({ template: LETTERS.OFFER_LETTER.file, values: { Candidate_Name: "Asha <Verma>" }, firm: null });
    const r = renderDocxHtml(bytes);
    expect(r.header).toContain("color:#1F4E78");
    expect(r.pages.join("")).toContain("Asha &lt;Verma&gt;");
    expect(r.pages.join("")).toContain("background:#D9E1F2");
    expect(r.pages.join("")).toMatch(/>1\.<\/span>/); // numbered terms
    expect(r.pages.join("")).toContain(">•</span>"); // bulleted documents list
  });
});
