import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => {
  const disk = {
    dataDirBytes: 0,
    sqliteBytes: 0,
    modelsBytes: 0,
    totalBytes: 0,
    paths: [],
  };
  return {
    api: {
      getHealth: vi.fn(async () => ({
        serviceRunning: true,
        port: 9,
        protocolVersion: "1.0.0",
        extensionIdPinned: false,
        allowedExtensionId: null,
        dataDir: "/tmp",
        sqliteReady: true,
        modelCatalogReady: true,
        activeSessions: 0,
        jobCount: 0,
        lyricsNetworkAllowed: false,
      })),
      startService: vi.fn(async () => ({})),
      stopService: vi.fn(async () => ({})),
      repairNativeHost: vi.fn(async () => ({
        ok: true,
        extensionId: "x",
        manifestPath: null,
        wrapperPath: null,
        message: "ok",
      })),
      pinExtension: vi.fn(async () => "ok"),
      listModels: vi.fn(async () => []),
      verifyModel: vi.fn(async () => ({})),
      removeModel: vi.fn(async () => true),
      installModelBytes: vi.fn(async () => ""),
      diskEstimate: vi.fn(async () => disk),
      getStorage: vi.fn(async () => ({
        retention: "days7",
        disk,
        dictionaryCount: 0,
        dictionaryEntries: 0,
        lyricsNetworkAllowed: false,
      })),
      setRetention: vi.fn(async () => "days7"),
      wipePrivacy: vi.fn(async () => ({})),
      listDictionaries: vi.fn(async () => []),
      listJobs: vi.fn(async () => []),
      cancelJob: vi.fn(async () => true),
      getHardware: vi.fn(async () => ({
        ramGb: 16,
        vramGb: 0,
        recommendedProfile: "balanced",
        selectedProfile: "balanced",
        backends: [],
        notes: "",
      })),
      setHardwareProfile: vi.fn(async () => ({})),
      discoverBackends: vi.fn(async () => []),
      listLicenses: vi.fn(async () => []),
      getUpdateStatus: vi.fn(async () => ({
        configured: false,
        pubkeyConfigured: false,
        endpoints: [],
        currentVersion: "0.1.0",
        message: "unconfigured",
      })),
      exportLogs: vi.fn(async () => "/tmp/logs.txt"),
      getDiagnostics: vi.fn(async () => ({})),
      setLyricsNetwork: vi.fn(async () => false),
    },
    formatBytes: (n: number) => `${n} B`,
    isTauri: () => false,
  };
});

import App from "./App";

afterEach(() => {
  cleanup();
});

describe("Desktop manager shell", () => {
  it("exposes nav landmarks and switches views", () => {
    render(<App />);
    expect(
      screen.getByRole("navigation", { name: /desktop manager/i }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Models" }));
    expect(
      screen.getByText(/Download verify\/remove model packs/i),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Storage & privacy" }));
    expect(screen.getByText(/Retention presets/i)).toBeTruthy();
  });
});
