import React from 'react';
import classNames from 'classnames';

import {
  CERTIFICATION_TIERS,
  HOST_ACADEMY_PUBLIC_BADGE_ENABLED,
} from '../../config/hostAcademy';
import css from './CertificationBadge.module.css';

/**
 * CertificationBadge
 * ──────────────────
 * Displays a host's certification tier (Certified / Professional / Master).
 *
 * IMPORTANT — Surface gating:
 *   The badge is INTERNAL-ONLY until we reach critical mass of certified hosts.
 *   Until then, showing the badge on public listing pages would inadvertently
 *   penalize uncertified hosts (the majority) instead of rewarding certified ones.
 *
 *   Internal surfaces (always visible): /host-academy, host dashboard, onboarding.
 *   Public surfaces (gated by HOST_ACADEMY_PUBLIC_BADGE_ENABLED):
 *     - listing page, search results, public profile.
 *
 *   Pass `surface="public"` from public callers — the component will render
 *   null unless the flag is flipped on. Pass `surface="internal"` (or omit)
 *   from internal callers to always render.
 */
const CertificationBadge = props => {
  const {
    tier,
    size = 'md',
    surface = 'internal',
    showLabel = true,
    className,
  } = props;

  if (!tier) return null;

  // Public surfaces are gated until critical mass.
  if (surface === 'public' && !HOST_ACADEMY_PUBLIC_BADGE_ENABLED) {
    return null;
  }

  const tierMeta = CERTIFICATION_TIERS[tier];
  if (!tierMeta) return null;

  const style = { '--badge-accent': tierMeta.accent };

  return (
    <div
      className={classNames(css.root, css[`size_${size}`], className)}
      style={style}
      title={tierMeta.description}
      aria-label={tierMeta.label}
    >
      <span className={css.emoji} aria-hidden="true">{tierMeta.badgeEmoji}</span>
      {showLabel ? (
        <span className={css.label}>
          <span className={css.prnm}>PRNM</span>
          <span className={css.tier}>{tierMeta.short}</span>
        </span>
      ) : null}
    </div>
  );
};

export default CertificationBadge;
