import React from 'react';
import ImageCarousel from '../shared/ImageCarousel/ImageCarousel';
import AmenitiesGrid from '../shared/AmenitiesGrid/AmenitiesGrid';
import HostCard from '../shared/HostCard/HostCard';
import ReviewSection from '../shared/ReviewSection/ReviewSection';
import LocationMap from '../shared/LocationMap/LocationMap';

/**
 * Unique & Bold listing template.
 * Retro-futurism, personality-forward design.
 * Dark stone backgrounds, orange & violet accents, Space Mono monospace font.
 */
const BoldListingPage = ({
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
    <div data-template="bold" className="min-h-screen bg-stone-900 font-['Space_Mono',monospace]">
      {/* Action Bar */}
      {actionBar && <div className="mb-4">{actionBar}</div>}

      {/* Retro accent header */}
      <div className="bg-gradient-to-r from-orange-500 via-red-500 to-violet-600 py-1" />

      {/* Hero */}
      <div className="relative">
        <ImageCarousel images={images} design="bold" className="rounded-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-stone-900/30 to-transparent pointer-events-none" />
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Title */}
            <div className="border-b border-stone-700 pb-8">
              <p className="text-orange-500 text-xs uppercase tracking-[0.4em] font-bold mb-4">
                // ONE OF A KIND
              </p>
              <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight">
                {title}
              </h1>
              {location.address && (
                <p className="text-stone-400 mt-3 text-sm tracking-wide">
                  &gt; {location.address}
                </p>
              )}
              {price.formatted && (
                <div className="mt-6 flex items-baseline gap-3">
                  <span className="text-3xl font-bold text-orange-500">{price.formatted}</span>
                  {price.unitType && (
                    <span className="text-stone-500 text-sm">/ {price.unitType}</span>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            {description && (
              <div className="bg-stone-800 rounded-xl p-8 border border-stone-700">
                <h2 className="text-xs uppercase tracking-[0.3em] text-violet-400 font-bold mb-4">
                  [ THE STORY ]
                </h2>
                <p className="text-stone-300 leading-relaxed whitespace-pre-line font-sans">{description}</p>
              </div>
            )}

            {/* Pool Specs - Retro terminal style */}
            {(publicData.poolType || publicData.poolSize || publicData.maxGuests) && (
              <div className="bg-stone-800 rounded-xl p-8 border border-stone-700">
                <h2 className="text-xs uppercase tracking-[0.3em] text-orange-400 font-bold mb-6">
                  [ POOL.SPECS ]
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {publicData.poolType && (
                    <div className="bg-stone-900 rounded-lg p-4 border border-stone-600">
                      <p className="text-violet-400 text-[10px] uppercase tracking-widest">TYPE:</p>
                      <p className="text-white font-bold mt-1">{publicData.poolType}</p>
                    </div>
                  )}
                  {publicData.poolSize && (
                    <div className="bg-stone-900 rounded-lg p-4 border border-stone-600">
                      <p className="text-orange-400 text-[10px] uppercase tracking-widest">SIZE:</p>
                      <p className="text-white font-bold mt-1">{publicData.poolSize}</p>
                    </div>
                  )}
                  {publicData.maxGuests && (
                    <div className="bg-stone-900 rounded-lg p-4 border border-stone-600">
                      <p className="text-violet-400 text-[10px] uppercase tracking-widest">MAX:</p>
                      <p className="text-white font-bold mt-1">{publicData.maxGuests}</p>
                    </div>
                  )}
                  {publicData.poolDepth && (
                    <div className="bg-stone-900 rounded-lg p-4 border border-stone-600">
                      <p className="text-orange-400 text-[10px] uppercase tracking-widest">DEPTH:</p>
                      <p className="text-white font-bold mt-1">{publicData.poolDepth}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div className="bg-stone-800 rounded-xl p-8 border border-stone-700">
                <h2 className="text-xs uppercase tracking-[0.3em] text-violet-400 font-bold mb-6">
                  [ FEATURES ]
                </h2>
                <AmenitiesGrid amenities={amenities} design="bold" />
              </div>
            )}

            {/* Location */}
            <div className="bg-stone-800 rounded-xl p-8 border border-stone-700">
              <LocationMap location={location} design="bold" />
            </div>

            {/* Host */}
            <HostCard
              host={host}
              design="bold"
              onContactUser={onContactUser}
              isOwnListing={isOwnListing}
            />

            {/* Reviews */}
            <div className="bg-stone-800 rounded-xl p-8 border border-stone-700">
              <ReviewSection reviews={reviews} design="bold" />
            </div>
          </div>

          {/* Right Column - Booking */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              {orderPanel && (
                <div className="bg-stone-800 rounded-xl border border-stone-600 shadow-2xl shadow-orange-500/10 p-6">
                  {orderPanel}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom retro accent */}
      <div className="mt-16 bg-gradient-to-r from-orange-500 via-red-500 to-violet-600 py-1" />
    </div>
  );
};

export default BoldListingPage;
