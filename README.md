# MG&CO Field

**The job clock for contractors.** Start the clock when you get to the site, log materials and photos while you work, and send the customer a professional report the second you're done. No paperwork, works with gloves on, works with no signal.

Part of the MG&CO Technologies Trades & Contractors vertical.

## Features

**Core (works fully offline)**
- One-tap job start — pick a customer (or add one in 10 seconds) and the clock is running
- Timestamp-based timer with an animated progress ring — survives phone lock, app close, dead battery. Breaks tracked separately and never billed
- Materials log — frequently-used materials become one-tap chips automatically
- Before / after photos, compressed on-device, embedded in the report
- Instant customer report — hours, work performed, materials, labor + tax + total, photo gallery. Send via SMS, email, native share, copy, or print-to-PDF
- Customer history — every job, dollar, and photo stays on the record
- **Scheduling** — line up jobs by day, one-tap start when you arrive, overdue flagging
- **Team & payroll** — add workers with wages, assign them to jobs, weekly hours / pay / billed rollups with copyable summaries

**AI (Supabase Edge Function + Claude)**
- **Voice notes** — tap the mic and talk; live speech-to-text into job notes (Web Speech API, on-device)
- **"Make it professional"** — rough field notes rewritten into a customer-ready work summary
- **Receipt scanning** — snap a supplier receipt; line items, quantities and unit prices fill the materials list automatically

The app degrades gracefully: with no AI configured, everything still works — voice keeps transcribing locally and polish falls back to a local cleanup.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173 at phone width (or on a phone on the same network).

## AI setup (one time)

The edge function lives at `supabase/functions/ai/index.ts` and deploys via the Supabase GitHub integration on push. It needs one secret on the Supabase project:

```
Dashboard → Project Settings → Edge Functions → Secrets
ANTHROPIC_API_KEY = sk-ant-...
```

Optional: `AI_MODEL` (defaults to `claude-opus-4-8`).

Verify from the app: **More → AI Assistant → Test the AI connection**.

## Stack

- Vite + React + Framer Motion, Inter Variable
- All field data in `localStorage` (key `mgco-field-v1`) — local-first by design
- Supabase Edge Function (Deno) + Anthropic Claude for AI features
- Deploys to Vercel (frontend) + Supabase (function) on push to `main`

## Roadmap

1. Supabase data sync — multi-device, team accounts, owner sees techs' active jobs live
2. Stripe payment link on the report
3. PWA install polish (icons, offline shell)
4. Integration with mgcodashboard.com client portal
