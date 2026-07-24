import React, { useState, useMemo } from 'react';
import css from './PoolBookingExperience.module.css';

/* ────────────────────────────────────────────────────────────
   PoolBookingExperience
   Premium demo component that shows the full booking UX:
   - Package selector with "recommended" highlighting
   - Guest count stepper with per-guest pricing
   - Live market intelligence (supply, demand, weather)
   - Dynamic pricing transparency
   - Price breakdown with every line item
   - Cancellation policy snapshot protection
   Mock data for now — to be wired to real SDK data in Phase 4.
   ──────────────────────────────────────────────────────────── */

// ─── Mock pool + packages ──────────────────────────────────
const MOCK_POOL = {
  name: 'The Orange Grove Lagoon',
  location: 'Riverside, CA',
  heroImg:
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1400&q=85',
  host: { name: 'Sophia M.', since: '2024', superhost: true, responseTime: '4 hrs' },
  rating: 4.96,
  reviews: 48,
};

// ─── Adapt a real Sharetribe listing into the shape this component expects ──
// Falls back to MOCK_POOL fields when the listing is missing data.
const adaptListing = listing => {
  if (!listing) return MOCK_POOL;

  const attrs = listing.attributes || {};
  const publicData = attrs.publicData || {};
  const metadata = attrs.metadata || {};
  const geo = attrs.geolocation || null;
  const authorName = publicData.authorDisplayName || publicData.hostName || MOCK_POOL.host.name;

  // Prefer the scaled-medium variant for the hero image.
  const firstImg = listing.images?.[0];
  const variants = firstImg?.attributes?.variants || {};
  const heroImg =
    variants['scaled-medium']?.url ||
    variants['scaled-small']?.url ||
    MOCK_POOL.heroImg;

  // Rating + reviews can live in either metadata or publicData depending on
  // which custom fields the marketplace is using.
  const rating =
    metadata?.rating ??
    publicData?.rating ??
    MOCK_POOL.rating;
  const reviews =
    metadata?.reviewCount ??
    publicData?.reviewCount ??
    MOCK_POOL.reviews;

  const city =
    publicData.city ||
    publicData.location?.city ||
    publicData.address?.city ||
    null;
  const region = publicData.region || publicData.address?.state || null;
  const locationLabel = city && region ? `${city}, ${region}` : city || region || MOCK_POOL.location;

  return {
    name: attrs.title || MOCK_POOL.name,
    location: locationLabel,
    heroImg,
    host: {
      name: authorName,
      since: '2024',
      superhost: !!(publicData.isSuperhost || metadata?.isSuperhost),
      responseTime: publicData.responseTime || '4 hrs',
    },
    rating: Number(rating) || MOCK_POOL.rating,
    reviews: Number(reviews) || MOCK_POOL.reviews,
    geo,
  };
};

const PACKAGES = [
  {
    id: 'dip',
    name: 'Afternoon Dip',
    tagline: 'Quick cool-off',
    durationHours: 2,
    basePrice: 160,
    includedGuests: 6,
    extraGuestPrice: 20,
    maxGuests: 10,
    isRecommended: false,
  },
  {
    id: 'party',
    name: 'Pool Party',
    tagline: 'Ideal for birthdays & events',
    durationHours: 4,
    basePrice: 420,
    includedGuests: 12,
    extraGuestPrice: 25,
    maxGuests: 20,
    isRecommended: true,
  },
  {
    id: 'fullday',
    name: 'Full Day Retreat',
    tagline: 'Sunrise to sunset',
    durationHours: 8,
    basePrice: 780,
    includedGuests: 15,
    extraGuestPrice: 30,
    maxGuests: 24,
    isRecommended: false,
  },
];

const CANCELLATION_TIERS = [
  { label: '7+ days before', refund: 100, tone: 'green' },
  { label: '3–7 days before', refund: 50, tone: 'amber' },
  { label: 'Within 72 hours', refund: 0, tone: 'red' },
];

// ─── Market intelligence fallback (used when no live snapshot arrives) ──
const FALLBACK_MARKET = {
  region: 'your area',
  totalPools: 23,
  availableThisWeekend: 5,
  demandLevel: 'high',
  surgeMultiplier: 1.15,
  surgeDeltaPct: 15,
  competitorAvg: 387,
  weatherNote: 'Peak demand',
  explanation: 'Demand is high — prices reflect live supply.',
};

// Merge a live snapshot from the reducer with the fallback, preferring live
// values wherever present. Also derives a rough "available this weekend"
// figure from total pool count (placeholder until we query availability
// exceptions in Phase 6).
const mergeMarketSnapshot = snapshot => {
  if (!snapshot) return FALLBACK_MARKET;
  const totalPools = snapshot.totalPools ?? FALLBACK_MARKET.totalPools;
  // Rough saturation heuristic: assume ~22% of pools are open on a given weekend.
  const availableThisWeekend = Math.max(
    1,
    Math.round(totalPools * 0.22)
  );
  return {
    region: snapshot.region || FALLBACK_MARKET.region,
    totalPools,
    availableThisWeekend,
    demandLevel: snapshot.demandLevel || FALLBACK_MARKET.demandLevel,
    surgeMultiplier: snapshot.surgeMultiplier ?? FALLBACK_MARKET.surgeMultiplier,
    surgeDeltaPct: snapshot.surgeDeltaPct ?? FALLBACK_MARKET.surgeDeltaPct,
    competitorAvg: snapshot.avgPriceCents
      ? Math.round(snapshot.avgPriceCents / 100)
      : FALLBACK_MARKET.competitorAvg,
    weatherNote: FALLBACK_MARKET.weatherNote,
    explanation: snapshot.explanation || FALLBACK_MARKET.explanation,
  };
};

// ─── Helpers ──────────────────────────────────────────────────
const fmt = cents => `$${cents.toLocaleString()}`;
const tierDotClass = {
  green: css.tierDotGreen,
  amber: css.tierDotAmber,
  red: css.tierDotRed,
};

// ═══════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════
const PoolBookingExperience = ({ listing = null, marketSnapshot = null }) => {
  const [selectedPackageId, setSelectedPackageId] = useState('party');
  const [guestCount, setGuestCount] = useState(12);
  const [dateLabel] = useState('Saturday, Apr 18');

  // Resolve the pool to display: real listing if available, else mock.
  const pool = useMemo(() => adaptListing(listing), [listing]);
  // Resolve market intelligence: live snapshot if available, else fallback.
  const market = useMemo(() => mergeMarketSnapshot(marketSnapshot), [marketSnapshot]);

  const selectedPkg = PACKAGES.find(p => p.id === selectedPackageId);

  // Keep guest count within the selected package's bounds whenever it changes
  const activeGuestCount = Math.min(
    Math.max(guestCount, 1),
    selectedPkg.maxGuests
  );

  const extraGuests = Math.max(0, activeGuestCount - selectedPkg.includedGuests);
  const extraGuestCost = extraGuests * selectedPkg.extraGuestPrice;

  // Dynamic pricing — apply surge multiplier to base
  const surgedBase = Math.round(selectedPkg.basePrice * market.surgeMultiplier);
  const surgeDelta = surgedBase - selectedPkg.basePrice;

  const cleaningFee = 40;
  const refundableDeposit = 200;
  const subtotal = surgedBase + extraGuestCost + cleaningFee;
  const serviceFee = Math.round(subtotal * 0.08);
  const total = subtotal + serviceFee;

  // Animated progress bar for supply scarcity
  const supplyPct = useMemo(
    () =>
      Math.round(
        (market.availableThisWeekend / market.totalPools) * 100
      ),
    [market.availableThisWeekend, market.totalPools]
  );

  const handlePackageChange = id => {
    const pkg = PACKAGES.find(p => p.id === id);
    setSelectedPackageId(id);
    // When switching packages, default guests back to included count
    setGuestCount(pkg.includedGuests);
  };

  const decGuests = () => setGuestCount(g => Math.max(1, g - 1));
  const incGuests = () =>
    setGuestCount(g => Math.min(selectedPkg.maxGuests, g + 1));

  return (
    <section className={css.bookingSection}>
      <div className={css.bookingHeader}>
        <div className={css.eyebrow}>The Booking Experience</div>
        <h2 className={css.headline}>
          Book a pool the way it <em>should</em> work.
        </h2>
        <p className={css.subheadline}>
          Real-time pricing. Transparent fees. Packages designed for how you actually use a pool.
        </p>
      </div>

      <div className={css.bookingLayout}>
        {/* ═══ LEFT: Pool context + packages + guests ═══ */}
        <div className={css.bookingLeft}>
          {/* Pool card */}
          <div className={css.poolHero}>
            <img src={pool.heroImg} alt={pool.name} className={css.poolHeroImg} />
            <div className={css.poolHeroOverlay} />
            <div className={css.poolHeroInfo}>
              <div className={css.poolHeroLocation}>{pool.location}</div>
              <div className={css.poolHeroName}>{pool.name}</div>
              <div className={css.poolHeroMeta}>
                <span className={css.poolHeroStar}>★</span>
                <span className={css.poolHeroRating}>{pool.rating}</span>
                <span className={css.poolHeroReviews}>({pool.reviews} reviews)</span>
                <span className={css.poolHeroDot}>·</span>
                <span className={css.poolHeroHost}>
                  Hosted by {pool.host.name}
                  {pool.host.superhost && <span className={css.poolHeroSuperhost}>✦ Superhost</span>}
                </span>
              </div>
            </div>
          </div>

          {/* Market intelligence banner */}
          <div className={css.marketBanner}>
            <div className={css.marketBannerTop}>
              <div className={css.marketBannerLeft}>
                <span className={css.marketPulse} />
                <span className={css.marketLabel}>Live market intelligence</span>
              </div>
              <div className={css.marketRegion}>{market.region}</div>
            </div>
            <div className={css.marketStats}>
              <div className={css.marketStat}>
                <div className={css.marketStatValue}>{market.totalPools}</div>
                <div className={css.marketStatLabel}>Pools in metro</div>
              </div>
              <div className={css.marketStat}>
                <div className={css.marketStatValue}>{market.availableThisWeekend}</div>
                <div className={css.marketStatLabel}>Open Saturday</div>
              </div>
              <div className={css.marketStat}>
                <div className={css.marketStatValue}>${market.competitorAvg}</div>
                <div className={css.marketStatLabel}>Metro average</div>
              </div>
              <div className={css.marketStat}>
                <div className={`${css.marketStatValue} ${css.marketStatValueHot}`}>
                  {market.surgeDeltaPct >= 0 ? '+' : ''}{market.surgeDeltaPct}%
                </div>
                <div className={css.marketStatLabel}>Demand surge</div>
              </div>
            </div>
            <div className={css.supplyBar}>
              <div className={css.supplyBarFill} style={{ width: `${supplyPct}%` }} />
              <div className={css.supplyBarLabel}>
                Only <strong>{market.availableThisWeekend}</strong> of {market.totalPools} pools open this weekend
              </div>
            </div>
            <div className={css.marketNote}>
              <span className={css.marketNoteIcon}>⛅</span> {market.weatherNote}
            </div>
          </div>

          {/* Package selector */}
          <div className={css.packageSelect}>
            <div className={css.sectionLabel}>
              <span className={css.sectionLabelNum}>1</span> Choose your package
            </div>
            <div className={css.packageGrid}>
              {PACKAGES.map(pkg => {
                const isSelected = pkg.id === selectedPackageId;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => handlePackageChange(pkg.id)}
                    className={`${css.packageCard} ${isSelected ? css.packageCardActive : ''} ${
                      pkg.isRecommended ? css.packageCardRecommended : ''
                    }`}
                  >
                    {pkg.isRecommended && (
                      <div className={css.packageRibbon}>Most booked</div>
                    )}
                    <div className={css.packageName}>{pkg.name}</div>
                    <div className={css.packageTagline}>{pkg.tagline}</div>
                    <div className={css.packageDuration}>{pkg.durationHours}-hour session</div>
                    <div className={css.packagePrice}>
                      {fmt(pkg.basePrice)}
                      <span className={css.packagePriceUnit}>base</span>
                    </div>
                    <div className={css.packageIncluded}>
                      Includes {pkg.includedGuests} guests
                    </div>
                    <div className={css.packageExtra}>
                      +${pkg.extraGuestPrice} per extra (up to {pkg.maxGuests})
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date picker (visual only) */}
          <div className={css.dateSelect}>
            <div className={css.sectionLabel}>
              <span className={css.sectionLabelNum}>2</span> Pick your date
            </div>
            <div className={css.dateCard}>
              <div className={css.dateCardLeft}>
                <div className={css.dateCardLabel}>Selected date</div>
                <div className={css.dateCardValue}>{dateLabel}</div>
                <div className={css.dateCardMeta}>
                  Check-in 2:00 PM · {selectedPkg.durationHours}-hour session
                </div>
              </div>
              <button type="button" className={css.dateCardBtn}>
                Change date
              </button>
            </div>
          </div>

          {/* Guest stepper */}
          <div className={css.guestSelect}>
            <div className={css.sectionLabel}>
              <span className={css.sectionLabelNum}>3</span> How many guests?
            </div>
            <div className={css.guestCard}>
              <div className={css.guestStepper}>
                <button
                  type="button"
                  className={css.guestStepBtn}
                  onClick={decGuests}
                  disabled={activeGuestCount <= 1}
                >
                  −
                </button>
                <div className={css.guestCount}>
                  <div className={css.guestCountValue}>{activeGuestCount}</div>
                  <div className={css.guestCountLabel}>guests</div>
                </div>
                <button
                  type="button"
                  className={css.guestStepBtn}
                  onClick={incGuests}
                  disabled={activeGuestCount >= selectedPkg.maxGuests}
                >
                  +
                </button>
              </div>

              {/* Visual capacity bar showing included vs extra */}
              <div className={css.capacityBar}>
                <div
                  className={css.capacityBarIncluded}
                  style={{
                    width: `${Math.min(
                      (activeGuestCount / selectedPkg.maxGuests) * 100,
                      (selectedPkg.includedGuests / selectedPkg.maxGuests) * 100
                    )}%`,
                  }}
                />
                {extraGuests > 0 && (
                  <div
                    className={css.capacityBarExtra}
                    style={{
                      left: `${(selectedPkg.includedGuests / selectedPkg.maxGuests) * 100}%`,
                      width: `${(extraGuests / selectedPkg.maxGuests) * 100}%`,
                    }}
                  />
                )}
                <div
                  className={css.capacityBarMarker}
                  style={{
                    left: `${(selectedPkg.includedGuests / selectedPkg.maxGuests) * 100}%`,
                  }}
                >
                  <div className={css.capacityBarMarkerLabel}>
                    {selectedPkg.includedGuests} included
                  </div>
                </div>
              </div>

              <div className={css.guestHint}>
                {extraGuests === 0 ? (
                  <>✓ All {activeGuestCount} guests included in your base price</>
                ) : (
                  <>
                    {selectedPkg.includedGuests} included + <strong>{extraGuests} extra</strong> at $
                    {selectedPkg.extraGuestPrice}/guest
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Cancellation policy */}
          <div className={css.cancelSection}>
            <div className={css.sectionLabel}>
              <span className={css.sectionLabelNum}>4</span> Cancellation policy
            </div>
            <div className={css.cancelCard}>
              <div className={css.cancelHeader}>
                <div className={css.cancelHeaderTitle}>Moderate policy</div>
                <div className={css.cancelHeaderBadge}>Host-managed</div>
              </div>
              <div className={css.cancelTiers}>
                {CANCELLATION_TIERS.map(tier => (
                  <div key={tier.label} className={css.cancelTier}>
                    <span className={`${css.tierDot} ${tierDotClass[tier.tone]}`} />
                    <span className={css.cancelTierLabel}>{tier.label}</span>
                    <span className={css.cancelTierRefund}>{tier.refund}% refund</span>
                  </div>
                ))}
              </div>
              <div className={css.cancelFootnote}>
                🔒 These terms lock in the moment you book. Even if the host updates their
                policy later, your booking honors the terms you saw today.
              </div>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT: Sticky price breakdown ═══ */}
        <aside className={css.bookingRight}>
          <div className={css.priceCard}>
            {/* Package summary */}
            <div className={css.priceCardHead}>
              <div className={css.priceCardPkgName}>{selectedPkg.name}</div>
              <div className={css.priceCardPkgMeta}>
                {selectedPkg.durationHours} hours · {activeGuestCount} guests
              </div>
            </div>

            {/* Dynamic pricing badge */}
            {market.surgeMultiplier > 1 && (
              <div className={css.priceSurgeBadge}>
                <div className={css.priceSurgeBadgeTop}>
                  <span className={css.priceSurgeIcon}>⚡</span>
                  <span className={css.priceSurgeLabel}>
                    {market.demandLevel === 'surge' ? 'Surge pricing' : 'High demand pricing'}
                  </span>
                  <span className={css.priceSurgeValue}>
                    +{market.surgeDeltaPct}%
                  </span>
                </div>
                <div className={css.priceSurgeDesc}>{market.explanation}</div>
              </div>
            )}

            {/* Line items */}
            <div className={css.priceLines}>
              <div className={css.priceLine}>
                <div className={css.priceLineLabel}>
                  {fmt(selectedPkg.basePrice)} × base package
                  {surgeDelta > 0 && (
                    <span className={css.priceLineSurge}>+{fmt(surgeDelta)} demand</span>
                  )}
                </div>
                <div className={css.priceLineValue}>{fmt(surgedBase)}</div>
              </div>

              {extraGuests > 0 && (
                <div className={css.priceLine}>
                  <div className={css.priceLineLabel}>
                    Extra guests ({extraGuests} × ${selectedPkg.extraGuestPrice})
                  </div>
                  <div className={css.priceLineValue}>{fmt(extraGuestCost)}</div>
                </div>
              )}

              <div className={css.priceLine}>
                <div className={css.priceLineLabel}>Cleaning fee</div>
                <div className={css.priceLineValue}>{fmt(cleaningFee)}</div>
              </div>

              <div className={css.priceLine}>
                <div className={css.priceLineLabel}>
                  Refundable deposit
                  <span className={css.priceLineNote}>Returned after stay</span>
                </div>
                <div className={`${css.priceLineValue} ${css.priceLineValueDim}`}>
                  {fmt(refundableDeposit)}
                </div>
              </div>

              <div className={css.priceDivider} />

              <div className={css.priceLine}>
                <div className={css.priceLineLabel}>Subtotal</div>
                <div className={css.priceLineValue}>{fmt(subtotal)}</div>
              </div>

              <div className={css.priceLine}>
                <div className={css.priceLineLabel}>Service fee</div>
                <div className={css.priceLineValue}>{fmt(serviceFee)}</div>
              </div>

              <div className={css.priceDivider} />

              <div className={`${css.priceLine} ${css.priceLineTotal}`}>
                <div className={css.priceLineLabel}>Due today</div>
                <div className={css.priceLineValue}>{fmt(total)}</div>
              </div>
            </div>

            <button type="button" className={css.bookBtn}>
              Reserve now
              <span className={css.bookBtnArrow}>→</span>
            </button>
            <div className={css.bookBtnFootnote}>
              ✓ Free to reserve · Host confirms within {pool.host.responseTime}
            </div>

            <div className={css.bookAssurances}>
              <div className={css.bookAssurance}>
                <span className={css.bookAssuranceIcon}>🛡️</span>
                <span>Host Protection</span>
              </div>
              <div className={css.bookAssurance}>
                <span className={css.bookAssuranceIcon}>💬</span>
                <span>24/7 support</span>
              </div>
              <div className={css.bookAssurance}>
                <span className={css.bookAssuranceIcon}>✓</span>
                <span>Verified host</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default PoolBookingExperience;
