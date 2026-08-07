import React from 'react';
import classNames from 'classnames';
import ListingCard from 'components/ListingCard/ListingCard';
import PaginationLinks from 'components/PaginationLinks/PaginationLinks';
import { array, bool, node, object, string } from 'prop-types';

import css from './SearchResultsPanel.module.css';

/**
 * SearchResultsPanel component
 *
 * @component
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that extends the default class for the root element
 * @param {Array<propTypes.listing>} props.listings - The listings
 * @param {propTypes.pagination} props.pagination - The pagination
 * @param {Object} props.search - The search
 * @param {Function} props.setActiveListing - The function to handle the active listing
 * @param {boolean} [props.isMapVariant] - Whether the map variant is enabled
 * @returns {JSX.Element}
 */
const SK_KEYFRAMES = '@keyframes prnmSkPulse{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}';
const skBlock = {
  background: '#e6eef2',
  borderRadius: '10px',
  animation: 'prnmSkPulse 1.4s ease-in-out infinite',
};
const SkeletonCard = () => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <div style={{ ...skBlock, width: '100%', aspectRatio: '16 / 9' }} />
    <div style={{ ...skBlock, height: '14px', width: '70%', margin: '10px 0 6px' }} />
    <div style={{ ...skBlock, height: '12px', width: '45%' }} />
  </div>
);

// "Get notified when we add more pools" lead-capture banner — shown alongside
// results to capture searchers who want more supply in their area. Posts the
// email + searched city to /p/waitlist-signup (source: more_pools_banner).
const searchedCity = () => {
  try {
    const s = typeof window !== 'undefined' ? window.location.search : '';
    const a = new URLSearchParams(s || '').get('address');
    return a ? a.trim() : '';
  } catch (e) {
    return '';
  }
};
const NotifyBanner = () => {
  const [email, setEmail] = React.useState('');
  const [done, setDone] = React.useState(false);
  const [err, setErr] = React.useState(false);
  const submit = e => {
    e.preventDefault();
    e.stopPropagation();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr(true);
      return;
    }
    setErr(false);
    fetch('/p/waitlist-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, city: searchedCity(), source: 'more_pools_banner' }),
    })
      .then(() => setDone(true))
      .catch(() => setDone(true));
  };
  return (
    <div className={css.notifyBanner}>
      {done ? (
        <div className={css.notifyDone}>
          🎉 You're on the list — we'll email you when more pools open up near you.
        </div>
      ) : (
        <div className={css.notifyInner}>
          <div className={css.notifyText}>
            <div className={css.notifyTitle}>Get notified when we add more pools!</div>
            <div className={css.notifySub}>
              Join the list and we'll prioritize pools in your area.
            </div>
          </div>
          <form className={css.notifyForm} onSubmit={submit}>
            <input
              className={css.notifyInput}
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              aria-label="Email address"
            />
            <button className={css.notifyBtn} type="submit">
              Notify me!
            </button>
          </form>
        </div>
      )}
      {err ? <div className={css.notifyErr}>Please enter a valid email.</div> : null}
    </div>
  );
};

const SearchResultsPanel = props => {
  const {
    className,
    rootClassName,
    listings = [],
    pagination,
    search,
    setActiveListing,
    currentLocation,
    isMapVariant = true,
    listingTypeParam,
    searchInProgress = false,
  } = props;
  const classes = classNames(rootClassName || css.root, className);
  const pageName = listingTypeParam ? 'SearchPageWithListingType' : 'SearchPage';

  const paginationLinks =
    pagination && pagination.totalPages > 1 ? (
      <PaginationLinks
        className={css.pagination}
        pageName={pageName}
        pagePathParams={{ listingType: listingTypeParam }}
        pageSearchParams={search}
        pagination={pagination}
      />
    ) : null;

  const cardRenderSizes = (isMapVariant) => {
    if (isMapVariant) {
      // Panel width relative to the viewport
      const panelMediumWidth = 50;
      const panelLargeWidth = 62.5;
      return [
        '(max-width: 767px) 100vw',
        `(max-width: 1023px) ${panelMediumWidth}vw`,
        `(max-width: 1920px) ${panelLargeWidth / 2}vw`,
        `${panelLargeWidth / 3}vw`,
      ].join(', ');
    } else {
      // Panel width relative to the viewport
      const panelMediumWidth = 50;
      const panelLargeWidth = 62.5;
      return [
        '(max-width: 549px) 100vw',
        '(max-width: 767px) 50vw',
        `(max-width: 1439px) 26vw`,
        `(max-width: 1920px) 18vw`,
        `14vw`,
      ].join(', ');
    }
  };

  return (
    <div className={classes}>
      <div className={isMapVariant ? css.listingCardsMapVariant : css.listingCards}>
        {searchInProgress && listings.length === 0 ? (
          <>
            <style>{SK_KEYFRAMES}</style>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={`sk-${i}`} />
            ))}
          </>
        ) : (
          listings.map((l) => (
            <ListingCard
              className={css.listingCard}
              key={l.id.uuid}
              listing={l}
              renderSizes={cardRenderSizes(isMapVariant)}
              setActiveListing={setActiveListing}
              currentLocation={currentLocation}
            />
          ))
        )}
        {props.children}
      </div>
      {!searchInProgress && listings.length > 0 ? <NotifyBanner /> : null}
      {paginationLinks}
    </div>
  );
};

export default SearchResultsPanel;
