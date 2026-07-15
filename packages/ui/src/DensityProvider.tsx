import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DEFAULT_DENSITY,
  DEFAULT_THEME,
  densityCssVars,
  isDensityProfile,
  isThemePreference,
  type DensityProfile,
  type ThemePreference,
} from "./density.js";

export interface DensityContextValue {
  profile: DensityProfile;
  theme: ThemePreference;
  setProfile: (profile: DensityProfile) => void;
  setTheme: (theme: ThemePreference) => void;
}

const DensityContext = createContext<DensityContextValue | null>(null);

type StorageLike = {
  get: (
    keys: string[],
    cb: (items: Record<string, unknown>) => void,
  ) => void;
  set: (items: Record<string, unknown>) => void;
};

type StorageChangeApi = {
  onChanged: {
    addListener: (
      cb: (
        changes: Record<string, { newValue?: unknown }>,
        area: string,
      ) => void,
    ) => void;
    removeListener: (
      cb: (
        changes: Record<string, { newValue?: unknown }>,
        area: string,
      ) => void,
    ) => void;
  };
};

function chromeLocalStorage(): StorageLike | null {
  const g = globalThis as {
    chrome?: { storage?: { local?: StorageLike } & StorageChangeApi };
  };
  return g.chrome?.storage?.local ?? null;
}

function chromeStorageApi(): StorageChangeApi | null {
  const g = globalThis as {
    chrome?: { storage?: StorageChangeApi };
  };
  return g.chrome?.storage ?? null;
}

export interface DensityProviderProps {
  children: ReactNode;
  profile?: DensityProfile;
  theme?: ThemePreference;
  /** Persist via chrome.storage.local when available. */
  persist?: boolean;
  onProfileChange?: (profile: DensityProfile) => void;
  onThemeChange?: (theme: ThemePreference) => void;
}

export function DensityProvider({
  children,
  profile: profileProp,
  theme: themeProp,
  persist = false,
  onProfileChange,
  onThemeChange,
}: DensityProviderProps) {
  const [profile, setProfileState] = useState<DensityProfile>(
    profileProp ?? DEFAULT_DENSITY,
  );
  const [theme, setThemeState] = useState<ThemePreference>(
    themeProp ?? DEFAULT_THEME,
  );

  useEffect(() => {
    if (profileProp) setProfileState(profileProp);
  }, [profileProp]);

  useEffect(() => {
    if (themeProp) setThemeState(themeProp);
  }, [themeProp]);

  useEffect(() => {
    if (!persist) return;
    const local = chromeLocalStorage();
    const api = chromeStorageApi();
    if (!local || !api) return;

    local.get(
      ["language-llm.density-profile", "language-llm.theme"],
      (v) => {
        if (isDensityProfile(v["language-llm.density-profile"])) {
          setProfileState(v["language-llm.density-profile"]);
        }
        if (isThemePreference(v["language-llm.theme"])) {
          setThemeState(v["language-llm.theme"]);
        }
      },
    );

    const onChange = (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ) => {
      if (area !== "local") return;
      const d = changes["language-llm.density-profile"]?.newValue;
      if (isDensityProfile(d)) setProfileState(d);
      const t = changes["language-llm.theme"]?.newValue;
      if (isThemePreference(t)) setThemeState(t);
    };
    api.onChanged.addListener(onChange);
    return () => api.onChanged.removeListener(onChange);
  }, [persist]);

  const setProfile = (next: DensityProfile) => {
    setProfileState(next);
    onProfileChange?.(next);
    if (persist) {
      chromeLocalStorage()?.set({ "language-llm.density-profile": next });
    }
  };

  const setTheme = (next: ThemePreference) => {
    setThemeState(next);
    onThemeChange?.(next);
    if (persist) {
      chromeLocalStorage()?.set({ "language-llm.theme": next });
    }
  };

  const value = useMemo(
    () => ({ profile, theme, setProfile, setTheme }),
    [profile, theme],
  );

  const style = densityCssVars(profile) as CSSProperties;

  return (
    <DensityContext.Provider value={value}>
      <div
        className="llm-surface"
        data-llm-density={profile}
        {...(theme === "system" ? {} : { "data-llm-theme": theme })}
        style={style}
      >
        {children}
      </div>
    </DensityContext.Provider>
  );
}

export function useDensity(): DensityContextValue {
  const ctx = useContext(DensityContext);
  if (!ctx) {
    return {
      profile: DEFAULT_DENSITY,
      theme: DEFAULT_THEME,
      setProfile: () => undefined,
      setTheme: () => undefined,
    };
  }
  return ctx;
}
