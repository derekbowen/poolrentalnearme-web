import React from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import classNames from 'classnames';

import { useConfiguration } from '../../../../context/configurationContext';
import { useRouteConfiguration } from '../../../../context/routeConfigurationContext';
import { FormattedMessage, intlShape, useIntl } from '../../../../util/reactIntl';
import { displayPrice } from '../../../../util/configHelpers';
import { propTypes } from '../../../../util/types';
import { formatMoney } from '../../../../util/currency';
import { ensureOwnListing, ensureUser } from '../../../../util/data';
import { createSlug } from '../../../../util/urlHelpers';
import { createResourceLocatorString } from '../../../../util/routes';
import { isBookingProcessAlias } from '../../../../transactions/transaction';

import {
  AspectRatioWrapper,
  InlineTextButton,
  Menu,
  MenuLabel,
  MenuContent,
  MenuItem,
  IconSpinner,
  ResponsiveImage,
  IconClose,
} from '../../../../components';

import MenuIcon from './MenuIcon';
import Overlay from './Overlay';

import css from './WishlistListingCard.module.css';

// Menu content needs the same padding
const MENU_CONTENT_OFFSET = -12;
const MAX_LENGTH_FOR_WORDS_IN_TITLE = 7;

const priceData = (price, currency, intl) => {
  const priceCurrency = price?.currency;

  if (priceCurrency === currency) {
    const formattedPrice = formatMoney(intl, price);
    return { formattedPrice, priceTitle: formattedPrice };
  }

  if (price) {
    return {
      formattedPrice: intl.formatMessage(
        { id: 'WishlistListingCard.unsupportedPrice' },
        { currency: priceCurrency }
      ),
      priceTitle: intl.formatMessage(
        { id: 'WishlistListingCard.unsupportedPriceTitle' },
        { currency: priceCurrency }
      ),
    };
  }
  return {};
};

const createListingURL = (routes, listing) => {
  const id = listing.id.uuid;
  const slug = createSlug(listing.attributes.title);

  return createResourceLocatorString('ListingPage', routes, { id, slug }, {});
};

// Cards are not fixed sizes - So, long words in title make flexboxed items to grow too big.
// 1. We split title to an array of words and spaces.
//    "foo bar".split(/([^\s]+)/gi) => ["", "foo", " ", "bar", ""]
// 2. Then we break long words by adding a '<span>' with word-break: 'break-all';
const formatTitle = (title, maxLength) => {
  const nonWhiteSpaceSequence = /([^\s]+)/gi;
  return title.split(nonWhiteSpaceSequence).map((word, index) => {
    return word.length > maxLength ? (
      <span key={index} style={{ wordBreak: 'break-all' }}>
        {word}
      </span>
    ) : (
      word
    );
  });
};

const PriceMaybe = (props) => {
  const { price, publicData = {}, config, intl } = props;
  const { listingType } = publicData;
  const validListingTypes = config.listing.listingTypes;
  const foundListingTypeConfig = validListingTypes.find((conf) => conf.listingType === listingType);

  const showPrice = displayPrice(foundListingTypeConfig);
  if (showPrice && !price) {
    return (
      <div className={css.noPrice}>
        <FormattedMessage id="WishlistListingCard.priceNotSet" />
      </div>
    );
  }

  if (!showPrice) {
    return null;
  }

  const isBookable = isBookingProcessAlias(publicData.transactionProcessAlias);
  const { formattedPrice, priceTitle } = priceData(price, config.currency, intl);
  return (
    <div className={css.price}>
      <div className={css.priceValue} title={priceTitle}>
        {formattedPrice}
      </div>
      {isBookable ? (
        <div className={css.perUnit}>
          <FormattedMessage
            id="WishlistListingCard.perUnit"
            values={{ unitType: publicData.unitType }}
          />
        </div>
      ) : null}
    </div>
  );
};

export const WishlistListingCardComponent = (props) => {
  const config = useConfiguration();
  const routeConfiguration = useRouteConfiguration();
  const {
    className,
    rootClassName,
    hasRemovingError,
    isMenuOpen,
    actionsInProgressListingId,
    listing,
    onRemoveListing,
    onToggleMenu,
    renderSizes,
  } = props;
  const intl = useIntl();
  const navigate = useNavigate();
  const classes = classNames(rootClassName || css.root, className);
  const currentListing = ensureOwnListing(listing);
  const id = currentListing.id.uuid;
  const { title = '', price, publicData } = currentListing.attributes;
  const author = ensureUser(listing.author);
  const authorName = author.attributes.profile.displayName;

  const firstImage =
    currentListing.images && currentListing.images.length > 0 ? currentListing.images[0] : null;

  const menuItemClasses = classNames(css.menuItem, {
    [css.menuItemDisabled]: !!actionsInProgressListingId,
  });

  const hasError = hasRemovingError;
  const thisListingInProgress =
    actionsInProgressListingId && actionsInProgressListingId.uuid === id;
  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config.layout.listingImage;
  const variants = firstImage
    ? Object.keys(firstImage?.attributes?.variants).filter((k) => k.startsWith(variantPrefix))
    : [];

  return (
    <div className={classes}>
      <div
        className={css.clickWrapper}
        tabIndex={0}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();

          // WishlistListingCard contains links, buttons and elements that are working with routing.
          // This card doesn't work if <a> or <button> is used to wrap events that are card 'clicks'.
          //
          // NOTE: It might be better to absolute-position those buttons over a card-links.
          // (So, that they have no parent-child relationship - like '<a>bla<a>blaa</a></a>')
          navigate(createListingURL(routeConfiguration, listing));
        }}
      >
        <AspectRatioWrapper
          width={aspectWidth}
          height={aspectHeight}
          className={css.aspectRatioWrapper}
        >
          <ResponsiveImage
            rootClassName={css.rootForImage}
            alt={title}
            image={firstImage}
            variants={variants}
            sizes={renderSizes}
          />
        </AspectRatioWrapper>

        <div className={classNames(css.menuOverlayWrapper)}>
          <div className={classNames(css.menuOverlay, { [css.menuOverlayOpen]: isMenuOpen })} />
        </div>
        <div className={css.menubarWrapper}>
          <div className={css.menubarGradient} />
          <div className={css.menubar}>
            <Menu
              className={classNames(css.menu)}
              contentPlacementOffset={MENU_CONTENT_OFFSET}
              contentPosition="left"
              useArrow={false}
              onToggleActive={(isOpen) => {
                const listingOpen = isOpen ? currentListing : null;
                onToggleMenu(listingOpen);
              }}
              isOpen={isMenuOpen}
            >
              <MenuLabel className={css.menuLabel} isOpenClassName={css.listingMenuIsOpen}>
                <div className={css.iconWrapper}>
                  <MenuIcon isActive={isMenuOpen} />
                </div>
              </MenuLabel>
              <MenuContent rootClassName={css.menuContent}>
                <MenuItem key="remove-listing-from-wishlist">
                  <InlineTextButton
                    rootClassName={menuItemClasses}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!actionsInProgressListingId) {
                        onToggleMenu(null);
                        onRemoveListing(currentListing.id);
                      }
                    }}
                  >
                    <IconClose rootClassName={css.closeIcon} />
                    <FormattedMessage id="WishlistListingCard.removeListing" />
                  </InlineTextButton>
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </div>

        {thisListingInProgress ? (
          <Overlay>
            <IconSpinner />
          </Overlay>
        ) : hasError ? (
          <Overlay errorMessage={intl.formatMessage({ id: 'WishlistListingCard.actionFailed' })} />
        ) : null}
      </div>

      <div className={css.info}>
        <PriceMaybe price={price} publicData={publicData} config={config} intl={intl} />

        <div className={css.mainInfo}>
          <div className={css.title}>{formatTitle(title, MAX_LENGTH_FOR_WORDS_IN_TITLE)}</div>
          <div className={css.authorInfo}>
            <FormattedMessage id="WishlistListingCard.author" values={{ authorName }} />
          </div>
        </div>
      </div>
    </div>
  );
};

WishlistListingCardComponent.defaultProps = {
  className: null,
  rootClassName: null,
  actionsInProgressListingId: null,
  renderSizes: null,
};

const { bool, func, shape, string } = PropTypes;

WishlistListingCardComponent.propTypes = {
  className: string,
  rootClassName: string,
  hasRemovingError: bool.isRequired,
  intl: intlShape.isRequired,
  listing: propTypes.listing.isRequired,
  isMenuOpen: bool.isRequired,
  actionsInProgressListingId: shape({ uuid: string.isRequired }),
  onRemoveListing: func.isRequired,
  onToggleMenu: func.isRequired,

  // Responsive image sizes hint
  renderSizes: string,
};

export default WishlistListingCardComponent;
