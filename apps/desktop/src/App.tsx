import {
  Button,
  DensityProvider,
  ProfilePicker,
  useDensity,
  type DensityProfile,
} from "@language-llm/ui";
import { useEffect, useId, useRef, useState } from "react";
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

type NavGroup = {
  id: string;
  label: string;
  items: { id: NavId; label: string }[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    label: "Home",
    items: [{ id: "overview", label: "Overview" }],
  },
  {
    id: "library",
    label: "Library",
    items: [
      { id: "models", label: "Models" },
      { id: "dictionaries", label: "Dictionaries" },
    ],
  },
  {
    id: "work",
    label: "Work",
    items: [{ id: "jobs", label: "Jobs" }],
  },
  {
    id: "system",
    label: "System",
    items: [
      { id: "hardware", label: "Hardware" },
      { id: "storage", label: "Storage & privacy" },
      { id: "diagnostics", label: "Diagnostics" },
    ],
  },
  {
    id: "about",
    label: "About",
    items: [
      { id: "licenses", label: "Licenses" },
      { id: "updates", label: "Updates" },
    ],
  },
];

const FLAT_NAV = NAV_GROUPS.flatMap((g) => g.items);

const DESCRIPTIONS: Record<NavId, string> = {
  overview: "Companion health, start/stop, and native-host repair.",
  models: "Download, verify, and remove model packs with disk estimates.",
  dictionaries: "Companion SQLite dictionary metadata and attribution.",
  storage: "Retention presets, disk usage, and privacy wipe scopes.",
  jobs: "Active ASR, translate, and page-translate jobs with cancel.",
  hardware: "Hardware profile selection and backend discovery.",
  diagnostics: "Redacted log export and expert runtime snapshot.",
  licenses: "Commercial-default vs research-opt-in model packs.",
  updates: "Signed update plumbing without embedded private keys.",
};

const DENSITY_KEY = "language-llm.desktop.density-profile";
const NAV_KEY = "language-llm.desktop.nav";

function readDensity(): DensityProfile {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    if (v === "focus" || v === "balanced" || v === "expert") return v;
  } catch {
    /* ignore */
  }
  return "balanced";
}

function readNav(): NavId {
  try {
    const v = localStorage.getItem(NAV_KEY);
    if (FLAT_NAV.some((n) => n.id === v)) return v as NavId;
  } catch {
    /* ignore */
  }
  return "overview";
}

function Shell() {
  const [nav, setNav] = useState<NavId>(() => readNav());
  const { profile, setProfile } = useDensity();
  const mainId = useId();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, profile);
    } catch {
      /* ignore */
    }
  }, [profile]);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_KEY, nav);
    } catch {
      /* ignore */
    }
  }, [nav]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const inNav = Boolean(navRef.current?.contains(document.activeElement));
      const cycle =
        e.key === "j" ||
        e.key === "k" ||
        (inNav && (e.key === "ArrowDown" || e.key === "ArrowUp"));
      if (!cycle) return;
      e.preventDefault();
      const idx = FLAT_NAV.findIndex((n) => n.id === nav);
      const forward = e.key === "j" || e.key === "ArrowDown";
      const next = forward
        ? FLAT_NAV[(idx + 1) % FLAT_NAV.length]
        : FLAT_NAV[(idx - 1 + FLAT_NAV.length) % FLAT_NAV.length];
      if (next) setNav(next.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  const current = FLAT_NAV.find((n) => n.id === nav);

  return (
    <div className="desktop-shell">
      <a className="desktop-skip" href={`#${mainId}`}>
        Skip to content
      </a>
      <nav
        ref={navRef}
        className="desktop-nav"
        aria-label="Desktop manager"
      >
        <div className="desktop-brand">
          <p className="desktop-brand__name">Language-LLM</p>
          <p className="desktop-brand__tag">Local companion manager</p>
        </div>
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="desktop-nav__group">
            <p className="desktop-nav__label">{group.label}</p>
            {group.items.map((item) => (
              <Button
                key={item.id}
                variant="nav"
                aria-current={nav === item.id ? "page" : undefined}
                onClick={() => setNav(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        ))}
        <div className="desktop-nav__footer">
          <ProfilePicker value={profile} onChange={setProfile} compact />
          <p className="meta">Press j / k to move between pages</p>
        </div>
      </nav>
      <main className="desktop-main" id={mainId}>
        <header className="desktop-header">
          <div>
            <h1>{current?.label}</h1>
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
