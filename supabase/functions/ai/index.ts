// MG&CO Field — AI edge function
// Tasks: "polish" (rough field notes → customer-ready summary)
//        "receipt" (receipt photo → structured line items)
// Requires the ANTHROPIC_API_KEY secret on the Supabase project.
import Anthropic from "npm:@anthropic-ai/sdk";

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

const MODEL = Deno.env.get("AI_MODEL") || "claude-opus-4-8";

const POLISH_SYSTEM = `You rewrite a tradesperson's rough job notes into a short, professional work summary for a customer-facing report.
Rules:
- Keep every fact. Add nothing. Never invent work that wasn't mentioned.
- No prices, no greetings, no sign-offs — the report adds those separately.
- Write in plain, confident language a homeowner understands.
- One short paragraph (or up to 5 short lines for multi-part jobs).
- Output the summary text only — no preamble, no quotes, no markdown.`;

const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["supplier", "items"],
  properties: {
    supplier: { type: "string", description: "Store or supplier name; empty string if unreadable" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "qty", "price"],
        properties: {
          name: { type: "string", description: "Short readable item name" },
          qty: { type: "number" },
          price: { type: "number", description: "Unit price, not line total" },
        },
      },
    },
  },
} as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ ok: false, error: "AI not configured — set the ANTHROPIC_API_KEY secret" }, 503);
  }
  const client = new Anthropic({ apiKey });

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
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: POLISH_SYSTEM,
        messages: [{ role: "user", content: text }],
      });
      if (msg.stop_reason === "refusal") return json({ ok: false, error: "Request declined" }, 400);
      const out = msg.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("")
        .trim();
      return json({ ok: true, result: out });
    }

    if (body.task === "receipt") {
      const image = String(body.image || "");
      const match = image.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/s);
      if (!match) return json({ ok: false, error: "Expected a base64 image data URL" }, 400);
      const [, media_type, data] = match;
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system:
          "You read photos of supplier receipts for a contractor. Extract the purchased line items. " +
          "Skip subtotals, tax lines, totals, payment lines and store metadata. " +
          "Use short readable item names. price is the UNIT price (line total ÷ qty).",
        output_config: { format: { type: "json_schema", schema: RECEIPT_SCHEMA } },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type, data } },
              { type: "text", text: "Extract the line items from this receipt." },
            ],
          },
        ],
      });
      if (msg.stop_reason === "refusal") return json({ ok: false, error: "Request declined" }, 400);
      const raw = msg.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("");
      return json({ ok: true, result: JSON.parse(raw) });
    }

    return json({ ok: false, error: `Unknown task: ${body.task}` }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
