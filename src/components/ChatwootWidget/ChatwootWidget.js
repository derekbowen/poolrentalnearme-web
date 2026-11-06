import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';

import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import useMediaQuery from '../../hooks/useMediaQuery';
import { matchPathname } from '../../util/routes';
import {
  COMPACT_QUERY,
  loadChatwoot,
  sanitizeToken,
  setChatwootVisible,
  shouldHide,
} from './chatwootLoader';

// Public website token of the Chatwoot "PRNM Website" inbox (printed by
// ops/chatbot/ops/cw_setup.py). It is compiled into the browser bundle and is
// public by definition. Unset or malformed: the widget is a no-op.
const WEBSITE_TOKEN = sanitizeToken(import.meta.env.VITE_CHATWOOT_WEBSITE_TOKEN);

/**
 * Self-hosted Chatwoot widget with the scripted PRNM assistant behind it.
 *
 * Client-only and renders nothing: effects never run during SSR, so server HTML
 * is unchanged and hydration cannot mismatch. The SDK script is fetched from
 * chat.poolrentalnearme.com only after hydration, and only once the visitor is
 * on a route that shows the widget, so checkout and payout pages never load it.
 * See chatwootLoader.js for the hide rules.
 */
const ChatwootWidget = () => {
  const { pathname } = useLocation();
  const routeConfiguration = useRouteConfiguration();
  const scrollLocked = useSelector(isScrollingDisabled);
  const compact = useMediaQuery(COMPACT_QUERY);

  const matched =
    WEBSITE_TOKEN && routeConfiguration ? matchPathname(pathname, routeConfiguration) : [];
  const hidden = shouldHide(matched[0]?.route?.name, { compact, scrollLocked });

  useEffect(() => {
    if (!WEBSITE_TOKEN) return;
    if (hidden) {
      setChatwootVisible(window, false);
      return;
    }
    loadChatwoot(window, document, WEBSITE_TOKEN);
    setChatwootVisible(window, true);
  }, [hidden]);

  return null;
};

export default ChatwootWidget;
