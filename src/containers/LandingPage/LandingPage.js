import React, { useEffect, useMemo, useRef, useState } from 'react';
import { arrayOf, bool, number, object, shape, string } from 'prop-types';
import { compose } from 'redux';
import { connect } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useConfiguration } from '../../context/configurationContext';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { useIntl } from '../../util/reactIntl';
import { createResourceLocatorString } from '../../util/routes';
import { stringify } from '../../util/urlHelpers';
import { stringifyDateToISO8601 } from '../../util/dates';
import { isOriginInUse } from '../../util/search';
import { propTypes } from '../../util/types';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import { getListingsById } from '../../ducks/marketplaceData.duck';
import { Page, LayoutSingleColumn } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';

import {
  SEASONS,
  TABS,
  TAB_FOR_YOU,
  flattenCategories,
  formatAllInPrice,
  getSeason,
  isEligible,
  pickForTab,
  rankListings,
  rankingOrderLabel,
  resolveHomepageCategoryIds,
  toHomepageListing,
} from './homepageInventory';
import { FALLBACK_LISTINGS, FAQS, MOSAIC, POOL_TYPES, SHORTCUTS } from './homeContent';
// Shared recipes first so every section's own rules cascade after them.
import './HomeShared.module.css';
import HomeHeader from './sections/HomeHeader';
import HomeHero from './sections/HomeHero';
import HomeStickySearch from './sections/HomeStickySearch';
import HomeShortcuts from './sections/HomeShortcuts';
import HomeInventory from './sections/HomeInventory';
import HomeMosaic from './sections/HomeMosaic';
import HomeHowItWorks from './sections/HomeHowItWorks';
import HomeFeaturedPool from './sections/HomeFeaturedPool';
import HomeHostCta from './sections/HomeHostCta';
import HomeAcademy from './sections/HomeAcademy';
import HomeDirectory from './sections/HomeDirectory';
import HomeFaq from './sections/HomeFaq';
import HomeFooter from './sections/HomeFooter';

import css from './LandingPage.module.css';

const PAGE_TITLE = 'Rent a Private Pool by the Hour — Pool Rental Near Me';
const PAGE_DESCRIPTION =
  'Rent a pool you’ll fall in love with. Private backyard pools by the hour — indoor and heated pools open all winter, real hosts, prices that include all fees. Search by city or ZIP.';

const GREEN = '#16a34a';
const AMBER = '#ff8a1f';
const RED = '#dc2626';

// /s links: real Console category ids when configured, keyword search as the crawlable fallback.
const searchTo = (params) => ({ search: `?${stringify(params)}` });
const searchLinkFor = (categoryIds, { category, keywords }) =>
  category && categoryIds[category]
    ? searchTo({ pub_categoryLevel1: categoryIds[category] })
    : searchTo({ keywords });

const DATE_FORMAT = { weekday: 'short', month: 'short', day: 'numeric' };

/**
 * PoolRentalNearMe.com homepage (PRNM Homepage v3): marketplace hero + booking search,
 * seasonal shortcuts, live ranked inventory, occasion mosaic, how it works, Katy feature, host
 * acquisition, Pool Host Academy, SEO directory, FAQ + Text Derek, footer.
 *
 * Inventory comes from LandingPage.duck (Marketplace API) and is filtered + ranked by
 * homepageInventory.js; the design's real listings are the fallback when the feed is empty.
 */
export const LandingPageComponent = (props) => {
  const {
    listings = [],
    fetchInProgress,
    fetchError,
    scrollingDisabled,
    isAuthenticated,
    currentUser,
    currentUserHasListings,
    notificationCount,
  } = props;

  const config = useConfiguration();
  const routeConfiguration = useRouteConfiguration();
  const intl = useIntl();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState(TAB_FOR_YOU);
  const [searchValues, setSearchValues] = useState({});
  const [stickyVisible, setStickyVisible] = useState(false);
  const searchAnchorRef = useRef(null);
  const whereInputRef = useRef(null);

  const season = SEASONS[getSeason()];
  const categories = config.categoryConfiguration?.categories;
  const categoryNames = useMemo(() => flattenCategories(categories), [categories]);
  const categoryIds = useMemo(() => resolveHomepageCategoryIds(categories), [categories]);

  // ---- inventory ----
  const liveListings = useMemo(
    () => listings.map((l) => toHomepageListing(l, { categoryNames, intl })).filter(isEligible),
    [listings, categoryNames, intl]
  );
  const loading = fetchInProgress && liveListings.length === 0;
  const usingFallback = !loading && liveListings.length === 0;
  const pool = usingFallback
    ? FALLBACK_LISTINGS.map((l) => ({ ...l, priceLabel: formatAllInPrice(intl, l.price) })).filter(
        isEligible
      )
    : liveListings;
  const ranked = rankListings(pool, { weights: season.weights, location: null, density: null });
  const picked = pickForTab(ranked, tab);
  const activeTab = TABS.find((t) => t.key === tab) || TABS[0];
  const order = rankingOrderLabel(season.weights);

  const status = loading
    ? { color: AMBER, text: 'Loading live pools…' }
    : !usingFallback
      ? {
          color: GREEN,
          text: `Live from the marketplace · ${liveListings.length} pools online now · ranked for ${season.key}: ${order} · prices include all fees`,
        }
      : {
          color: fetchError ? RED : AMBER,
          text: `${fetchError ? 'Live feed unavailable right now' : 'No live pools yet'} · showing recent pools · ranked for ${season.key}: ${order} · prices include all fees`,
        };

  const heading = tab === TAB_FOR_YOU ? season.inventoryHeading : activeTab.heading;
  const noun = activeTab.noun;
  const more =
    tab === TAB_FOR_YOU
      ? {
          eyebrow: season.moreEyebrow,
          text: 'See every pool near you on the map →',
          to: searchTo({}),
        }
      : picked.length > 0
        ? {
            eyebrow: season.moreEyebrow,
            text: `See all ${noun} pools on the map →`,
            to: searchLinkFor(categoryIds, { category: tab, keywords: noun }),
          }
        : {
            eyebrow: season.moreEyebrow,
            text: `More ${noun} pools are joining. Heated pools are open all winter →`,
            to: searchLinkFor(categoryIds, { category: 'heated', keywords: 'heated' }),
          };

  const tabs = TABS.map((t) => ({
    key: t.key,
    label: t.label,
    active: t.key === tab,
    onPick: () => setTab(t.key),
  }));

  // ---- discovery links ----
  const indoorPhoto = liveListings.find((l) => l.cat === 'indoor')?.image?.attributes?.variants?.[
    'scaled-small'
  ]?.url;
  const shortcuts = season.shortcutOrder.map((k) => {
    const s = SHORTCUTS[k];
    return {
      key: s.key,
      label: s.label,
      imageUrl: s.img || (k === 'indoor' ? indoorPhoto : null),
      to: searchLinkFor(categoryIds, s),
    };
  });
  const mosaic = MOSAIC.map((t) => ({ ...t, to: searchLinkFor(categoryIds, t) }));
  const poolTypes = POOL_TYPES.map((p) => ({
    label: p.label,
    to: searchLinkFor(categoryIds, {
      category: categoryIds[p.keywords] ? p.keywords : null,
      keywords: p.keywords,
    }),
  }));

  // ---- search ----
  const onSearchSubmit = (values) => {
    const { location, date, guests } = values || {};
    const selectedPlace = location?.selectedPlace;
    const originMaybe =
      isOriginInUse(config) && selectedPlace?.origin ? { origin: selectedPlace.origin } : {};
    const placeMaybe = selectedPlace
      ? { address: location.search, bounds: selectedPlace.bounds, ...originMaybe }
      : {};
    const day = date?.date;
    const iso = day ? stringifyDateToISO8601(day) : null;
    const datesMaybe = iso ? { dates: `${iso},${iso}` } : {};
    const guestCount = parseInt(guests, 10);
    // /s only applies a seats filter together with dates (see SearchPage.duck seatsSearchParams).
    const seatsMaybe = iso && guestCount > 0 ? { seats: guestCount } : {};
    const categoryMaybe =
      tab !== TAB_FOR_YOU && categoryIds[tab] ? { pub_categoryLevel1: categoryIds[tab] } : {};
    navigate(
      createResourceLocatorString(
        'SearchPage',
        routeConfiguration,
        {},
        {
          ...placeMaybe,
          ...datesMaybe,
          ...seatsMaybe,
          ...categoryMaybe,
        }
      )
    );
  };

  const stickyPrimary = searchValues.location?.search || 'Where to?';
  const stickySecondary = [
    searchValues.date?.date ? intl.formatDate(searchValues.date.date, DATE_FORMAT) : 'Any date',
    searchValues.guests ? `${searchValues.guests} guests` : 'Guests',
  ].join(' · ');

  useEffect(() => {
    const el = searchAnchorRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const backToSearch = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => whereInputRef.current?.focus?.(), 450);
  };

  const openMobileMenu = () =>
    setSearchParams((prev) => {
      prev.append('mobilemenu', 'open');
      return prev;
    });

  const schema = [
    {
      '@context': 'http://schema.org',
      '@type': 'WebPage',
      name: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
    },
    {
      '@context': 'http://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];

  return (
    <Page
      className={css.page}
      title={PAGE_TITLE}
      description={PAGE_DESCRIPTION}
      schema={schema}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn
        className={css.layout}
        mainColumnClassName={css.main}
        topbar={
          <TopbarContainer
            currentPage="LandingPage"
            mobileRootClassName={css.hiddenTopbar}
            desktopClassName={css.hiddenTopbar}
          />
        }
        footer={<HomeFooter />}
      >
        <HomeHeader
          isAuthenticated={isAuthenticated}
          currentUser={currentUser}
          notificationCount={notificationCount}
          inboxTab={currentUserHasListings ? 'sales' : 'orders'}
          onOpenMobileMenu={openMobileMenu}
        />
        <HomeStickySearch
          visible={stickyVisible}
          primary={stickyPrimary}
          secondary={stickySecondary}
          shortcuts={shortcuts}
          onTap={backToSearch}
        />
        <HomeHero
          eyebrow={season.heroEyebrow}
          tabs={tabs}
          searchAnchorRef={searchAnchorRef}
          searchFormProps={{
            onSubmit: onSearchSubmit,
            onValuesChange: setSearchValues,
            inputRef: whereInputRef,
          }}
        />
        <HomeShortcuts items={shortcuts} className={css.shortcuts} />
        <HomeInventory
          heading={heading}
          status={status}
          tabs={tabs}
          listings={picked}
          more={more}
          isAuthenticated={isAuthenticated}
        />
        <HomeMosaic tiles={mosaic} />
        <HomeHowItWorks />
        <HomeFeaturedPool />
        <HomeHostCta />
        <HomeAcademy />
        <HomeDirectory poolTypes={poolTypes} />
        <HomeFaq />
      </LayoutSingleColumn>
    </Page>
  );
};

LandingPageComponent.propTypes = {
  listings: arrayOf(propTypes.listing),
  fetchInProgress: bool,
  fetchError: propTypes.error,
  scrollingDisabled: bool,
  isAuthenticated: bool,
  currentUser: propTypes.currentUser,
  currentUserHasListings: bool,
  notificationCount: number,
  categoryIds: shape({ indoor: string, heated: string, night: string }),
  // eslint-disable-next-line react/no-unused-prop-types
  location: object,
};

const mapStateToProps = (state) => {
  const { listingIds = [], fetchInProgress, fetchError, categoryIds } = state.LandingPage || {};
  const { isAuthenticated } = state.auth;
  const { currentUser, currentUserHasListings, currentUserNotificationCount } = state.user;
  return {
    listings: getListingsById(state, listingIds),
    fetchInProgress,
    fetchError,
    categoryIds,
    isAuthenticated,
    currentUser,
    currentUserHasListings,
    notificationCount: currentUserNotificationCount,
    scrollingDisabled: isScrollingDisabled(state),
  };
};

const LandingPage = compose(connect(mapStateToProps))(LandingPageComponent);

export default LandingPage;
