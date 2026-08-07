import React from 'react';
import classNames from 'classnames';
import { NamedLink } from '../../../../components';
import css from './BottomNav.module.css';

// App-style mobile bottom tab bar (matches the native iOS/Android app's nav).
// Rendered from Topbar (on every page); CSS shows it only on mobile (≤1024px).
// Uses the current marketplace branding (blue active state).

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const IconHome = () => (
  <svg viewBox="0 0 24 24" className={css.icon} aria-hidden="true">
    <path {...stroke} d="M3 10.5 12 3l9 7.5" />
    <path {...stroke} d="M5 9.5V20h14V9.5" />
    <path {...stroke} d="M9.5 20v-5h5v5" />
  </svg>
);
const IconSearch = () => (
  <svg viewBox="0 0 24 24" className={css.icon} aria-hidden="true">
    <circle {...stroke} cx="11" cy="11" r="6.5" />
    <path {...stroke} d="m20 20-3.6-3.6" />
  </svg>
);
const IconHeart = () => (
  <svg viewBox="0 0 24 24" className={css.icon} aria-hidden="true">
    <path {...stroke} d="M12 20s-7-4.6-7-9.4A3.9 3.9 0 0 1 12 7a3.9 3.9 0 0 1 7 3.6C19 15.4 12 20 12 20Z" />
  </svg>
);
const IconCalendar = () => (
  <svg viewBox="0 0 24 24" className={css.icon} aria-hidden="true">
    <rect {...stroke} x="4" y="5" width="16" height="16" rx="2.5" />
    <path {...stroke} d="M4 9.5h16M8 3.5v3m8-3v3" />
  </svg>
);
const IconUser = () => (
  <svg viewBox="0 0 24 24" className={css.icon} aria-hidden="true">
    <circle {...stroke} cx="12" cy="8.5" r="3.6" />
    <path {...stroke} d="M5.5 20a6.5 6.5 0 0 1 13 0" />
  </svg>
);
const IconChat = () => (
  <svg viewBox="0 0 24 24" className={css.icon} aria-hidden="true">
    <path {...stroke} d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v8A1.5 1.5 0 0 1 19 15.5H10l-4.5 4v-4H5A1.5 1.5 0 0 1 3.5 14V6A1.5 1.5 0 0 1 5 4.5Z" />
  </svg>
);

// These pages render their own fixed bottom CTA on mobile (e.g. "Request to
// book", "Save & continue"), so the tab bar would collide — hide it there.
const HIDE_ON_PAGES = [
  'ListingPage',
  'ListingPageVariant',
  'CheckoutPage',
  'EditListingPage',
  'EditListingDeprecatedPage',
  'PayoutDetailsPage',
];

const BottomNav = ({ currentPage, isAuthenticated, inboxTab }) => {
  if (currentPage && HIDE_ON_PAGES.includes(currentPage)) return null;

  const authed = !!isAuthenticated;
  const tabs = [
    { key: 'home', label: 'Home', Icon: IconHome, name: 'LandingPage', pages: ['LandingPage'] },
    { key: 'explore', label: 'Explore', Icon: IconSearch, name: 'SearchPage', pages: ['SearchPage'] },
    {
      key: 'wishlist',
      label: 'Wishlist',
      Icon: IconHeart,
      name: authed ? 'WishlistPage' : 'LoginPage',
      pages: ['WishlistPage'],
    },
    {
      key: 'inbox',
      label: 'Bookings',
      Icon: IconChat,
      name: authed ? 'InboxPage' : 'LoginPage',
      params: authed ? { tab: inboxTab || 'orders' } : {},
      pages: ['InboxPage'],
    },
    {
      key: 'account',
      label: 'Settings',
      Icon: IconUser,
      name: authed ? 'ProfileSettingsPage' : 'LoginPage',
      pages: ['ProfileSettingsPage', 'AccountSettingsPage', 'ContactDetailsPage', 'ManageListingsPage'],
    },
  ];

  return (
    <nav className={css.bottomNav} aria-label="Primary">
      {tabs.map(t => {
        const isActive = !!currentPage && t.pages.includes(currentPage);
        const { Icon } = t;
        return (
          <NamedLink
            key={t.key}
            name={t.name}
            params={t.params}
            className={classNames(css.tab, { [css.active]: isActive })}
          >
            <Icon />
            <span className={css.label}>{t.label}</span>
          </NamedLink>
        );
      })}
    </nav>
  );
};

export default BottomNav;
