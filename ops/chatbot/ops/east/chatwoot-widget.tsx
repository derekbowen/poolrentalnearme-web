// PRNM: self-hosted Chatwoot widget (prnm-chatwoot-v1) for the EAST marketing site.
//
// Installed by ops/chatbot/ops/east_widget.py as src/components/chatwoot-widget.tsx
// and mounted from src/routes/__root.tsx as {!isAdmin && <ChatwootWidget />}.
// Same settings, CSS and behaviour as the marketplace's
// src/components/ChatwootWidget/chatwootLoader.js (keep the CSS block between the
// prnm-cw-css markers byte-identical; ops/chatbot/ops/selfcheck.py checks it).
//
// - Renders nothing on the server or in the hydration render; after mount it
//   shows the PRNM launcher (#prnm-chat-launcher, bottom-left).
// - sdk.js is fetched from chat.poolrentalnearme.com only when the visitor clicks
//   the launcher, or on mount when a cw_conversation cookie shows they have
//   chatted before (so replies reach them). Crawlers and visitors who never click
//   create no Chatwoot contact and hold no websocket.
// - The script tag carries integrity (VITE_CHATWOOT_SDK_SRI, sha384) and
//   crossorigin="anonymous". Token or SRI unset or malformed: nothing renders.
//   Its URL carries ?v=<part of the SRI>, so a new SRI always means a new URL.
// - Chatwoot's own bubble is hidden; the launcher opens and closes the chat.
// - Hidden while a dialog holds the body scroll lock (the mobile menu sets
//   body overflow hidden; Radix dialogs set data-scroll-locked). While hidden,
//   <html> carries prnm-cw-hidden and the CSS keeps the SDK's window invisible, so
//   a reply that arrives then (the SDK's unread preview) cannot pop over the
//   dialog; it shows once the dialog closes. A preview already on screen when the
//   dialog opens is kept the same way, not closed (closing would mark it read).
// Both env values are public build-time values (east_widget.py writes them to
// .env.production.local for the build).
import { useEffect, useState, useSyncExternalStore } from "react";

const BASE_URL = "https://chat.poolrentalnearme.com";
const SDK_URL = BASE_URL + "/packs/js/sdk.js";
const SCRIPT_ID = "prnm-chatwoot-sdk";
const STYLE_ID = "prnm-chatwoot-style";
const LAUNCHER_ID = "prnm-chat-launcher";
const LAUNCHER_LABEL = "Chat with Pool Rental Near Me";
const FALLBACK_EMAIL = "support@poolrentalnearme.com"; // only if sdk.js or the chat window fails to load
const OPEN_CLASS = "prnm-cw-open";
const HIDDEN_CLASS = "prnm-cw-hidden"; // on <html> while hidden: WIDGET_CSS keeps the SDK window invisible
const HOLDER_ID = "cw-widget-holder"; // ids the 4.16.2 SDK creates (sdk/IFrameHelper.js)
const FRAME_ID = "chatwoot_live_chat_widget";
const LOAD_TIMEOUT_MS = 20000;
const MARK = "prnm-chatwoot-v1";

function clean(value: unknown, re: RegExp): string {
  const t = typeof value === "string" ? value.trim() : "";
  return re.test(t) ? t : "";
}
const TOKEN = clean(import.meta.env.VITE_CHATWOOT_WEBSITE_TOKEN, /^[A-Za-z0-9]{16,64}$/);
const SRI = clean(import.meta.env.VITE_CHATWOOT_SDK_SRI, /^sha384-[A-Za-z0-9+/]{64}$/);
const ENABLED = TOKEN !== "" && SRI !== "";
// sdk.js is served with a one-year cache-control: a URL that changes with the SRI
// keeps a browser or CDN from serving an old copy that fails the new integrity
// check after a Chatwoot image change (nginx and Rails ignore the query).
const SDK_SRC = SDK_URL + "?v=" + encodeURIComponent(SRI.slice(7, 23));

// Inbox-side settings (attachments off, end-conversation off) are set by cw_setup.rb.
const SDK_SETTINGS = {
  position: "left",
  type: "standard",
  locale: "en",
  showPopoutButton: false,
  enableFileUpload: false,
  enableEndConversation: false,
  darkMode: "light",
  hideMessageBubble: true,
} as const;

/* prnm-cw-css:start */
const WIDGET_CSS = `
#prnm-chat-launcher { position: fixed; left: 20px; bottom: calc(20px + env(safe-area-inset-bottom, 0px)); z-index: 2147482999; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; margin: 0; padding: 0 18px 0 14px; border: 0; border-radius: 22px; background: #0b6ea8; color: #fff; font: 700 15px/1 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; letter-spacing: 0; text-transform: none; text-decoration: none; white-space: nowrap; box-shadow: 0 6px 20px rgba(10, 40, 70, .28); cursor: pointer; -webkit-tap-highlight-color: transparent; }
#prnm-chat-launcher:hover { background: #095d8e; color: #fff; }
#prnm-chat-launcher:focus-visible { outline: 3px solid #12212e; outline-offset: 2px; }
#prnm-chat-launcher svg { display: block; flex: none; width: 20px; height: 20px; }
#prnm-chat-launcher[aria-busy="true"] { cursor: progress; }
#prnm-chat-launcher[aria-busy="true"] svg { animation: prnm-cw-pulse .8s ease-in-out infinite alternate; }
@keyframes prnm-cw-pulse { to { opacity: .3; } }
@media (prefers-reduced-motion: reduce) {
  #prnm-chat-launcher[aria-busy="true"] svg { animation: none; }
}
@media (max-width: 1024px) {
  #prnm-chat-launcher { bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
}
@media (max-width: 480px) {
  #prnm-chat-launcher { left: 10px; width: 48px; height: 52px; padding: 7px 0 6px; flex-direction: column; gap: 4px; border-radius: 14px; font-size: 11px; }
}
@media (min-width: 1025px) {
  .woot-widget-holder.woot-elements--left:not(.woot--hide) { bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important; max-height: min(640px, calc(100% - 96px)) !important; }
}
@media (min-width: 667px) and (max-width: 1024px) {
  .woot-widget-holder.woot-elements--left:not(.woot--hide) { top: auto !important; bottom: calc(136px + env(safe-area-inset-bottom, 0px)) !important; max-height: min(640px, calc(100% - 156px)) !important; min-height: 0 !important; }
  .woot-widget-holder.woot-elements--left:not(.woot--hide):not(.has-unread-view) { max-height: min(640px, calc(100% - 216px)) !important; }
}
@media (min-width: 667px) and (max-width: 1024px) and (max-height: 465px) {
  #prnm-chat-launcher { left: 10px; width: 48px; height: 52px; padding: 7px 0 6px; flex-direction: column; gap: 4px; border-radius: 14px; font-size: 11px; }
  .woot-widget-holder.woot-elements--left:not(.woot--hide):not(.has-unread-view) { top: env(safe-area-inset-top, 0px) !important; bottom: env(safe-area-inset-bottom, 0px) !important; left: 68px !important; height: auto !important; max-height: none !important; border-radius: 0 !important; }
  .woot-widget-holder.has-unread-view.woot-elements--left:not(.woot--hide) { bottom: calc(144px + env(safe-area-inset-bottom, 0px)) !important; max-height: calc(100% - 164px) !important; }
}
@media (max-width: 666px) {
  .woot-widget-holder.has-unread-view.woot-elements--left:not(.woot--hide) { bottom: calc(144px + env(safe-area-inset-bottom, 0px)) !important; max-height: calc(100% - 164px) !important; }
}
html.prnm-cw-open #prnm-cta { display: none !important; }
html.prnm-cw-hidden #cw-widget-holder { visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }
@media print {
  #prnm-chat-launcher { display: none !important; }
}
`;
/* prnm-cw-css:end */

type Phase = "idle" | "loading" | "ready" | "failed";
type View = "closed" | "unread" | "open";
type Snapshot = { readonly phase: Phase; readonly view: View; readonly busy: boolean };
type CwWindow = Window & {
  chatwootSettings?: Record<string, unknown>;
  chatwootSDK?: { run: (options: { websiteToken: string; baseUrl: string }) => void };
  $chatwoot?: { isOpen?: boolean; toggle?: (state?: "open" | "close") => void };
};

const IDLE: Snapshot = { phase: "idle", view: "closed", busy: false };

// One page, one widget: module state (same rules as the marketplace loader's per-window state).
const st = {
  phase: "idle" as Phase,
  view: "closed" as View,
  wantOpen: false,
  hidden: false,
  timer: 0,
  snap: IDLE,
};
const subscribers = new Set<() => void>();

function emit() {
  const next: Snapshot = {
    phase: st.phase,
    view: st.view,
    busy: st.wantOpen && st.phase === "loading",
  };
  if (next.phase === st.snap.phase && next.view === st.snap.view && next.busy === st.snap.busy)
    return;
  st.snap = next;
  subscribers.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function callToggle(w: CwWindow, how: "open" | "close") {
  try {
    w.$chatwoot?.toggle?.(how);
  } catch {
    // The widget must never break the page.
  }
}

function viewOf(w: CwWindow, d: Document): View {
  const holder = d.getElementById(HOLDER_ID);
  if (holder) {
    if (holder.classList.contains("woot--hide")) return "closed";
    return holder.classList.contains("has-unread-view") ? "unread" : "open";
  }
  return w.$chatwoot?.isOpen ? "open" : "closed";
}

// <html> classes: HIDDEN_CLASS while hidden, OPEN_CLASS (it hides #prnm-cta) while
// the chat or the unread preview is on screen.
function syncRoot(d: Document) {
  d.documentElement.classList.toggle(HIDDEN_CLASS, st.hidden);
  d.documentElement.classList.toggle(OPEN_CLASS, !st.hidden && st.view !== "closed");
}

// Re-read the chat window state from the SDK's DOM, keep the <html> classes in
// step, and hand focus back to the launcher when the chat closes from inside its
// own window (the close button the widget shows on phones). While hidden, the SDK
// can still open its unread preview (on every bot or founder reply): the view is
// recorded and HIDDEN_CLASS keeps it off screen; closing it would mark it read.
function refresh(w: CwWindow, d: Document) {
  const prev = st.view;
  st.view = viewOf(w, d);
  syncRoot(d);
  if (prev !== "closed" && st.view === "closed" && d.activeElement?.id === FRAME_ID) {
    d.getElementById(LAUNCHER_ID)?.focus({ preventScroll: true });
  }
  emit();
}

function fail() {
  if (st.phase === "ready") return;
  st.phase = "failed";
  st.wantOpen = false;
  emit();
}

function ensureStyle(d: Document) {
  if (d.getElementById(STYLE_ID)) return;
  const style = d.createElement("style");
  style.id = STYLE_ID;
  style.textContent = WIDGET_CSS;
  d.head.appendChild(style);
}

function hasConversationCookie(d: Document): boolean {
  try {
    return /(?:^|;\s*)cw_conversation=[^;\s]/.test(d.cookie);
  } catch {
    return false;
  }
}

function load(w: CwWindow, d: Document) {
  if (!ENABLED || st.hidden || st.phase !== "idle" || d.getElementById(SCRIPT_ID)) return;
  ensureStyle(d);
  st.phase = "loading";
  w.chatwootSettings = { ...SDK_SETTINGS }; // the SDK reads its settings from here when it runs
  w.addEventListener("chatwoot:opened", () => refresh(w, d));
  w.addEventListener("chatwoot:closed", () => refresh(w, d));
  w.addEventListener("chatwoot:ready", () => {
    w.clearTimeout(st.timer);
    st.phase = "ready";
    const open = st.wantOpen && !st.hidden;
    st.wantOpen = false;
    refresh(w, d);
    if (open) callToggle(w, "open");
  });
  const s = d.createElement("script");
  s.id = SCRIPT_ID;
  s.dataset.prnm = MARK;
  s.src = SDK_SRC;
  s.integrity = SRI;
  s.crossOrigin = "anonymous";
  s.async = true;
  s.onerror = () => fail();
  s.onload = () => {
    try {
      if (!w.chatwootSDK) throw new Error("no chatwootSDK");
      w.chatwootSDK.run({ websiteToken: TOKEN, baseUrl: BASE_URL });
      const holder = d.getElementById(HOLDER_ID);
      if (holder)
        new MutationObserver(() => refresh(w, d)).observe(holder, {
          attributes: true,
          attributeFilter: ["class"],
        });
      st.timer = w.setTimeout(fail, LOAD_TIMEOUT_MS);
    } catch {
      fail(); // SDK failed: no chat; the page itself is unaffected.
    }
  };
  d.body.appendChild(s);
  emit();
}

// The launcher's click: open (loading the SDK first if needed) or close. From the
// unread-message preview it opens the full chat.
function toggleChat() {
  const w = window as CwWindow;
  if (st.hidden || st.phase === "failed") return;
  if (st.phase === "ready") {
    if (st.view === "open") callToggle(w, "close");
    else {
      if (st.view === "unread") callToggle(w, "close");
      callToggle(w, "open");
    }
    return;
  }
  st.wantOpen = true;
  if (st.phase === "idle") load(w, document);
  emit();
}

// Hiding closes the full chat window and drops a pending open; whatever the SDK
// shows while hidden stays invisible (HIDDEN_CLASS) and shows again when this ends.
// An unread preview is never closed here: in Chatwoot (widget/App.vue) closing from
// the unread-messages view marks the reply seen and dismisses it, and with the
// bubble hidden nothing else would tell the visitor a reply is waiting.
function setHidden(hidden: boolean) {
  st.hidden = hidden;
  if (hidden) {
    st.wantOpen = false;
    if (st.phase === "ready" && st.view === "open") callToggle(window as CwWindow, "close");
  }
  syncRoot(document);
  emit();
}

// A dialog holds the body scroll lock.
function useScrollLocked(): boolean {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const b = document.body;
    const read = () =>
      setLocked(b.style.overflow === "hidden" || b.hasAttribute("data-scroll-locked"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(b, { attributes: true, attributeFilter: ["style", "data-scroll-locked"] });
    return () => mo.disconnect();
  }, []);
  return locked;
}

const svgProps = {
  "aria-hidden": true,
  focusable: false,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function ChatwootWidget() {
  const [mounted, setMounted] = useState(false);
  const locked = useScrollLocked();
  const chat = useSyncExternalStore(
    subscribe,
    () => st.snap,
    () => IDLE,
  );

  useEffect(() => {
    if (!ENABLED) return;
    ensureStyle(document); // before the first launcher render, so it never shows unstyled
    setMounted(true);
    // Unmounted (e.g. client-side navigation into /admin): close and hide, keep the session.
    return () => setHidden(true);
  }, []);

  useEffect(() => {
    if (!ENABLED) return;
    setHidden(locked);
    if (!locked && hasConversationCookie(document)) load(window as CwWindow, document); // returning chatter
  }, [locked]);

  if (!ENABLED || !mounted || locked) return null;

  if (chat.phase === "failed") {
    return (
      <a
        id={LAUNCHER_ID}
        href={"mailto:" + FALLBACK_EMAIL}
        aria-label={"Email us at " + FALLBACK_EMAIL}
        title="Chat is unavailable right now"
      >
        <svg {...svgProps}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m4 7 8 6 8-6" />
        </svg>
        <span>Email us</span>
      </a>
    );
  }

  const open = chat.view === "open";
  return (
    <button
      type="button"
      id={LAUNCHER_ID}
      aria-label={LAUNCHER_LABEL}
      aria-expanded={open}
      aria-busy={chat.busy || undefined}
      data-view={chat.view}
      onClick={toggleChat}
    >
      <svg {...svgProps}>
        {open ? (
          <path d="M6 6l12 12M18 6 6 18" />
        ) : (
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.3 9 9 0 0 1-3.6-.8L3 20.5l1.6-4.4A8 8 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3.2a8.4 8.4 0 0 1 9 8.3Z" />
        )}
      </svg>
      <span>Chat</span>
    </button>
  );
}
