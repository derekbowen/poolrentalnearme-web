// PRNM: self-hosted Chatwoot widget (prnm-chatwoot-v1) for the EAST marketing site.
//
// Installed by ops/chatbot/ops/east_widget.py as src/components/chatwoot-widget.tsx
// and mounted from src/routes/__root.tsx as {!isAdmin && <ChatwootWidget />}.
// Same settings, CSS and show/hide behaviour as the marketplace's
// src/components/ChatwootWidget/chatwootLoader.js (keep the CSS block between the
// prnm-cw-css markers byte-identical; ops/chatbot/ops/selfcheck.py checks it).
//
// Renders nothing, on the server or the client: the SDK is fetched from
// chat.poolrentalnearme.com in an effect, i.e. only in the browser after
// hydration. The website token is public (it ships in every page) and comes from
// VITE_CHATWOOT_WEBSITE_TOKEN at build time; unset or malformed = no widget.
import { useEffect } from "react";

const BASE_URL = "https://chat.poolrentalnearme.com";
const SCRIPT_ID = "prnm-chatwoot-sdk";
const STYLE_ID = "prnm-chatwoot-style";
const OPEN_CLASS = "prnm-cw-open";
const MARK = "prnm-chatwoot-v1";
const RAW_TOKEN: unknown = import.meta.env.VITE_CHATWOOT_WEBSITE_TOKEN;
const TOKEN =
  typeof RAW_TOKEN === "string" && /^[A-Za-z0-9]{16,64}$/.test(RAW_TOKEN.trim()) ? RAW_TOKEN.trim() : "";

/* prnm-cw-css:start */
const WIDGET_CSS = `
@media (max-width: 1024px) {
  .woot-widget-bubble.woot-elements--left:not(.woot--hide) { bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important; }
}
@media (max-width: 480px) {
  .woot-widget-bubble.woot-elements--left { left: 12px !important; width: 48px !important; height: 48px !important; }
  .woot-widget-bubble.woot-elements--left svg { margin: 12px !important; }
}
@media (max-width: 666px) {
  .woot-widget-holder.has-unread-view.woot-elements--left:not(.woot--hide) { bottom: calc(154px + env(safe-area-inset-bottom, 0px)) !important; max-height: calc(100% - 174px) !important; }
}
@media (min-width: 667px) and (max-width: 1024px) {
  .woot-widget-holder.woot-elements--left:not(.woot--hide) { bottom: calc(164px + env(safe-area-inset-bottom, 0px)) !important; max-height: calc(100% - 184px) !important; }
}
html.prnm-cw-open #prnm-cta { display: none !important; }
`;
/* prnm-cw-css:end */

type ChatwootApi = {
  isOpen?: boolean;
  toggle?: (state?: "open" | "close") => void;
  toggleBubbleVisibility?: (visibility: "show" | "hide") => void;
};
type CwWindow = Window & {
  chatwootSettings?: Record<string, unknown>;
  chatwootSDK?: { run: (options: { websiteToken: string; baseUrl: string }) => void };
  $chatwoot?: ChatwootApi;
};

// One page, one widget: module state (same rules as the marketplace loader's per-window state).
const state: { visible: boolean; ready: boolean; settings: Record<string, unknown> | null } = {
  visible: true,
  ready: false,
  settings: null,
};

function setVisible(w: CwWindow, visible: boolean) {
  state.visible = visible;
  if (state.settings) state.settings.hideMessageBubble = !visible;
  const cw = w.$chatwoot;
  if (!state.ready || !cw) return;
  try {
    if (!visible && cw.isOpen && cw.toggle) cw.toggle("close");
    cw.toggleBubbleVisibility?.(visible ? "show" : "hide");
  } catch {
    // The widget must never break the page.
  }
}

function load(w: CwWindow, d: Document) {
  if (d.getElementById(SCRIPT_ID)) return;
  if (!d.getElementById(STYLE_ID)) {
    const style = d.createElement("style");
    style.id = STYLE_ID;
    style.textContent = WIDGET_CSS;
    d.head.appendChild(style);
  }
  state.settings = {
    position: "left",
    type: "standard",
    locale: "en",
    showPopoutButton: false,
    enableFileUpload: false,
    darkMode: "light",
    hideMessageBubble: !state.visible,
  };
  w.chatwootSettings = state.settings; // the SDK reads its settings from here when it runs
  const root = d.documentElement;
  w.addEventListener("chatwoot:opened", () => root.classList.add(OPEN_CLASS));
  w.addEventListener("chatwoot:closed", () => root.classList.remove(OPEN_CLASS));
  w.addEventListener("chatwoot:ready", () => {
    state.ready = true;
    setVisible(w, state.visible);
  });
  const s = d.createElement("script");
  s.id = SCRIPT_ID;
  s.dataset.prnm = MARK;
  s.src = BASE_URL + "/packs/js/sdk.js";
  s.async = true;
  s.defer = true;
  s.onload = () => {
    try {
      w.chatwootSDK?.run({ websiteToken: TOKEN, baseUrl: BASE_URL });
    } catch {
      // SDK failed: no widget; the page itself is unaffected.
    }
  };
  d.body.appendChild(s);
}

export function ChatwootWidget() {
  useEffect(() => {
    if (!TOKEN) return;
    const w = window as CwWindow;
    load(w, document);
    setVisible(w, true);
    // Unmounted (e.g. client-side navigation into /admin): hide, keep the session.
    return () => setVisible(w, false);
  }, []);
  return null;
}
