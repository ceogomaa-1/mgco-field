// MG&CO Field — AI edge function (xAI Grok, with Anthropic fallback)
// Tasks: "polish" (rough field notes → customer-ready summary)
//        "receipt" (receipt photo → structured line items)
// Secrets: XAI_API_KEY (preferred) or ANTHROPIC_API_KEY. Optional: AI_MODEL.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const POLISH_SYSTEM = `You rewrite a tradesperson's rough job notes into a short, professional work summary for a customer-facing report.
Rules:
- Keep every fact. Add nothing. Never invent work that wasn't mentioned.
- No prices, no greetings, no sign-offs — the report adds those separately.
- Write in plain, confident language a homeowner understands.
- One short paragraph (or up to 5 short lines for multi-part jobs).
- Output the summary text only — no preamble, no quotes, no markdown.`;

const RECEIPT_SYSTEM = `You read photos of supplier receipts for a contractor. Extract the purchased line items.
Skip subtotals, tax lines, totals, payment lines and store metadata.
Use short readable item names. "price" is the UNIT price (line total ÷ qty).
Respond with ONLY valid JSON, no markdown fences, in exactly this shape:
{"supplier": "store name or empty string", "items": [{"name": "item", "qty": 1, "price": 9.99}]}`;

/** Pull the first JSON object out of a model reply, tolerating fences/preamble. */
function extractJSON(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON in model reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/* ---------- providers (OpenAI-compatible xAI first, Anthropic fallback) ---------- */

async function grokChat(opts: { system: string; user: unknown[]; maxTokens: number }) {
  const key = Deno.env.get("XAI_API_KEY")!;
  const model = Deno.env.get("AI_MODEL") || "grok-4";
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.error || `xAI error ${res.status}`);
  }
  return String(data?.choices?.[0]?.message?.content ?? "");
}

async function claudeChat(opts: { system: string; user: unknown[]; maxTokens: number }) {
  const key = Deno.env.get("ANTHROPIC_API_KEY")!;
  const model = Deno.env.get("AI_MODEL") || "claude-opus-4-8";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic error ${res.status}`);
  if (data.stop_reason === "refusal") throw new Error("Request declined");
  return (data.content || [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
}

/* ---------- request handling ---------- */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const useGrok = Boolean(Deno.env.get("XAI_API_KEY"));
  const useClaude = Boolean(Deno.env.get("ANTHROPIC_API_KEY"));
  if (!useGrok && !useClaude) {
    return json({ ok: false, error: "AI not configured — set the XAI_API_KEY secret" }, 503);
  }

  let body: { task?: string; text?: string; image?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  try {
    if (body.task === "polish") {
      const text = String(body.text || "").slice(0, 8000);
      if (!text.trim()) return json({ ok: false, error: "No text provided" }, 400);
      const user = useGrok
        ? [{ type: "text", text }]
        : [{ type: "text", text }];
      const out = (useGrok ? await grokChat({ system: POLISH_SYSTEM, user, maxTokens: 1024 })
                           : await claudeChat({ system: POLISH_SYSTEM, user, maxTokens: 1024 })).trim();
      return json({ ok: true, result: out });
    }

    if (body.task === "receipt") {
      const image = String(body.image || "");
      const match = image.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/s);
      if (!match) return json({ ok: false, error: "Expected a base64 image data URL" }, 400);
      const [, mediaType, b64] = match;

      const user = useGrok
        ? [
            { type: "image_url", image_url: { url: image, detail: "high" } },
            { type: "text", text: "Extract the line items from this receipt." },
          ]
        : [
            { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
            { type: "text", text: "Extract the line items from this receipt." },
          ];

      const raw = useGrok
        ? await grokChat({ system: RECEIPT_SYSTEM, user, maxTokens: 4096 })
        : await claudeChat({ system: RECEIPT_SYSTEM, user, maxTokens: 4096 });
      return json({ ok: true, result: extractJSON(raw) });
    }

    return json({ ok: false, error: `Unknown task: ${body.task}` }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
