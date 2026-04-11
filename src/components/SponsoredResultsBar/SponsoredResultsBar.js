import React, { useEffect, useRef, useState } from 'react';

import ListingCard from '../ListingCard/ListingCard';
import FeaturedBadge from '../FeaturedBadge/FeaturedBadge';
import { mergeBoostedResults } from '../../util/listingBoost';

import css from './SponsoredResultsBar.module.css';

/**
 * SponsoredResultsBar
 * ───────────────────
 * The "pay to be up top" band. Renders above the organic search results
 * and is visually distinct from them — different background, FeaturedBadge
 * overlay, explicit "Sponsored" label + disclosure.
 *
 * Design contract:
 *  - MUST look different from the earned-trust cluster. Paid placement and
 *    social proof are two different axes — a guest must never confuse the
 *    two or the trust signal of the CertificationBadge loses all meaning.
 *  - Hidden entirely when there are no active boosts. Empty ad slots are
 *    the #1 killer of perceived inventory density.
 *  - Fires an impression beacon per card when mounted. Click beacons are
 *    fired by the ListingCard wrapper below.
 */
const SponsoredResultsBar = ({ listings = [], setActiveListing, currentLocation }) => {
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const beaconedRef = useRef(new Set());

  // Merge + rank the boosted listings (tier rank + jitter). Cap at 6.
  const merged = mergeBoostedResults({
    primary: [],
    boosted: listings,
    maxSponsored: 6,
  });

  const sponsored = merged.sponsored || [];

  // Fire impression beacons for each card the first time it's rendered.
  // In-memory dedupe via beaconedRef — the server also has a short
  // debounce window, but we avoid double-sending from the client.
  useEffect(() => {
    sponsored.forEach(l => {
      const id = l.id?.uuid || l.id;
      if (!id || beaconedRef.current.has(id)) return;
      beaconedRef.current.add(id);
      fetch('/api/boost/beacon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id, event: 'impression' }),
      }).catch(() => {});
    });
  }, [sponsored]);

  if (!sponsored.length) return null;

  const fireClickBeacon = listingId => {
    if (!listingId) return;
    fetch('/api/boost/beacon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId, event: 'click' }),
    }).catch(() => {});
  };

  return (
    <section className={css.root} aria-label="Sponsored pool rentals">
      <header className={css.header}>
        <div className={css.headerLeft}>
          <FeaturedBadge size="sm" label="Sponsored" />
          <span className={css.label}>Featured hosts</span>
          <span className={css.divider} aria-hidden="true">
            ·
          </span>
          <span className={css.subtle}>Paid placement</span>
        </div>
        <button
          type="button"
          className={css.disclosureLink}
          onClick={() => setDisclosureOpen(o => !o)}
          aria-expanded={disclosureOpen}
        >
          {disclosureOpen ? 'Hide' : 'Why am I seeing these?'}
        </button>
      </header>

      {disclosureOpen ? (
        <div className={css.disclosure}>
          These hosts pay for top placement on PRNM. They're not ranked by
          trust score or reviews — look for the PRNM certification pill on
          individual listings for our earned-trust signal. Sponsored slots
          only show listings that are actually available in your dates and
          weather window, so you won't see dead inventory here.
        </div>
      ) : null}

      <div className={css.grid}>
        {sponsored.map(l => (
          <div key={l.id.uuid} className={css.cardSlot}>
            <div className={css.badgeOverlay}>
              <FeaturedBadge size="sm" label="Promoted" />
            </div>
            <ListingCard
              listing={l}
              setActiveListing={setActiveListing}
              currentLocation={currentLocation}
              onClick={() => fireClickBeacon(l.id?.uuid || l.id)}
            />
          </div>
        ))}
      </div>
    </section>
  );
};

export default SponsoredResultsBar;
