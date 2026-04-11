import React from 'react';

const HostCard = ({
  host = {},
  design = 'clean',
  onContactUser,
  isOwnListing = false,
  className = '',
}) => {
  const { displayName = 'Host', profileImage, bio } = host;

  const designStyles = {
    clean: {
      card: 'bg-white rounded-xl border border-gray-200 p-6',
      heading: 'text-lg font-semibold text-gray-900',
      name: 'text-xl font-bold text-gray-900',
      bio: 'text-gray-600 text-sm mt-2 leading-relaxed',
      avatar: 'w-16 h-16 rounded-full object-cover border-2 border-gray-100',
      button: 'mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium',
    },
    resort: {
      card: 'bg-white rounded-2xl border border-emerald-100 p-6 shadow-sm',
      heading: 'text-lg font-semibold text-emerald-900',
      name: 'text-xl font-bold text-emerald-800',
      bio: 'text-emerald-700 text-sm mt-2 leading-relaxed',
      avatar: 'w-16 h-16 rounded-full object-cover border-2 border-emerald-200',
      button: 'mt-4 px-6 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors text-sm font-medium',
    },
    luxury: {
      card: 'bg-gray-900/60 rounded-xl border border-gray-700 p-6 backdrop-blur',
      heading: 'text-lg font-light text-gray-400 tracking-wider uppercase',
      name: 'text-xl font-semibold text-white',
      bio: 'text-gray-400 text-sm mt-2 leading-relaxed font-light',
      avatar: 'w-16 h-16 rounded-full object-cover border-2 border-yellow-600',
      button: 'mt-4 px-6 py-2 bg-yellow-600 text-black rounded-lg hover:bg-yellow-500 transition-colors text-sm font-medium tracking-wide',
    },
    party: {
      card: 'bg-slate-800 rounded-2xl border border-slate-600 p-6',
      heading: 'text-lg font-bold text-rose-400',
      name: 'text-xl font-bold text-white',
      bio: 'text-slate-300 text-sm mt-2 leading-relaxed',
      avatar: 'w-16 h-16 rounded-full object-cover border-2 border-rose-500',
      button: 'mt-4 px-6 py-2 bg-gradient-to-r from-rose-500 to-cyan-500 text-white rounded-xl hover:opacity-90 transition-opacity text-sm font-bold',
    },
    family: {
      card: 'bg-white rounded-2xl border border-amber-200 p-6 shadow-sm',
      heading: 'text-lg font-bold text-amber-800',
      name: 'text-xl font-bold text-amber-900',
      bio: 'text-amber-700 text-sm mt-2 leading-relaxed',
      avatar: 'w-16 h-16 rounded-full object-cover border-2 border-amber-300',
      button: 'mt-4 px-6 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors text-sm font-bold',
    },
    bold: {
      card: 'bg-stone-800 rounded-xl border border-stone-600 p-6',
      heading: 'text-lg font-mono text-orange-400 uppercase tracking-widest',
      name: 'text-xl font-bold text-white font-mono',
      bio: 'text-stone-300 text-sm mt-2 leading-relaxed',
      avatar: 'w-16 h-16 rounded-full object-cover border-2 border-orange-500',
      button: 'mt-4 px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-mono font-bold',
    },
  };

  const styles = designStyles[design] || designStyles.clean;

  return (
    <div className={`${styles.card} ${className}`}>
      <h3 className={styles.heading}>Your Host</h3>
      <div className="flex items-center gap-4 mt-4">
        {profileImage ? (
          <img src={profileImage} alt={displayName} className={styles.avatar} />
        ) : (
          <div className={`${styles.avatar} bg-gray-300 flex items-center justify-center text-2xl font-bold text-white`}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className={styles.name}>{displayName}</p>
        </div>
      </div>
      {bio && <p className={styles.bio}>{bio}</p>}
      {!isOwnListing && onContactUser && (
        <button onClick={onContactUser} className={styles.button}>
          Contact {displayName}
        </button>
      )}
    </div>
  );
};

export default HostCard;
