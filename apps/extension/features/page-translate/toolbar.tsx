import React, { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  injectTokenStyles,
  isDensityProfile,
  PageTranslateToolbar,
  type DensityProfile,
  type PageTranslateMode,
} from "@language-llm/ui";
import type { PageTranslateController } from "./controller";

export interface ToolbarSnapshot {
  mode: PageTranslateMode;
  targetLang: string;
  progress?: number;
  statusMessage?: string;
  localProcessing?: boolean;
  failureMessage?: string;
}

export interface ToolbarHandle {
  update: (patch: Partial<ToolbarSnapshot>) => void;
  destroy: () => void;
}

function ToolbarApp({
  controller,
  density,
  snapshot,
  onModeSynced,
  onSnapshotPatch,
}: {
  controller: PageTranslateController;
  density: DensityProfile;
  snapshot: ToolbarSnapshot;
  onModeSynced: (mode: PageTranslateMode) => void;
  onSnapshotPatch: (patch: Partial<ToolbarSnapshot>) => void;
}) {
  const [busy, setBusy] = useState(false);

  const runTranslate = (lang: string) => {
    setBusy(true);
    onSnapshotPatch({
      localProcessing: true,
      statusMessage: "Translating locally…",
    });
    void controller
      .translateNow(lang)
      .then(() => {
        const provisionalSource = controller.lastProvisionalSource();
        onModeSynced(controller.getMode() as PageTranslateMode);
        onSnapshotPatch({
          localProcessing: false,
          statusMessage:
            provisionalSource === "companion-mock"
              ? "OfflineMock page MT — weights not installed (companion connected)"
              : provisionalSource === "dev-fallback"
                ? "Provisional [dev] draft — companion unavailable (not a real translation)"
                : "Translated on-device",
          progress: 1,
          failureMessage: "",
        });
      })
      .catch((err: unknown) => {
        onSnapshotPatch({
          localProcessing: false,
          failureMessage:
            err instanceof Error ? err.message : "Translation failed",
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <div data-llm-density={density} style={{ pointerEvents: "auto" }}>
      <PageTranslateToolbar
        mode={snapshot.mode}
        targetLang={snapshot.targetLang}
        {...(snapshot.progress != null ? { progress: snapshot.progress } : {})}
        {...(snapshot.statusMessage
          ? { statusMessage: snapshot.statusMessage }
          : {})}
        localProcessing={Boolean(snapshot.localProcessing) || busy}
        {...(snapshot.failureMessage
          ? { failureMessage: snapshot.failureMessage }
          : {})}
        onModeChange={(next) => {
          controller.setMode(next);
          onModeSynced(next);
        }}
        onRestore={() => {
          controller.restore();
          onModeSynced("original");
        }}
        onTargetLangChange={(lang) => {
          onSnapshotPatch({ targetLang: lang });
          runTranslate(lang);
        }}
        onRetry={() => runTranslate(snapshot.targetLang)}
      />
    </div>
  );
}

/** Mount in-page Shadow DOM toolbar for website translation. */
export function mountPageTranslateToolbar(
  controller: PageTranslateController,
  parent: HTMLElement = document.documentElement,
): ToolbarHandle {
  const host = document.createElement("div");
  host.id = "language-llm-page-toolbar";
  host.setAttribute("data-llm-page-toolbar", "true");
  host.style.cssText =
    "all:initial;position:fixed;top:12px;right:12px;z-index:2147483646;pointer-events:none;";
  parent.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  injectTokenStyles(shadow);
  const mountPoint = document.createElement("div");
  mountPoint.className = "llm-shadow-root";
  shadow.appendChild(mountPoint);

  let density: DensityProfile = "balanced";
  let snapshot: ToolbarSnapshot = {
    mode: controller.getMode() as PageTranslateMode,
    targetLang: "en",
    statusMessage: "Local processing",
    localProcessing: false,
  };

  let root: Root | null = createRoot(mountPoint);

  const paint = () => {
    host.setAttribute("data-llm-density", density);
    root?.render(
      <ToolbarApp
        controller={controller}
        density={density}
        snapshot={snapshot}
        onModeSynced={(mode) => {
          snapshot = { ...snapshot, mode };
          paint();
        }}
        onSnapshotPatch={(patch) => {
          snapshot = { ...snapshot, ...patch };
          paint();
        }}
      />,
    );
  };

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.get("language-llm.density-profile", (v) => {
      if (isDensityProfile(v["language-llm.density-profile"])) {
        density = v["language-llm.density-profile"];
        paint();
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const next = changes["language-llm.density-profile"]?.newValue;
      if (isDensityProfile(next)) {
        density = next;
        paint();
      }
    });
  }

  paint();

  return {
    update: (patch) => {
      snapshot = { ...snapshot, ...patch };
      paint();
    },
    destroy: () => {
      root?.unmount();
      root = null;
      host.remove();
    },
  };
}
