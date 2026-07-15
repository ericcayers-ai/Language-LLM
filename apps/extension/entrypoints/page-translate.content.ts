import { createPageTranslateController } from "../features/page-translate/controller";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  excludeMatches: [
    "*://www.youtube.com/*",
    "*://youtube.com/*",
    "*://music.youtube.com/*",
  ],
  registration: "runtime",
  async main() {
    const controller = createPageTranslateController(document);
    chrome.runtime.onMessage.addListener((message, _s, sendResponse) => {
      if (message?.type === "page-translate.start") {
        void controller.translateNow(message.targetLang ?? "en").then(() =>
          sendResponse({ ok: true, mode: controller.getMode() }),
        );
        return true;
      }
      if (message?.type === "page-translate.restore") {
        controller.restore();
        sendResponse({ ok: true });
      }
      if (message?.type === "page-translate.set-mode") {
        controller.setMode(message.mode);
        sendResponse({ ok: true, mode: controller.getMode() });
      }
      return false;
    });
    return () => controller.destroy();
  },
});

declare function defineContentScript(config: {
  matches: string[];
  excludeMatches?: string[];
  registration?: string;
  main: () => void | Promise<void | (() => void)>;
}): unknown;
