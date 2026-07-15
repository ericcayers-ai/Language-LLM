import { Button, EmptyState, StatusRegion } from "@language-llm/ui";
import { useEffect, useState } from "react";
import {
  api,
  formatBytes,
  type ModelStatusEntry,
  type ModelVerifyReport,
} from "../api";

export function ModelsView() {
  const [models, setModels] = useState<ModelStatusEntry[]>([]);
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<"info" | "success" | "warn" | "error">(
    "info",
  );
  const [report, setReport] = useState<ModelVerifyReport | null>(null);

  const refresh = async () => {
    setModels(await api.listModels());
  };

  useEffect(() => {
    void refresh().catch((e) => {
      setTone("error");
      setStatus(String(e));
    });
  }, []);

  if (!status && models.length === 0) {
    // still loading or empty catalog
  }

  return (
    <div>
      <StatusRegion message={status} tone={tone} />
      {models.length === 0 ? (
        <EmptyState
          kind="no-model"
          title="No catalog models"
          description="Place models/catalog.json under the data or repo root, then refresh."
          actions={[
            {
              id: "refresh",
              label: "Refresh",
              onClick: () => void refresh(),
            },
          ]}
        />
      ) : (
        <section className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Model catalog</h2>
            <Button variant="ghost" onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Task</th>
                <th>License</th>
                <th>Installed</th>
                <th>Disk</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="mono">{m.id}</div>
                    <div className="meta">
                      {m.family}
                      {m.hardwareMin ? ` · min ${m.hardwareMin}` : ""}
                    </div>
                  </td>
                  <td>{m.task}</td>
                  <td>
                    {m.licenseClass ?? "—"}
                    {m.commercialDefault ? " · default" : ""}
                  </td>
                  <td>{m.installed ? "yes" : "no"}</td>
                  <td>{formatBytes(m.diskBytes)}</td>
                  <td>
                    <div className="row">
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          try {
                            const r = await api.verifyModel(m.id);
                            setReport(r);
                            setTone(r.digestOk && r.installed ? "success" : "warn");
                            setStatus(
                              r.installed
                                ? `Verified ${m.id} (digestOk=${r.digestOk})`
                                : `${m.id} not installed`,
                            );
                          } catch (e) {
                            setTone("error");
                            setStatus(String(e));
                          }
                        }}
                      >
                        Verify
                      </Button>
                      <Button
                        variant="danger"
                        disabled={!m.installed}
                        onClick={async () => {
                          try {
                            await api.removeModel(m.id);
                            setTone("warn");
                            setStatus(`Removed ${m.id}`);
                            await refresh();
                          } catch (e) {
                            setTone("error");
                            setStatus(String(e));
                          }
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                    {m.downloadUrlHint ? (
                      <div className="meta">{m.downloadUrlHint}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="meta" style={{ marginTop: "0.75rem" }}>
            Install verified weight files under{" "}
            <span className="mono">models/weights/&lt;id&gt;/</span> then Verify.
            Digests must match the catalog before release builds will treat a
            pack as installed.
          </p>
          {report ? (
            <pre className="mono panel" style={{ overflow: "auto" }}>
              {JSON.stringify(report, null, 2)}
            </pre>
          ) : null}
        </section>
      )}
    </div>
  );
}
