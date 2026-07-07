import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

async function callAI(payload) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `AI request failed (${res.status})`);
  return data.result;
}

/** Rewrite rough field notes into a customer-ready summary. */
export function aiPolish(text) {
  return callAI({ task: "polish", text });
}

/** Read a receipt photo → { supplier, items: [{ name, qty, price }] } */
export function scanReceipt(imageDataURL) {
  return callAI({ task: "receipt", image: imageDataURL });
}

/**
 * Turn a spoken measurement-note transcript into suggested annotations.
 * Never invents numbers — only organizes what was said and guesses placement
 * on the photo. Returns { items: [{ type, text, x, y }] }.
 */
export function suggestAnnotations(transcript, imageDataURL, existingTexts = []) {
  return callAI({ task: "annotate", transcript, image: imageDataURL, existing: existingTexts });
}

/** Cheap offline cleanup used when the AI backend isn't reachable. */
export function localPolish(text) {
  const parts = String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      let out = s.charAt(0).toUpperCase() + s.slice(1);
      if (!/[.!?]$/.test(out)) out += ".";
      return out;
    });
  return parts.join(" ");
}

/**
 * Live speech-to-text via the Web Speech API.
 * Returns null when the browser doesn't support it.
 */
export function makeRecognizer({ onText, onEnd }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.continuous = true;
  r.interimResults = true;
  r.lang = navigator.language || "en-US";
  r.onresult = (e) => {
    let final = "";
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else interim += t;
    }
    onText(final, interim);
  };
  r.onend = () => onEnd?.();
  r.onerror = () => onEnd?.();
  return r;
}

export const speechSupported = () =>
  Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
