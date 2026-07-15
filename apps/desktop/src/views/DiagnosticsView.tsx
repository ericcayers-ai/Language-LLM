import { Button, StatusRegion, useDensity } from "@language-llm/ui";
import { useEffect, useState } from "react";
import { api } from "../api";

export function DiagnosticsView() {
  const { profile } = useDensity();
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<"info" | "success" | "warn" | "error">(
    "info",
  );

  const refresh = async () => setPayload(await api.getDiagnostics());

  useEffect(() => {
    void refresh().catch((e) => {
      setTone("error");
      setStatus(String(e));
    });
  }, []);

  const expert = profile === "expert";

  return (
    <div>
      <StatusRegion message={status} tone={tone} />
      <section className="panel">
        <h2>Diagnostics</h2>
        <p className="meta">
          Default desktop density is Balanced. Switch to Expert for full log
          tails and raw snapshots. Export always redacts tokens.
        </p>
        <div className="row">
          <Button
            onClick={async () => {
              try {
                await refresh();
                setTone("success");
                setStatus("Diagnostics refreshed");
              } catch (e) {
                setTone("error");
                setStatus(String(e));
              }
            }}
          >
            Refresh
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                const path = await api.exportLogs();
                setTone("success");
                setStatus(`Exported redacted logs to ${path}`);
              } catch (e) {
                setTone("error");
                setStatus(String(e));
              }
            }}
          >
            Export logs (redacted)
          </Button>
        </div>
      </section>

      {payload ? (
        <section className="panel">
          <h2>Snapshot</h2>
          {!expert ? (
            <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(
                {
                  appVersion: payload.appVersion,
                  protocolVersion: payload.protocolVersion,
                  dataDir: payload.dataDir,
                  health: payload.health,
                },
                null,
                2,
              )}
            </pre>
          ) : (
            <pre className="mono" style={{ whiteSpace: "pre-wrap", overflow: "auto" }}>
              {JSON.stringify(payload, null, 2)}
            </pre>
          )}
        </section>
      ) : null}
    </div>
  );
}
