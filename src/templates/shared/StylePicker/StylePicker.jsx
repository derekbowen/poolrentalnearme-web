import React from 'react';

const DEFAULT_STYLES = [
  { key: 'clean', label: 'Clean & Modern', description: 'Minimal, professional, Airbnb-like', previewGradient: 'from-blue-500 to-blue-600' },
  { key: 'resort', label: 'Tropical Resort', description: 'Vacation vibes, teal & orange', previewGradient: 'from-teal-500 to-orange-500' },
  { key: 'luxury', label: 'Luxury Estate', description: 'Dark, editorial, gold accents', previewGradient: 'from-gray-900 to-yellow-600' },
  { key: 'party', label: 'Party Ready', description: 'Bold, colorful, event-focused', previewGradient: 'from-rose-500 to-cyan-500' },
  { key: 'family', label: 'Family Fun', description: 'Warm, approachable, kid-friendly', previewGradient: 'from-amber-400 to-emerald-500' },
  { key: 'bold', label: 'Unique & Bold', description: 'Retro-warm, personality-forward', previewGradient: 'from-orange-500 to-violet-500' },
];

const StylePicker = ({ selectedStyle, onChange, styles = DEFAULT_STYLES }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {styles.map((style) => {
        const isSelected = selectedStyle === style.key;
        return (
          <button
            key={style.key}
            onClick={() => onChange(style.key)}
            className={`group relative flex flex-col rounded-xl overflow-hidden border-2 transition-all duration-200 text-left ${
              isSelected
                ? 'border-blue-500 ring-2 ring-blue-200 shadow-lg scale-[1.02]'
                : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
            }`}
          >
            {/* Gradient preview block */}
            <div className={`h-20 w-full bg-gradient-to-br ${style.previewGradient}`}>
              {isSelected && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow">
                  <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>

            {/* Label area */}
            <div className="p-3 bg-white">
              <p className="font-semibold text-sm text-gray-900">{style.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{style.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default StylePicker;
