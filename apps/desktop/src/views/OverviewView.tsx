import { Button, StatusRegion } from "@language-llm/ui";
import { useEffect, useState } from "react";
import { api, type HealthSnapshot, formatBytes } from "../api";

export function OverviewView() {
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<"info" | "success" | "warn" | "error">(
    "info",
  );
  const [extensionId, setExtensionId] = useState("");

  const refresh = async () => {
    try {
      const h = await api.getHealth();
      setHealth(h);
      setExtensionId(h.allowedExtensionId ?? "");
    } catch (e) {
      setTone("error");
      setStatus(String(e));
    }
  };

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, []);

  const running = health?.serviceRunning === true;

  return (
    <div>
      {status ? (
        <div style={{ marginBottom: "0.75rem" }}>
          <StatusRegion message={status} tone={tone} />
        </div>
      ) : null}

      <section className="panel" aria-labelledby="health-heading">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 id="health-heading">Companion</h2>
          {health ? (
            <span
              className={`llm-chip ${running ? "llm-chip--ok" : "llm-chip--err"}`}
            >
              {running ? "Running" : "Stopped"}
              {running ? ` · :${health.port}` : ""}
            </span>
          ) : (
            <span className="llm-chip">Checking…</span>
          )}
        </div>

        {health ? (
          <dl className="stack meta">
            <div>Protocol {health.protocolVersion}</div>
            <div>
              Extension pin:{" "}
              {health.extensionIdPinned
                ? health.allowedExtensionId
                : "not pinned — set LANGUAGE_LLM_EXTENSION_ID or use Repair below"}
            </div>
            <div>
              SQLite {health.sqliteReady ? "ready" : "unavailable"} · catalog{" "}
              {health.modelCatalogReady ? "ready" : "missing"} · sessions{" "}
              {health.activeSessions} · jobs {health.jobCount}
            </div>
            <div className="mono">{health.dataDir}</div>
          </dl>
        ) : (
          <p className="meta">Loading health…</p>
        )}

        <div className="row" style={{ marginTop: "1rem" }}>
          {running ? (
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  setHealth(await api.stopService());
                  setTone("warn");
                  setStatus("Service stopped");
                } catch (e) {
                  setTone("error");
                  setStatus(String(e));
                }
              }}
            >
              Stop service
            </Button>
          ) : (
            <Button
              onClick={async () => {
                try {
                  setHealth(await api.startService());
                  setTone("success");
                  setStatus("Service started");
                } catch (e) {
                  setTone("error");
                  setStatus(String(e));
                }
              }}
            >
              Start service
            </Button>
          )}
          <Button variant="ghost" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      </section>

      <section className="panel" aria-labelledby="native-heading">
        <h2 id="native-heading">Connect Chrome extension</h2>
        <p className="meta" style={{ marginTop: 0 }}>
          One action writes the native messaging manifest, wrapper, and pins the
          extension ID for loopback WebSocket auth.
        </p>
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <label className="field">
            <span>Extension ID</span>
            <input
              value={extensionId}
              onChange={(e) => setExtensionId(e.target.value)}
              placeholder="abcdefghijklmnopqrstuvwxyz"
              spellCheck={false}
              className="llm-focus-ring"
            />
          </label>
          <Button
            onClick={async () => {
              try {
                const result = await api.repairNativeHost(extensionId.trim());
                setTone(result.ok ? "success" : "error");
                setStatus(result.message);
                await refresh();
              } catch (e) {
                setTone("error");
                setStatus(String(e));
              }
            }}
          >
            Repair native host
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                const path = await api.pinExtension(extensionId.trim());
                setTone("success");
                setStatus(`Pinned extension id at ${path}`);
                await refresh();
              } catch (e) {
                setTone("error");
                setStatus(String(e));
              }
            }}
          >
            Pin ID only
          </Button>
        </div>
      </section>

      <section className="panel expert-only" aria-labelledby="disk-heading">
        <h2 id="disk-heading">Disk (quick)</h2>
        <DiskQuick />
      </section>
    </div>
  );
}

function DiskQuick() {
  const [text, setText] = useState("…");
  useEffect(() => {
    void api
      .diskEstimate()
      .then((d) => setText(`Total est. ${formatBytes(d.totalBytes)}`))
      .catch(() => setText("unavailable"));
  }, []);
  return <p className="meta">{text}</p>;
}
