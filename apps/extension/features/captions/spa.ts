/**
 * YouTube SPA navigation detection without polling the whole DOM.
 */

export type YtPageKind = "watch" | "shorts" | "live" | "music" | "other";

export function extractVideoId(href: string): string | null {
  try {
    const u = new URL(href);
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const shorts = u.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shorts) return shorts[1]!;
      const live = u.pathname.match(/^\/live\/([^/?]+)/);
      if (live) return live[1]!;
    }
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1) || null;
    }
    if (u.hostname.includes("music.youtube.com")) {
      return u.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

export function classifyYtPage(href: string): YtPageKind {
  const u = href.toLowerCase();
  if (u.includes("music.youtube.com")) return "music";
  if (u.includes("/shorts/")) return "shorts";
  if (u.includes("/live/") || u.includes("live=1")) return "live";
  if (u.includes("/watch")) return "watch";
  return "other";
}

export function subscribeYtNavigation(
  onNavigate: (info: { href: string; videoId: string | null }) => void,
): () => void {
  let last = "";
  const emit = () => {
    const href = location.href;
    if (href === last) return;
    last = href;
    onNavigate({ href, videoId: extractVideoId(href) });
  };
  const obs = new MutationObserver(() => emit());
  obs.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("yt-navigate-finish", emit as EventListener);
  window.addEventListener("popstate", emit);
  emit();
  return () => {
    obs.disconnect();
    window.removeEventListener("yt-navigate-finish", emit as EventListener);
    window.removeEventListener("popstate", emit);
  };
}
