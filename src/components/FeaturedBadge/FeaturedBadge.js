import React from 'react';
import classNames from 'classnames';

import css from './FeaturedBadge.module.css';

/**
 * FeaturedBadge
 * ─────────────
 * The "Promoted" pill shown on boosted listing cards in the Sponsored
 * band of search results.
 *
 * Design contract: must be VISUALLY DIFFERENT from the CertificationBadge
 * so hosts and guests can't confuse "paid placement" with "earned trust."
 *  - CertificationBadge = dark obsidian + gold, on-brand trust signal
 *  - FeaturedBadge      = cream/gold fill, commercial marker, always visible
 */
const FeaturedBadge = ({ className, size = 'md', label = 'Promoted' }) => {
  return (
    <div
      className={classNames(css.root, css[`size_${size}`], className)}
      aria-label="Promoted listing"
    >
      <span className={css.dot} aria-hidden="true" />
      <span className={css.label}>{label}</span>
    </div>
  );
};

export default FeaturedBadge;
