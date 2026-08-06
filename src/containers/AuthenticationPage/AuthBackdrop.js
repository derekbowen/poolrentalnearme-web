import React from 'react';
import classNames from 'classnames';

import css from './AuthBackdrop.module.css';

// Destination tiles behind the login card. Cities we actually have pools in,
// plus the three international hubs, so the wall reads as a real map of the
// marketplace rather than decoration.
const TILES = [
  { city: 'Phoenix', tone: 'sun' },
  { city: 'Miami', tone: 'lagoon' },
  { city: 'Dallas', tone: 'dusk' },
  { city: 'Atlanta', tone: 'palm' },
  { city: 'Los Angeles', tone: 'sunset' },
  { city: 'Houston', tone: 'deep' },
  { city: 'Tampa', tone: 'lagoon' },
  { city: 'Las Vegas', tone: 'sun' },
  { city: 'San Diego', tone: 'surf' },
  { city: 'Orlando', tone: 'palm' },
  { city: 'Austin', tone: 'dusk' },
  { city: 'Sacramento', tone: 'sunset' },
  { city: 'Nashville', tone: 'deep' },
  { city: 'Charlotte', tone: 'surf' },
  { city: 'London', tone: 'deep' },
  { city: 'Toronto', tone: 'surf' },
  { city: 'Sydney', tone: 'lagoon' },
  { city: 'Denver', tone: 'dusk' },
  { city: 'Seattle', tone: 'deep' },
  { city: 'Chicago', tone: 'surf' },
];

/**
 * Decorative wall of destination tiles for the auth pages.
 *
 * Pure CSS - no images, so it costs nothing to load, cannot be blocked by a
 * CSP, and never shifts layout. It is presentational only: aria-hidden, and it
 * never receives pointer events, so it cannot sit between a user and the form.
 */
const AuthBackdrop = props => {
  const { className } = props;

  return (
    <div className={classNames(css.root, className)} aria-hidden="true">
      <div className={css.grid}>
        {TILES.map(({ city, tone }, i) => (
          <div
            key={city}
            className={classNames(css.tile, css[tone])}
            // Staggered so the drift never looks like one synchronised block.
            style={{ '--i': i }}
          >
            <span className={css.city}>{city}</span>
            <span className={css.wave} />
          </div>
        ))}
      </div>
      <div className={css.scrim} />
    </div>
  );
};

export default AuthBackdrop;
