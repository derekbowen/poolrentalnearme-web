import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';

import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import useMediaQuery from '../../hooks/useMediaQuery';
import { matchPathname } from '../../util/routes';
import {
  COMPACT_QUERY,
  FALLBACK_EMAIL,
  IDLE_SNAPSHOT,
  LAUNCHER_ID,
  LAUNCHER_LABEL,
  ensureStyle,
  getChatSnapshot,
  hasConversationCookie,
  isSearchFiltersSheetOpen,
  loadChatwoot,
  setChatHidden,
  shouldHide,
  subscribeChat,
  toggleChat,
  widgetConfig,
} from './chatwootLoader';

// Build-time values (Vite inlines them into the bundle; both are public):
// - VITE_CHATWOOT_WEBSITE_TOKEN: website token of the Chatwoot "PRNM Website" inbox
//   (printed by ops/chatbot/ops/cw_setup.py).
// - VITE_CHATWOOT_SDK_SRI: sha384 of the sdk.js that chat.poolrentalnearme.com
//   serves (east_widget.py computes it). It changes with every Chatwoot image.
// Either one unset or malformed: the widget renders nothing and loads nothing.
const CONFIG = widgetConfig(
  import.meta.env.VITE_CHATWOOT_WEBSITE_TOKEN,
  import.meta.env.VITE_CHATWOOT_SDK_SRI
);

const subscribe = (fn) => subscribeChat(typeof window === 'undefined' ? null : window, fn);
const getSnapshot = () => getChatSnapshot(window);
const getServerSnapshot = () => IDLE_SNAPSHOT;

const svgProps = {
  'aria-hidden': true,
  focusable: false,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const IconChat = () => (
  <svg {...svgProps}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.3 9 9 0 0 1-3.6-.8L3 20.5l1.6-4.4A8 8 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3.2a8.4 8.4 0 0 1 9 8.3Z" />
  </svg>
);

const IconClose = () => (
  <svg {...svgProps}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

const IconMail = () => (
  <svg {...svgProps}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </svg>
);

/**
 * Self-hosted Chatwoot widget with the scripted PRNM assistant behind it.
 *
 * Client-only: nothing renders during SSR or the hydration render, so server HTML
 * is unchanged and hydration cannot mismatch. After mount it renders the PRNM
 * launcher (#prnm-chat-launcher). sdk.js is fetched from chat.poolrentalnearme.com
 * only when the visitor clicks it, or on mount when a cw_conversation cookie shows
 * they have chatted before, and never while the widget is hidden. Once loaded, the
 * SDK stays in the page for the rest of the visit (a script cannot be unloaded);
 * on checkout and payout routes reached by in-app navigation the chat is closed,
 * the launcher is not rendered, and a reply that arrives there is kept invisible
 * until the visitor is back on a page where the widget shows. Integrity (SRI)
 * pins exactly what it runs.
 * See chatwootLoader.js for the hide rules and layout.
 */
const ChatwootWidget = () => {
  const { pathname } = useLocation();
  const routeConfiguration = useRouteConfiguration();
  const scrollLocked = useSelector(isScrollingDisabled);
  const sheetOpen = useSelector(isSearchFiltersSheetOpen);
  const compact = useMediaQuery(COMPACT_QUERY);
  const [mounted, setMounted] = useState(false);
  const chat = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const matched = CONFIG && routeConfiguration ? matchPathname(pathname, routeConfiguration) : [];
  const hidden = shouldHide(matched[0]?.route?.name, { compact, scrollLocked, sheetOpen });

  useEffect(() => {
    if (!CONFIG) return;
    ensureStyle(document); // before the first launcher render, so it never shows unstyled
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!CONFIG) return;
    setChatHidden(window, hidden);
    // Returning chatter: load now so replies from Derek or Brandon reach them.
    if (!hidden && hasConversationCookie(document)) loadChatwoot(window, document, CONFIG);
  }, [hidden]);

  const onClick = useCallback(() => toggleChat(window, document, CONFIG), []);

  if (!CONFIG || !mounted || hidden) return null;

  if (chat.phase === 'failed') {
    return (
      <a
        id={LAUNCHER_ID}
        href={`mailto:${FALLBACK_EMAIL}`}
        aria-label={`Email us at ${FALLBACK_EMAIL}`}
        title="Chat is unavailable right now"
      >
        <IconMail />
        <span>Email us</span>
      </a>
    );
  }

  const open = chat.view === 'open';
  return (
    <button
      type="button"
      id={LAUNCHER_ID}
      aria-label={LAUNCHER_LABEL}
      aria-expanded={open}
      aria-busy={chat.busy || undefined}
      data-view={chat.view}
      onClick={onClick}
    >
      {open ? <IconClose /> : <IconChat />}
      <span>Chat</span>
    </button>
  );
};

export default ChatwootWidget;
