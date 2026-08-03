import { defineConfig } from "wxt";

// Least-privilege MV3: YouTube + Netflix match patterns by default;
// page-translate uses activeTab / optional_host_permissions.
export default defineConfig({
  modules: [],
  manifest: {
    name: "Language-LLM",
    description:
      "Local-first captions, translation, website translate, and store-safe lyrics — inference stays on your machine.",
    permissions: [
      "storage",
      "activeTab",
      "offscreen",
      "tabCapture",
      "nativeMessaging",
      "scripting",
      "sidePanel",
    ],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    host_permissions: [
      "*://www.youtube.com/*",
      "*://youtube.com/*",
      "*://music.youtube.com/*",
      "*://m.youtube.com/*",
      "*://www.netflix.com/*",
    ],
    action: {
      default_title: "Language-LLM",
    },
    side_panel: {
      default_path: "sidepanel.html",
    },
    externally_connectable: {
      matches: [],
    },
  },
  vite: () => ({
    resolve: {
      alias: {
        "@": new URL("./", import.meta.url).pathname,
      },
    },
  }),
});
