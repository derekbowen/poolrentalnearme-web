import React from 'react';
import ImageCarousel from '../shared/ImageCarousel/ImageCarousel';
import AmenitiesGrid from '../shared/AmenitiesGrid/AmenitiesGrid';
import HostCard from '../shared/HostCard/HostCard';
import ReviewSection from '../shared/ReviewSection/ReviewSection';
import LocationMap from '../shared/LocationMap/LocationMap';

/**
 * Luxury Estate listing template.
 * Dark, editorial design with gold accents.
 * Deep navy/black backgrounds, Playfair Display serif font.
 */
const LuxuryListingPage = ({
  templateProps = {},
  orderPanel,
  actionBar,
  onContactUser,
  isOwnListing = false,
}) => {
  const {
    title = '',
    description = '',
    images = [],
    price = {},
    location = {},
    host = {},
    amenities = [],
    reviews = [],
    publicData = {},
  } = templateProps;

  return (
    <div data-template="luxury" className="min-h-screen bg-[#0f0f1a] font-['Playfair_Display',serif] text-white">
      {/* Action Bar */}
      {actionBar && <div className="mb-4">{actionBar}</div>}

      {/* Hero Image - Full Width */}
      <div className="relative">
        <ImageCarousel images={images} design="luxury" className="rounded-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f1a] via-transparent to-transparent pointer-events-none" />
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 -mt-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-10">
            {/* Title */}
            <div className="border-b border-gray-800 pb-8">
              <p className="text-yellow-500 text-sm uppercase tracking-[0.3em] font-sans font-medium mb-3">
                Exclusive Collection
              </p>
              <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight tracking-tight">
                {title}
              </h1>
              {location.address && (
                <p className="text-gray-400 mt-3 text-sm font-sans tracking-wide">
                  {location.address}
                </p>
              )}
              {price.formatted && (
                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-yellow-500">{price.formatted}</span>
                  {price.unitType && (
                    <span className="text-gray-500 text-sm font-sans">/ {price.unitType}</span>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            {description && (
              <div className="border-b border-gray-800 pb-10">
                <h2 className="text-xs uppercase tracking-[0.3em] text-yellow-500 font-sans font-medium mb-6">
                  The Experience
                </h2>
                <p className="text-gray-300 leading-relaxed text-lg font-light whitespace-pre-line">
                  {description}
                </p>
              </div>
            )}

            {/* Pool Details */}
            {(publicData.poolType || publicData.poolSize || publicData.maxGuests) && (
              <div className="border-b border-gray-800 pb-10">
                <h2 className="text-xs uppercase tracking-[0.3em] text-yellow-500 font-sans font-medium mb-6">
                  Estate Details
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {publicData.poolType && (
                    <div className="text-center">
                      <p className="text-gray-500 text-xs uppercase tracking-widest font-sans">Type</p>
                      <p className="text-white text-lg mt-2">{publicData.poolType}</p>
                      <div className="w-8 h-px bg-yellow-600 mx-auto mt-3" />
                    </div>
                  )}
                  {publicData.poolSize && (
                    <div className="text-center">
                      <p className="text-gray-500 text-xs uppercase tracking-widest font-sans">Size</p>
                      <p className="text-white text-lg mt-2">{publicData.poolSize}</p>
                      <div className="w-8 h-px bg-yellow-600 mx-auto mt-3" />
                    </div>
                  )}
                  {publicData.maxGuests && (
                    <div className="text-center">
                      <p className="text-gray-500 text-xs uppercase tracking-widest font-sans">Capacity</p>
                      <p className="text-white text-lg mt-2">{publicData.maxGuests} Guests</p>
                      <div className="w-8 h-px bg-yellow-600 mx-auto mt-3" />
                    </div>
                  )}
                  {publicData.poolDepth && (
                    <div className="text-center">
                      <p className="text-gray-500 text-xs uppercase tracking-widest font-sans">Depth</p>
                      <p className="text-white text-lg mt-2">{publicData.poolDepth}</p>
                      <div className="w-8 h-px bg-yellow-600 mx-auto mt-3" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div className="border-b border-gray-800 pb-10">
                <h2 className="text-xs uppercase tracking-[0.3em] text-yellow-500 font-sans font-medium mb-6">
                  Curated Amenities
                </h2>
                <AmenitiesGrid amenities={amenities} design="luxury" />
              </div>
            )}

            {/* Location */}
            <div className="border-b border-gray-800 pb-10">
              <LocationMap location={location} design="luxury" />
            </div>

            {/* Host */}
            <HostCard
              host={host}
              design="luxury"
              onContactUser={onContactUser}
              isOwnListing={isOwnListing}
            />

            {/* Reviews */}
            <ReviewSection reviews={reviews} design="luxury" />
          </div>

          {/* Right Column - Booking */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              {orderPanel && (
                <div className="bg-gray-900/80 rounded-xl border border-gray-700 shadow-2xl p-6 backdrop-blur">
                  {orderPanel}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gold line accent */}
      <div className="mt-20 h-px bg-gradient-to-r from-transparent via-yellow-600 to-transparent" />
    </div>
  );
};

export default LuxuryListingPage;
