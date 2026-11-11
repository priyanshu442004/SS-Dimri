import { describe, expect, it } from "vitest";
import { cleanReply, extractReply } from "@/lib/ai-reply";

describe("AI webhook replies", () => {
  it("reads the common n8n shapes", () => {
    expect(extractReply(JSON.stringify({ output: "Hi **there**" }))).toBe("Hi **there**");
    expect(extractReply(JSON.stringify([{ output: "From an array" }]))).toBe("From an array");
    expect(extractReply(JSON.stringify({ text: "Report" }))).toBe("Report");
    expect(extractReply(JSON.stringify({ data: { response: "Nested" } }))).toBe("Nested");
    expect(extractReply(JSON.stringify({ choices: [{ message: { content: "OpenAI style" } }] }))).toBe("OpenAI style");
    expect(extractReply(JSON.stringify("A bare string"))).toBe("A bare string");
    expect(extractReply("Plain text answer")).toBe("Plain text answer");
    expect(extractReply("")).toBe("");
  });

  it("cleans escaped newlines, wrapping fences and blank runs", () => {
    expect(cleanReply("Line one\nLine two")).toBe("Line one\nLine two");
    expect(cleanReply("```markdown\n# Title\n\nBody\n```")).toBe("# Title\n\nBody");
    expect(cleanReply("a\r\n\r\n\r\n\r\nb")).toBe("a\n\nb");
  });

  it("turns HTML into readable text", () => {
    expect(extractReply("<p>Hello <strong>team</strong></p><ul><li>One</li><li>Two</li></ul>")).toContain("**team**");
    expect(extractReply("<p>Hello</p><ul><li>One</li></ul>")).toContain("- One");
  });

  it("passes a raw Markdown body through intact", () => {
    const md = "# Report\n\n- **12** overdue\n\n| A | B |\n|---|---|\n| 1 | 2 |";
    expect(extractReply(md)).toBe(md);
    expect(extractReply(JSON.stringify({ output: md }))).toBe(md);
  });

  it("shows unknown JSON instead of nothing", () => {
    expect(extractReply(JSON.stringify({ foo: 1 }))).toContain('"foo": 1');
  });
});
