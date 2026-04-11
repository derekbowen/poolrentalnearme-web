import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import classNames from 'classnames';
import PropTypes, { oneOf, oneOfType } from 'prop-types';
import { useIntl } from 'react-intl';
import { propTypes } from '../../../../util/types';

import { addWishlistListing, removeWishlistListing } from '../../ducks/wishlist.duck';
import { createResourceLocatorString } from '../../../../util/routes';
import { useRouteConfiguration } from '../../../../context/routeConfigurationContext';
import { enableBookmarkOwnListing } from '../../config/configWishlist';

import IconHeart from './IconHeart';

import css from './BookmarkButton.module.css';

const ICON_POSITION_LEFT = 'left';
const ICON_POSITION_RIGHT = 'right';

/**
 * A button for toggling the bookmark status of the listing.
 *
 * @component
 * @param {string} props.rootClassName - The root class name of the component (will override the default one)
 * @param {string} props.className - The subclass name of css (will be combined with the default one)
 * @param {string} props.iconClassName - The icon class name of css (will be combined with the default one)
 * @param {UUID | string} props.listingId - The listing id
 * @param {User} props.listingAuthor - The listing author
 * @param {bool} props.isVisible - This component should be visible or not
 * @param {bool} props.showTitle - This component should show title or not
 * @param {string} props.iconPosition - The position of the icon
 * @returns {JSX.Element} The rendered button component.
 *
 * @example
 * // Render a button with heart icon
 * <BookmarkButton listingId={listingId} listingAuthor={listingAuthor}/>
 */

const BookmarkButton = (props) => {
  // REDUX STATES
  const { isAuthenticated } = useSelector((state) => state.auth);
  const { currentUser } = useSelector((state) => state.user);
  const { addingListing, removingListing, addListingError } = useSelector(
    (state) => state.wishlist
  );
  const navigate = useNavigate();

  // REDUX DISPATCH
  const dispatch = useDispatch();
  const onAddListingToWishlist = (listingId) => dispatch(addWishlistListing(listingId));
  const onRemoveListingFromWishlist = (listingId) => dispatch(removeWishlistListing(listingId));

  // PROPS
  const {
    rootClassName,
    className,
    iconClassName,
    listingId,
    isVisible,
    listingAuthor,
    showTitle,
    iconPosition,
  } = props;
  const currentListingId = listingId?.uuid ?? listingId;

  const { wishlist = {} } = currentUser?.attributes?.profile.metadata || {};
  const isBookmarked = wishlist[currentListingId];

  const actionsInProgress = !!(addingListing || removingListing);

  // CUSTOM HOOKS
  const routeConfiguration = useRouteConfiguration();
  const intl = useIntl();

  // LOCAL STATES
  const [bookmarked, setBookmarked] = useState(isBookmarked);

  // OTHERS
  const classes = rootClassName || classNames(css.root, className);
  const iconClasses = classNames(iconClassName, {
    [css.icon]: !iconClassName,
    [css.bookmarked]: bookmarked,
    [css.disabled]: actionsInProgress,
  });

  const isComponentDisabled =
    !isVisible ||
    !currentListingId ||
    !currentUser ||
    !isAuthenticated ||
    (!enableBookmarkOwnListing && listingAuthor?.id.uuid === currentUser.id.uuid);

  const title = showTitle ? (
    <div className={css.title}>
      {intl.formatMessage({ id: 'BookmarkButton.title' }, { isBookmarked: bookmarked })}
    </div>
  ) : null;

  const content =
    iconPosition === ICON_POSITION_LEFT ? (
      <>
        <IconHeart rootClassName={iconClasses} />
        {title}
      </>
    ) : (
      <>
        {title}
        <IconHeart rootClassName={iconClasses} />
      </>
    );

  const handleClick = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (actionsInProgress) {
        return;
      }

      if (!isAuthenticated) {
        navigate(createResourceLocatorString('LoginPage', routeConfiguration, {}, {}));
        return;
      }

      setBookmarked(!bookmarked);

      const promiseCall = isBookmarked ? onRemoveListingFromWishlist : onAddListingToWishlist;
      promiseCall(currentListingId).catch((e) => {
        console.error(e);
        setBookmarked(false);
      });
    },
    [bookmarked, isBookmarked, currentUser, actionsInProgress, isAuthenticated]
  );

  useEffect(() => {
    setBookmarked(isBookmarked);
  }, [isBookmarked]);

  useEffect(() => {
    if (addListingError?.apiErrors[0]?.listingId === listingId) {
      setBookmarked(!bookmarked);
    }
  }, [addListingError]);

  if (isComponentDisabled) {
    return null;
  }

  return (
    <div
      className={classes}
      role="button"
      onClick={handleClick}
      aria-disabled={`${actionsInProgress}`}
    >
      {content}
    </div>
  );
};

BookmarkButton.defaultProps = {
  rootClassName: null,
  className: null,
  iconClassName: null,
  isVisible: true,
  listingAuthor: null,
  showTitle: false,
  iconPosition: ICON_POSITION_LEFT,
};

const { bool, string } = PropTypes;

BookmarkButton.propTypes = {
  rootClassName: string,
  className: string,
  iconClassName: string,
  listingId: oneOfType([string, propTypes.uuid]).isRequired,
  isVisible: bool,
  listingAuthor: propTypes.user,
  showTitle: bool,
  iconPosition: oneOf([ICON_POSITION_LEFT, ICON_POSITION_RIGHT]),
};

export default BookmarkButton;
