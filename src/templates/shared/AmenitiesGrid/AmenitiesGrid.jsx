import React from 'react';

const AMENITY_ICONS = {
  'hot-tub': { icon: '♨️', label: 'Hot Tub' },
  'heated-pool': { icon: '🌡️', label: 'Heated Pool' },
  'pool-cover': { icon: '🛡️', label: 'Pool Cover' },
  'diving-board': { icon: '🏊', label: 'Diving Board' },
  'water-slide': { icon: '🎢', label: 'Water Slide' },
  'pool-toys': { icon: '🏖️', label: 'Pool Toys' },
  'pool-floats': { icon: '🛟', label: 'Pool Floats' },
  'grill': { icon: '🔥', label: 'Grill / BBQ' },
  'outdoor-kitchen': { icon: '🍳', label: 'Outdoor Kitchen' },
  'fire-pit': { icon: '🔥', label: 'Fire Pit' },
  'lounge-chairs': { icon: '🪑', label: 'Lounge Chairs' },
  'cabana': { icon: '⛱️', label: 'Cabana' },
  'outdoor-shower': { icon: '🚿', label: 'Outdoor Shower' },
  'changing-room': { icon: '🚪', label: 'Changing Room' },
  'bathroom': { icon: '🚻', label: 'Bathroom' },
  'towels': { icon: '🏳️', label: 'Towels Provided' },
  'wifi': { icon: '📶', label: 'WiFi' },
  'bluetooth-speaker': { icon: '🔊', label: 'Bluetooth Speaker' },
  'lighting': { icon: '💡', label: 'Pool Lighting' },
  'parking': { icon: '🅿️', label: 'Parking' },
  'pets-allowed': { icon: '🐕', label: 'Pets Allowed' },
  'kids-friendly': { icon: '👶', label: 'Kid Friendly' },
  'fenced': { icon: '🏗️', label: 'Fenced Area' },
  'lifeguard': { icon: '🏊‍♂️', label: 'Lifeguard' },
  'shallow-end': { icon: '🌊', label: 'Shallow End' },
  'deep-end': { icon: '🌊', label: 'Deep End' },
  'sauna': { icon: '🧖', label: 'Sauna' },
  'games': { icon: '🎮', label: 'Games' },
  'basketball-hoop': { icon: '🏀', label: 'Basketball Hoop' },
  'volleyball-net': { icon: '🏐', label: 'Volleyball Net' },
};

const AmenitiesGrid = ({ amenities = [], design = 'clean', className = '' }) => {
  if (!amenities.length) return null;

  const designStyles = {
    clean: {
      container: 'grid grid-cols-2 md:grid-cols-3 gap-3',
      item: 'flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors',
      icon: 'text-xl',
      label: 'text-sm text-gray-700 font-medium',
    },
    resort: {
      container: 'grid grid-cols-2 md:grid-cols-3 gap-3',
      item: 'flex items-center gap-3 p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-100',
      icon: 'text-xl',
      label: 'text-sm text-emerald-800 font-medium',
    },
    luxury: {
      container: 'grid grid-cols-2 md:grid-cols-3 gap-4',
      item: 'flex items-center gap-3 p-4 rounded-lg bg-gray-900/50 border border-gray-700 hover:border-yellow-600/50 transition-colors',
      icon: 'text-xl',
      label: 'text-sm text-gray-300 font-light tracking-wide',
    },
    party: {
      container: 'grid grid-cols-2 md:grid-cols-3 gap-3',
      item: 'flex items-center gap-3 p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 transition-colors',
      icon: 'text-xl',
      label: 'text-sm text-slate-200 font-medium',
    },
    family: {
      container: 'grid grid-cols-2 md:grid-cols-3 gap-3',
      item: 'flex items-center gap-3 p-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors',
      icon: 'text-xl',
      label: 'text-sm text-amber-900 font-medium',
    },
    bold: {
      container: 'grid grid-cols-2 md:grid-cols-3 gap-3',
      item: 'flex items-center gap-3 p-3 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-600 transition-colors',
      icon: 'text-xl',
      label: 'text-sm text-stone-200 font-mono',
    },
  };

  const styles = designStyles[design] || designStyles.clean;

  return (
    <div className={`${styles.container} ${className}`}>
      {amenities.map((amenityKey) => {
        const amenity = AMENITY_ICONS[amenityKey] || { icon: '✓', label: amenityKey.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) };
        return (
          <div key={amenityKey} className={styles.item}>
            <span className={styles.icon}>{amenity.icon}</span>
            <span className={styles.label}>{amenity.label}</span>
          </div>
        );
      })}
    </div>
  );
};

export default AmenitiesGrid;
