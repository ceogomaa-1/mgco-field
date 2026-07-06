import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

// Captured before supabase-js consumes the URL hash — tells us the user
// arrived from an invite / recovery email so we can prompt for a password.
export const urlAuthType = new URLSearchParams(
  window.location.hash.replace(/^#/, "")
).get("type");

export const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
