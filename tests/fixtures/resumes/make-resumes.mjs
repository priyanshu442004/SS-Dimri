// Builds the sample resumes used by tests/careers.test.ts: PDFs printed by Chromium from the HTML
// below (layouts that trip up text extraction: two columns, icons, links, an address split over
// elements or glued to the next word, a References section, letter spacing, a multi-page file)
// and Word files assembled by hand (runs, headers, hyperlinks, text boxes).
// Run: node tests/fixtures/resumes/make-resumes.mjs   (writes the files next to this script)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";

const dir = path.dirname(fileURLToPath(import.meta.url));
const css = `body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;margin:28px;color:#222} h1{font-size:26pt;margin:0} h2{font-size:13pt;border-bottom:1px solid #999;margin-top:18px} .muted{color:#555}`;

/** [file, expected email, expected name, html body] */
const pdfs = [
  ["01-simple.pdf", "priyanshu.sharma@gmail.com", "Priyanshu Sharma",
    `<h1>Priyanshu Sharma</h1><p>+91 98765 43210 · priyanshu.sharma@gmail.com · New Delhi</p><h2>Experience</h2><p>Article assistant at a CA firm, 2023–2025. GST returns, TDS, audit support.</p><h2>Education</h2><p>B.Com (Hons), Delhi University</p>`],
  ["02-mailto-only.pdf", "neha.verma91@yahoo.co.in", "Neha Verma",
    `<h1>Neha Verma</h1><p><a href="mailto:neha.verma91@yahoo.co.in">Email me</a> | <a href="https://linkedin.com/in/nehav">LinkedIn</a> | 9811122233</p><h2>Summary</h2><p>Accounts executive with 4 years in Tally and Zoho Books.</p>`],
  ["03-two-column-split.pdf", "rahul_k.mehta@outlook.com", "Rahul Mehta",
    `<div style="display:flex;gap:30px"><div style="width:180px;background:#eef;padding:10px"><p><b>Contact</b></p><p><span>rahul_k.mehta</span><span>@outlook.com</span></p><p>+91-9999888877</p><p>Skills: Excel, Tally, GST</p></div><div><h1>Rahul Mehta</h1><p class="muted">Senior Accountant</p><h2>Experience</h2><p>Finance team, ABC Pvt Ltd 2019–2025.</p></div></div>`],
  ["04-glued-next-word.pdf", "ankit.gupta@gmail.com", "Ankit Gupta",
    `<h1>ANKIT GUPTA</h1><p><span>ankit.gupta@gmail.com</span><span>LinkedIn</span><span> | </span><span>Phone</span><span>7011223344</span></p><h2>Objective</h2><p>To work as an audit assistant.</p>`],
  ["05-references.pdf", "sonal.jain@rediffmail.com", "Sonal Jain",
    `<h1>Sonal Jain</h1><p>sonal.jain@rediffmail.com | 8800776655</p><h2>Experience</h2><p>Tax associate, 3 years.</p><h2>References</h2><p>Mr. R. K. Arora, Partner, Arora &amp; Co — rk.arora@aroraco.in</p><p>Ms. P. Singh, Manager — psingh@xyzltd.com</p>`],
  ["06-letter-spacing.pdf", "vikas.yadav@gmail.com", "Vikas Yadav",
    `<h1 style="letter-spacing:4px">Vikas Yadav</h1><p style="letter-spacing:1.5px">vikas.yadav@gmail.com</p><p>+91 9123456780</p><h2>Skills</h2><p>Payroll, PF, ESI.</p>`],
  ["07-icons-table.pdf", "Deepak.Rawat@Hotmail.com", "Deepak Rawat",
    `<h1>Deepak Rawat</h1><table style="border-collapse:collapse"><tr><td style="padding:2px 6px">✉</td><td>E-mail:</td><td>Deepak.Rawat@Hotmail.com</td></tr><tr><td style="padding:2px 6px">☎</td><td>Mobile:</td><td>98100 12345</td></tr></table><h2>Experience</h2><p>Audit executive.</p>`],
  ["08-email-wraps-line.pdf", "chandrashekhar.venkataraman.ca@gmail.com", "Chandrashekhar Venkataraman",
    `<h1 style="font-size:20pt">Chandrashekhar Venkataraman</h1><div style="width:130px;word-break:break-all;font-size:10pt">chandrashekhar.venkataraman.ca@gmail.com</div><p>9988776655</p><h2>Profile</h2><p>Chartered Accountant.</p>`],
  ["09-name-label-caps.pdf", "mohit.k@ssdimri-example.in", "Mohit Kumar",
    `<p style="font-size:10pt">CURRICULUM VITAE</p><p>NAME: MOHIT KUMAR</p><p>EMAIL ID: mohit.k@ssdimri-example.in</p><p>MOBILE NO.: 9711000222</p><h2>Educational Qualification</h2><p>12th, CBSE</p>`],
  ["10-multipage-footer.pdf", "kavya.nair@icloud.com", "Kavya Nair",
    `<h1>Kavya Nair</h1><p class="muted">Bookkeeper · Bengaluru</p>${"<h2>Experience</h2><p>Bookkeeping for small businesses, bank reconciliation, ledger scrutiny, GST filing support.</p>".repeat(14)}<p style="margin-top:30px">Contact: kavya.nair@icloud.com · +91 90000 11122</p>`],
  ["11-company-and-own.pdf", "arjun.malhotra@gmail.com", "Arjun Malhotra",
    `<h1>Arjun Malhotra</h1><p>arjun.malhotra@gmail.com · 9876501234</p><h2>Experience</h2><p>Worked at Infosys @ Pune. Escalations went to hr@infosys-example.com.</p>`],
  ["12-unicode-name.pdf", "ritika.chauhan@gmail.com", "Ritika Chauhan",
    `<h1>Ritika Chauhan <span style="font-size:14pt">(रितिका चौहान)</span></h1><p>Email – ritika.chauhan@gmail.com, Ph – 9654321098</p><h2>Skills</h2><p>Hindi, English typing.</p>`],
  // Contact block one item per line: the lines around the address must not be read as part of it.
  ["13-contact-block.pdf", "meera.iyer@gmail.com", "Meera Iyer",
    `<h1>Meera Iyer</h1><p>Contact<br>+91 98765 43210<br>meera.iyer@gmail.com<br>linkedin.com/in/meera-iyer<br>Delhi</p><h2>Experience</h2><p>Junior accountant.</p>`],
  // Broken after "gmail.co": the first line alone is a valid-looking but wrong address. Both
  // readings must be offered and neither trusted (expected = the true address, flagged).
  ["14-wrap-valid-tld.pdf", "anshul.tiwari@gmail.com", "Anshul Tiwari",
    `<h1>Anshul Tiwari</h1><p>anshul.tiwari@gmail.co<br>m</p><p>9811000111</p><h2>Skills</h2><p>Tally.</p>`],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, , , body] of pdfs) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
  writeFileSync(path.join(dir, file), await page.pdf({ format: "A4", printBackground: true }));
}
await browser.close();

// ---------------------------------------------------------------- Word files

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const para = (...runs) => `<w:p>${runs.map((r) => `<w:r><w:t xml:space="preserve">${r}</w:t></w:r>`).join("")}</w:p>`;
const ct = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const rootRels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
function docx(bodyXml, extra = {}) {
  return zipSync({
    "[Content_Types].xml": strToU8(ct),
    "_rels/.rels": strToU8(rootRels),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${bodyXml}</w:body></w:document>`),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, strToU8(v)])),
  });
}

const docs = [
  // Address split over three runs (Word does this after spell-check or formatting changes).
  ["21-runs.docx", "sneha.bhatia@gmail.com", "Sneha Bhatia", docx(para("Sneha Bhatia") + para("Email: ", "sneha.", "bhatia", "@gmail.com", " | Mobile: 98111 22334") + para("Experience") + para("GST and TDS returns."))],
  // Contact details only in the page header.
  ["22-header.docx", "amit.saxena@outlook.com", "Amit Saxena", docx(para("Amit Saxena") + para("Objective") + para("Audit assistant."), {
    "word/header1.xml": `<?xml version="1.0" encoding="UTF-8"?><w:hdr ${W}>${para("amit.saxena@outlook.com · 9810098100")}</w:hdr>`,
  })],
  // Link text only; the address is the hyperlink's target.
  ["23-hyperlink.docx", "pooja.rana@yahoo.com", "Pooja Rana", docx(para("Pooja Rana") + `<w:p><w:hyperlink r:id="rId9"><w:r><w:t>Write to me</w:t></w:r></w:hyperlink></w:p>` + para("Skills") + para("Tally Prime."), {
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="mailto:pooja.rana@yahoo.com" TargetMode="External"/></Relationships>`,
  })],
  // A text box (stored twice: Word's version and a fallback copy) and XML entities.
  ["24-textbox.docx", "harsh.o'neil@gmail.com", "Harsh Oneil", docx(para("Harsh Oneil") + `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:txbxContent>${para("harsh.o&apos;neil@gmail.com")}</w:txbxContent></mc:Choice><mc:Fallback><w:txbxContent>${para("harsh.o&apos;neil@gmail.com")}</w:txbxContent></mc:Fallback></mc:AlternateContent></w:r></w:p>` + para("Experience") + para("Accounts."))],
];
for (const [file, , , data] of docs) writeFileSync(path.join(dir, file), data);

writeFileSync(path.join(dir, "expected.json"), JSON.stringify([...pdfs, ...docs].map(([file, email, name]) => ({ file, email, name })), null, 2) + "\n");
console.log(`Wrote ${pdfs.length} PDFs and ${docs.length} Word files to ${dir}`);
