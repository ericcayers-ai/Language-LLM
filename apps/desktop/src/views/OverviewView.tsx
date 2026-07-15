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

  return (
    <div>
      <StatusRegion message={status} tone={tone} />
      <section className="panel">
        <h2>Companion health</h2>
        {health ? (
          <dl className="stack meta">
            <div>
              Service:{" "}
              <strong>{health.serviceRunning ? "running" : "stopped"}</strong>
              {health.serviceRunning ? ` · port ${health.port}` : null}
            </div>
            <div>Protocol {health.protocolVersion}</div>
            <div>
              Extension pin:{" "}
              {health.extensionIdPinned
                ? health.allowedExtensionId
                : "not pinned (release builds require LANGUAGE_LLM_EXTENSION_ID or data_dir/extension_id)"}
            </div>
            <div>
              SQLite {health.sqliteReady ? "ready" : "unavailable"} · catalog{" "}
              {health.modelCatalogReady ? "ready" : "missing"} · sessions{" "}
              {health.activeSessions} · jobs {health.jobCount}
            </div>
            <div className="mono">{health.dataDir}</div>
          </dl>
        ) : (
          <p className="meta">Loading…</p>
        )}
        <div className="row" style={{ marginTop: "0.75rem" }}>
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
          <Button variant="ghost" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      </section>

      <section className="panel">
        <h2>Native-host registration</h2>
        <p className="meta">
          One-action repair writes the Chrome native messaging manifest, wrapper,
          and pins the extension ID for loopback WS auth.
        </p>
        <div className="row">
          <label className="field">
            <span className="meta">Extension ID</span>
            <input
              value={extensionId}
              onChange={(e) => setExtensionId(e.target.value)}
              placeholder="abcdefghijklmnopqrstuvwxyz"
              spellCheck={false}
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

      <section className="panel expert-only">
        <h2>Disk (quick)</h2>
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
