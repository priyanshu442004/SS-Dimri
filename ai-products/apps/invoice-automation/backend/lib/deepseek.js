// Minimal DeepSeek client (OpenAI-compatible chat-completions API).
const BASE = () => process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const MODEL = () => process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

function headers() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set");
  return { Authorization: `Bearer ${key.trim()}`, "Content-Type": "application/json" };
}

/** One-shot completion. With json:true the model must return a JSON object. */
export async function complete(messages, { json = false, maxTokens = 2000, temperature = 0, timeoutMs = 120000 } = {}) {
  const res = await fetch(`${BASE()}/chat/completions`, {
    method: "POST",
    headers: headers(),
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: MODEL(),
      messages,
      thinking: { type: "disabled" },
      ...(json ? { response_format: { type: "json_object" } } : {}),
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!json) return content;
  try {
    return JSON.parse(content.replace(/^```(?:json)?|```$/g, "").trim());
  } catch {
    throw new Error("DeepSeek returned invalid JSON");
  }
}

/** Streaming completion: yields text deltas. */
export async function* stream(messages, { maxTokens = 1200, temperature = 0.3, signal } = {}) {
  const res = await fetch(`${BASE()}/chat/completions`, {
    method: "POST",
    headers: headers(),
    signal,
    body: JSON.stringify({
      model: MODEL(),
      messages,
      thinking: { type: "disabled" },
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* keep-alive or partial line */ }
    }
  }
}
