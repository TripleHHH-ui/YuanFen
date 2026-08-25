import { useEffect, useState } from "react";
import { api, type EvidenceCall } from "../../api";
import { useStore } from "../../store";

/** FR-018: the receipts — every Atlas-client call, id + timestamp + mode. */
export function EvidencePanel() {
  const { evidenceOpen, toggleEvidence } = useStore();
  const [calls, setCalls] = useState<EvidenceCall[]>([]);
  const [env, setEnv] = useState("");

  useEffect(() => {
    if (!evidenceOpen) return;
    let alive = true;
    const load = () =>
      api.evidence().then((r) => {
        if (alive) {
          setCalls(r.calls);
          setEnv(`${r.environment} · ${r.mode}`);
        }
      });
    void load();
    const t = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [evidenceOpen]);

  return (
    <>
      <button className="evidence-toggle" onClick={toggleEvidence}>
        {evidenceOpen ? "hide receipts" : "receipts"}
      </button>
      {evidenceOpen && (
        <div className="evidence-panel">
          <div className="ev-head">
            atlas request log <span className="dim">{env}</span>
          </div>
          <div className="ev-rows">
            {calls.length === 0 && <div className="ev-row dim">no calls yet</div>}
            {calls.map((c) => (
              <div key={c.request_id + c.ts} className="ev-row">
                <span className="ev-ts">{c.ts.slice(11, 19)}</span>
                <span className={`ev-mode ${c.mode}`}>{c.mode}</span>
                <span className="ev-op">{c.op}</span>
                <span className="ev-id">{c.request_id}</span>
                <span className="ev-sum">{c.summary}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
