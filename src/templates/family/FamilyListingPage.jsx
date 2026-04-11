import React from 'react';
import ImageCarousel from '../shared/ImageCarousel/ImageCarousel';
import AmenitiesGrid from '../shared/AmenitiesGrid/AmenitiesGrid';
import HostCard from '../shared/HostCard/HostCard';
import ReviewSection from '../shared/ReviewSection/ReviewSection';
import LocationMap from '../shared/LocationMap/LocationMap';

/**
 * Family Fun listing template.
 * Warm, approachable, kid-friendly design.
 * Amber/warm backgrounds, Nunito font, friendly rounded shapes.
 */
const FamilyListingPage = ({
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
    <div data-template="family" className="min-h-screen bg-amber-50 font-['Nunito',sans-serif]">
      {/* Action Bar */}
      {actionBar && <div className="mb-4">{actionBar}</div>}

      {/* Friendly Header Banner */}
      <div className="bg-gradient-to-r from-amber-400 via-yellow-400 to-emerald-400 py-3 text-center">
        <p className="text-white font-bold text-sm tracking-wide">
          Family-Friendly Pool Experience
        </p>
      </div>

      {/* Hero Image */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <ImageCarousel images={images} design="family" className="rounded-3xl overflow-hidden shadow-lg" />
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Title */}
            <div className="bg-white rounded-3xl p-8 border border-amber-200 shadow-sm">
              <div className="flex flex-wrap gap-2 mb-3">
                {publicData.kidsPool && (
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                    Kids Pool Available
                  </span>
                )}
                {publicData.shallowEnd && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                    Shallow End
                  </span>
                )}
                <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                  Family Approved
                </span>
              </div>
              <h1 className="text-3xl font-extrabold text-amber-900 leading-tight">{title}</h1>
              {location.address && (
                <p className="text-amber-600 mt-2 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {location.address}
                </p>
              )}
              {price.formatted && (
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-amber-600">{price.formatted}</span>
                  {price.unitType && (
                    <span className="text-amber-400 text-sm">/ {price.unitType}</span>
                  )}
                  <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                    Great Value!
                  </span>
                </div>
              )}
            </div>

            {/* Description */}
            {description && (
              <div className="bg-white rounded-3xl p-8 border border-amber-200 shadow-sm">
                <h2 className="text-xl font-extrabold text-amber-900 mb-4">About This Pool</h2>
                <p className="text-amber-800 leading-relaxed whitespace-pre-line">{description}</p>
              </div>
            )}

            {/* Pool Details - Fun Cards */}
            {(publicData.poolType || publicData.poolSize || publicData.maxGuests) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {publicData.poolType && (
                  <div className="bg-white rounded-2xl p-5 border border-amber-200 shadow-sm text-center">
                    <span className="text-3xl">🏊‍♂️</span>
                    <p className="text-xs text-amber-500 uppercase tracking-wide font-bold mt-2">Type</p>
                    <p className="text-amber-900 font-bold mt-1">{publicData.poolType}</p>
                  </div>
                )}
                {publicData.poolSize && (
                  <div className="bg-white rounded-2xl p-5 border border-amber-200 shadow-sm text-center">
                    <span className="text-3xl">📏</span>
                    <p className="text-xs text-amber-500 uppercase tracking-wide font-bold mt-2">Size</p>
                    <p className="text-amber-900 font-bold mt-1">{publicData.poolSize}</p>
                  </div>
                )}
                {publicData.maxGuests && (
                  <div className="bg-white rounded-2xl p-5 border border-amber-200 shadow-sm text-center">
                    <span className="text-3xl">👨‍👩‍👧‍👦</span>
                    <p className="text-xs text-amber-500 uppercase tracking-wide font-bold mt-2">Guests</p>
                    <p className="text-amber-900 font-bold mt-1">{publicData.maxGuests}</p>
                  </div>
                )}
                {publicData.poolDepth && (
                  <div className="bg-white rounded-2xl p-5 border border-amber-200 shadow-sm text-center">
                    <span className="text-3xl">🌊</span>
                    <p className="text-xs text-amber-500 uppercase tracking-wide font-bold mt-2">Depth</p>
                    <p className="text-amber-900 font-bold mt-1">{publicData.poolDepth}</p>
                  </div>
                )}
              </div>
            )}

            {/* Safety Features callout */}
            {(publicData.fenced || publicData.lifeguard || publicData.shallowEnd) && (
              <div className="bg-emerald-50 rounded-3xl p-6 border border-emerald-200">
                <h3 className="text-lg font-extrabold text-emerald-800 mb-3 flex items-center gap-2">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Safety Features
                </h3>
                <div className="flex flex-wrap gap-2">
                  {publicData.fenced && <span className="px-3 py-1 bg-emerald-200 text-emerald-800 rounded-full text-sm font-bold">Fenced</span>}
                  {publicData.lifeguard && <span className="px-3 py-1 bg-emerald-200 text-emerald-800 rounded-full text-sm font-bold">Lifeguard</span>}
                  {publicData.shallowEnd && <span className="px-3 py-1 bg-emerald-200 text-emerald-800 rounded-full text-sm font-bold">Shallow End</span>}
                </div>
              </div>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div className="bg-white rounded-3xl p-8 border border-amber-200 shadow-sm">
                <h2 className="text-xl font-extrabold text-amber-900 mb-4">What We Offer</h2>
                <AmenitiesGrid amenities={amenities} design="family" />
              </div>
            )}

            {/* Location */}
            <div className="bg-white rounded-3xl p-8 border border-amber-200 shadow-sm">
              <LocationMap location={location} design="family" />
            </div>

            {/* Host */}
            <HostCard
              host={host}
              design="family"
              onContactUser={onContactUser}
              isOwnListing={isOwnListing}
            />

            {/* Reviews */}
            <div className="bg-white rounded-3xl p-8 border border-amber-200 shadow-sm">
              <ReviewSection reviews={reviews} design="family" />
            </div>
          </div>

          {/* Right Column - Booking */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              {orderPanel && (
                <div className="bg-white rounded-3xl border-2 border-amber-300 shadow-xl p-6">
                  {orderPanel}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom fun gradient */}
      <div className="mt-16 h-2 bg-gradient-to-r from-amber-400 via-yellow-400 to-emerald-400" />
    </div>
  );
};

export default FamilyListingPage;
