import React from 'react';
import classNames from 'classnames';

import { NamedLink } from '../../../components';
import Avatar from '../../../components/Avatar/Avatar';
import { IMG } from '../homeContent';

import shared from '../HomeShared.module.css';
import css from './HomeHeader.module.css';

/**
 * Homepage header. Desktop: logo · Find a pool · How it works · Pool Host Academy (glass pill)
 * · List your pool (0% fees) · Log in · Sign up. Mobile: logo · "List · 0% fees" · hamburger that
 * opens the template's mobile menu. Logged-in visitors get Inbox + their avatar instead of
 * Log in / Sign up.
 */
const HomeHeader = (props) => {
  const { isAuthenticated, currentUser, notificationCount = 0, inboxTab, onOpenMobileMenu } = props;

  const authedActions = (
    <>
      <NamedLink name="InboxPage" params={{ tab: inboxTab || 'orders' }} className={css.textLink}>
        Inbox
        {notificationCount > 0 ? <span className={css.notificationDot} /> : null}
      </NamedLink>
      <NamedLink name="ProfileSettingsPage" className={css.avatarLink} title="Your account">
        <Avatar className={css.avatar} user={currentUser} disableProfileLink />
      </NamedLink>
    </>
  );
  const anonymousActions = (
    <>
      <NamedLink name="LoginPage" className={css.textLink}>
        Log in
      </NamedLink>
      <NamedLink name="SignupPage" className={css.signup}>
        Sign up
      </NamedLink>
    </>
  );

  return (
    <header className={css.root}>
      <div className={css.desktop}>
        <NamedLink
          name="LandingPage"
          className={css.logoLink}
          aria-label="Pool Rental Near Me home"
        >
          <img src={IMG.logo} alt="Pool Rental Near Me" className={css.logo} />
        </NamedLink>
        <nav className={css.nav} aria-label="Main">
          <NamedLink name="SearchPage" className={css.navLink}>
            Find a pool
          </NamedLink>
          <a href="/p/how-it-works" className={css.navLink}>
            How it works
          </a>
          <a href="/p/learningacademy" className={classNames(shared.iosPill, css.academyPill)}>
            <img src={IMG.fredAvatar} alt="" className={css.fredAvatar} />
            Pool Host Academy
          </a>
        </nav>
        <div className={css.actions}>
          <NamedLink name="NewListingPage" className={classNames(shared.glassLight, css.listPill)}>
            List your pool <span className={css.feeBadge}>0% fees</span>
          </NamedLink>
          {isAuthenticated ? authedActions : anonymousActions}
        </div>
      </div>

      <div className={css.mobile}>
        <NamedLink
          name="LandingPage"
          className={css.logoLink}
          aria-label="Pool Rental Near Me home"
        >
          <img src={IMG.logo} alt="Pool Rental Near Me" className={css.logoMobile} />
        </NamedLink>
        <div className={css.mobileActions}>
          <NamedLink name="NewListingPage" className={css.listChip}>
            List · 0% fees
          </NamedLink>
          <button
            type="button"
            className={classNames(shared.buttonReset, shared.glassLight, css.menuButton)}
            aria-label="Menu"
            onClick={onOpenMobileMenu}
          >
            <span className={css.menuBar} />
            <span className={css.menuBar} />
            <span className={css.menuBar} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default HomeHeader;
