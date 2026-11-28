import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readResume } from "@/lib/careers/resume-text";
import { collapseLetterSpacing, findEmails, findPhone, guessName, isEmailShape, nameLike } from "@/lib/careers/email-extract";
import { classify, labelledDetails, messageIdsIn, normalizeMessageId, refInSubject, replyBody, supportedBy } from "@/lib/careers/reply-parse";
import { firmDisplayName, resumeAckEmail } from "@/lib/careers/mail";

// Careers (28 Nov 2026). The rule that matters: an address the system presents as found in the resume
// must be exactly the candidate's. A reading the file's text made uncertain may be offered, but only
// marked for the uploader to check — never as found.

const DIR = "tests/fixtures/resumes";
const expected: { file: string; email: string; name: string }[] = JSON.parse(readFileSync(`${DIR}/expected.json`, "utf8"));
const mimeOf = (f: string) => (f.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
/** Layouts where text extraction damages the address: the right one must be offered, flagged for checking. */
const NEEDS_CHECK = new Set(["04-glued-next-word.pdf", "06-letter-spacing.pdf", "08-email-wraps-line.pdf", "14-wrap-valid-tld.pdf"]);
const trusted = (c: { sources: string[] }) => c.sources.includes("text") || c.sources.includes("link");

describe("email address from real resume files (PDF and Word)", () => {
  for (const e of expected) {
    it(e.file, async () => {
      const r = await readResume(new Uint8Array(readFileSync(`${DIR}/${e.file}`)), mimeOf(e.file));
      const found = findEmails(r.text, r.links, guessName(r.lines));
      const want = e.email.toLowerCase();
      const hit = found.find((c) => c.email.toLowerCase() === want);
      expect(hit, `expected ${e.email} among ${found.map((c) => c.email).join(", ")}`).toBeTruthy();
      // No other address is ever presented as the candidate's own.
      for (const c of found) {
        if (c.email.toLowerCase() === want) continue;
        expect(!trusted(c) || c.inReferences || c.roleAddress, `${c.email} was offered as trusted`).toBe(true);
      }
      if (NEEDS_CHECK.has(e.file)) {
        expect(trusted(hit!)).toBe(false);
      } else {
        expect(trusted(hit!)).toBe(true);
        expect(found[0].email.toLowerCase()).toBe(want);
      }
    });
  }

  it("finds the name on most resumes, and never a heading", async () => {
    let named = 0;
    for (const e of expected) {
      const r = await readResume(new Uint8Array(readFileSync(`${DIR}/${e.file}`)), mimeOf(e.file));
      const n = guessName(r.lines);
      if (n) { expect(n).toBe(e.name); named++; }
    }
    expect(named).toBeGreaterThanOrEqual(expected.length - 3);
  });
});

describe("email extraction rules", () => {
  it("takes the whole address, including apostrophes and plus tags", () => {
    expect(findEmails("Mail: harsh.o'neil+jobs@gmail.com")[0].email).toBe("harsh.o'neil+jobs@gmail.com");
  });
  it("never reads a sentence end or a following word into the domain", () => {
    expect(findEmails("Write to john@gmail.com. Thanks")[0].email).toBe("john@gmail.com");
    const glued = findEmails("john@gmail.comLinkedIn");
    expect(glued[0].email).toBe("john@gmail.com");
    expect(glued[0].sources).toEqual(["repaired"]);
    expect(findEmails("john@gmail.comwww.linkedin.com/in/john")[0].email).toBe("john@gmail.com");
  });
  it("strips a label glued in front, but flags it", () => {
    const c = findEmails("Emailjohn.doe@gmail.com")[0];
    expect(c.email).toBe("john.doe@gmail.com");
    expect(trusted(c)).toBe(false);
  });
  it("does not trust a match that a rarer character may have cut short", () => {
    expect(trusted(findEmails("a&b@company.com")[0])).toBe(false);
  });
  it("prefers the mailto link and the address near the top, and marks referees and company mailboxes", () => {
    const text = "Ravi Kumar\nravi.k@gmail.com\nExperience\n...\nReferences\nMr Rao, rao@firm.in\nhr@company.com";
    const found = findEmails(text, ["mailto:ravi.k@gmail.com"], "Ravi Kumar");
    expect(found[0].email).toBe("ravi.k@gmail.com");
    expect(found[0].sources).toEqual(["link", "text"]);
    expect(found.find((c) => c.email === "rao@firm.in")!.inReferences).toBe(true);
    expect(found.find((c) => c.email === "hr@company.com")!.roleAddress).toBe(true);
  });
  it("suggests the common fix for a misspelt provider, without changing the address", () => {
    const c = findEmails("ravi@gmial.com")[0];
    expect(c.email).toBe("ravi@gmial.com");
    expect(c.suggestion).toBe("ravi@gmail.com");
  });
  it("joins an address that the extraction spaced out, only when nothing else is found", () => {
    expect(collapseLetterSpacing("v i k a s @ g m a i l . c o m")).toBe("vikas@gmail.com");
    expect(findEmails("john @ gmail.com")[0]).toMatchObject({ email: "john@gmail.com", sources: ["repaired"] });
  });
  it("does not treat the lines around an address as part of it", () => {
    for (const above of ["Contact", "+91 98765 43210", "Email", "Skills", "Delhi"]) {
      const f = findEmails(`${above}\nmeera.iyer@gmail.com\nlinkedin.com/in/meera`);
      expect(f.map((c) => c.email)).toEqual(["meera.iyer@gmail.com"]);
      expect(trusted(f[0])).toBe(true);
    }
  });
  it("checks typed addresses", () => {
    expect(isEmailShape("a.b@c.co.in")).toBe(true);
    for (const bad of ["a..b@c.com", "a@b", "@b.com", "a b@c.com", "a@b.c"]) expect(isEmailShape(bad)).toBe(false);
  });
  it("reads names and Indian mobile numbers", () => {
    expect(nameLike("NAME: MOHIT KUMAR")).toBe("Mohit Kumar");
    expect(nameLike("Ritika Chauhan (रितिका चौहान)")).toBe("Ritika Chauhan");
    expect(nameLike("Curriculum Vitae")).toBeNull();
    expect(findPhone("Ph: +91 98765 43210")).toBe("+919876543210");
    expect(findPhone("Mobile 09876543210")).toBe("+919876543210");
    expect(findPhone("Batch 2019-2023, roll 12345")).toBeNull();
  });
});

describe("3,000 generated resumes", () => {
  // Deterministic pseudo-random, so a failure can be reproduced.
  let seed = 20261128;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const firsts = ["priyanshu", "neha", "rahul", "ankit", "sonal", "o'neil", "chandrashekhar", "md", "k", "ritika", "vikas", "aarav", "zoya"];
  const lasts = ["sharma", "verma", "mehta", "gupta", "jain", "venkataraman", "iyer", "khan", "singh", "das"];
  const domains = ["gmail.com", "yahoo.co.in", "outlook.com", "rediffmail.com", "icloud.com", "ssdimri.co.in", "hotmail.com", "proton.me", "company-name.in", "mail.example.org"];
  const seps = [".", "_", "-", "", "+jobs."];
  const before = ["Email: ", "E-mail - ", "Mail ID: ", "✉ ", "| ", "", "Contact: ", "(", "<", "Email id :- ", "• "];
  const after = ["", " | +91 98765 43210", ")", ">", ", New Delhi", ".", " · LinkedIn", "\nPhone: 9876543210", " ;", "\nlinkedin.com/in/x"];
  it("finds exactly the candidate's address in every one", () => {
    for (let i = 0; i < 3000; i++) {
      const local = `${pick(firsts)}${pick(seps)}${pick(lasts)}${rnd() < 0.3 ? Math.floor(rnd() * 999) : ""}`.replace(/^[.'_+-]+|[.'_+-]+$/g, "");
      const email = `${rnd() < 0.15 ? local.toUpperCase() : local}@${pick(domains)}`;
      const name = "Test Candidate";
      const text = [rnd() < 0.5 ? "CURRICULUM VITAE" : "", name, `${pick(before)}${email}${pick(after)}`, "Objective", "To work in a CA firm.", "Experience", "Audit assistant 2022–2025."].filter(Boolean).join("\n");
      const found = findEmails(text);
      expect(found.length, text).toBe(1);
      expect(found[0].email.toLowerCase(), text).toBe(email.toLowerCase());
      expect(trusted(found[0]), text).toBe(true);
    }
  });
});

describe("reading the candidate's reply", () => {
  const quoted = `Hi,

Current/Last Drawn CTC: 4.2 LPA
Expected CTC - 6 LPA
Notice Period / Earliest Joining Date: 30 days
Preferred Time Slots for an Interview: weekdays after 4 pm
Current Location: Noida

Thanks,
Priya

On Fri, 28 Nov 2026 at 18:00, S S Dimri & Associates <careers@example.com> wrote:
> Current/Last Drawn CTC
> Expected CTC
> Current Location`;

  it("takes the answers, never the quoted questions", () => {
    expect(labelledDetails(quoted)).toEqual({ currentCtc: "4.2 LPA", expectedCtc: "6 LPA", noticePeriod: "30 days", interviewSlots: "weekdays after 4 pm", currentLocation: "Noida" });
    expect(replyBody(quoted)).not.toContain("wrote:");
    expect(labelledDetails("Thanks!\n\nOn Fri, 28 Nov 2026, X wrote:\n> Current/Last Drawn CTC\n> Expected CTC")).toEqual({});
  });
  it("reads answers typed under the quoted questions, and bare numbers as written", () => {
    expect(labelledDetails("> Expected CTC\n50000\n> Current Location\nGurgaon")).toEqual({ expectedCtc: "50000", currentLocation: "Gurgaon" });
    expect(labelledDetails("Expected CTC 6 LPA")).toEqual({ expectedCtc: "6 LPA" });
  });
  it("keeps only AI values that the reply itself supports", () => {
    expect(supportedBy("4.2 LPA", "I am at 4.2 lpa right now")).toBe(true);
    expect(supportedBy("6 LPA", "I expect around 7")).toBe(false);
    expect(supportedBy("Mumbai", "I live in Noida")).toBe(false);
  });
  it("tells replies, out-of-office answers and bounces apart", () => {
    expect(classify({ from: "a@b.com", subject: "Re: Thank you", headers: {} })).toBe("REPLY");
    expect(classify({ from: "a@b.com", subject: "Automatic reply: Thank you", headers: {} })).toBe("AUTO_REPLY");
    expect(classify({ from: "a@b.com", subject: "x", headers: { "auto-submitted": "auto-replied" } })).toBe("AUTO_REPLY");
    expect(classify({ from: "mailer-daemon@googlemail.com", subject: "Delivery Status Notification (Failure)", headers: {} })).toBe("BOUNCE");
  });
  it("matches thread headers and the reference in the subject", () => {
    expect(normalizeMessageId("<Careers.CV-ABC123.ff@Example.com>")).toBe("careers.cv-abc123.ff@example.com");
    expect(messageIdsIn("<a@x> <b@y>")).toEqual(["a@x", "b@y"]);
    expect(refInSubject("Re: Thank you for sharing your resume – Firm [Ref CV-7KQ2MX]")).toBe("CV-7KQ2MX");
  });
});

describe("the email to the candidate", () => {
  it("uses the client's wording with the firm's name", () => {
    expect(firmDisplayName("S S DIMRI & ASSOCIATES")).toBe("S S Dimri & Associates");
    const m = resumeAckEmail({ name: "Priyanshu Sharma", firm: "S S Dimri & Associates", ref: "CV-7KQ2MX" });
    expect(m.text.startsWith("Dear Priyanshu Sharma,\n\nGreetings from S S Dimri & Associates Recruitment Team!")).toBe(true);
    for (const line of ["Current/Last Drawn CTC", "Expected CTC", "Notice Period / Earliest Joining Date", "Preferred Time Slots for an Interview", "Current Location"]) expect(m.text).toContain(line);
    expect(m.text.trimEnd().endsWith("Best regards,\nS S Dimri & Associates Recruitment Team")).toBe(true);
    expect(m.subject).toContain("[Ref CV-7KQ2MX]");
  });
});
