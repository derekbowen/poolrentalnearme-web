import React, { useState } from 'react';
import ImageCarousel from '../shared/ImageCarousel/ImageCarousel';
import AmenitiesGrid from '../shared/AmenitiesGrid/AmenitiesGrid';
import HostCard from '../shared/HostCard/HostCard';
import ReviewSection from '../shared/ReviewSection/ReviewSection';
import LocationMap from '../shared/LocationMap/LocationMap';

/**
 * Clean & Modern listing template.
 * Minimalist, professional, Airbnb-inspired layout.
 * White background, blue accents, Inter font family.
 */
const CleanListingPage = ({
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
    <div data-template="clean" className="min-h-screen bg-white font-['Inter',sans-serif]">
      {/* Action Bar */}
      {actionBar && <div className="mb-4">{actionBar}</div>}

      {/* Hero Image Gallery */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ImageCarousel images={images} design="clean" className="rounded-xl overflow-hidden" />
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Details */}
          <div className="lg:col-span-2 space-y-8">
            {/* Title & Price */}
            <div className="border-b border-gray-200 pb-6">
              <h1 className="text-3xl font-bold text-gray-900 leading-tight">{title}</h1>
              {location.address && (
                <p className="text-gray-500 mt-1 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {location.address}
                </p>
              )}
              {price.formatted && (
                <div className="mt-3">
                  <span className="text-2xl font-bold text-gray-900">{price.formatted}</span>
                  {price.unitType && (
                    <span className="text-gray-500 text-sm ml-1">/ {price.unitType}</span>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            {description && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-3">About this pool</h2>
                <p className="text-gray-600 leading-relaxed whitespace-pre-line">{description}</p>
              </div>
            )}

            {/* Pool Details from publicData */}
            {publicData.poolType && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {publicData.poolType && (
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Pool Type</p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{publicData.poolType}</p>
                  </div>
                )}
                {publicData.poolSize && (
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Size</p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{publicData.poolSize}</p>
                  </div>
                )}
                {publicData.maxGuests && (
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Max Guests</p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{publicData.maxGuests}</p>
                  </div>
                )}
                {publicData.poolDepth && (
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Depth</p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{publicData.poolDepth}</p>
                  </div>
                )}
              </div>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">What this place offers</h2>
                <AmenitiesGrid amenities={amenities} design="clean" />
              </div>
            )}

            {/* Location */}
            <LocationMap location={location} design="clean" />

            {/* Host */}
            <HostCard
              host={host}
              design="clean"
              onContactUser={onContactUser}
              isOwnListing={isOwnListing}
            />

            {/* Reviews */}
            <ReviewSection reviews={reviews} design="clean" />
          </div>

          {/* Right Column - Booking Widget */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              {orderPanel && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-6">
                  {orderPanel}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CleanListingPage;
