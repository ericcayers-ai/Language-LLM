import { StatusRegion } from "@language-llm/ui";
import { useEffect, useState } from "react";
import { api, type LicenseEntry } from "../api";

export function LicensesView() {
  const [rows, setRows] = useState<LicenseEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void api
      .listLicenses()
      .then(setRows)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div>
      <StatusRegion message={error} tone="error" />
      <section className="panel">
        <h2>Model & pack licenses</h2>
        <p className="meta">
          Commercial-default packs may be offered without a research screen.
          Research-opt-in packs require explicit acknowledgment and are never
          auto-selected.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Class</th>
              <th>Default?</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="mono">{r.id}</div>
                  <div className="meta">
                    {r.family} · {r.task}
                  </div>
                </td>
                <td>{r.licenseClass ?? "—"}</td>
                <td>{r.commercialDefault ? "yes" : "no"}</td>
                <td className="meta">{r.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
