const wishlistConfig = require('../../../common/config/wishlist');
const { createError } = require('../../../../common/utils/response');
const integrationSdk = require('../../../../../api-util/integration');

/**
 * @async
 * @description Adds a listing to user's wishlist
 * @copyright Journey Horizon Vietnam
 * @name wishlistAddModule
 * @method mod/wishlist/add
 * @param {UUID | string} userId
 * @param {UUID | string} listingId
 * @returns {Promise} Returns the promise that resolves when the listing is added to the user's wishlist successfully
 *
 * @todo
 * - Limit the total number of wishlist entries to prevent Sharetribe's 50kb limit in data structures
 */
module.exports = async (userId, listingId) => {
  const [listing, user] = await Promise.all([
    integrationSdk.listings.show({ id: listingId, include: ['author'] }, { expand: true }),
    integrationSdk.users.show({ id: userId }, { expand: true }),
  ]);

  if (!wishlistConfig.enableBookmarkOwnListing && userId === listing.author.id.uuid) {
    throw createError({
      status: 403,
      statusText: 'Forbidden',
      message: 'You are not allowed to add your own listing',
      data: {
        errors: [
          {
            status: 403,
            statusText: 'Forbidden',
            listingId,
            message: 'You are not allowed to add your own listing',
          },
        ],
      },
    });
  }

  const { wishlist: userWishlist = {} } = user.attributes.profile.metadata;
  const { likedByUserIds: listingBookmarks = [] } = listing.attributes.metadata;

  const updateListingPromise = (currentUserId) => {
    const updatedBookmarks = Array.from(new Set(listingBookmarks.concat(currentUserId)));

    return integrationSdk.listings.update(
      {
        id: listingId,
        metadata: {
          likedByUserIds: updatedBookmarks,
        },
      },
      { expand: true }
    );
  };

  const updateUserProfilePromise = (currentListingId) =>
    integrationSdk.users.updateProfile(
      {
        id: userId,
        metadata: {
          wishlist: { ...userWishlist, [currentListingId]: true },
        },
      },
      { expand: true }
    );

  const [updatedListing, updatedUser] = await Promise.all([
    updateListingPromise(userId),
    updateUserProfilePromise(listingId),
  ]);

  return {
    data: {
      listing: updatedListing,
      user: updatedUser,
    },
  };
};
