import { EmptyState, StatusRegion } from "@language-llm/ui";
import { useEffect, useState } from "react";
import { api, type DictionaryMeta } from "../api";

export function DictionariesView() {
  const [dicts, setDicts] = useState<DictionaryMeta[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void api
      .listDictionaries()
      .then(setDicts)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div>
      <StatusRegion message={error} tone="error" />
      {dicts.length === 0 ? (
        <EmptyState
          kind="empty-dictionary"
          description="Import JMdict, CC-CEDICT, Kaikki, or Yomitan-compatible archives from the extension side panel. Metadata appears here once the companion SQLite store has entries."
        />
      ) : (
        <section className="panel">
          <h2>Installed dictionaries</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Language</th>
                <th>License</th>
                <th>Entries</th>
              </tr>
            </thead>
            <tbody>
              {dicts.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div>{d.name}</div>
                    <div className="mono meta">{d.id}</div>
                  </td>
                  <td>{d.language}</td>
                  <td>{d.license}</td>
                  <td>{d.entryCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
