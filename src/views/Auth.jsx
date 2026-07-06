import { useState } from "react";
import { supa } from "../supa";
import { APP_URL } from "../config";
import { Icon } from "../icons";

const GoogleMark = (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.02c2.2-2 3.5-5 3.5-8.6z" />
    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-4.9l-.14.01-3.7 2.8-.05.13C3.4 21.3 7.4 24 12 24z" />
    <path fill="#FBBC05" d="M5.3 14.5c-.25-.7-.39-1.5-.39-2.5s.14-1.8.38-2.5l-.01-.16-3.7-2.9-.12.06C.5 8.1 0 10 0 12s.5 3.9 1.4 5.5l3.9-3z" />
    <path fill="#EB4335" d="M12 4.6c2.2 0 3.7.95 4.5 1.7l3.3-3.2C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.5l3.9 3c.95-2.8 3.6-4.9 6.7-4.9z" />
  </svg>
);

export function AuthScreen() {
  // Opened from mgcodashboard? The owner's email is prefilled via ?email=
  const prefill = new URLSearchParams(location.search).get("email") || "";
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup'
  const [email, setEmail] = useState(prefill);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async () => {
    setBusy(true);
    setErr("");
    setNotice("");
    try {
      if (mode === "signin") {
        const { error } = await supa.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supa.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setNotice("Check your inbox — confirm your email, then come back and sign in.");
        }
      }
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setErr("");
    const redirectTo = location.hostname === "localhost" ? location.origin : APP_URL;
    const { error } = await supa.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setErr(error.message);
  };

  const forgot = async () => {
    if (!email) return setErr("Type your email first, then tap Forgot password.");
    setErr("");
    const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
    setNotice(error ? error.message : "Password reset email sent.");
  };

  return (
    <div className="page auth-page">
      <div className="auth-hero">
        <div className="auth-mark">
          <Icon name="clock" size={30} />
        </div>
        <h1>{mode === "signin" ? "Welcome back." : "Create your account."}</h1>
        <p>Your company's field app — jobs, hours and reports in one place.</p>
      </div>

      <div className="card form">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>

        {err && <div className="callout bad">{err}</div>}
        {notice && <div className="callout ok">{notice}</div>}

        <button className="btn big primary" disabled={busy || !email || password.length < 6} onClick={submit}>
          {busy ? "One sec…" : mode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
        </button>

        <button className="btn big secondary" onClick={google}>
          {GoogleMark} Continue with Google
        </button>

        <div className="auth-links">
          <button className="link-btn" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
          {mode === "signin" && (
            <button className="link-btn dim-link" onClick={forgot}>
              Forgot password
            </button>
          )}
        </div>
      </div>

      <small className="hint">
        Invited by your boss? Sign in (or continue with Google) using the same email the invite
        was sent to — you'll land straight in your company.
      </small>
    </div>
  );
}

/** Shown when a user signs in but has no membership, invite, or TechOps grant. */
export function DeniedScreen({ email, onRetry, onSignOut }) {
  return (
    <div className="page auth-page">
      <div className="auth-hero">
        <div className="auth-mark dim-mark">
          <Icon name="users" size={30} />
        </div>
        <h1>Almost there.</h1>
        <p>
          <b>{email}</b> isn't enabled yet.
        </p>
      </div>

      <div className="group">
        <div className="grow">
          <span className="row-ic"><Icon name="briefcase" size={19} /></span>
          <div className="grow-main">
            <b>Business owner?</b>
            <span>Ask MG&CO to activate access for this email</span>
          </div>
        </div>
        <div className="grow">
          <span className="row-ic"><Icon name="mail" size={19} /></span>
          <div className="grow-main">
            <b>On a crew?</b>
            <span>Ask your boss to invite this exact email address</span>
          </div>
        </div>
      </div>

      <button className="btn big primary" onClick={onRetry}>
        Check again
      </button>
      <button className="btn big ghost" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}

/** Shown after arriving from an invite / recovery email — lock in a password. */
export function SetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setBusy(true);
    setErr("");
    const { error } = await supa.auth.updateUser({ password });
    setBusy(false);
    if (error) setErr(error.message);
    else onDone();
  };

  return (
    <div className="page auth-page">
      <div className="auth-hero">
        <div className="auth-mark">
          <Icon name="check" size={30} />
        </div>
        <h1>You're in.</h1>
        <p>Set a password so you can sign in next time.</p>
      </div>
      <div className="card form">
        <label className="field">
          <span>Choose a password</span>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>
        {err && <div className="callout bad">{err}</div>}
        <button className="btn big primary" disabled={busy || password.length < 6} onClick={save}>
          {busy ? "Saving…" : "SAVE & CONTINUE"}
        </button>
        <button className="btn big ghost" onClick={onDone}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="page auth-page center-load">
      <div className="load-ring" />
    </div>
  );
}
