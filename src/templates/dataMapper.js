import { stripStreetAddress } from '../util/address';
/**
 * Maps Sharetribe SDK entities into the templateProps shape
 * expected by all listing page templates.
 *
 * @param {Object} listing  - Sharetribe listing entity
 * @param {Object} author   - Sharetribe user entity (listing author)
 * @param {Array}  reviews  - Array of Sharetribe review entities
 * @param {Object} config   - Marketplace configuration
 * @param {Object} intl     - React Intl instance
 * @returns {Object} templateProps
 */
export const mapListingToTemplateProps = (listing, author, reviews = [], config, intl) => {
  const { attributes = {} } = listing || {};
  const { title = '', description = '', price, publicData = {}, geolocation } = attributes;

  // --- Images ---
  const images = (listing?.images || []).map((img) => {
    const variants = img?.attributes?.variants || {};
    return {
      url: variants['scaled-large']?.url || variants['landscape-crop2x']?.url || '',
      alt: title,
      thumbnail: variants['listing-card-2x']?.url || variants['listing-card']?.url || '',
    };
  });

  // --- Price ---
  const priceData = (() => {
    if (!price) return {};
    const amountCents = price.amount;
    const currency = price.currency;
    // Format price: convert cents to dollars/euros etc.
    const amountDecimal = amountCents / 100;
    let formatted;
    try {
      formatted = new Intl.NumberFormat(intl?.locale || 'en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: amountDecimal % 1 === 0 ? 0 : 2,
      }).format(amountDecimal);
    } catch {
      formatted = `${currency} ${amountDecimal.toFixed(2)}`;
    }

    return {
      amount: amountCents,
      currency,
      formatted,
      unitType: publicData?.unitType || '',
    };
  })();

  // --- Location ---
  const location = (() => {
    // Backstop: never hand a street address to a public template.
    const address = stripStreetAddress(
      publicData?.location?.address || publicData?.address || ''
    );
    const coords = geolocation
      ? { lat: geolocation.lat, lng: geolocation.lng }
      : null;
    return {
      address,
      coordinates: coords,
    };
  })();

  // --- Host ---
  const host = (() => {
    if (!author) return {};
    const profile = author?.attributes?.profile || {};
    const profileImageVariants = author?.profileImage?.attributes?.variants || {};
    const profileImage =
      profileImageVariants['square-small2x']?.url ||
      profileImageVariants['square-small']?.url ||
      '';
    return {
      displayName: profile.displayName || '',
      profileImage,
      bio: profile.bio || '',
    };
  })();

  // --- Reviews ---
  const mappedReviews = reviews.map((review) => {
    const reviewAttrs = review?.attributes || {};
    const reviewAuthor = review?.author;
    const authorProfile = reviewAuthor?.attributes?.profile || {};
    return {
      rating: reviewAttrs.rating || 0,
      content: reviewAttrs.content || '',
      authorName: authorProfile.displayName || 'Guest',
      createdAt: reviewAttrs.createdAt || '',
    };
  });

  // --- Amenities ---
  // Amenities may be stored in publicData under various keys
  const amenities = publicData?.amenities || publicData?.poolAmenities || [];

  return {
    title,
    description: description || '',
    images,
    price: priceData,
    location,
    host,
    amenities: Array.isArray(amenities) ? amenities : [],
    reviews: mappedReviews,
    publicData,
  };
};

export default mapListingToTemplateProps;
