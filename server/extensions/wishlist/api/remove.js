const { asyncRequestHandler } = require('../../common/utils/request');
const removeFromWishlist = require('../mod/wishlist/sharetribeExtendedData/remove');

module.exports = asyncRequestHandler((req) => {
  const { currentUser } = req;
  const { listingId } = req.params;

  return removeFromWishlist(currentUser.id.uuid, listingId);
});
