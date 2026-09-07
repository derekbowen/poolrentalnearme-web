import classNames from 'classnames';
import React from 'react';
import { useNavigate } from 'react-router-dom';

import { useRouteConfiguration } from '../../../context/routeConfigurationContext';
import { createResourceLocatorString } from '../../../util/routes';
import { NamedLink, ResponsiveImage } from '../../../components';
import BookmarkButton from '../../../extensions/wishlist/components/BookmarkButton/BookmarkButton';
import IconHeart from '../../../extensions/wishlist/components/BookmarkButton/IconHeart';
import { HOME_IMAGE_VARIANTS } from '../LandingPage.duck';

import shared from '../HomeShared.module.css';
import css from './HomeListingCard.module.css';

// Anonymous visitors get the same 44px heart; tapping it goes to login (same as BookmarkButton).
const LoginHeart = () => {
  const navigate = useNavigate();
  const routeConfiguration = useRouteConfiguration();
  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(createResourceLocatorString('LoginPage', routeConfiguration, {}, {}));
  };
  return (
    <button
      type="button"
      className={classNames(shared.buttonReset, css.heart)}
      aria-label="Save"
      onClick={onClick}
    >
      <IconHeart rootClassName={css.heartIcon} />
    </button>
  );
};

/**
 * Inventory card: big 5:4 photo, heart, one attribute tag, name · city · all-in hourly price.
 * Roughly 80% image / 20% metadata, per the design.
 */
const HomeListingCard = (props) => {
  const { listing, isAuthenticated, sizes } = props;
  const { id, slug, title, city, priceLabel, tag, image, author } = listing;

  return (
    <NamedLink name="ListingPage" params={{ id, slug }} className={css.root}>
      <div className={css.media}>
        <ResponsiveImage
          rootClassName={css.img}
          alt={title}
          image={image}
          variants={HOME_IMAGE_VARIANTS}
          sizes={sizes}
        />
        {isAuthenticated ? (
          <BookmarkButton
            rootClassName={classNames(shared.buttonReset, css.heart)}
            iconClassName={css.heartIcon}
            listingId={id}
            listingAuthor={author}
          />
        ) : (
          <LoginHeart />
        )}
        {tag ? <span className={css.tag}>{tag}</span> : null}
      </div>
      <div className={css.meta}>
        <div className={css.metaMain}>
          <div className={css.name}>{title}</div>
          <div className={css.city}>{city}</div>
        </div>
        <div className={css.price}>
          <span className={css.priceValue}>{priceLabel}</span>
          <span className={css.priceUnit}>
            {' '}
            / <span className={css.unitLong}>hour</span>
            <span className={css.unitShort}>hr</span>
          </span>
        </div>
      </div>
    </NamedLink>
  );
};

export default HomeListingCard;
