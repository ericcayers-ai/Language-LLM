import { Button, StatusRegion } from "@language-llm/ui";
import { useEffect, useState } from "react";
import { api, type UpdateStatus } from "../api";

export function UpdatesView() {
  const [info, setInfo] = useState<UpdateStatus | null>(null);
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<"info" | "success" | "warn" | "error">(
    "info",
  );

  useEffect(() => {
    void api
      .getUpdateStatus()
      .then(setInfo)
      .catch((e) => {
        setTone("error");
        setStatus(String(e));
      });
  }, []);

  return (
    <div>
      <StatusRegion message={status} tone={tone} />
      <section className="panel">
        <h2>Signed updates</h2>
        {info ? (
          <>
            <p>
              App version <strong>{info.currentVersion}</strong>
            </p>
            <p className="meta">{info.message}</p>
            <p className="meta">
              Public key configured: {info.pubkeyConfigured ? "yes" : "no"}
            </p>
            <ul className="meta">
              {info.endpoints.map((e) => (
                <li key={e} className="mono">
                  {e}
                </li>
              ))}
            </ul>
            <p className="meta">
              Release CI must inject signing credentials from repository secrets
              only. Private keys are never embedded in this app or source tree.
            </p>
            <Button
              variant="ghost"
              disabled={!info.configured}
              onClick={() => {
                setTone("info");
                setStatus(
                  info.configured
                    ? "Use the release updater plugin once artifacts are signed in CI."
                    : "Updater public key not configured for this build.",
                );
              }}
            >
              Check for updates
            </Button>
          </>
        ) : (
          <p className="meta">{status ? "Unavailable" : "Loading…"}</p>
        )}
      </section>
    </div>
  );
}
