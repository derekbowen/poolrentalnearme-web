import React from 'react';
import classNames from 'classnames';

import Button from '../Button/Button';
import { FormattedMessage } from '../../util/reactIntl';
import { getSuperLoginAsUser } from '../../util/cookie';
import { ensureCurrentUser } from '../../util/data';

import css from './LimitedAccessBanner.module.css';

// Due to the layout structure, do not render the banner on the following pages
const disabledPages = ['SearchPage', 'SearchPageWithListingType'];

/**
 * This component returns a limited-access banner.
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to components own css.root
 * @param {string?} props.rootClassName overwrite components own css.root
 * @param {boolean} props.isAuthenticated
 * @param {boolean} props.isLoggedInAs
 * @param {Array<string>} props.authScopes
 * @param {Object} props.currentUser
 * @param {Function} props.onLogout
 * @param {string?} props.currentPage
 * @returns {JSX.Element} LimitedAccessBanner component
 */
const LimitedAccessBanner = props => {
  const {
    rootClassName,
    className,
    isAuthenticated,
    isLoggedInAs,
    authScopes = [],
    currentUser,
    onLogout,
    currentPage,
  } = props;
  const classes = classNames(rootClassName || css.root, className);
  const user = ensureCurrentUser(currentUser);
  const superLoginAsUser = getSuperLoginAsUser();

  const showBanner =
    user.id &&
    isAuthenticated &&
    (isLoggedInAs || superLoginAsUser) &&
    !disabledPages.includes(currentPage);

  const { firstName, lastName } = user.attributes.profile;

  const limitedRights = authScopes?.indexOf('user:limited') >= 0;
  const fullRights = authScopes?.indexOf('user') >= 0;

  return showBanner ? (
    <div className={classes}>
      <p className={css.text}>
        {superLoginAsUser ? (
          <FormattedMessage
            id="LimitedAccessBanner.fullRightsMessageLoginAs"
            values={{ superLoginAsUser }}
          />
        ) : limitedRights ? (
          <FormattedMessage id="LimitedAccessBanner.message" values={{ firstName, lastName }} />
        ) : fullRights ? (
          <FormattedMessage
            id="LimitedAccessBanner.fullRightsMessage"
            values={{ firstName, lastName }}
          />
        ) : (
          <FormattedMessage
            id="LimitedAccessBanner.fallbackMessage"
            values={{ firstName, lastName }}
          />
        )}
      </p>
      <Button rootClassName={css.button} onClick={onLogout}>
        <FormattedMessage id="LimitedAccessBanner.logout" />
      </Button>
    </div>
  ) : null;
};

export default LimitedAccessBanner;
