const integrationSdk = require('../../../../../api-util/integration');

/**
 * @async
 * @description Removes listing from user's wishlist
 * @copyright Journey Horizon Vietnam
 * @name wishlistRemoveModule
 * @method mod/wishlist/remove
 * @param {UUID | string} userId
 * @param {UUID | string} listingId
 * @returns {Promise} Returns the promise that resolves when the listing is removed from the user's wishlist successfully
 *
 */
module.exports = async (userId, listingId) => {
  const [listing, user] = await Promise.all([
    integrationSdk.listings.show({ id: listingId }, { expand: true }),
    integrationSdk.users.show({ id: userId }, { expand: true }),
  ]);

  const { wishlist: userWishlist = {} } = user.attributes.profile.metadata;
  const { likedByUserIds: listingBookmarks = [] } = listing.attributes.metadata;

  const updateListingPromise = (currentUserId) =>
    integrationSdk.listings.update({
      id: listingId,
      metadata: {
        likedByUserIds: listingBookmarks.filter((id) => id !== currentUserId),
      },
    });

  const updateUserProfilePromise = (currentListingId) => {
    const { [currentListingId]: _, ...restWishlist } = userWishlist;

    return integrationSdk.users.updateProfile({
      id: userId,
      metadata: {
        wishlist: restWishlist,
      },
    });
  };

  await Promise.all([updateListingPromise(userId), updateUserProfilePromise(listingId)]);

  return {
    data: {
      message: 'The listing has been removed successfully!',
    },
  };
};
