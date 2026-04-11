import React, { useEffect } from 'react';
import { connect, useDispatch } from 'react-redux';
import { fetchFeaturedListings, fetchUserLocation } from './LandingPage.duck';
import PremiumLandingPage from './PremiumLandingPage';

export const LandingPageComponent = (props) => {
  const {
    listings,
    fetchInProgress,
    fetchError,
    userLocation,
    userLocationError,
    marketSnapshot,
  } = props;
  const dispatch = useDispatch();

  // On mount: resolve the visitor's approximate location (by IP), then
  // fetch featured listings ordered by distance from that origin. If
  // geolocation fails for any reason, fall back to an un-located query
  // so the page still renders useful content.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loc = await dispatch(fetchUserLocation());
      if (cancelled) return;
      dispatch(fetchFeaturedListings(loc));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PremiumLandingPage
      listings={listings}
      fetchInProgress={fetchInProgress}
      fetchError={fetchError}
      userLocation={userLocation}
      userLocationError={userLocationError}
      marketSnapshot={marketSnapshot}
    />
  );
};

const mapStateToProps = (state) => {
  const {
    featuredListingIds,
    fetchFeaturedListingsInProgress,
    fetchFeaturedListingsError,
    userLocation,
    userLocationError,
    marketSnapshot,
  } = state.LandingPage;

  // featuredListingIds now stores full processed listing objects from the live SDK
  return {
    listings: featuredListingIds || [],
    fetchInProgress: fetchFeaturedListingsInProgress,
    fetchError: fetchFeaturedListingsError,
    userLocation,
    userLocationError,
    marketSnapshot,
  };
};

export default connect(mapStateToProps)(LandingPageComponent);
