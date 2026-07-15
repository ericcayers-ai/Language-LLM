import { Button, StatusRegion } from "@language-llm/ui";
import { useEffect, useState } from "react";
import { api, type HardwareSnapshot } from "../api";

const PROFILES = ["lite", "balanced", "quality", "workstation"] as const;

export function HardwareView() {
  const [hw, setHw] = useState<HardwareSnapshot | null>(null);
  const [status, setStatus] = useState("");
  const [tone, setTone] = useState<"info" | "success" | "warn" | "error">(
    "info",
  );

  const refresh = async () => setHw(await api.getHardware());

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
        <h2>Hardware profile</h2>
        {hw ? (
          <>
            <p className="meta">
              RAM ≈ {hw.ramGb} GB · VRAM probe {hw.vramGb} GB · recommended{" "}
              <strong>{hw.recommendedProfile}</strong> · selected{" "}
              <strong>{hw.selectedProfile}</strong>
            </p>
            <p className="meta">{hw.notes}</p>
            <div className="row">
              {PROFILES.map((p) => (
                <Button
                  key={p}
                  variant={hw.selectedProfile === p ? "primary" : "ghost"}
                  onClick={async () => {
                    try {
                      setHw(await api.setHardwareProfile(p));
                      setTone("success");
                      setStatus(`Hardware profile set to ${p}`);
                    } catch (e) {
                      setTone("error");
                      setStatus(String(e));
                    }
                  }}
                >
                  {p}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <p className="meta">Probing…</p>
        )}
      </section>

      <section className="panel">
        <h2>Backend discovery</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Backend</th>
              <th>Kind</th>
              <th>Available</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {(hw?.backends ?? []).map((b) => (
              <tr key={b.name}>
                <td>{b.name}</td>
                <td>{b.kind}</td>
                <td>{b.available ? "yes" : "no"}</td>
                <td>
                  <div>{b.detail}</div>
                  {b.path ? <div className="mono meta">{b.path}</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button
          variant="ghost"
          style={{ marginTop: "0.75rem" }}
          onClick={() => void refresh()}
        >
          Re-probe
        </Button>
      </section>
    </div>
  );
}
