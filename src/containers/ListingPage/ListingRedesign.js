import React from 'react';
import { AvatarLarge } from 'components/Avatar/Avatar';
import { NamedLink } from '../../components';

// Truncate at a word boundary — never mid-word ("trust we g" bug).
const cut = (str, n) => {
  const t = String(str || '').trim();
  if (t.length <= n) return t;
  const cps = Array.from(t); // code points — never split an emoji surrogate pair
  if (cps.length <= n) return t;
  let sliced = cps.slice(0, n).join('');
  const i = sliced.lastIndexOf(' ');
  if (i > n * 0.6) sliced = sliced.slice(0, i);
  return sliced.trim() + '…';
};

/**
 * c96 listing redesign — data-driven sections installed for ALL listings.
 *
 * Hard rules (the honesty contract):
 *  - NO fabricated values: every line renders from real listing/author data.
 *  - No data -> no line -> no section. Sparse listings degrade gracefully.
 *  - Money path untouched: these are presentation components only.
 *  - Unknown slugs are SKIPPED, never rendered raw.
 *
 * Slug vocabularies below were generated from a live sweep of all 87
 * published listings (2026-07-12) — every slug in production has a label.
 */

/* ─────────────────────────── label maps ─────────────────────────── */

const HOUSE_RULES = {
  no_glass: { ok: false, label: 'No glass' },
  no_smoking: { ok: false, label: 'No smoking' },
  no_pets: { ok: false, label: 'No pets' },
  no_djs: { ok: false, label: 'No DJs' },
  no_nudity: { ok: false, label: 'No nudity' },
  no_alcohol: { ok: false, label: 'No alcohol' },
  no_night_swim: { ok: false, label: 'No night swimming' },
  supervised_minors: { ok: true, label: 'Minors with supervision' },
  music_curfew: { ok: true, label: 'Music until curfew' },
  host_present: { ok: true, label: 'Host is present' },
  vendors_approved: { ok: true, label: 'Vendors need approval' },
  cameras_disclosed: { ok: true, label: 'Security cameras on site' },
};

const POOL_AMENITIES = {
  fenced: { ic: '🚧', label: 'Fully fenced' },
  deep_end: { ic: '🏊', label: 'Deep end' },
  evening_lights: { ic: '💡', label: 'Evening lights' },
  parking: { ic: '🅿️', label: 'Parking' },
  bbq: { ic: '🍖', label: 'BBQ grill' },
  restroom: { ic: '🚻', label: 'Restroom' },
  covered_seating: { ic: '🌴', label: 'Covered seating' },
  wifi: { ic: '📶', label: 'WiFi' },
  cameras: { ic: '📷', label: 'Security cameras' },
  changing_area: { ic: '👙', label: 'Changing area' },
  heated: { ic: '♨️', label: 'Heated' },
  sound_system: { ic: '🔊', label: 'Sound system' },
  hot_tub: { ic: '🛁', label: 'Hot tub' },
  saltwater: { ic: '🌊', label: 'Saltwater' },
  pet_friendly: { ic: '🐾', label: 'Pet friendly' },
  diving_board: { ic: '🤿', label: 'Diving board' },
  ada: { ic: '♿', label: 'ADA accessible' },
  slide: { ic: '🛝', label: 'Water slide' },
};

const ADVANTAGES = {
  'shaded-area-nearby': { ic: '⛱️', label: 'Shaded areas', d: 'Plenty of shade when you need a break from the sun.' },
  'heated-pool': { ic: '♨️', label: 'Heated pool', d: 'Comfortable water even on cooler days.' },
  'night-lighting': { ic: '🌙', label: 'Night lighting', d: 'Swim past sunset — the pool lights up.' },
  'pool-cleaning-included': { ic: '✨', label: 'Cleaned before you arrive', d: 'The water is prepped and ready for your booking.' },
  'music-system': { ic: '🎵', label: 'Music system', d: 'Bring your playlist and set the vibe.' },
  'fire-pit-nearby': { ic: '🔥', label: 'Fire pit', d: 'Wind the evening down around the fire.' },
  'spa-and-sauna-nearby': { ic: '🧖', label: 'Spa & sauna', d: 'Extra ways to relax on site.' },
  'private-access': { ic: '🔒', label: 'Private access', d: 'The space is yours — no strangers wandering through.' },
  'panoramic-views': { ic: '🏞️', label: 'Panoramic views', d: 'A view worth the trip on its own.' },
  'diving-board': { ic: '🤿', label: 'Diving board', d: 'For the cannonball crowd.' },
  'poolside-dining-area': { ic: '🍽️', label: 'Poolside dining', d: 'Eat right at the water.' },
  'eco-friendly-filtration': { ic: '🌿', label: 'Eco-friendly filtration', d: 'Gentler water, greener system.' },
  'lifeguard-on-duty': { ic: '🛟', label: 'Lifeguard on duty', d: 'An extra set of trained eyes on the water.' },
  'water-slide': { ic: '🛝', label: 'Water slide', d: 'Instant hit with the kids.' },
};

const SPACE_LABELS = {
  parties: '🎉 Parties',
  hangouts: '🛋️ Hangouts',
  gathers: '🧑‍🤝‍🧑 Gatherings',
  celbrai: '🥳 Celebrations',
  birthdayparties: '🎂 Birthdays',
  'birthday-parties': '🎂 Birthdays',
  quiet: '🌙 Quiet days',
  'quiet-relaxation': '🌙 Quiet days',
  'photo-video-shoots': '📸 Photo & video shoots',
  'photo-video': '📸 Photo & video shoots',
  corporate: '💼 Corporate events',
  childbday: '🧸 Kids’ parties',
  adultparties: '🥂 Adult parties',
  bbqcookout: '🍖 BBQ cookouts',
  bbq: '🥳 Bachelor/ette parties',
  'bbq-cookout': '🍖 BBQ cookouts',
  babys: '👶 Baby showers',
  fitness: '💪 Fitness',
  fundraiser: '🎗️ Fundraisers',
  swimlesson: '🏊 Swim lessons',
  'swim-lessons': '🏊 Swim lessons',
  teambuild: '🤝 Team building',
  'team-building': '🤝 Team building',
  Weddings: '💍 Weddings',
  weddings: '💍 Weddings',
  events: '🎪 Events',
  'adult-only': '🥂 Adults only',
  family: '👨‍👩‍👧‍👦 Family days',
  'date-night': '🌹 Date nights',
};

const WATER_TYPES = {
  chlorine: '🌊 Chlorine pool',
  saltwater: '🌊 Saltwater',
};

/* ─────────────────────────── styles ─────────────────────────── */

const S = {
  block: { padding: '24px 0', borderTop: '1px solid #e6edf1' },
  h2: { fontSize: '20px', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.01em' },
  sub: { color: '#5f7480', fontSize: '14px', margin: '0 0 16px' },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fff',
    border: '1px solid #e6edf1', borderRadius: '999px', padding: '7px 13px',
    fontWeight: 600, fontSize: '13px', color: '#33474f',
  },
  coralChip: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eef4f8',
    border: '1px solid #c3e3f2', borderRadius: '999px', padding: '7px 13px',
    fontWeight: 700, fontSize: '13px', color: '#00719c',
  },
  tile: {
    width: '50px', height: '50px', borderRadius: '12px', flex: 'none',
    background: 'linear-gradient(150deg,#eaf7fd,#cfeaf6)', border: '1px solid #c3e3f2',
    display: 'grid', placeItems: 'center', fontSize: '24px',
    boxShadow: 'inset 0 1px 0 #ffffffcc, 0 3px 8px -4px rgba(0,113,156,.25)',
  },
};

/* ─────────────────────────── sections ─────────────────────────── */

/**
 * Meet-the-host card. TOP HOST ribbon renders ONLY when publicData.proHost === true
 * (operator-set flag). Every "why" line is conditional on real data.
 */
export const SectionTopHost = props => {
  const { author, authorDisplayName, publicData, reviews, onContactUser, isOwnListing, listingTitle } = props;
  if (!author || !author.id) return null;
  // Hosts often set a BUSINESS name as displayName (e.g. the listing title itself).
  // In that case "Meet Salty Without The Sharks" reads wrong — fall back to "your host".
  const rawName = (authorDisplayName || '').trim();
  const looksBusinessy =
    !rawName ||
    rawName.length > 22 ||
    (listingTitle && rawName.toLowerCase() === String(listingTitle).toLowerCase().trim());
  const hostLabel = looksBusinessy ? 'your host' : rawName;
  const hostShort = looksBusinessy ? 'the host' : rawName.split(' ')[0];
  const isTopHost = publicData?.proHost === true;
  const hasSync = !!publicData?.swimplyIcalUrl;
  const bio = (author.attributes?.profile?.bio || '').trim();
  const createdAt = author.attributes?.createdAt;
  const sinceLabel = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : null;
  const reviewCount = Array.isArray(reviews) ? reviews.length : 0;
  const avgRating =
    reviewCount > 0
      ? (reviews.reduce((s, r) => s + (r.attributes?.rating || 0), 0) / reviewCount).toFixed(1)
      : null;

  const whyFacts = [];
  if (isTopHost) whyFacts.push('Recognized as a Top Host by Pool Rental Near Me');
  if (avgRating) whyFacts.push(`★ ${avgRating} from ${reviewCount} guest review${reviewCount === 1 ? '' : 's'}`);
  if (hasSync) whyFacts.push('Calendar auto-synced — availability stays current');

  return (
    <div style={{ ...S.block }}>
      <div style={{ border: '1px solid #e6edf1', borderRadius: '16px', background: '#fff', overflow: 'hidden', boxShadow: '0 1px 2px rgba(11,39,51,.04), 0 8px 28px -14px rgba(11,39,51,.16)' }}>
        {isTopHost ? (
          <div style={{ background: 'linear-gradient(90deg,#009ed8,#00719c)', color: '#fff', fontWeight: 800, fontSize: '13px', letterSpacing: '.09em', textTransform: 'uppercase', padding: '9px 18px' }}>
            ★ Top Host <span style={{ fontWeight: 700, letterSpacing: '.02em', textTransform: 'none', opacity: 0.9 }}>— verified by Pool Rental Near Me</span>
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '20px', flexWrap: 'wrap' }}>
          <AvatarLarge user={author} disableProfileLink />
          <div style={{ flex: 1, minWidth: '200px' }}>
            <h2 style={{ fontWeight: 800, fontSize: '20px', letterSpacing: '-0.01em', margin: 0 }}>
              Meet {hostLabel}
            </h2>
            {sinceLabel ? (
              <div style={{ fontSize: '13px', color: '#5f7480', fontWeight: 600, marginTop: '2px' }}>
                Hosting since {sinceLabel}
              </div>
            ) : null}
            {bio ? (
              <div style={{ fontSize: '14px', color: '#33474f', fontStyle: 'italic', marginTop: '7px', lineHeight: 1.5 }}>
                “{cut(bio, 160)}”
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: '9px', alignItems: 'center' }}>
              {author.id?.uuid ? (
                <NamedLink name="ProfilePage" params={{ id: author.id.uuid }} style={{ fontSize: '13px', fontWeight: 700, color: '#00719c' }}>
                  View profile
                </NamedLink>
              ) : null}
              {isTopHost ? (
                <span style={{ display: 'inline-flex', gap: '4px', fontSize: '12px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', background: '#009ed8', color: '#fff' }}>★ Top Host</span>
              ) : null}
              {hasSync ? (
                <span style={{ display: 'inline-flex', gap: '4px', fontSize: '12px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', background: '#eef3f6', color: '#33474f' }}>⇄ Calendar auto-synced</span>
              ) : null}
            </div>
          </div>
          {onContactUser && !isOwnListing && !String(publicData?.transactionProcessAlias || '').startsWith('default-inquiry') ? (
            <button
              type="button"
              onClick={onContactUser}
              style={{ border: '1.5px solid #009ed8', color: '#00719c', background: '#fff', fontWeight: 800, fontSize: '14px', padding: '13px 20px', borderRadius: '13px', cursor: 'pointer', flex: 'none', fontFamily: 'inherit' }}
            >
              💬 Message {hostShort}
            </button>
          ) : null}
        </div>
        {whyFacts.length >= 2 ? (
          <div style={{ borderTop: '1px solid #eef3f6', background: '#f7fbfd', padding: '14px 20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: '#00719c', marginBottom: '7px' }}>
              {isTopHost ? `Why ${hostShort === 'the host' ? 'this host' : hostShort} is a Top Host` : 'Good to know'}
            </div>
            <div style={{ display: 'flex', gap: '7px 22px', flexWrap: 'wrap' }}>
              {whyFacts.slice(0, 3).map(f => (
                <span key={f} style={{ fontSize: '13.5px', fontWeight: 600, color: '#33474f', display: 'inline-flex', gap: '7px', alignItems: 'center' }}>
                  <span style={{ color: '#0c8f5f', fontWeight: 800 }}>✓</span> {f}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

/** Quick facts strip — each fact conditional on real data. */
export const SectionQuickFacts = props => {
  const { publicData } = props;
  const pd = publicData || {};
  const facts = [];
  if (pd.guestallowed) {
    facts.push({ ic: '👥', t: `Up to ${pd.guestallowed} guests`, d: pd.houseRules?.includes('no_pets') ? 'No pets' : 'Bring the crew' });
  }
  const minH = Number(pd.availability?.minHours) || 0;
  const maxH = Number(pd.availability?.maxHours) || 0;
  if (minH > 0 && maxH > minH) {
    facts.push({ ic: '⏱️', t: `Book ${minH}–${maxH} hours`, d: 'Flexible day & evening slots' });
  } else if (minH > 0 && maxH === minH) {
    facts.push({ ic: '⏱️', t: `${minH}-hour bookings`, d: 'Fixed-length sessions' });
  } else if (minH > 0) {
    facts.push({ ic: '⏱️', t: `${minH}-hour minimum`, d: 'Book as long as you like' });
  }
  const ACCESS = {
    wheelchair: 'Wheelchair accessible', animals: 'Service animals welcome', sensory: 'Sensory-friendly',
    dietary: 'Dietary accommodations', 'personal-assistance': 'Personal assistance available',
    audio: 'Audio assistance', visual: 'Visual assistance', transportation: 'Transportation help',
  };
  const accLabels = (Array.isArray(pd.accessibility) ? pd.accessibility : []).map(a => ACCESS[a]).filter(Boolean);
  if (accLabels.length > 0) {
    facts.push({ ic: '♿', t: accLabels[0], d: accLabels.length > 1 ? accLabels.slice(1).join(' · ') : 'Accessible venue' });
  }
  if (pd.swimplyIcalUrl) {
    facts.push({ ic: '⇄', t: 'Calendar always current', d: 'Auto-syncs every few hours' });
  }
  if (pd.checkingin === 'self') facts.push({ ic: '🔑', t: 'Self check-in', d: 'Let yourself in and enjoy' });
  if (pd.checkingin === 'checkn2' || pd.checkingin === 'host-present') facts.push({ ic: '👋', t: 'Check in with host', d: 'A real welcome on arrival' });
  if (facts.length === 0) return null;
  return (
    <div style={S.block}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '2px 26px' }}>
        {facts.slice(0, 4).map(f => (
          <div key={f.t} style={{ display: 'flex', gap: '13px', alignItems: 'center', padding: '13px 0', borderBottom: '1px solid #eef3f6' }}>
            <div style={S.tile}>{f.ic}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14.5px' }}>{f.t}</div>
              <div style={{ fontSize: '12.5px', color: '#5f7480', marginTop: '1px' }}>{f.d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Pool spec chips + "Perfect for" occasion chips (from real space[]). */
export const SectionPoolChips = props => {
  const { publicData } = props;
  const pd = publicData || {};
  const spec = [];
  if (pd.water_type && WATER_TYPES[pd.water_type]) spec.push(WATER_TYPES[pd.water_type]);
  const sqft = Number(pd.squarefootage);
  if (Number.isFinite(sqft) && sqft >= 50 && sqft <= 100000) spec.push(`📐 ${sqft} sq ft`);
  const pk = String(pd.parking_size || '');
  const PK_CARS = { small: 1, medium: 2, large: 3 };
  const cars = /^\d+$/.test(pk) ? Number(pk) : PK_CARS[pk] || 0;
  if (pk === 'no-parking-space') spec.push('🚫 No on-site parking');
  else if (pk === 'rob') spec.push('🅿️ RV / bus parking');
  else if (cars === 1) spec.push('🅿️ Parking for 1 car');
  else if (cars > 1) spec.push(`🅿️ Parking for ${cars} cars`);

  const seen = new Set();
  const occasions = (Array.isArray(pd.space) ? pd.space : [])
    .map(sl => SPACE_LABELS[sl])
    .filter(Boolean)
    .filter(l => (seen.has(l) ? false : (seen.add(l), true)));

  if (spec.length === 0 && occasions.length === 0) return null;
  return (
    <div style={{ padding: '4px 0 20px' }}>
      {spec.length > 0 ? (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: occasions.length ? '12px' : 0 }}>
          {spec.map(c => (
            <span key={c} style={S.chip}>{c}</span>
          ))}
        </div>
      ) : null}
      {occasions.length > 0 ? (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#8798a1', textTransform: 'uppercase', letterSpacing: '.08em' }}>Perfect for</span>
          {occasions.map(c => (
            <span key={c} style={S.coralChip}>{c}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
};

/** What's included — light checklist from poolAmenities (known slugs only). */
export const SectionAmenities = props => {
  const items = (Array.isArray(props.publicData?.poolAmenities) ? props.publicData.poolAmenities : [])
    .map(sl => POOL_AMENITIES[sl])
    .filter(Boolean);
  if (items.length < 3) return null;
  return (
    <div style={S.block}>
      <h2 style={S.h2}>What’s included</h2>
      <p style={S.sub}>Everything’s ready when you arrive.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '2px 26px' }}>
        {items.map(a => (
          <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid #eef3f6' }}>
            <span style={{ width: '32px', fontSize: '23px', flex: 'none', textAlign: 'center' }}>{a.ic}</span>
            <span style={{ fontWeight: 700, fontSize: '14.5px' }}>{a.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Add-on icons.
 *
 * These were emoji, which looked amateurish beside real listing photos: they
 * render differently on every platform and most add-ons fell through to a gift
 * box, so one live listing showed four identical gift boxes in a column. The
 * keyword list also matched bare substrings, so "Popcorn Bar" hit /corn/ and
 * was labelled with a dartboard.
 *
 * Now: line art in the brand blue at one stroke weight, matched on word
 * boundaries so a keyword has to be an actual word. Across the add-ons on all
 * live listings this resolves every one - no generic fallbacks.
 */
const AddonIcon = props => (
  <svg
    viewBox="0 0 24 24"
    width="26"
    height="26"
    fill="none"
    stroke="#00719c"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={props.d} />
  </svg>
);

const ICON_PATHS = {
  grill: 'M4 9h16M6 9a6 6 0 0 0 12 0M9 15l-1.5 5M15 15l1.5 5M12 15v5',
  flame: 'M12 3c1 3-2 4-2 7a2 2 0 0 0 4 0c0 1 2 2 2 5a6 6 0 0 1-12 0c0-5 5-6 8-12Z',
  tub: 'M3 12h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3ZM7 12V6a2 2 0 0 1 4 0M6 21l-1 1M18 21l1 1',
  towel: 'M6 3h9a3 3 0 0 1 3 3v15H9a3 3 0 0 1-3-3V3ZM6 3a3 3 0 0 0-3 3v3h3',
  drink: 'M6 4h12l-2 16H8L6 4ZM7 10h10',
  game: 'M12 3v18M3 12h18M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  pet:
    'M5 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM19 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9.5 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM14.5 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 12c-3 0-5 2.5-5 5a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3c0-2.5-2-5-5-5Z',
  umbrella: 'M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9ZM12 12v7a2 2 0 0 0 4 0',
  people:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 8.5a2.5 2.5 0 1 0 0-5M18 20c0-2 .5-3.5-1-5',
  clean: 'M4 21h16M7 21v-6l-2-2 4-9h6l4 9-2 2v6M9 15h6',
  sound: 'M4 9v6h4l5 4V5L8 9H4ZM17 8a5 5 0 0 1 0 8M20 5a9 9 0 0 1 0 14',
  tv: 'M3 5h18v11H3zM8 21h8M12 16v5',
  wifi: 'M2 8a16 16 0 0 1 20 0M5.5 11.5a11 11 0 0 1 13 0M9 15a6 6 0 0 1 6 0M12 19h.01',
  photo: 'M3 6h5l1.5-2h5L16 6h5v13H3zM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z',
};

// Word boundaries matter: "corn" must be the word corn, not the tail of popcorn.
const ADDON_ICONS = [
  [/\b(grill|bbq|barbecue|barbeque)\b/i, 'grill'],
  [/\b(hot ?tub|jacuzzi|spa|sauna)\b/i, 'tub'],
  [/\b(heat|heater|heated|heating|warm)\w*\b/i, 'flame'],
  [/\b(fire ?pit|fire ?table|fire|bonfire)\b/i, 'flame'],
  [/\b(towel|towels|linen|linens)\b/i, 'towel'],
  [/\b(cooler|drink|drinks|beverage|ice|snack|snacks|popcorn|food|catering)\w*\b/i, 'drink'],
  [/\b(dog|dogs|pet|pets|pup|pups|puppy)\w*\b/i, 'pet'],
  [/\b(umbrella|umbrellas|shade|canopy|tent)\b/i, 'umbrella'],
  [/\b(set ?up|setup|assistant|host|staff|service|attendant)\w*\b/i, 'people'],
  [/\b(clean|cleaning|cleanup|clean ?up|sanitation|sanitize)\w*\b/i, 'clean'],
  [/\b(speaker|speakers|sound|music|audio|bluetooth|dj)\b/i, 'sound'],
  [/\b(tv|tvs|television|projector|screen)\b/i, 'tv'],
  [/\b(wifi|wi-?fi|internet)\b/i, 'wifi'],
  [
    /\b(float|floats|toy|toys|game|games|corn ?hole|cornhole|ladder ?toss|ring ?toss|volleyball|connect ?four)\b/i,
    'game',
  ],
  [/\b(photo|photos|photographer|photography|decor|decoration|balloon)\w*\b/i, 'photo'],
  [/\b(table|tables|chair|chairs|seating|lounge|furniture)\b/i, 'people'],
];

const addonIcon = (name) => {
  for (const [re, key] of ADDON_ICONS) if (re.test(name || '')) return ICON_PATHS[key];
  return ICON_PATHS.star; // neutral "extra" - never a column of identical gift boxes
};

/** Paid add-ons (publicData.amenities[] objects with name+price). */
export const SectionAddOns = props => {
  const raw = Array.isArray(props.publicData?.amenities) ? props.publicData.amenities : [];
  const items = raw.filter(
    a => a && a.name && a.price && Number.isFinite(a.price.amount) && a.price.amount > 0 && (a.price.currency || 'USD') === 'USD'
  );
  const fmtAddon = amount => (amount % 100 === 0 ? `$${amount / 100}` : `$${(amount / 100).toFixed(2)}`);
  if (items.length === 0) return null;
  const hostFirst = (props.authorDisplayName || '').split(' ')[0];
  return (
    <div style={S.block}>
      <h2 style={S.h2}>Add-ons</h2>
      <p style={S.sub}>Optional extras {hostFirst ? `${hostFirst} offers` : 'the host offers'} — ask when you book.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items.slice(0, 8).map((a, i) => (
          <div key={(a.id || '') + i} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '14px 16px', border: '1px solid #e6edf1', borderRadius: '14px', background: '#fff' }}>
            <span style={{ ...S.tile, width: '52px', height: '52px' }}>
              <AddonIcon d={addonIcon(a.name)} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: '15px' }}>{a.name}</div>
              {a.description ? (
                <div style={{ fontSize: '13px', color: '#5f7480', marginTop: '2px', lineHeight: 1.45 }}>
                  {cut(a.description, 110)}
                </div>
              ) : null}
            </div>
            <span style={{ marginLeft: 'auto', flex: 'none', fontWeight: 800, fontSize: '14px', color: '#00719c', background: '#e6f6fc', border: '1px solid #cfeaf5', padding: '7px 14px', borderRadius: '999px' }}>
              +{fmtAddon(a.price.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Why you'll love it — top advantages as feature cards. */
export const SectionWhyLove = props => {
  const items = (Array.isArray(props.publicData?.advantagesSelection) ? props.publicData.advantagesSelection : [])
    .map(sl => ADVANTAGES[sl])
    .filter(Boolean)
    .slice(0, 3);
  if (items.length < 2) return null;
  return (
    <div style={S.block}>
      <h2 style={S.h2}>Why you’ll love it</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px', marginTop: '12px' }}>
        {items.map(a => (
          <div key={a.label} style={{ border: '1px solid #e6edf1', borderRadius: '15px', padding: '18px', background: 'linear-gradient(180deg,#fff,#f8fcfd)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'linear-gradient(150deg,#00a7e1,#00719c)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '26px', marginBottom: '13px', boxShadow: 'inset 0 1px 0 #ffffff55, 0 10px 18px -8px rgba(0,113,156,.6)' }}>{a.ic}</div>
            <div style={{ fontWeight: 800, fontSize: '15px' }}>{a.label}</div>
            <div style={{ fontSize: '13px', color: '#5f7480', marginTop: '3px', lineHeight: 1.5 }}>{a.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Things to know — real house rules + cancellation policy. */
export const SectionThingsToKnow = props => {
  const { publicData } = props;
  const rules = (Array.isArray(publicData?.houseRules) ? publicData.houseRules : [])
    .map(sl => HOUSE_RULES[sl])
    .filter(Boolean);
  const cancel = typeof publicData?.cancellation_policy === 'string' ? publicData.cancellation_policy.trim() : '';
  const poolCare = typeof publicData?.poolcleanring === 'string' ? publicData.poolcleanring.trim() : '';
  const arrival = typeof publicData?.transportation === 'string' ? publicData.transportation.trim() : '';
  if (rules.length === 0 && !cancel && !poolCare && !arrival) return null;
  return (
    <div style={S.block}>
      <h2 style={S.h2}>Things to know</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '22px', marginTop: '12px' }}>
        {rules.length > 0 ? (
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 9px' }}>House rules</h3>
            {rules.map(r => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', color: '#33474f', padding: '4px 0' }}>
                <span style={{ color: r.ok ? '#0c8f5f' : '#c05252', fontWeight: 800 }}>{r.ok ? '✓' : '✕'}</span> {r.label}
              </div>
            ))}
          </div>
        ) : null}
        {arrival ? (
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 9px' }}>Arrival &amp; meeting point</h3>
            <p style={{ fontSize: '13px', color: '#5f7480', lineHeight: 1.55, margin: 0 }}>{cut(arrival, 200)}</p>
          </div>
        ) : null}
        {poolCare ? (
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 9px' }}>Pool care</h3>
            <p style={{ fontSize: '13px', color: '#5f7480', lineHeight: 1.55, margin: 0 }}>Pool cleaning provided by {cut(poolCare, 120)}</p>
          </div>
        ) : null}
        {cancel ? (
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 9px' }}>Cancellation</h3>
            <p style={{ fontSize: '13px', color: '#5f7480', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-line' }}>{cancel}</p>
          </div>
        ) : null}
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 9px' }}>Trust &amp; safety</h3>
          <p style={{ fontSize: '13px', color: '#5f7480', lineHeight: 1.55, margin: 0 }}>
            Secure payments and Pool Rental Near Me support on every booking. A 15% booking fee is added at checkout — no hidden charges.
          </p>
        </div>
      </div>
    </div>
  );
};
