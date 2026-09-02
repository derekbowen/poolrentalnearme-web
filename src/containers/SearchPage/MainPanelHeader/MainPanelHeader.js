import React from 'react';
import classNames from 'classnames';

import { FormattedMessage } from '../../../util/reactIntl';

import css from './MainPanelHeader.module.css';

/**
 * MainPanelHeader component
 *
 * @component
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {React.Node} props.children - The children
 * @param {React.Node} props.sortByComponent - The sort by component
 * @param {boolean} props.isSortByActive - Whether the sort by is active
 * @param {boolean} props.listingsAreLoaded - Whether the listings are loaded
 * @param {number} props.resultsCount - The results count
 * @param {boolean} props.searchInProgress - Whether the search is in progress
 * @param {React.Node} props.noResultsInfo - The no results info
 * @returns {JSX.Element}
 */
const MainPanelHeader = props => {
  const {
    rootClassName,
    className,
    children,
    sortByComponent,
    isSortByActive,
    listingsAreLoaded,
    resultsCount,
    searchInProgress = false,
    noResultsInfo,
    currentLocation,
    searchAddress,
  } = props;

  const classes = classNames(rootClassName || css.root, className);

  const prettyLocation =
    searchAddress && searchAddress !== 'Current location' ? searchAddress : 'you';
  const showHeading = !searchInProgress && resultsCount > 0 && !!searchAddress;

  // The search page is the marketplace's main discovery entry point and, until
  // now, had no <h1> at all: the heading above was a styled <div>, and only
  // rendered once a located search returned results. Google saw a 2,972-
  // impression page with no primary heading. It is now a real <h1>, always
  // present: "Pools near {place}" for a located search, and the generic
  // "Pool rentals near you" for the bare /s hub. Same visual style.
  const headingText = showHeading ? `Pools near ${prettyLocation}` : 'Pool rentals near you';

  return (
    <div className={classes}>
      <h1
        style={{
          fontSize: '22px',
          fontWeight: 600,
          margin: '0 0 6px 0',
          color: '#0b2733',
          lineHeight: 1.3,
        }}
      >
        {headingText}
      </h1>
      <div className={css.searchOptions}>
        <div className={css.searchResultSummary}>
          <span className={css.resultsFound}>
            {searchInProgress ? (
              <FormattedMessage id="MainPanelHeader.loadingResults" />
            ) : (
              <>
                <FormattedMessage
                  id="MainPanelHeader.foundResults"
                  values={{ count: resultsCount }}
                />
                {currentLocation || resultsCount == 0 ? null : (
                  <div className={css.locationDescription}>
                    <FormattedMessage id="SearchPage.cannotGetLocation" />
                  </div>
                )}
              </>
            )}
          </span>
        </div>
        {isSortByActive ? (
          <div className={css.sortyByWrapper}>
            <span className={css.sortyBy}>
              <FormattedMessage id="MainPanelHeader.sortBy" />
            </span>
            {sortByComponent}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '13px',
          fontWeight: 500,
          color: '#007eb7',
          margin: '2px 0 10px',
        }}
      >
        <span aria-hidden="true">✓</span> Prices include all fees — no surprises at checkout
      </div>

      {children}

      {noResultsInfo ? noResultsInfo : null}
    </div>
  );
};

export default MainPanelHeader;
