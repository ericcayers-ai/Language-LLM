import { createPageTranslateController } from "../features/page-translate/controller";
import { mountPageTranslateToolbar } from "../features/page-translate/toolbar";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  excludeMatches: [
    "*://www.youtube.com/*",
    "*://youtube.com/*",
    "*://music.youtube.com/*",
  ],
  registration: "runtime",
  async main() {
    // YouTube music / watch handled by overlay content script.
    if (/youtube\.com|youtu\.be/i.test(location.hostname)) {
      return;
    }

    const controller = createPageTranslateController(document);
    const toolbar = mountPageTranslateToolbar(controller);

    chrome.runtime.onMessage.addListener((message, _s, sendResponse) => {
      if (message?.type === "page-translate.start") {
        toolbar.update({
          localProcessing: true,
          statusMessage: "Translating locally…",
          targetLang: message.targetLang ?? "en",
        });
        void controller
          .translateNow(message.targetLang ?? "en")
          .then(() => {
            const provisionalSource = controller.lastProvisionalSource();
            toolbar.update({
              mode: controller.getMode(),
              localProcessing: false,
              statusMessage:
                provisionalSource === "companion-mock"
                  ? "OfflineMock page MT — weights not installed (companion connected)"
                  : provisionalSource === "dev-fallback"
                    ? "Provisional [dev] draft — companion unavailable (not a real translation)"
                    : "Translated on-device",
              progress: 1,
            });
            sendResponse({ ok: true, mode: controller.getMode() });
          })
          .catch((err: unknown) => {
            toolbar.update({
              localProcessing: false,
              failureMessage:
                err instanceof Error ? err.message : "Translation failed",
            });
            sendResponse({ ok: false });
          });
        return true;
      }
      if (message?.type === "page-translate.restore") {
        controller.restore();
        toolbar.update({
          mode: "original",
          statusMessage: "Original restored",
        });
        sendResponse({ ok: true });
      }
      if (message?.type === "page-translate.set-mode") {
        controller.setMode(message.mode);
        toolbar.update({ mode: message.mode });
        sendResponse({ ok: true, mode: controller.getMode() });
      }
      return false;
    });

    return () => {
      toolbar.destroy();
      controller.destroy();
    };
  },
});

declare function defineContentScript(config: {
  matches: string[];
  excludeMatches?: string[];
  registration?: string;
  main: () => void | Promise<void | (() => void)>;
}): unknown;
