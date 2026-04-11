import React from 'react';

const LocationMap = ({ location = {}, design = 'clean', className = '' }) => {
  const { address, coordinates } = location;

  if (!address && !coordinates) return null;

  const designStyles = {
    clean: {
      container: 'rounded-xl overflow-hidden border border-gray-200',
      label: 'text-lg font-semibold text-gray-900 mb-3',
      address: 'text-gray-600 text-sm mt-3',
    },
    resort: {
      container: 'rounded-2xl overflow-hidden border border-emerald-100 shadow-sm',
      label: 'text-lg font-semibold text-emerald-900 mb-3',
      address: 'text-emerald-700 text-sm mt-3',
    },
    luxury: {
      container: 'rounded-xl overflow-hidden border border-gray-700',
      label: 'text-lg font-light text-white tracking-wider uppercase mb-3',
      address: 'text-gray-400 text-sm mt-3 font-light',
    },
    party: {
      container: 'rounded-2xl overflow-hidden border border-slate-600',
      label: 'text-lg font-bold text-white mb-3',
      address: 'text-slate-300 text-sm mt-3',
    },
    family: {
      container: 'rounded-2xl overflow-hidden border border-amber-200 shadow-sm',
      label: 'text-lg font-bold text-amber-900 mb-3',
      address: 'text-amber-700 text-sm mt-3',
    },
    bold: {
      container: 'rounded-xl overflow-hidden border border-stone-600',
      label: 'text-lg font-bold text-white font-mono mb-3',
      address: 'text-stone-300 text-sm mt-3 font-mono',
    },
  };

  const styles = designStyles[design] || designStyles.clean;

  // If coordinates are available, render a static map placeholder
  // In production, this would use Google Maps, Mapbox, etc.
  const mapUrl = coordinates?.lat && coordinates?.lng
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${coordinates.lat},${coordinates.lng}&zoom=14&size=600x300&markers=color:red%7C${coordinates.lat},${coordinates.lng}&key=YOUR_API_KEY`
    : null;

  return (
    <div className={className}>
      <h2 className={styles.label}>Location</h2>
      <div className={styles.container}>
        {/* Map placeholder - uses approximate location for privacy */}
        <div className="w-full h-64 bg-gray-100 flex items-center justify-center relative">
          <div className="text-center text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm">Approximate location shown</p>
          </div>
        </div>
      </div>
      {address && <p className={styles.address}>{address}</p>}
    </div>
  );
};

export default LocationMap;
