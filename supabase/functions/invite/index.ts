// MG&CO Field — team invites
// Called by a signed-in OWNER. For each email: records an invite row
// (RLS-checked as the caller) and sends a Supabase invite email via the
// admin API. Returns a shareable link per email as a fallback for
// texting the invite manually.
import { createClient } from "npm:@supabase/supabase-js@2";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const appUrl = Deno.env.get("APP_URL") || "https://mgco-field.vercel.app";

  // Client acting AS the caller (their JWT) — RLS applies
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, error: "Not signed in" }, 401);
  const caller = userData.user;

  // Must be an owner
  const { data: me } = await asCaller
    .from("members")
    .select("company_id, role")
    .eq("user_id", caller.id)
    .maybeSingle();
  if (!me || me.role !== "owner") {
    return json({ ok: false, error: "Only the business owner can invite the team" }, 403);
  }

  let body: { emails?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const emails = [...new Set((body.emails || []).map((e) => String(e).trim().toLowerCase()))]
    .filter((e) => EMAIL_RE.test(e))
    .slice(0, 25);
  if (!emails.length) return json({ ok: false, error: "No valid emails" }, 400);

  const admin = createClient(url, service);
  const results: Record<string, { invited: boolean; emailed: boolean; link?: string; note?: string }> = {};

  for (const email of emails) {
    const r: (typeof results)[string] = { invited: false, emailed: false };
    try {
      if (email === (caller.email || "").toLowerCase()) {
        r.note = "That's you";
        results[email] = r;
        continue;
      }
      // Record the invite as the caller (RLS enforces owner + own company)
      const { error: invErr } = await asCaller
        .from("invites")
        .upsert(
          { company_id: me.company_id, email, role: "employee", invited_by: caller.id },
          { onConflict: "company_id,email" }
        );
      if (invErr) throw invErr;
      r.invited = true;

      // Best-effort: send the Supabase invite email (new users only)
      const { error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: appUrl,
      });
      if (!mailErr) {
        r.emailed = true;
      } else {
        // Existing account or SMTP limit — hand back a sign-in link to share manually
        r.note = mailErr.message;
        const { data: linkData } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo: appUrl },
        });
        if (linkData?.properties?.action_link) r.link = linkData.properties.action_link;
      }
    } catch (e) {
      r.note = String((e as Error)?.message || e);
    }
    results[email] = r;
  }

  return json({ ok: true, results, appUrl });
});
