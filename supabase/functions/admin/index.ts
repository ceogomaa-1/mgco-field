// MG&CO Field — TechOps access gate
// Called by mgcodashboard's TechOps portal (server-side) to grant or revoke
// a business owner's access to the Field app. Protected by a shared secret:
// set FIELD_ADMIN_KEY on this Supabase project AND in mgcodashboard's env.
//
//   POST { action: "grant",  email }           -> allow this owner email
//   POST { action: "revoke", email }           -> turn access off
//   POST { action: "status", email }           -> { granted: boolean }
//   POST { action: "list" }                    -> all grants
//
// Headers: x-admin-key: <FIELD_ADMIN_KEY>
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const adminKey = Deno.env.get("FIELD_ADMIN_KEY");
  if (!adminKey) return json({ ok: false, error: "FIELD_ADMIN_KEY secret not set" }, 503);
  if (req.headers.get("x-admin-key") !== adminKey) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  let body: { action?: string; email?: string; granted_by?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const email = String(body.email || "").trim().toLowerCase();

  try {
    switch (body.action) {
      case "grant": {
        if (!email) return json({ ok: false, error: "email required" }, 400);
        const { error } = await db
          .from("access_grants")
          .upsert({ email, active: true, granted_by: String(body.granted_by || "techops") });
        if (error) throw error;
        return json({ ok: true, email, granted: true });
      }
      case "revoke": {
        if (!email) return json({ ok: false, error: "email required" }, 400);
        const { error } = await db.from("access_grants").upsert({ email, active: false });
        if (error) throw error;
        return json({ ok: true, email, granted: false });
      }
      case "status": {
        if (!email) return json({ ok: false, error: "email required" }, 400);
        const { data } = await db.from("access_grants").select("active").eq("email", email).maybeSingle();
        return json({ ok: true, email, granted: Boolean(data?.active) });
      }
      case "list": {
        const { data, error } = await db
          .from("access_grants")
          .select("email, active, granted_by, created_at")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return json({ ok: true, grants: data });
      }
      default:
        return json({ ok: false, error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
