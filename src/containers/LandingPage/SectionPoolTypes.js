import React from 'react';
import css from './SectionPoolTypes.module.css';

// PRNM redesign: "browse by pool type" grid from the www marketing design. Each tile runs a
// keyword search so it works against the live marketplace without hardcoding category params.
const TYPES = [
  { icon: '🌊', label: 'Saltwater pools', q: 'saltwater' },
  { icon: '♨️', label: 'Heated pools', q: 'heated' },
  { icon: '🏝️', label: 'Resort-style pools', q: 'resort' },
  { icon: '🏊', label: 'Lap pools', q: 'lap' },
  { icon: '🛁', label: 'Pools with hot tub', q: 'hot tub' },
  { icon: '👨‍👩‍👧', label: 'Family-friendly pools', q: 'family' },
  { icon: '🏠', label: 'Indoor pools', q: 'indoor' },
  { icon: '♾️', label: 'Infinity pools', q: 'infinity' },
];

const SectionPoolTypes = props => {
  const { sectionId } = props;
  return (
    <section id={sectionId} className={css.root}>
      <div className={css.inner}>
        <h2 className={css.heading}>Browse by pool type</h2>
        <p className={css.sub}>
          Heated pools, infinity edges, lap pools, indoor escapes — find your vibe.
        </p>
        <div className={css.grid}>
          {TYPES.map(t => (
            <a key={t.label} className={css.tile} href={`/s?keywords=${encodeURIComponent(t.q)}`}>
              <span className={css.tileIcon} aria-hidden="true">
                {t.icon}
              </span>
              <span className={css.tileLabel}>{t.label}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SectionPoolTypes;
