import React from 'react';
import ImageCarousel from '../shared/ImageCarousel/ImageCarousel';
import AmenitiesGrid from '../shared/AmenitiesGrid/AmenitiesGrid';
import HostCard from '../shared/HostCard/HostCard';
import ReviewSection from '../shared/ReviewSection/ReviewSection';
import LocationMap from '../shared/LocationMap/LocationMap';

/**
 * Party Ready listing template.
 * Bold, colorful, event-focused design.
 * Dark slate backgrounds, rose & cyan accents, Space Grotesk font.
 */
const PartyListingPage = ({
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
    <div data-template="party" className="min-h-screen bg-slate-900 font-['Space_Grotesk',sans-serif]">
      {/* Action Bar */}
      {actionBar && <div className="mb-4">{actionBar}</div>}

      {/* Hero with gradient overlay */}
      <div className="relative">
        <ImageCarousel images={images} design="party" className="rounded-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent pointer-events-none" />
        {/* Neon accent line */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500" />
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Title Block */}
            <div className="pb-6">
              <div className="inline-block px-3 py-1 bg-gradient-to-r from-rose-500 to-cyan-500 rounded-full text-xs font-bold text-white uppercase tracking-wider mb-4">
                Pool Party Ready
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight">
                {title}
              </h1>
              {location.address && (
                <p className="text-slate-400 mt-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {location.address}
                </p>
              )}
              {price.formatted && (
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold bg-gradient-to-r from-rose-400 to-cyan-400 bg-clip-text text-transparent">
                    {price.formatted}
                  </span>
                  {price.unitType && (
                    <span className="text-slate-500 text-sm">/ {price.unitType}</span>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            {description && (
              <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700">
                <h2 className="text-xl font-bold text-white mb-4">The Vibe</h2>
                <p className="text-slate-300 leading-relaxed whitespace-pre-line">{description}</p>
              </div>
            )}

            {/* Pool Stats */}
            {(publicData.poolType || publicData.poolSize || publicData.maxGuests) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {publicData.poolType && (
                  <div className="bg-gradient-to-br from-slate-800 to-slate-800/50 rounded-2xl p-5 border border-slate-700 text-center">
                    <p className="text-cyan-400 text-xs uppercase tracking-wider font-bold">Type</p>
                    <p className="text-white text-lg font-bold mt-2">{publicData.poolType}</p>
                  </div>
                )}
                {publicData.poolSize && (
                  <div className="bg-gradient-to-br from-slate-800 to-slate-800/50 rounded-2xl p-5 border border-slate-700 text-center">
                    <p className="text-rose-400 text-xs uppercase tracking-wider font-bold">Size</p>
                    <p className="text-white text-lg font-bold mt-2">{publicData.poolSize}</p>
                  </div>
                )}
                {publicData.maxGuests && (
                  <div className="bg-gradient-to-br from-slate-800 to-slate-800/50 rounded-2xl p-5 border border-slate-700 text-center">
                    <p className="text-purple-400 text-xs uppercase tracking-wider font-bold">Capacity</p>
                    <p className="text-white text-lg font-bold mt-2">{publicData.maxGuests}</p>
                  </div>
                )}
                {publicData.poolDepth && (
                  <div className="bg-gradient-to-br from-slate-800 to-slate-800/50 rounded-2xl p-5 border border-slate-700 text-center">
                    <p className="text-cyan-400 text-xs uppercase tracking-wider font-bold">Depth</p>
                    <p className="text-white text-lg font-bold mt-2">{publicData.poolDepth}</p>
                  </div>
                )}
              </div>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700">
                <h2 className="text-xl font-bold text-white mb-4">Party Essentials</h2>
                <AmenitiesGrid amenities={amenities} design="party" />
              </div>
            )}

            {/* Location */}
            <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700">
              <LocationMap location={location} design="party" />
            </div>

            {/* Host */}
            <HostCard
              host={host}
              design="party"
              onContactUser={onContactUser}
              isOwnListing={isOwnListing}
            />

            {/* Reviews */}
            <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700">
              <ReviewSection reviews={reviews} design="party" />
            </div>
          </div>

          {/* Right Column - Booking */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              {orderPanel && (
                <div className="bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl shadow-rose-500/10 p-6">
                  {orderPanel}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom neon accent */}
      <div className="mt-16 h-1 bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500" />
    </div>
  );
};

export default PartyListingPage;
