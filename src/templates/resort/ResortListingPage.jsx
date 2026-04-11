import React from 'react';
import ImageCarousel from '../shared/ImageCarousel/ImageCarousel';
import AmenitiesGrid from '../shared/AmenitiesGrid/AmenitiesGrid';
import HostCard from '../shared/HostCard/HostCard';
import ReviewSection from '../shared/ReviewSection/ReviewSection';
import LocationMap from '../shared/LocationMap/LocationMap';

/**
 * Tropical Resort listing template.
 * Vacation vibes with teal & orange accent colors.
 * Lush green backgrounds, Poppins font, rounded shapes.
 */
const ResortListingPage = ({
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
    <div data-template="resort" className="min-h-screen bg-gradient-to-b from-emerald-50 to-teal-50 font-['Poppins',sans-serif]">
      {/* Action Bar */}
      {actionBar && <div className="mb-4">{actionBar}</div>}

      {/* Hero Section */}
      <div className="relative">
        <ImageCarousel images={images} design="resort" className="rounded-none" />
        {/* Tropical overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-900/30 to-transparent pointer-events-none" />
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        {/* Title Card */}
        <div className="bg-white rounded-3xl shadow-xl p-8 mb-8 border border-emerald-100">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-emerald-900 leading-tight">{title}</h1>
              {location.address && (
                <p className="text-teal-600 mt-2 flex items-center gap-2">
                  <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {location.address}
                </p>
              )}
            </div>
            {price.formatted && (
              <div className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white px-6 py-3 rounded-2xl text-center flex-shrink-0">
                <span className="text-2xl font-bold">{price.formatted}</span>
                {price.unitType && (
                  <span className="text-teal-100 text-sm block">per {price.unitType}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Description */}
            {description && (
              <div className="bg-white rounded-3xl p-8 border border-emerald-100 shadow-sm">
                <h2 className="text-xl font-bold text-emerald-900 mb-4 flex items-center gap-2">
                  <span className="text-2xl">🌴</span> About This Paradise
                </h2>
                <p className="text-emerald-700 leading-relaxed whitespace-pre-line">{description}</p>
              </div>
            )}

            {/* Pool Details */}
            {(publicData.poolType || publicData.poolSize || publicData.maxGuests) && (
              <div className="bg-white rounded-3xl p-8 border border-emerald-100 shadow-sm">
                <h2 className="text-xl font-bold text-emerald-900 mb-4 flex items-center gap-2">
                  <span className="text-2xl">🏊</span> Pool Details
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {publicData.poolType && (
                    <div className="bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl p-4 text-center border border-emerald-100">
                      <p className="text-xs text-teal-500 uppercase tracking-wide font-semibold">Type</p>
                      <p className="text-sm font-bold text-emerald-900 mt-1">{publicData.poolType}</p>
                    </div>
                  )}
                  {publicData.poolSize && (
                    <div className="bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl p-4 text-center border border-emerald-100">
                      <p className="text-xs text-teal-500 uppercase tracking-wide font-semibold">Size</p>
                      <p className="text-sm font-bold text-emerald-900 mt-1">{publicData.poolSize}</p>
                    </div>
                  )}
                  {publicData.maxGuests && (
                    <div className="bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl p-4 text-center border border-emerald-100">
                      <p className="text-xs text-teal-500 uppercase tracking-wide font-semibold">Guests</p>
                      <p className="text-sm font-bold text-emerald-900 mt-1">{publicData.maxGuests}</p>
                    </div>
                  )}
                  {publicData.poolDepth && (
                    <div className="bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl p-4 text-center border border-emerald-100">
                      <p className="text-xs text-teal-500 uppercase tracking-wide font-semibold">Depth</p>
                      <p className="text-sm font-bold text-emerald-900 mt-1">{publicData.poolDepth}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div className="bg-white rounded-3xl p-8 border border-emerald-100 shadow-sm">
                <h2 className="text-xl font-bold text-emerald-900 mb-4 flex items-center gap-2">
                  <span className="text-2xl">🌺</span> Resort Amenities
                </h2>
                <AmenitiesGrid amenities={amenities} design="resort" />
              </div>
            )}

            {/* Location */}
            <div className="bg-white rounded-3xl p-8 border border-emerald-100 shadow-sm">
              <LocationMap location={location} design="resort" />
            </div>

            {/* Host */}
            <HostCard
              host={host}
              design="resort"
              onContactUser={onContactUser}
              isOwnListing={isOwnListing}
            />

            {/* Reviews */}
            <div className="bg-white rounded-3xl p-8 border border-emerald-100 shadow-sm">
              <ReviewSection reviews={reviews} design="resort" />
            </div>
          </div>

          {/* Right Column - Booking */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              {orderPanel && (
                <div className="bg-white rounded-3xl border border-emerald-100 shadow-xl p-6">
                  {orderPanel}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom tropical accent */}
      <div className="mt-16 h-2 bg-gradient-to-r from-teal-400 via-emerald-500 to-orange-400" />
    </div>
  );
};

export default ResortListingPage;
