import React, { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import PaginationLinks from 'components/PaginationLinks/PaginationLinks';
import { isScrollingDisabled } from '../../../../ducks/ui.duck';
import { FormattedMessage, useIntl } from '../../../../util/reactIntl';

import { H3, LayoutSingleColumn, NamedLink, Page, UserNav } from '../../../../components';

import FooterContainer from '../../../../containers/FooterContainer/FooterContainer';
import TopbarContainer from '../../../../containers/TopbarContainer/TopbarContainer';

import WishlistListingCard from '../../components/WishlistListingCard/WishlistListingCard';

import NotFoundPage from '../../../../containers/NotFoundPage/NotFoundPage';

import { getListingsById } from '../../../../ducks/marketplaceData.duck';
import { removeListing } from './WishlistPage.duck';

import css from './WishlistPage.module.css';

/**
 * Component for showing current user's wishlist.
 *
 * @component
 */
export const WishlistPage = () => {
  // REDUX SELECTORS
  const { currentPageResultIds, pagination, queryInProgress, queryWishlistError, queryParams } =
    useSelector((state) => state.WishlistPage);
  const { removingListing, removingListingError } = useSelector((state) => state.wishlist);
  const scrollingDisabled = useSelector((state) => isScrollingDisabled(state));
  const listings = useSelector((state) => getListingsById(state, currentPageResultIds));

  // REDUX DISPATCH
  const dispatch = useDispatch();
  const onRemoveListing = (listingId) => dispatch(removeListing(listingId));

  // CUSTOM HOOKS
  const intl = useIntl();

  // LOCAL STATES
  const [listingMenuOpen, setListingMenuOpen] = useState(null);

  // LOCAL CALLBACKS
  const onToggleMenu = useCallback((listing) => {
    setListingMenuOpen(listing);
  }, []);

  const hasPaginationInfo = !!pagination && pagination.totalItems != null;
  const listingsAreLoaded = !queryInProgress && hasPaginationInfo;

  const loadingResults = (
    <div className={css.messagePanel}>
      <H3 as="h2" className={css.heading}>
        <FormattedMessage id="WishlistPage.loadingListings" />
      </H3>
    </div>
  );

  const queryError = (
    <div className={css.messagePanel}>
      <H3 as="h2" className={css.heading}>
        <FormattedMessage id="WishlistPage.queryError" />
      </H3>
    </div>
  );

  const noResults =
    listingsAreLoaded && pagination.totalItems === 0 ? (
      <div className={css.noResultsContainer}>
        <H3 as="h1" className={css.headingNoListings}>
          <FormattedMessage id="WishlistPage.noResults" />
        </H3>
        <p className={css.suggestionParagraph}>
          <NamedLink name="SearchPage">
            <FormattedMessage id="WishlistPage.searchListings" />
          </NamedLink>
        </p>
      </div>
    ) : null;

  const heading =
    listingsAreLoaded && pagination.totalItems > 0 ? (
      <H3 as="h1" className={css.heading}>
        <FormattedMessage id="WishlistPage.myWishlist" values={{ count: pagination.totalItems }} />
      </H3>
    ) : (
      noResults
    );

  const page = queryParams?.page ?? 1;
  const paginationLinks =
    listingsAreLoaded && pagination?.totalPages > 1 ? (
      <PaginationLinks
        className={css.pagination}
        pageName="WishlistPage"
        pageSearchParams={{ page }}
        pagination={pagination}
      />
    ) : null;

  const removingErrorListingId = removingListingError?.listingId;

  const title = intl.formatMessage({ id: 'WishlistPage.title' });

  const panelWidth = 62.5;
  // Render hints for responsive image
  const renderSizes = [
    `(max-width: 767px) 100vw`,
    `(max-width: 1920px) ${panelWidth / 2}vw`,
    `${panelWidth / 3}vw`,
  ].join(', ');

  if (hasPaginationInfo && pagination.totalPages >= 1 && pagination.page > pagination.totalPages) {
    // The total results are more than one page but the current page number is not valid, return not found page
    return <NotFoundPage />;
  }

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn
        topbar={
          <>
            <TopbarContainer />
            <UserNav currentPage="WishlistPage" />
          </>
        }
        footer={<FooterContainer />}
      >
        {queryInProgress ? loadingResults : null}
        {queryWishlistError ? queryError : null}
        <div className={css.listingPanel}>
          {heading}
          <div className={css.listingCards}>
            {listings.map((l) => (
              <WishlistListingCard
                className={css.listingCard}
                key={l.id.uuid}
                listing={l}
                isMenuOpen={!!listingMenuOpen && listingMenuOpen.id.uuid === l.id.uuid}
                actionsInProgressListingId={removingListing}
                onToggleMenu={onToggleMenu}
                onRemoveListing={onRemoveListing}
                hasRemovingError={removingErrorListingId?.uuid === l.id.uuid}
                renderSizes={renderSizes}
                showAuthorInfo
              />
            ))}
          </div>
          {paginationLinks}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

export default WishlistPage;
