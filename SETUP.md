# MG&CO Field — go-live setup

Everything is coded and deployed. These are the manual steps only you can do
(they involve secrets and provider settings). ~10 minutes total.

## 1. Supabase secrets (Field project: `lnznihlemvltzxcivypt`)

Dashboard → Project Settings → **Edge Functions → Secrets** → add:

| Secret | Value |
|---|---|
| `XAI_API_KEY` | `xai-…` (your xAI key — powers receipt scanning + summaries) |
| `APP_URL` | `https://mgco-field.vercel.app` |
| `FIELD_ADMIN_KEY` | a random 32+ char string you generate (keep it secret) |

Generate a `FIELD_ADMIN_KEY` with, e.g., `openssl rand -hex 32`. Use the **same value** in step 3.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — don't add them.

Optional: `AI_MODEL` (defaults to `grok-4`).

## 2. Supabase Auth (Field project)

- **Authentication → URL Configuration**
  - Site URL: `https://mgco-field.vercel.app`
  - Redirect URLs: add `https://mgco-field.vercel.app` and `https://mgco-field.vercel.app/**`
- **Authentication → Providers → Google**: enable it, paste your Google OAuth client ID + secret
  (reuse the same Google OAuth app you already use, just add the Field callback
  `https://lnznihlemvltzxcivypt.supabase.co/auth/v1/callback` to its authorized redirect URIs).
- Email: the built-in email works for testing. For production invites at volume, set up custom SMTP
  (Authentication → Emails) so invite emails don't get rate-limited.

## 3. mgcodashboard env (Vercel → mgcodashboard project)

Add:

| Var | Value |
|---|---|
| `FIELD_ADMIN_KEY` | **same value** you set in step 1 |
| `NEXT_PUBLIC_FIELD_APP_URL` | `https://mgco-field.vercel.app` |

Redeploy mgcodashboard.

## 4. Try it end to end

1. **TechOps** → open a client whose industry is Trades & Contractors → the **"MG&CO Field App"**
   card → **Enable access**. (This grants that owner's email in the Field app.)
2. That owner opens their **contractor portal** → clicks the **"Field App"** button → Field opens in a
   new tab with their email prefilled → they sign in (password or Google) → they land in their own
   workspace and can set their brand/colors.
3. Owner → **Team → Invite** → adds crew emails → each employee gets an email, signs in, and lands in
   the company with the branding already applied, seeing only their own jobs.

### Grant your own email for testing (optional shortcut)

Instead of the TechOps UI you can grant any email directly:

```bash
curl -X POST https://lnznihlemvltzxcivypt.supabase.co/functions/v1/admin \
  -H "Content-Type: application/json" \
  -H "x-admin-key: <FIELD_ADMIN_KEY>" \
  -d '{"action":"grant","email":"you@example.com"}'
```

`"action":"revoke"` turns it off; `"action":"list"` shows all grants.
