// eslint-disable-next-line import/prefer-default-export
const {
  VITE_JH_WISHLIST_FEATURE_ENABLE_BOOKMARK_OWN_LISTING,
  VITE_JH_WISHLIST_FEATURE_ENABLE_USER_NAV_ITEM,
} = import.meta.env;

export const enableBookmarkOwnListing =
  VITE_JH_WISHLIST_FEATURE_ENABLE_BOOKMARK_OWN_LISTING?.toLowerCase() === 'true';

export const enableUserNavItem =
  VITE_JH_WISHLIST_FEATURE_ENABLE_USER_NAV_ITEM?.toLowerCase() === 'true';
