import React, { useState, useEffect, useRef, useCallback } from 'react';
import css from './PremiumLandingPage.module.css';
import PoolBookingExperience from './PoolBookingExperience';

/* ── Card class assignments for the bento grid ─────────── */
const CARD_CLASSES = ['poolCardLg', 'poolCardMd', 'poolCardSm1', 'poolCardSm2', 'poolCardSm3'];

/* ── Fallback pool data (used when no live listings) ───── */
const FALLBACK_POOLS = [
  {
    id: 1,
    name: 'Infinity Edge Estate',
    location: 'Hollywood Hills, CA',
    price: '$85',
    rating: '4.98',
    reviews: 124,
    badge: 'Superhost',
    tags: ['Infinity Pool', 'City Views', 'Hot Tub'],
    img: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1000&q=85',
    cardClass: 'poolCardLg',
  },
  {
    id: 2,
    name: 'The Modern Retreat',
    location: 'Bel Air, CA',
    price: '$65',
    rating: '4.95',
    reviews: 88,
    tags: ['Heated', 'Private'],
    img: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=700&q=85',
    cardClass: 'poolCardMd',
  },
  {
    id: 3,
    name: 'The Shore House',
    location: 'Santa Monica, CA',
    price: '$55',
    rating: '5.0',
    reviews: 62,
    badge: 'New',
    img: 'https://images.unsplash.com/photo-1575429198097-0414ec08e8cd?w=600&q=85',
    cardClass: 'poolCardSm1',
  },
  {
    id: 4,
    name: 'Clifftop Oasis',
    location: 'Malibu, CA',
    price: '$110',
    rating: '4.92',
    reviews: 45,
    img: 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=600&q=85',
    cardClass: 'poolCardSm2',
  },
  {
    id: 5,
    name: 'The Grand Cabana',
    location: 'Beverly Hills, CA',
    price: '$75',
    rating: '4.97',
    reviews: 103,
    badge: 'Popular',
    img: 'https://images.unsplash.com/photo-1562778612-e1e0cda9915c?w=600&q=85',
    cardClass: 'poolCardSm3',
  },
];

/* ── Footer: social links ──────────────────────────────── */
const SOCIAL_LINKS = [
  { label: 'Facebook',  abbr: 'f',  url: 'https://www.facebook.com/poolrentalnearme' },
  { label: 'X',         abbr: '𝕏',  url: 'https://x.com/poolrentalnearm' },
  { label: 'YouTube',   abbr: '▶',  url: 'https://www.youtube.com/@poolrentalnearme' },
  { label: 'LinkedIn',  abbr: 'in', url: 'https://www.linkedin.com/company/poolrentalnearme/' },
  { label: 'Instagram', abbr: 'ig', url: 'https://www.instagram.com/poolrentalnearme' },
  { label: 'TikTok',    abbr: 'tt', url: 'https://www.tiktok.com/@poolrental?_t=8pUC9OcITF5&_r=1' },
  { label: 'Pinterest', abbr: 'p',  url: 'https://www.pinterest.com/derekbowencorp/' },
];

/* ── Footer: link columns ──────────────────────────────── */
const FOOTER_COLUMNS = [
  {
    title: 'Guests',
    links: [
      { label: 'Browse Pools',        url: '/s' },
      { label: 'How It Works',        url: '/p/howitworksforguests' },
      { label: 'Make Money',          url: '/p/make-money' },
      { label: 'Swimply Alternative', url: '/p/swimply-alternative-vs-pool-rental-near-me' },
      { label: 'Help Center',         url: 'https://help.poolrentalnearme.com/', external: true },
      { label: 'Rental Waivers',      url: 'https://www.rentalwaivers.com', external: true },
      { label: 'Merch Store',         url: 'https://pool-rental-near-me-store.printify.me', external: true },
      { label: 'Public Pools',        url: '/public-pools' },
    ],
  },
  {
    title: 'Hosts',
    links: [
      { label: 'List Your Pool',    url: '/l/new' },
      { label: 'Hosting Info',      url: '/p/hosting' },
      { label: 'All Locations',     url: '/p/all-locations' },
      { label: 'HostPro',           url: 'https://hostpro.poolrentalnearme.com/', external: true },
      { label: 'Learning Academy',  url: '/p/learningacademy' },
      { label: 'Host Connect',      url: 'https://connect.poolrentalnearme.com', external: true },
      { label: 'HOA Defense Kit',   url: '/p/hoa-pool-rental-defense-kit' },
      { label: 'Amenities',         url: '/amenities' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About',           url: '/p/about' },
      { label: 'Blog',            url: '/p/blog' },
      { label: 'Careers',         url: 'https://www.careers-page.com/10000-solutions-llc', external: true },
      { label: 'Investors',       url: '/p/investors' },
      { label: 'Terms of Service',url: '/terms-of-service' },
      { label: 'Privacy Policy',  url: '/privacy-policy' },
      { label: 'Meet with Us',    url: 'https://www.meetn.com/poolrental', external: true },
      { label: 'Contact',         url: 'https://formrobin.com/f/w8nqorw', external: true },
    ],
  },
  {
    title: 'Popular Locations',
    links: [
      { label: 'Los Angeles',   url: '/p/losangeles' },
      { label: 'San Diego',     url: '/p/privatepoolrentalssandiego' },
      { label: 'Riverside',     url: '/p/riverside' },
      { label: 'Sacramento',    url: '/p/sacramentobestprivatepools' },
      { label: 'Tampa, FL',     url: '/s' },
      { label: 'Scottsdale, AZ',url: '/s' },
      { label: 'Nashville, TN', url: '/s' },
      { label: 'Katy, TX',      url: '/p/katytexas' },
      { label: 'All Locations', url: '/p/all-locations' },
    ],
  },
];

/**
 * Haversine great-circle distance between two {lat, lng} points in miles.
 * Returns null if either point is missing.
 */
function milesBetween(a, b) {
  if (!a || !b) return null;
  if (typeof a.lat !== 'number' || typeof a.lng !== 'number') return null;
  if (typeof b.lat !== 'number' || typeof b.lng !== 'number') return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Format a miles number into a compact human-readable label.
 */
function formatDistance(miles) {
  if (miles == null) return null;
  if (miles < 0.1) return 'Right here';
  if (miles < 10) return `${miles.toFixed(1)} mi away`;
  return `${Math.round(miles)} mi away`;
}

/**
 * Map a Sharetribe listing entity into the shape our PoolCard expects.
 * `userLocation` (optional) is used to compute distance labels.
 */
function mapListingToPool(listing, index, userLocation = null) {
  const { title, price, publicData, geolocation, metadata } =
    listing.attributes || {};
  const images = listing.images || [];
  const firstImage = images[0];

  // Get the best image variant available
  let imgUrl = 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1000&q=85'; // fallback
  if (firstImage) {
    const variants = firstImage.attributes?.variants || {};
    const variant =
      variants['listing-card-2x'] ||
      variants['listing-card'] ||
      variants['scaled-medium'] ||
      variants['scaled-small'] ||
      variants['default'];
    if (variant?.url) {
      imgUrl = variant.url;
    }
  }

  // Build location string from publicData
  const city = publicData?.city || publicData?.location?.city || '';
  const state = publicData?.state || publicData?.location?.state || '';
  const location = [city, state].filter(Boolean).join(', ') || 'United States';

  // Format price
  const amount = price?.amount;
  const formattedPrice = amount != null ? `$${Math.round(amount / 100)}` : '$50';

  // Pool type tags from publicData
  const humanize = v => (typeof v === 'string' ? v.replace(/_/g, ' ') : null);
  const tags = [];
  const poolTypeValues = Array.isArray(publicData?.poolType)
    ? publicData.poolType
    : publicData?.poolType
    ? [publicData.poolType]
    : [];
  poolTypeValues.forEach(pt => {
    const label = humanize(pt);
    if (label) tags.push(label);
  });
  if (publicData?.heated) tags.push('Heated');
  if (Array.isArray(publicData?.amenities)) {
    publicData.amenities.slice(0, 2).forEach(a => {
      const label = humanize(a);
      if (label) tags.push(label);
    });
  }

  // Distance from the visitor (miles). Listing geolocation on Sharetribe is a
  // LatLng-shaped object with `lat` and `lng` numeric fields.
  const listingPoint =
    geolocation && typeof geolocation.lat === 'number'
      ? { lat: geolocation.lat, lng: geolocation.lng }
      : null;
  const distanceMiles = milesBetween(userLocation, listingPoint);
  const distanceLabel = formatDistance(distanceMiles);

  // Ratings & review counts. Sharetribe doesn't expose these natively; most
  // integrations store aggregates in publicData or metadata. We read either.
  const rating =
    metadata?.rating ??
    metadata?.avgRating ??
    publicData?.avgRating ??
    publicData?.rating ??
    null;
  const reviewCount =
    metadata?.reviewCount ??
    metadata?.reviews ??
    publicData?.reviewCount ??
    publicData?.reviews ??
    0;
  const ratingLabel = typeof rating === 'number' ? rating.toFixed(2) : '5.0';

  // Badges. Support a few common shapes: explicit array, boolean superhost
  // flag, or featured flag. First non-empty badge wins as the headline.
  const badges = [];
  if (Array.isArray(publicData?.badges)) {
    publicData.badges.forEach((b) => {
      const label = humanize(b);
      if (label) badges.push(label);
    });
  }
  if (Array.isArray(metadata?.badges)) {
    metadata.badges.forEach((b) => {
      const label = humanize(b);
      if (label) badges.push(label);
    });
  }
  if (publicData?.isSuperhost || metadata?.isSuperhost) badges.push('Superhost');
  if (publicData?.featured || metadata?.featured) badges.push('Featured');
  if (metadata?.verified || publicData?.verified) badges.push('Verified');

  return {
    id: listing.id?.uuid || index,
    name: title || 'Beautiful Pool',
    location,
    price: formattedPrice,
    rating: ratingLabel,
    reviews: reviewCount,
    tags: tags.length > 0 ? tags.slice(0, 3) : undefined,
    img: imgUrl,
    cardClass: CARD_CLASSES[index % CARD_CLASSES.length],
    listingId: listing.id, // keep reference for linking
    badge: badges[0] || null,
    badges,
    distanceMiles,
    distanceLabel,
  };
}

const OCCASIONS = [
  { emoji: '🎉', name: 'Pool Party',     count: '840+ pools',    color: 'linear-gradient(145deg, #FF6B9D 0%, #C1286C 100%)' },
  { emoji: '🌙', name: 'Date Night',     count: '320+ intimate', color: 'linear-gradient(145deg, #2D1B4E 0%, #6B3FA0 100%)' },
  { emoji: '👨‍👩‍👧‍👦', name: 'Family Fun',   count: '650+ family',   color: 'linear-gradient(145deg, #FFB547 0%, #FF7A00 100%)' },
  { emoji: '💼', name: 'Work Retreat',   count: '180+ corporate',color: 'linear-gradient(145deg, #1A3A5C 0%, #0D1B2A 100%)' },
  { emoji: '🎂', name: 'Birthdays',      count: '420+ parties',  color: 'linear-gradient(145deg, #FF4E8E 0%, #9B1B5C 100%)' },
  { emoji: '💍', name: 'Bachelorette',   count: '290+ glam',     color: 'linear-gradient(145deg, #E8C4D8 0%, #B8336A 100%)' },
  { emoji: '🧘', name: 'Wellness Day',   count: '210+ zen',      color: 'linear-gradient(145deg, #7BC8A4 0%, #2D6A4F 100%)' },
  { emoji: '📸', name: 'Photo Shoot',    count: '160+ scenic',   color: 'linear-gradient(145deg, #C9A961 0%, #6B4E1A 100%)' },
  { emoji: '🍼', name: 'Baby Shower',    count: '140+ gentle',   color: 'linear-gradient(145deg, #A8D8EA 0%, #3D7EA6 100%)' },
  { emoji: '🏊', name: 'Fitness Swim',   count: '120+ lap-ready',color: 'linear-gradient(145deg, #4FC3F7 0%, #01579B 100%)' },
  { emoji: '💕', name: 'Anniversary',    count: '95+ romantic',  color: 'linear-gradient(145deg, #FF6B6B 0%, #8B0000 100%)' },
  { emoji: '🎓', name: 'Graduation',     count: '180+ celebrate',color: 'linear-gradient(145deg, #3D5A80 0%, #0F1626 100%)' },
];

const TESTIMONIALS = [
  {
    stars: '★★★★★',
    quote: '"I booked a pool in 3 minutes for my daughter\'s birthday. The infinity view was insane. Every single guest was speechless. This app just replaced every party venue forever."',
    name: 'Sarah Mitchell',
    location: 'Los Angeles, CA',
    avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=100&q=80',
  },
  {
    stars: '★★★★★',
    quote: '"We used this for a team offsite. Rented a stunning Malibu pool for 4 hours. Best \'meeting\' we\'ve ever had. Our team is still talking about it six months later."',
    name: 'James Kramer',
    location: 'San Francisco, CA',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
  },
  {
    stars: '★★★★★',
    quote: '"Honestly? This is better than owning a pool. No maintenance, no hassle. Every time it\'s a different stunning pool. I\'m completely addicted. I book one every other weekend."',
    name: 'Priya Sharma',
    location: 'Miami, FL',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&q=80',
  },
];

/* ── useReveal hook ──────────────────────────────────────── */
function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, visible];
}

/* ── RevealBox component ─────────────────────────────────── */
function Reveal({ children, delay = 0, className = '' }) {
  const [ref, visible] = useReveal();
  const delayClass = delay === 1 ? css.delay1 : delay === 2 ? css.delay2 : delay === 3 ? css.delay3 : delay === 4 ? css.delay4 : '';
  return (
    <div
      ref={ref}
      className={`${css.reveal} ${visible ? css.visible : ''} ${delayClass} ${className}`}
    >
      {children}
    </div>
  );
}

/* ── FarAwayEmailCapture ────────────────────────────────── *
 * Shown when the nearest live listing is more than 100 miles
 * from the visitor's IP-geolocation. Posts the email along
 * with the surrounding context (geo, nearest distance, pools
 * shown, pathname) to `/api/lead-capture` so everything stays
 * in sync server-side. Defensive: treats network failures as
 * a soft error and keeps the user's email in the field.
 */
function FarAwayEmailCapture({ userLocation, nearestDistance, pools }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState('');

  const city = userLocation?.city;
  const region = userLocation?.region;
  const areaLabel = [city, region].filter(Boolean).join(', ') || 'your area';
  const distanceCopy =
    typeof nearestDistance === 'number'
      ? `Our closest pool is about ${Math.round(nearestDistance)} miles away.`
      : 'We don’t have pools in your area yet.';

  const submit = async (e) => {
    e.preventDefault();
    if (status === 'submitting') return;

    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg('Enter a valid email.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/lead-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          nearestDistanceMiles: nearestDistance ?? null,
          location: userLocation || null,
          pools: (pools || []).map((p) => ({
            id: p.id,
            name: p.name,
            distanceMiles: p.distanceMiles,
          })),
          referrer: typeof document !== 'undefined' ? document.referrer : '',
          pathname: typeof window !== 'undefined' ? window.location.pathname : '',
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'request_failed');
      }

      setStatus('success');
    } catch (err) {
      console.error('[lead-capture] submit failed', err);
      setErrorMsg('Something went wrong. Try again?');
      setStatus('error');
    }
  };

  return (
    <section id="notify-me" className={css.notifySection}>
      <div className={css.notifyCard}>
        <div className={css.notifyEyebrow}>Coming Soon to {areaLabel}</div>
        <h2 className={css.notifyHeadline}>
          No pools in <em className={css.titleItalic}>{areaLabel}</em> yet.
        </h2>
        <p className={css.notifySubline}>
          {distanceCopy} Drop your email and we’ll notify you the moment
          verified pools launch near you — and send you a launch-day booking
          credit as a thank-you.
        </p>

        {status === 'success' ? (
          <div className={css.notifySuccess}>
            <span className={css.notifySuccessCheck}>✓</span>
            You’re on the list. We’ll be in touch when pools go live in{' '}
            {city || 'your area'}.
          </div>
        ) : (
          <form className={css.notifyForm} onSubmit={submit} noValidate>
            <input
              type="email"
              className={css.notifyInput}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status === 'error') setStatus('idle');
              }}
              disabled={status === 'submitting'}
              aria-label="Email address"
              autoComplete="email"
              required
            />
            <button
              type="submit"
              className={css.notifyBtn}
              disabled={status === 'submitting'}
            >
              {status === 'submitting' ? 'Saving…' : 'Notify me →'}
            </button>
          </form>
        )}

        {status === 'error' && errorMsg && (
          <div className={css.notifyError}>{errorMsg}</div>
        )}
      </div>
    </section>
  );
}

/* ── PoolCard ────────────────────────────────────────────── */
function PoolCard({ pool }) {
  const [saved, setSaved] = useState(false);
  const badgeList = Array.isArray(pool.badges) && pool.badges.length > 0
    ? pool.badges
    : pool.badge
    ? [pool.badge]
    : [];
  return (
    <div className={`${css.poolCard} ${css[pool.cardClass]}`}>
      <img className={css.poolCardImg} src={pool.img} alt={pool.name} loading="lazy" />
      <div className={css.poolOverlayTop} />
      <div className={css.poolOverlay} />
      {badgeList.length > 0 && (
        <div className={css.poolBadgeStack}>
          {badgeList.slice(0, 2).map((b) => (
            <span key={b} className={css.poolBadge}>{b}</span>
          ))}
        </div>
      )}
      {pool.distanceLabel && (
        <span className={css.poolDistance}>📍 {pool.distanceLabel}</span>
      )}
      <button
        className={css.poolSave}
        onClick={() => setSaved(s => !s)}
        aria-label={saved ? 'Remove from saved' : 'Save pool'}
      >
        {saved ? '♥' : '♡'}
      </button>
      <div className={css.poolInfo}>
        <div className={css.poolLocation}>📍 {pool.location}</div>
        <div className={`${css.poolName} ${pool.cardClass === 'poolCardLg' ? css.poolNameLg : ''}`}>
          {pool.name}
        </div>
        {pool.tags && (
          <div className={css.poolTags}>
            {pool.tags.map(t => <span key={t} className={css.poolTag}>{t}</span>)}
          </div>
        )}
        <div className={css.poolMeta}>
          <div className={css.poolRating}>
            <span className={css.poolRatingStars}>★★★★★</span>
            {pool.rating} ({pool.reviews})
          </div>
          <div className={css.poolPrice}>
            {pool.price}<span className={css.poolPriceSub}>/hr</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── ArrowRight SVG ──────────────────────────────────────── */
const ArrowRight = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

/* ── Main Component ──────────────────────────────────────── */
export default function PremiumLandingPage({
  listings = [],
  fetchInProgress,
  fetchError,
  userLocation = null,
  userLocationError = null,
  marketSnapshot = null,
}) {
  // Use real Sharetribe listings if available, otherwise fall back to placeholder data
  console.log('🏊 PremiumLandingPage received:', listings?.length, 'listings', fetchInProgress ? '(loading...)' : '(done)');
  if (listings?.length > 0) {
    console.log('🏊 First listing entity:', listings[0]?.attributes?.title, listings[0]?.images?.length, 'images');
  }
  const pools = listings.length > 0
    ? listings.slice(0, 16).map((l, i) => mapListingToPool(l, i, userLocation))
    : FALLBACK_POOLS;

  // Nearest listing distance (miles). Used to drive the "no pools near you
  // yet" email capture flow when the closest pool is > 100 miles away.
  const nearestDistance = pools.reduce((min, p) => {
    if (typeof p.distanceMiles !== 'number') return min;
    return min == null || p.distanceMiles < min ? p.distanceMiles : min;
  }, null);
  const showFarAwayCapture =
    !fetchInProgress &&
    listings.length > 0 &&
    userLocation &&
    nearestDistance != null &&
    nearestDistance > 100;
  const [scrolled, setScrolled] = useState(false);
  const [heroBgLoaded, setHeroBgLoaded] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [ringPos, setRingPos] = useState({ x: -100, y: -100 });
  const [cursorHover, setCursorHover] = useState(false);
  const ringRef = useRef({ x: -100, y: -100 });
  const mouseRef = useRef({ x: -100, y: -100 });
  const rafRef = useRef(null);

  // Occasions drag scroll
  const scrollRef = useRef(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  // Cursor animation
  const animateCursor = useCallback(() => {
    ringRef.current.x += (mouseRef.current.x - ringRef.current.x) * 0.13;
    ringRef.current.y += (mouseRef.current.y - ringRef.current.y) * 0.13;
    setRingPos({ x: ringRef.current.x, y: ringRef.current.y });
    rafRef.current = requestAnimationFrame(animateCursor);
  }, []);

  useEffect(() => {
    // Trigger hero BG scale animation
    const timer = setTimeout(() => setHeroBgLoaded(true), 50);

    // Cursor
    const onMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      setCursorPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', onMouseMove);
    rafRef.current = requestAnimationFrame(animateCursor);

    // Scroll for navbar
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll);

    // Cursor hover on interactive elements
    const addHover = () => setCursorHover(true);
    const removeHover = () => setCursorHover(false);
    const interactives = document.querySelectorAll('a, button, [data-hover]');
    interactives.forEach(el => {
      el.addEventListener('mouseenter', addHover);
      el.addEventListener('mouseleave', removeHover);
    });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
      interactives.forEach(el => {
        el.removeEventListener('mouseenter', addHover);
        el.removeEventListener('mouseleave', removeHover);
      });
    };
  }, [animateCursor]);

  // Drag scroll for occasions
  const onDragStart = (e) => {
    isDragging.current = true;
    dragStartX.current = e.pageX - scrollRef.current.offsetLeft;
    dragScrollLeft.current = scrollRef.current.scrollLeft;
  };
  const onDragEnd = () => { isDragging.current = false; };
  const onDragMove = (e) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    scrollRef.current.scrollLeft = dragScrollLeft.current - (x - dragStartX.current) * 1.8;
  };

  const marqueeItems = [
    'Forbes', 'TechCrunch', 'Good Morning America',
    'Business Insider', 'The New York Times', 'Vogue Living',
    'Fast Company', 'Architectural Digest', 'Wired',
  ];

  return (
    <div className={css.root}>
      {/* Custom Cursor */}
      <div
        className={`${css.cursor} ${cursorHover ? css.cursorHover : ''}`}
        style={{ left: cursorPos.x, top: cursorPos.y }}
      />
      <div
        className={`${css.cursorRing} ${cursorHover ? css.cursorRingHover : ''}`}
        style={{ left: ringPos.x, top: ringPos.y }}
      />

      {/* ── NAVBAR ── */}
      <nav className={`${css.navbar} ${scrolled ? css.navbarScrolled : ''}`}>
        <a href="/" className={css.navLogo}>
          <div className={css.navLogoMark} />
          <span className={css.navLogoText}>
            pool<span className={css.navLogoAccent}>rental</span>nearme
          </span>
        </a>

        <ul className={css.navLinks}>
          <li><a href="#pools" className={css.navLink}>Find a Pool</a></li>
          <li><a href="#how" className={css.navLink}>How It Works</a></li>
          <li><a href="#host" className={css.navLink}>For Hosts</a></li>
        </ul>

        <div className={css.navActions}>
          <a href="/l/new" className={css.btnGhost}>List Your Pool</a>
          <a href="/signup" className={css.btnGhost}>Sign Up</a>
          <a href="/login" className={css.btnPrimary}>Sign In →</a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className={css.hero}>
        <div className={`${css.heroBg} ${heroBgLoaded ? css.heroBgLoaded : ''}`} />
        <div className={css.heroOverlay} />
        <div className={css.heroGrain} />

        <div className={css.heroContent}>
          <div className={css.heroBadge}>
            <span className={css.badgeDot} />
            The #1 Private Pool Network
          </div>

          <h1 className={css.heroHeadline}>
            Your private pool.<br />
            <em className={css.heroHeadlineItalic}>Around the corner.</em>
          </h1>

          <p className={css.heroSubline}>
            Book verified private pools by the hour.<br />
            No memberships. No strangers. No crowds.
          </p>

          {/* Search */}
          <div className={css.searchBar}>
            <div className={css.searchField}>
              <span className={css.searchLabel}>Location</span>
              <input className={css.searchInput} type="text" placeholder="Los Angeles, CA" />
            </div>
            <div className={css.searchField}>
              <span className={css.searchLabel}>Date</span>
              <input className={css.searchInput} type="text" placeholder="Today" />
            </div>
            <div className={css.searchField}>
              <span className={css.searchLabel}>Guests</span>
              <input className={css.searchInput} type="text" placeholder="2 guests" />
            </div>
            <button className={css.searchBtn}>
              <SearchIcon />
              Search
            </button>
          </div>

          {/* Live product strip — drives engagement with real bookable pools */}
          {listings.length > 0 && (
            <a
              href={showFarAwayCapture ? '#notify-me' : '/s'}
              className={css.heroLiveStrip}
              aria-label={
                showFarAwayCapture
                  ? 'Get notified when pools launch near you'
                  : 'Browse pools available near you'
              }
            >
              <span className={css.heroLivePulse} aria-hidden="true" />
              {showFarAwayCapture ? (
                <>
                  <span className={css.heroLiveText}>
                    No pools in {userLocation?.city || 'your area'} yet
                  </span>
                  <span className={css.heroLiveCta}>Get early access →</span>
                </>
              ) : (
                <>
                  <span className={css.heroLiveText}>
                    {listings.length} {listings.length === 1 ? 'pool' : 'pools'} available
                    {userLocation?.city ? ` near ${userLocation.city}` : ' near you'}
                    {pools[0]?.price ? ` · from ${pools[0].price}/hr` : ''}
                  </span>
                  <span className={css.heroLiveCta}>Book now →</span>
                </>
              )}
            </a>
          )}

          {/* Social Proof */}
          <div className={css.heroProof}>
            <div className={css.proofStat}>
              <span className={css.proofStars}>★★★★★</span>
              <span className={css.proofLabel}>4.9 avg rating</span>
            </div>
            <div className={css.proofDivider} />
            <div className={css.proofStat}>
              <span className={css.proofNumber}>50K+</span>
              <span className={css.proofLabel}>Happy swimmers</span>
            </div>
            <div className={css.proofDivider} />
            <div className={css.proofStat}>
              <span className={css.proofNumber}>2,400+</span>
              <span className={css.proofLabel}>Verified pools</span>
            </div>
            <div className={css.proofDivider} />
            <div className={css.proofStat}>
              <span className={css.proofNumber}>200</span>
              <span className={css.proofLabel}>Cities nationwide</span>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className={css.scrollIndicator}>
          <div className={css.scrollLineWrap}>
            <div className={css.scrollLine} />
          </div>
          <span className={css.scrollText}>Scroll</span>
        </div>
      </section>

      {/* ── TRUST MARQUEE ── */}
      <div className={css.trustBar}>
        <div className={css.marqueeTrack}>
          <span className={css.trustLabel}>As Seen In</span>
          <span className={css.trustSep}>—</span>
          {[...marqueeItems, ...marqueeItems].map((brand, i) => (
            <React.Fragment key={i}>
              <span className={css.trustBrand}>{brand}</span>
              <span className={css.trustSep}>·</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── FAR-AWAY EMAIL CAPTURE ── */}
      {showFarAwayCapture && (
        <FarAwayEmailCapture
          userLocation={userLocation}
          nearestDistance={nearestDistance}
          pools={pools}
        />
      )}

      {/* ── FEATURED POOLS ── */}
      <section id="pools" className={`${css.poolsSection} ${css.section}`}>
        <div className={css.sectionInner}>
          <div className={css.poolsHeader}>
            <div>
              <Reveal><div className={css.eyebrow}>Handpicked For You</div></Reveal>
              <Reveal delay={1}>
                <h2 className={css.sectionTitle}>
                  Pools that make <em className={css.titleItalic}>memories</em>
                </h2>
              </Reveal>
            </div>
            <Reveal delay={2}>
              <button className={css.btnText}>
                View all pools <ArrowRight />
              </button>
            </Reveal>
          </div>

          <Reveal delay={1}>
            <div className={css.bentoGrid}>
              {pools.map(pool => <PoolCard key={pool.id} pool={pool} />)}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className={`${css.hiwSection} ${css.section}`}>
        <div className={css.sectionInner}>
          <Reveal><div className={`${css.eyebrow} ${css.eyebrowDark}`}>Simple Process</div></Reveal>
          <Reveal delay={1}>
            <h2 className={`${css.sectionTitle} ${css.sectionTitleDark}`}>
              Three steps to your <em className={css.titleItalicDark}>perfect swim</em>
            </h2>
          </Reveal>

          <Reveal delay={2}>
            <div className={css.hiwGrid}>
              {[
                { n: '01', icon: '🔍', title: 'Search Nearby', desc: 'Enter your location and browse hundreds of verified private pools within miles of you. Filter by size, amenities, price, and vibe.' },
                { n: '02', icon: '⚡', title: 'Book Instantly', desc: 'Reserve your pool in seconds with instant confirmation. No waiting, no back-and-forth. Secure payment with flexible cancellation.' },
                { n: '03', icon: '🏊', title: 'Dive In', desc: 'Show up, check in with your code, and enjoy your private pool. Your host handles everything else — you just swim.' },
              ].map(step => (
                <div key={step.n} className={css.hiwStep}>
                  <div className={css.hiwNumber}>{step.n}</div>
                  <div className={css.hiwIcon}>{step.icon}</div>
                  <h3 className={css.hiwTitle}>{step.title}</h3>
                  <p className={css.hiwDesc}>{step.desc}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── PREMIUM BOOKING EXPERIENCE (Phases 1-6 demo) ── */}
      <PoolBookingExperience
        listing={listings?.[0] || null}
        marketSnapshot={marketSnapshot}
      />

      {/* ── OCCASIONS ── */}
      <section className={`${css.occasionsSection} ${css.section}`}>
        <div className={css.occasionsHeader}>
          <Reveal><div className={css.eyebrow}>Every Reason to Swim</div></Reveal>
          <Reveal delay={1}>
            <h2 className={css.sectionTitle}>
              Find your <em className={css.titleItalic}>perfect occasion</em>
            </h2>
          </Reveal>
        </div>

        <div
          ref={scrollRef}
          className={css.occasionsScroll}
          onMouseDown={onDragStart}
          onMouseLeave={onDragEnd}
          onMouseUp={onDragEnd}
          onMouseMove={onDragMove}
        >
          {OCCASIONS.map(o => (
            <div
              key={o.name}
              className={css.occasionCard}
              style={{ background: o.color }}
              data-hover
            >
              <div className={css.occasionGlow} />
              <div className={css.occasionInfo}>
                <span className={css.occasionEmoji}>{o.emoji}</span>
                <div className={css.occasionName}>{o.name}</div>
                <div className={css.occasionCount}>{o.count}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── TRUST & SAFETY ── */}
      <section className={`${css.trustSection} ${css.section}`}>
        <div className={css.sectionInner}>
          <Reveal><div className={css.eyebrow}>Peace of Mind</div></Reveal>

          <div className={css.trustLayout}>
            <Reveal>
              <h2 className={css.trustHeadline}>
                Protected.<br />
                Verified.<br />
                <em className={css.titleItalic}>Guaranteed.</em>
              </h2>
            </Reveal>

            <div className={css.trustItems}>
              {[
                { icon: '🛡️', title: 'Host Protection', desc: 'Every confirmed booking is backed by the PRNM Host Protection Program.', value: 'Included' },
                { icon: '✅', title: 'Verified Hosts', desc: 'Every pool and host is manually reviewed, identity-verified, and inspected before going live on the platform.', value: '100%' },
                { icon: '💬', title: '24/7 Support', desc: 'Real humans available around the clock. Before, during, or after your swim — we\'re always here.', value: '24/7' },
              ].map((item, i) => (
                <Reveal key={item.title} delay={i + 1}>
                  <div className={css.trustItem}>
                    <div className={css.trustItemIcon}>{item.icon}</div>
                    <div className={css.trustItemTitle}>{item.title}</div>
                    <div className={css.trustItemDesc}>{item.desc}</div>
                    <div className={css.trustItemValue}>{item.value}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className={`${css.testimonialsSection} ${css.section}`}>
        <div className={css.sectionInner}>
          <Reveal><div className={`${css.eyebrow} ${css.eyebrowDark}`}>Real Swimmers</div></Reveal>
          <Reveal delay={1}>
            <h2 className={`${css.sectionTitle} ${css.sectionTitleDark}`}>
              They dove in.<br />
              <em className={css.titleItalicDark}>Here's what they said.</em>
            </h2>
          </Reveal>

          <div className={css.testimonialsGrid}>
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={i + 1}>
                <div className={css.testimonialCard}>
                  <span className={css.testimonialStars}>{t.stars}</span>
                  <p className={css.testimonialQuote}>{t.quote}</p>
                  <div className={css.testimonialAuthor}>
                    <img className={css.testimonialAvatar} src={t.avatar} alt={t.name} loading="lazy" />
                    <div>
                      <div className={css.testimonialName}>{t.name}</div>
                      <div className={css.testimonialMeta}>
                        {t.location}
                        <span className={css.verifiedBadge}>✓ Verified</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOST CTA ── */}
      <section id="host" className={css.hostSection}>
        <div className={css.hostLayout}>
          <div className={css.hostContent}>
            <Reveal><div className={`${css.eyebrow} ${css.eyebrowGold}`}>For Pool Owners</div></Reveal>
            <Reveal delay={1}>
              <h2 className={css.hostTitle}>
                Your pool earns<br />
                while you <em className={css.titleItalic}>sleep.</em>
              </h2>
            </Reveal>
            <Reveal delay={2}>
              <p className={css.hostDesc}>
                It's <strong>easier than you think</strong>. Snap a few photos, set your price, and
                you could be approving your first booking this weekend. Our AI writes your listing,
                we handle bookings and payments, and every swim is backed by the PRNM Host Protection Program —
                you just collect the check.
              </p>
            </Reveal>
            <Reveal delay={2}>
              <div className={css.hostEasySteps}>
                <div className={css.hostStep}>
                  <div className={css.hostStepNum}>1</div>
                  <div className={css.hostStepContent}>
                    <div className={css.hostStepTitle}>Snap photos</div>
                    <div className={css.hostStepDesc}>Your phone is enough. 5 minutes, tops.</div>
                  </div>
                </div>
                <div className={css.hostStep}>
                  <div className={css.hostStepNum}>2</div>
                  <div className={css.hostStepContent}>
                    <div className={css.hostStepTitle}>AI writes your listing</div>
                    <div className={css.hostStepDesc}>Title, description, pricing — all done for you.</div>
                  </div>
                </div>
                <div className={css.hostStep}>
                  <div className={css.hostStepNum}>3</div>
                  <div className={css.hostStepContent}>
                    <div className={css.hostStepTitle}>Approve &amp; earn</div>
                    <div className={css.hostStepDesc}>First booking within 48 hours on average.</div>
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={2}>
              <div className={css.hostStats}>
                <div>
                  <div className={css.hostStatValue}>$2K</div>
                  <div className={css.hostStatLabel}>avg / month</div>
                </div>
                <div>
                  <div className={css.hostStatValue}>48h</div>
                  <div className={css.hostStatLabel}>to first booking</div>
                </div>
                <div>
                  <div className={css.hostStatValue}>0%</div>
                  <div className={css.hostStatLabel}>upfront cost</div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={3}>
              <a href="/l/new" className={css.btnLarge}>
                List My Pool Free <ArrowRight size={18} />
              </a>
              <div className={css.hostReassure}>
                <span className={css.hostReassureCheck}>✓</span> No fees to list
                <span className={css.hostReassureCheck}>✓</span> Cancel anytime
                <span className={css.hostReassureCheck}>✓</span> Host Protection Program included
              </div>
            </Reveal>
          </div>

          <div className={css.hostDashboard}>
            <div className={css.hostDashGlow} />

            {/* Earnings card */}
            <div className={css.hostDashCard}>
              <div className={css.hostDashCardHead}>
                <div>
                  <div className={css.hostDashLabel}>This month</div>
                  <div className={css.hostDashEarnings}>
                    $3,240<span className={css.hostDashEarningsDecimal}>.00</span>
                  </div>
                </div>
                <div className={css.hostDashTrend}>
                  <span className={css.hostDashTrendArrow}>▲</span> 28%
                </div>
              </div>

              <div className={css.hostDashChart}>
                {[32, 58, 44, 72, 61, 88, 96].map((h, i) => (
                  <div
                    key={i}
                    className={css.hostDashBar}
                    style={{ height: `${h}%`, animationDelay: `${i * 80}ms` }}
                  />
                ))}
              </div>

              <div className={css.hostDashChartLabels}>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
                <span>Sun</span>
              </div>
            </div>

            {/* Live booking feed */}
            <div className={css.hostDashFeed}>
              <div className={css.hostDashFeedHead}>
                <span className={css.hostDashFeedDot} />
                <span className={css.hostDashFeedLabel}>Live bookings</span>
              </div>
              {[
                { initials: 'SM', name: 'Sarah M.', action: 'booked 3 hrs', time: '2m ago', amount: '+$450' },
                { initials: 'JK', name: 'James K.', action: 'booked 2 hrs', time: '18m ago', amount: '+$300' },
                { initials: 'PA', name: 'Priya A.', action: 'booked 4 hrs', time: '1h ago', amount: '+$600' },
              ].map((b, i) => (
                <div key={i} className={css.hostDashFeedItem}>
                  <div className={css.hostDashFeedAvatar}>{b.initials}</div>
                  <div className={css.hostDashFeedText}>
                    <div className={css.hostDashFeedName}>{b.name} <span className={css.hostDashFeedAction}>{b.action}</span></div>
                    <div className={css.hostDashFeedTime}>{b.time}</div>
                  </div>
                  <div className={css.hostDashFeedAmount}>{b.amount}</div>
                </div>
              ))}
            </div>

            {/* Host quote */}
            <div className={css.hostDashQuote}>
              <div className={css.hostDashQuoteStars}>★★★★★</div>
              <p className={css.hostDashQuoteText}>
                "Listed in 10 minutes. Had my first booking the next day. I didn't realize it would be this easy."
              </p>
              <div className={css.hostDashQuoteAuthor}>
                <div className={css.hostDashQuoteAvatar}>MR</div>
                <div>
                  <div className={css.hostDashQuoteName}>Marcus R.</div>
                  <div className={css.hostDashQuoteMeta}>Scottsdale · Host since 2024</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className={css.footer}>
        <div className={css.footerGrid}>
          <div className={css.footerTop}>
            <div>
              <a href="/" className={css.navLogo} style={{ display: 'inline-flex' }}>
                <div className={css.navLogoMark} />
                <span className={css.navLogoText}>
                  pool<span className={css.navLogoAccent}>rental</span>nearme
                </span>
              </a>
              <p className={css.footerTagline}>
                The private pool experience, elevated. Book stunning private pools by the hour.
                No memberships. No crowds. Just you and the water.
              </p>
              <div className={css.footerSocial}>
                {SOCIAL_LINKS.map(s => (
                  <a
                    key={s.label}
                    href={s.url}
                    className={css.socialLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                  >
                    {s.abbr}
                  </a>
                ))}
              </div>
            </div>

            {FOOTER_COLUMNS.map(col => (
              <div key={col.title}>
                <div className={css.footerColTitle}>{col.title}</div>
                <ul className={css.footerLinks}>
                  {col.links.map(link => (
                    <li key={link.label}>
                      <a
                        href={link.url}
                        className={css.footerLinkItem}
                        {...(link.external
                          ? { target: '_blank', rel: 'noopener noreferrer' }
                          : {})}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className={css.footerBottom}>
            <div className={css.footerLegal}>
              © 2025 Pool Rental Near Me, Inc. · Privacy · Terms · Sitemap
            </div>
            <div className={css.appBadges}>
              <a href="#" className={css.appBadge}>
                <span className={css.appBadgeIcon}>🍎</span>
                <div>
                  <span className={css.appBadgeLabelSmall}>Download on the</span>
                  <span className={css.appBadgeStore}>App Store</span>
                </div>
              </a>
              <a href="#" className={css.appBadge}>
                <span className={css.appBadgeIcon}>▶</span>
                <div>
                  <span className={css.appBadgeLabelSmall}>Get it on</span>
                  <span className={css.appBadgeStore}>Google Play</span>
                </div>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
