import React from 'react';
import classNames from 'classnames';
import { bool, func, object, string } from 'prop-types';

import { useConfiguration } from '../../context/configurationContext';

import { isBookingProcessAlias } from '../../transactions/transaction';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { displayPrice, isPriceVariationsEnabled } from '../../util/configHelpers';
import { lazyLoadWithDimensions } from '../../util/uiHelpers';
import { formatMoney } from '../../util/currency';
import { ensureListing, ensureUser } from '../../util/data';
import { richText } from '../../util/richText';
import { propTypes } from '../../util/types';
import { createSlug } from '../../util/urlHelpers';

import { AspectRatioWrapper, NamedLink, ResponsiveImage } from '../../components';
import BookmarkButton from '../../extensions/wishlist/components/BookmarkButton/BookmarkButton';

import css from './ListingCard.module.css';

const MIN_LENGTH_FOR_LONG_WORDS = 10;

const priceData = (price, currency, intl) => {
  if (price && price.currency === currency) {
    const formattedPrice = formatMoney(intl, price);
    return { formattedPrice, priceTitle: formattedPrice };
  } else if (price) {
    return {
      formattedPrice: intl.formatMessage(
        { id: 'ListingCard.unsupportedPrice' },
        { currency: price.currency }
      ),
      priceTitle: intl.formatMessage(
        { id: 'ListingCard.unsupportedPriceTitle' },
        { currency: price.currency }
      ),
    };
  }
  return {};
};

const LazyImage = lazyLoadWithDimensions(ResponsiveImage, { loadAfterInitialRendering: 3000 });

const PriceMaybe = (props) => {
  const { price, publicData, config, intl } = props;
  const { listingType } = publicData || {};
  const validListingTypes = config.listing.listingTypes;
  const foundListingTypeConfig = validListingTypes.find((conf) => conf.listingType === listingType);
  const showPrice = displayPrice(foundListingTypeConfig);
  if (!showPrice && price) {
    return null;
  }

  const isPriceVariationsInUse = isPriceVariationsEnabled(publicData, foundListingTypeConfig);
  const hasMultiplePriceVariants = isPriceVariationsInUse && publicData?.priceVariants?.length > 1;

  const isBookable = isBookingProcessAlias(publicData?.transactionProcessAlias);
  const { formattedPrice, priceTitle } = priceData(price, config.currency, intl);

  const shortenUnitType = (unitType) => {
    switch (unitType) {
      case 'hour':
        return 'hr';
      default:
        return unitType;
    }
  };

  const priceValue = <span className={css.priceValue}>{formattedPrice}</span>;
  const pricePerUnit = isBookable ? (
    <span className={css.perUnit}>
      <FormattedMessage id="ListingCard.perUnit" values={{ unitType: shortenUnitType(publicData?.unitType) }} />
    </span>
  ) : (
    ''
  );

  return (
    <div className={css.price} title={priceTitle}>
      {hasMultiplePriceVariants ? (
        <FormattedMessage
          id="ListingCard.priceStartingFrom"
          values={{ priceValue, pricePerUnit }}
        />
      ) : (
        <FormattedMessage id="ListingCard.price" values={{ priceValue, pricePerUnit }} />
      )}
    </div>
  );
};

/**
 * ListingCard
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to component's own css.root
 * @param {string?} props.rootClassName overwrite components own css.root
 * @param {Object} props.listing API entity: listing or ownListing
 * @param {string?} props.renderSizes for img/srcset
 * @param {Function?} props.setActiveListing
 * @param {boolean?} props.showAuthorInfo
 * @returns {JSX.Element} listing card to be used in search result panel etc.
 */
export const ListingCard = props => {
  const config = useConfiguration();
  const intl = useIntl();
  const {
    className,
    rootClassName,
    listing,
    renderSizes,
    setActiveListing,
    showAuthorInfo,
    currentLocation,
  } = props;

  const classes = classNames(rootClassName || css.root, className);
  const currentListing = ensureListing(listing);
  const id = currentListing.id.uuid;
  const { title = '', price, publicData } = currentListing.attributes;
  const slug = createSlug(title);
  const author = ensureUser(listing.author);
  const authorName = author.attributes.profile.displayName;
  const firstImage =
    currentListing.images && currentListing.images.length > 0 ? currentListing.images[0] : null;
  const geolocation = currentListing.attributes?.geolocation;
  const location = currentListing.attributes?.publicData?.location || {};

  const calculationDistanceInMiles = (lat1, lon1, lat2, lon2) => {
    const R = 3958.8; // Radius of the Earth in miles
    const rLat1 = (lat1 * Math.PI) / 180; // Convert degrees to radians
    const rLat2 = (lat2 * Math.PI) / 180; // Convert degrees to radians
    const dLat = rLat2 - rLat1; // Radian difference (latitudes)
    const dLon = ((lon2 - lon1) * Math.PI) / 180; // Radian difference (longitudes)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in miles
  };

  const distance =
    geolocation && currentLocation
      ? calculationDistanceInMiles(
          geolocation.lat,
          geolocation.lng,
          currentLocation.lat,
          currentLocation.lng
        )
      : null;

  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config.layout.listingImage;
  const variants = firstImage
    ? Object.keys(firstImage?.attributes?.variants).filter((k) => k.startsWith(variantPrefix))
    : [];

  const setActivePropsMaybe = setActiveListing
    ? {
        onMouseEnter: () => setActiveListing(currentListing.id),
        onMouseLeave: () => setActiveListing(null),
      }
    : null;

  const getCityFromLocation = () => {
    const { address } = location;
    const addressArray = address?.split(',');
    if (!addressArray) return '';

    if (addressArray?.length >= 3) {
      return addressArray[addressArray.length - 3]?.trim();
    }
    if (addressArray?.length > 0) {
      return addressArray[0]?.trim();
    }
    return null;
  };

  const city = location?.city || getCityFromLocation() || '';

  return (
    <NamedLink className={classes} name="ListingPage" params={{ id, slug }}>
      <AspectRatioWrapper
        className={css.aspectRatioWrapper}
        width={aspectWidth}
        height={aspectHeight}
        {...setActivePropsMaybe}
      >
        <BookmarkButton listingId={id} listingAuthor={author} />
        {price ? (
          <PriceMaybe price={price} publicData={publicData} config={config} intl={intl} />
        ) : null}
        <LazyImage
          rootClassName={css.rootForImage}
          alt={title}
          image={firstImage}
          variants={variants}
          sizes={renderSizes}
        />
      </AspectRatioWrapper>
      <div className={css.info}>
        <div className={css.mainInfo}>
          <div className={css.title}>
            {richText(title, {
              longWordMinLength: MIN_LENGTH_FOR_LONG_WORDS,
              longWordClass: css.longWord,
            })}
          </div>
          <div className={css.cityInfo}>
            {city && distance
              ? intl.formatMessage(
                  { id: 'ListingCard.cityAndDistance' },
                  { city, distance: Math.round(distance * 10) / 10 }
                )
              : null}
            {city && !distance ? city : null}
          </div>
          {showAuthorInfo ? (
            <div className={css.authorInfo}>
              <FormattedMessage id="ListingCard.author" values={{ authorName }} />
            </div>
          ) : null}
        </div>
      </div>
    </NamedLink>
  );
};

export default ListingCard;
