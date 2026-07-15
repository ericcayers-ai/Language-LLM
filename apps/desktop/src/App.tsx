import {
  Button,
  DensityProvider,
  ProfilePicker,
  useDensity,
  type DensityProfile,
} from "@language-llm/ui";
import { useEffect, useState } from "react";
import { DictionariesView } from "./views/DictionariesView";
import { DiagnosticsView } from "./views/DiagnosticsView";
import { HardwareView } from "./views/HardwareView";
import { JobsView } from "./views/JobsView";
import { LicensesView } from "./views/LicensesView";
import { ModelsView } from "./views/ModelsView";
import { OverviewView } from "./views/OverviewView";
import { StorageView } from "./views/StorageView";
import { UpdatesView } from "./views/UpdatesView";

type NavId =
  | "overview"
  | "models"
  | "dictionaries"
  | "storage"
  | "jobs"
  | "hardware"
  | "diagnostics"
  | "licenses"
  | "updates";

const NAV: { id: NavId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "models", label: "Models" },
  { id: "dictionaries", label: "Dictionaries" },
  { id: "storage", label: "Storage & privacy" },
  { id: "jobs", label: "Jobs" },
  { id: "hardware", label: "Hardware" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "licenses", label: "Licenses" },
  { id: "updates", label: "Updates" },
];

const DESCRIPTIONS: Record<NavId, string> = {
  overview: "Companion health, start/stop, and native-host repair.",
  models: "Download verify/remove model packs with disk estimates.",
  dictionaries: "Companion SQLite dictionary metadata and attribution.",
  storage: "Retention presets, disk usage, and privacy wipe scopes.",
  jobs: "Active ASR/translate/page-translate jobs with cancel.",
  hardware: "Hardware profile selection and backend discovery.",
  diagnostics: "Redacted log export and expert runtime snapshot.",
  licenses: "Commercial-default vs research-opt-in model packs.",
  updates: "Signed update plumbing without embedded private keys.",
};

const DENSITY_KEY = "language-llm.desktop.density-profile";

function readDensity(): DensityProfile {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    if (v === "focus" || v === "balanced" || v === "expert") return v;
  } catch {
    /* ignore */
  }
  return "balanced";
}

function Shell() {
  const [nav, setNav] = useState<NavId>("overview");
  const { profile, setProfile } = useDensity();

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, profile);
    } catch {
      /* ignore */
    }
  }, [profile]);

  return (
    <div className="desktop-shell">
      <nav className="desktop-nav" aria-label="Desktop manager">
        <p className="desktop-brand">Language-LLM</p>
        {NAV.map((item) => (
          <Button
            key={item.id}
            variant={nav === item.id ? "primary" : "ghost"}
            aria-current={nav === item.id ? "page" : undefined}
            onClick={() => setNav(item.id)}
          >
            {item.label}
          </Button>
        ))}
        <div style={{ marginTop: "auto" }}>
          <ProfilePicker value={profile} onChange={setProfile} compact />
        </div>
      </nav>
      <main className="desktop-main">
        <header className="desktop-header">
          <div>
            <h1>{NAV.find((n) => n.id === nav)?.label}</h1>
            <p>{DESCRIPTIONS[nav]}</p>
          </div>
        </header>
        {nav === "overview" ? <OverviewView /> : null}
        {nav === "models" ? <ModelsView /> : null}
        {nav === "dictionaries" ? <DictionariesView /> : null}
        {nav === "storage" ? <StorageView /> : null}
        {nav === "jobs" ? <JobsView /> : null}
        {nav === "hardware" ? <HardwareView /> : null}
        {nav === "diagnostics" ? <DiagnosticsView /> : null}
        {nav === "licenses" ? <LicensesView /> : null}
        {nav === "updates" ? <UpdatesView /> : null}
      </main>
    </div>
  );
}

export default function App() {
  const [density, setDensity] = useState<DensityProfile>(() => readDensity());
  return (
    <DensityProvider profile={density} onProfileChange={setDensity}>
      <Shell />
    </DensityProvider>
  );
}
