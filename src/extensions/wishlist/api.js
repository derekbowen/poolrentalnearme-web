import { deleteMethod, putMethod } from '../common/api';

export const removeListingFromWishlist = (listingId) => {
  return deleteMethod(`/api/wishlist/${listingId}`);
};

export const addListingToWishlist = (listingId) => {
  return putMethod(`/api/wishlist`, { listingId });
};
