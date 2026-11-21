import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/config", () => ({ aiConfig: () => ({}) }));

const { parseToolMarkup, stripToolMarkup } = await import("@/lib/ai/deepseek");

// The model sometimes writes a tool call as text in its internal markup; it must run as a real call
// and never be shown to the user (AI assistant feedback, 21 Nov 2026).
describe("tool calls written as text", () => {
  const fullWidth = 'Here are the clients.\n<｜DSML｜function_calls>\n<｜DSML｜invoke name="query_database">\n<｜DSML｜parameter name="model" string="true">Client</｜DSML｜parameter>\n<｜DSML｜parameter name="args" string="false">{"take":300}</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜function_calls>';
  const spaced = '< | DSML | | tool_calls>\n< | DSML | | invoke name="query_database">\n< | DSML | | parameter name="operation" string="true">findMany</ | DSML | | parameter>\n</ | DSML | | invoke>';
  it("strips the markup from the text", () => {
    expect(stripToolMarkup(fullWidth)).toBe("Here are the clients.");
    expect(stripToolMarkup(spaced)).toBe("");
    expect(stripToolMarkup("a < b and <b>bold</b>")).toBe("a < b and <b>bold</b>");
  });
  it("turns it into real tool calls with typed arguments", () => {
    const [c] = parseToolMarkup(fullWidth);
    expect(c.function.name).toBe("query_database");
    expect(JSON.parse(c.function.arguments)).toEqual({ model: "Client", args: { take: 300 } });
    expect(JSON.parse(parseToolMarkup(spaced)[0].function.arguments)).toEqual({ operation: "findMany" });
  });
});
