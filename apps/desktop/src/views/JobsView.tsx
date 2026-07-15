import { Button, EmptyState, StatusRegion } from "@language-llm/ui";
import { useEffect, useState } from "react";
import { api, type JobView } from "../api";

export function JobsView() {
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<"info" | "success" | "warn" | "error">(
    "info",
  );

  const refresh = async () => setJobs(await api.listJobs());

  useEffect(() => {
    void refresh().catch((e) => {
      setTone("error");
      setStatus(String(e));
    });
    const id = window.setInterval(() => void refresh().catch(() => undefined), 3000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div>
      <StatusRegion message={status} tone={tone} />
      {jobs.length === 0 ? (
        <EmptyState
          kind="generic"
          title="No active jobs"
          description="ASR, translation, and page-translate jobs submitted by the extension appear here."
          actions={[
            { id: "refresh", label: "Refresh", onClick: () => void refresh() },
          ]}
        />
      ) : (
        <section className="panel">
          <h2>Jobs</h2>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Kind</th>
                <th>Video</th>
                <th>Status</th>
                <th>Progress</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="mono">{j.id}</td>
                  <td>{j.kind}</td>
                  <td className="mono">{j.videoId || "—"}</td>
                  <td>
                    {j.status}
                    {j.paused ? " (paused)" : ""}
                    {j.cancelled ? " (cancelled)" : ""}
                  </td>
                  <td>{Math.round(j.fraction * 100)}%</td>
                  <td>
                    <Button
                      variant="danger"
                      disabled={j.cancelled}
                      onClick={async () => {
                        try {
                          await api.cancelJob(j.id);
                          setTone("warn");
                          setStatus(`Cancelled ${j.id}`);
                          await refresh();
                        } catch (e) {
                          setTone("error");
                          setStatus(String(e));
                        }
                      }}
                    >
                      Cancel
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
