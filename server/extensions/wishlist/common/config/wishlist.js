const enableBookmarkOwnListing =
  process.env.VITE_JH_WISHLIST_FEATURE_ENABLE_BOOKMARK_OWN_LISTING?.toLowerCase() === 'true';

module.exports = {
  enableBookmarkOwnListing,
};
