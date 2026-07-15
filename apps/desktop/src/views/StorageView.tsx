import { Button, StatusRegion } from "@language-llm/ui";
import { useEffect, useState } from "react";
import { api, formatBytes, type StorageSnapshot } from "../api";

const RETENTION = ["session", "days7", "days30", "keep"] as const;
const WIPE_SCOPES = [
  "transcripts",
  "translations",
  "lyrics",
  "page-cache",
  "study",
  "dictionaries",
  "all",
] as const;

export function StorageView() {
  const [snap, setSnap] = useState<StorageSnapshot | null>(null);
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<"info" | "success" | "warn" | "error">(
    "info",
  );

  const refresh = async () => setSnap(await api.getStorage());

  useEffect(() => {
    void refresh().catch((e) => {
      setTone("error");
      setStatus(String(e));
    });
  }, []);

  return (
    <div>
      <StatusRegion message={status} tone={tone} />
      <section className="panel">
        <h2>Storage & privacy</h2>
        {snap ? (
          <>
            <p className="meta">
              Retention: <strong>{snap.retention}</strong> · Dictionaries{" "}
              {snap.dictionaryCount} ({snap.dictionaryEntries} entries) · LRCLIB
              network {snap.lyricsNetworkAllowed ? "allowed" : "blocked"}
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {snap.disk.paths.map((p) => (
                  <tr key={p.path}>
                    <td>
                      <div>{p.label}</div>
                      <div className="mono meta">{p.path}</div>
                    </td>
                    <td>{formatBytes(p.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="meta">Loading…</p>
        )}
      </section>

      <section className="panel">
        <h2>Retention preset</h2>
        <div className="row">
          {RETENTION.map((preset) => (
            <Button
              key={preset}
              variant={snap?.retention === preset ? "primary" : "ghost"}
              onClick={async () => {
                try {
                  await api.setRetention(preset);
                  setTone("success");
                  setStatus(`Retention set to ${preset}`);
                  await refresh();
                } catch (e) {
                  setTone("error");
                  setStatus(String(e));
                }
              }}
            >
              {preset}
            </Button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Privacy wipe</h2>
        <p className="meta">
          Local-first wipe of companion SQLite scopes. Does not uninstall models.
        </p>
        <div className="row">
          {WIPE_SCOPES.map((scope) => (
            <Button
              key={scope}
              variant={scope === "all" ? "danger" : "ghost"}
              onClick={async () => {
                try {
                  const result = await api.wipePrivacy(scope);
                  setTone(scope === "all" ? "warn" : "success");
                  setStatus(`Wiped ${scope}: ${JSON.stringify(result)}`);
                  await refresh();
                } catch (e) {
                  setTone("error");
                  setStatus(String(e));
                }
              }}
            >
              Wipe {scope}
            </Button>
          ))}
        </div>
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                const next = !(snap?.lyricsNetworkAllowed ?? false);
                await api.setLyricsNetwork(next);
                setStatus(
                  next
                    ? "LRCLIB network fetches allowed (attributed, opt-in)"
                    : "LRCLIB network fetches blocked",
                );
                setTone("info");
                await refresh();
              } catch (e) {
                setTone("error");
                setStatus(String(e));
              }
            }}
          >
            Toggle LRCLIB network
          </Button>
        </div>
      </section>
    </div>
  );
}
