// "Chat with your processed documents" — shared Express routes for product backends.
// Each run folder gets a chat.json; answers stream from DeepSeek over SSE and are
// grounded in the run's processed output + its original inputs (built by `context`).
//
//   mountChat(app, { stream, runDir, context, suggestions, assistant, product, limiter })
//
//   GET  /api/chat/suggestions          → { suggestions }
//   GET  /api/runs/:id/chat             → { messages }
//   POST /api/runs/:id/chat {message}   → text/event-stream of {delta} … {done}
//   POST /api/runs/:id/chat/reset       → { ok }
//   GET  /api/runs/:id/transcript       → Markdown download
import fs from "fs";
import path from "path";

const MAX_HISTORY = 16; // previous messages sent for follow-up context
const MAX_CONTEXT = 120_000; // characters of document context per request

const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };

export function mountChat(app, { stream, runDir, context, suggestions = [], assistant = "AI assistant", product = "", limiter }) {
  const mw = limiter ? [limiter] : [];
  const contextCache = new Map(); // run id -> { mtime, text }

  /** Run folder for :id, or null when it doesn't exist / isn't processed yet. */
  const dirFor = (id) => {
    const dir = runDir(id);
    return dir && fs.existsSync(path.join(dir, "meta.json")) ? dir : null;
  };

  async function systemPrompt(id, dir) {
    const stamp = fs.statSync(path.join(dir, "meta.json")).mtimeMs;
    let hit = contextCache.get(id);
    if (!hit || hit.stamp !== stamp) {
      const { title, documents } = await context(dir);
      let text = documents;
      if (text.length > MAX_CONTEXT) text = `${text.slice(0, MAX_CONTEXT)}\n…[context truncated]`;
      hit = { stamp, title, text };
      contextCache.set(id, hit);
    }
    return `You are "${assistant}", the AI assistant inside ${product}, used by a firm of Chartered Accountants (Agarwal & Saxena).
You answer questions about ONE processed job: ${hit.title}. Everything you know about it is in the DOCUMENTS section below —
the system's processed output (already validated, deterministic) and the source documents the user uploaded.

HOW TO ANSWER
- Ground every figure in the documents. Name where it came from briefly, e.g. (bank statement, row BS-0019) or (invoice INV-260401).
- Never invent, round away or recompute figures that the processed output already states; quote them. Show short working only when you derive something new (a sum, a difference, a share).
- Indian conventions: ₹ with Indian digit grouping (₹1,86,500.00), dates as DD-MM-YYYY.
- You may use general accounting / Indian tax knowledge (Ind AS, GST, TDS, Companies Act) to explain — say when something is general guidance rather than from these documents.
- If the documents don't contain the answer, say so plainly and say what data would answer it.
- Stay on accounting, tax, finance and this job. Politely decline unrelated topics.

STYLE
- Lead with the answer in one sentence, then support it. Usually 60–180 words unless the user asks for detail.
- Markdown that fits: bullets for lists, a small table for comparisons or item lists, **bold** for the key figure, ### headings only for multi-part answers. No filler.

DOCUMENTS
${hit.text}`;
  }

  app.get("/api/chat/suggestions", (_req, res) => res.json({ suggestions }));

  app.get("/api/runs/:id/chat", (req, res) => {
    const dir = dirFor(req.params.id);
    if (!dir) return res.status(404).json({ error: "Not found" });
    res.json({ messages: readJson(path.join(dir, "chat.json"), []) });
  });

  app.post("/api/runs/:id/chat/reset", ...mw, (req, res) => {
    const dir = dirFor(req.params.id);
    if (!dir) return res.status(404).json({ error: "Not found" });
    fs.writeFileSync(path.join(dir, "chat.json"), "[]");
    res.json({ ok: true });
  });

  app.post("/api/runs/:id/chat", ...mw, async (req, res) => {
    const dir = dirFor(req.params.id);
    if (!dir) return res.status(404).json({ error: "Not found" });
    const question = String(req.body?.message || "").trim().slice(0, 2000);
    if (!question) return res.status(400).json({ error: "Empty message" });

    let system;
    try { system = await systemPrompt(req.params.id, dir); }
    catch (e) { console.error("chat context:", e); return res.status(500).json({ error: "Could not read this job's documents." }); }
    const chatPath = path.join(dir, "chat.json");
    const history = readJson(chatPath, []);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no"); // nginx: don't buffer the stream
    res.flushHeaders();
    const ctrl = new AbortController();
    res.on("close", () => ctrl.abort());

    let full = "";
    try {
      const messages = [
        { role: "system", content: system },
        ...history.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: question },
      ];
      for await (const delta of stream(messages, { maxTokens: 1200, temperature: 0.2, signal: ctrl.signal })) {
        full += delta;
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
      const at = new Date().toISOString();
      history.push({ role: "user", content: question, at }, { role: "assistant", content: full, at });
      fs.writeFileSync(chatPath, JSON.stringify(history, null, 1));
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (e) {
      if (!ctrl.signal.aborted) {
        console.error("chat:", e.message);
        res.write(`data: ${JSON.stringify({ error: "The assistant is unavailable right now. Please try again." })}\n\n`);
      }
    }
    res.end();
  });

  app.get("/api/runs/:id/transcript", (req, res) => {
    const dir = dirFor(req.params.id);
    if (!dir) return res.status(404).end();
    const chat = readJson(path.join(dir, "chat.json"), []);
    const md = [`# ${product} — chat transcript`, `Exported ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, "",
      ...chat.map((m) => `## ${m.role === "user" ? "You" : assistant}\n\n${m.content}\n`)].join("\n");
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="chat_${req.params.id}.md"`);
    res.send(md);
  });
}
