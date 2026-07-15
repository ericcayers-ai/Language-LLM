import { invoke } from "@tauri-apps/api/core";

export interface HealthSnapshot {
  serviceRunning: boolean;
  port: number;
  protocolVersion: string;
  extensionIdPinned: boolean;
  allowedExtensionId: string | null;
  dataDir: string;
  sqliteReady: boolean;
  modelCatalogReady: boolean;
  activeSessions: number;
  jobCount: number;
  lyricsNetworkAllowed: boolean;
}

export interface ModelStatusEntry {
  id: string;
  family: string;
  task: string;
  licenseClass: string | null;
  commercialDefault: boolean;
  hardwareMin: string | null;
  backend: string | null;
  installed: boolean;
  diskBytes: number;
  downloadUrlHint: string | null;
  notes: string | null;
}

export interface DiskEstimate {
  dataDirBytes: number;
  sqliteBytes: number;
  modelsBytes: number;
  totalBytes: number;
  paths: { label: string; path: string; bytes: number }[];
}

export interface StorageSnapshot {
  retention: string;
  disk: DiskEstimate;
  dictionaryCount: number;
  dictionaryEntries: number;
  lyricsNetworkAllowed: boolean;
}

export interface DictionaryMeta {
  id: string;
  name: string;
  language: string;
  license: string;
  entryCount: number;
  payloadPath: string;
  importedAtMs: number;
}

export interface JobView {
  id: string;
  kind: string;
  videoId: string;
  status: string;
  fraction: number;
  cancelled: boolean;
  paused: boolean;
}

export interface BackendDiscovery {
  name: string;
  kind: string;
  available: boolean;
  path: string | null;
  detail: string;
}

export interface HardwareSnapshot {
  ramGb: number;
  vramGb: number;
  recommendedProfile: string;
  selectedProfile: string;
  backends: BackendDiscovery[];
  notes: string;
}

export interface LicenseEntry {
  id: string;
  family: string;
  task: string;
  licenseClass: string | null;
  commercialDefault: boolean;
  notes: string | null;
}

export interface UpdateStatus {
  configured: boolean;
  pubkeyConfigured: boolean;
  endpoints: string[];
  currentVersion: string;
  message: string;
}

export interface NativeHostRepairResult {
  ok: boolean;
  extensionId: string;
  manifestPath: string | null;
  wrapperPath: string | null;
  message: string;
}

export interface ModelVerifyReport {
  modelId: string;
  installed: boolean;
  digestOk: boolean;
  expectedDigest: string | null;
  actualDigest: string | null;
  markerPresent: boolean;
  weightPath: string | null;
}

/** Detect whether we are inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error(`Tauri IPC unavailable for ${cmd} (open via desktop app)`);
  }
  return invoke<T>(cmd, args);
}

export const api = {
  getHealth: () => call<HealthSnapshot>("get_health"),
  startService: () => call<HealthSnapshot>("start_service"),
  stopService: () => call<HealthSnapshot>("stop_service"),
  listModels: () => call<ModelStatusEntry[]>("list_models"),
  verifyModel: (modelId: string) =>
    call<ModelVerifyReport>("verify_model", { modelId }),
  removeModel: (modelId: string) => call<boolean>("remove_model", { modelId }),
  installModelBytes: (modelId: string, filename: string, bytes: number[]) =>
    call<string>("install_model_bytes", { modelId, filename, bytes }),
  diskEstimate: () => call<DiskEstimate>("disk_estimate"),
  getStorage: () => call<StorageSnapshot>("get_storage"),
  setRetention: (preset: string) => call<string>("set_retention", { preset }),
  wipePrivacy: (scope: string) => call<unknown>("wipe_privacy", { scope }),
  listDictionaries: () => call<DictionaryMeta[]>("list_dictionaries"),
  listJobs: () => call<JobView[]>("list_jobs"),
  cancelJob: (jobId: string) => call<boolean>("cancel_job", { jobId }),
  getHardware: () => call<HardwareSnapshot>("get_hardware"),
  setHardwareProfile: (profile: string) =>
    call<HardwareSnapshot>("set_hardware_profile", { profile }),
  discoverBackends: () => call<BackendDiscovery[]>("discover_backends"),
  listLicenses: () => call<LicenseEntry[]>("list_licenses"),
  getUpdateStatus: () => call<UpdateStatus>("get_update_status"),
  exportLogs: (dest?: string) =>
    call<string>("export_logs", dest ? { dest } : {}),
  pinExtension: (extensionId: string) =>
    call<string>("pin_extension", { extensionId }),
  repairNativeHost: (extensionId: string) =>
    call<NativeHostRepairResult>("repair_native_host_registration", {
      extensionId,
    }),
  getDiagnostics: () => call<Record<string, unknown>>("get_diagnostics"),
  setLyricsNetwork: (allowed: boolean) =>
    call<boolean>("set_lyrics_network", { allowed }),
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
