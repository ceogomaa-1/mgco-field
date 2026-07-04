import { useState } from "react";
import { TopBar } from "../ui";
import { Icon } from "../icons";
import { aiPolish, speechSupported } from "../ai";

export default function Assistant({ go }) {
  const [status, setStatus] = useState(null); // null | 'testing' | 'ok' | 'error'
  const [detail, setDetail] = useState("");

  const test = async () => {
    setStatus("testing");
    try {
      await aiPolish("replaced the valve, tested, no leaks");
      setStatus("ok");
      setDetail("");
    } catch (e) {
      setStatus("error");
      setDetail(String(e.message || e));
    }
  };

  return (
    <div className="page">
      <TopBar title="AI Assistant" onBack={() => go("more")} />

      <div className="group">
        <div className="grow">
          <span className="row-ic">
            <Icon name="mic" size={19} />
          </span>
          <div className="grow-main">
            <b>Voice notes</b>
            <span>
              {speechSupported()
                ? "Ready — tap the mic on any job and just talk"
                : "Not supported in this browser"}
            </span>
          </div>
          <span className={"dot " + (speechSupported() ? "ok" : "bad")} />
        </div>
        <div className="grow">
          <span className="row-ic">
            <Icon name="sparkle" size={19} />
          </span>
          <div className="grow-main">
            <b>Professional summaries</b>
            <span>Turns rough notes into customer-ready writing</span>
          </div>
          <span className={"dot " + (status === "ok" ? "ok" : status === "error" ? "bad" : "")} />
        </div>
        <div className="grow">
          <span className="row-ic">
            <Icon name="receipt" size={19} />
          </span>
          <div className="grow-main">
            <b>Receipt scanning</b>
            <span>Snap a receipt — materials & prices fill themselves in</span>
          </div>
          <span className={"dot " + (status === "ok" ? "ok" : status === "error" ? "bad" : "")} />
        </div>
      </div>

      <button className="btn big secondary" disabled={status === "testing"} onClick={test}>
        <Icon name="sparkle" size={17} />
        {status === "testing" ? "Testing…" : "Test the AI connection"}
      </button>

      {status === "ok" && <div className="callout ok">✓ AI is live. Summaries and receipt scanning are good to go.</div>}
      {status === "error" && (
        <div className="callout bad">
          AI isn't responding yet. Make sure the <b>ANTHROPIC_API_KEY</b> secret is set on the
          Supabase project (Dashboard → Edge Functions → Secrets), then test again.
          {detail && <small>{detail}</small>}
        </div>
      )}

      <small className="hint">
        The app works 100% offline without AI — these features just make it faster.
      </small>
    </div>
  );
}
