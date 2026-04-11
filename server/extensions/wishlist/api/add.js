const { asyncRequestHandler } = require('../../common/utils/request');
const addToWishlist = require('../mod/wishlist/sharetribeExtendedData/add');

module.exports = asyncRequestHandler((req) => {
  const { currentUser } = req;
  const { listingId } = req.body;

  return addToWishlist(currentUser.id.uuid, listingId);
});
