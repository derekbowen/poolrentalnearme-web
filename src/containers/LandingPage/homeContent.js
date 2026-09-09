/**
 * Static homepage content: photography, seasonal shortcuts, the occasion mosaic, love notes,
 * FAQs, the SEO directory and the footer groups. Copy lives here so the section components
 * stay pure layout.
 */
import { types as sdkTypes } from '../../util/sdkLoader';
import { priceWithBookingFee } from '../../util/currency';
import { HOME_IMAGE_VARIANTS } from './LandingPage.duck';

const { Money } = sdkTypes;

// Photography served by the www marketing server (poolrentalnearme.com/fw-assets) and the
// marketplace image CDN. These are hashed build outputs — if the marketing site rebuilds its
// assets, update the hashes here (one place).
const FW = 'https://www.poolrentalnearme.com/fw-assets/';
const IX = 'https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/';

export const IMG = {
  logo: `${FW}logo-D_Zw8xV4.png`,
  fred: `${FW}fred-BbXWBvj5.png`,
  fredAvatar: `${FW}fred-avatar-BeNG4olQ.png`,
  hero: `${FW}paradise-hero-B0o20BIM.webp`,
  love: `${FW}love-hero-CxQHMi2R.jpg`,
  friends: `${FW}love-friends-BF81oUo5.jpg`,
  night: `${FW}hero-night-B_5M-4-s.jpg`,
  day: `${FW}poolside-day-eP9nlg5C.jpg`,
  spa: `${FW}pool-spa-DQ_I-1M2.jpg`,
  glow: `${FW}night-glow-DAwFDLD0.jpg`,
  firePit: `${FW}fire-pit-CjwieAAX.jpg`,
  swimpark: `${IX}6a4e92d8-106a-42b0-8030-db9168200f73?auto=format&fit=clip&h=1024&w=1024&s=bb1b49ce5ddf8bb5384d43089df15010`,
  katyVideoPoster: 'https://i.ytimg.com/vi/jJF_OyufFQs/hqdefault.jpg',
  derek: '/static/images/home/derek.png',
};

// Seasonal browse shortcuts under the hero. `category` keys resolve to real Console ids at
// render time; `keywords` is the crawlable fallback when a category isn't configured.
export const SHORTCUTS = {
  indoor: { key: 'indoor', label: 'Indoor', category: 'indoor', keywords: 'indoor' },
  heated: {
    key: 'heated',
    label: 'Heated',
    category: 'heated',
    keywords: 'heated',
    img: IMG.swimpark,
  },
  party: { key: 'party', label: 'Pool parties', keywords: 'party', img: IMG.friends },
  hottub: { key: 'hot-tub', label: 'Hot tubs', keywords: 'hot tub', img: IMG.spa },
  night: {
    key: 'night',
    label: 'Night swims',
    category: 'night',
    keywords: 'night',
    img: IMG.glow,
  },
  family: { key: 'family', label: 'Family pools', keywords: 'family', img: IMG.love },
};

// "What are you getting into?" — six deliberate tiles; the first two dominate in winter.
export const MOSAIC = [
  {
    key: 'heated',
    title: 'Heated escapes',
    sub: 'Warm water, open all winter',
    img: IMG.swimpark,
    alt: 'Heated backyard pool',
    category: 'heated',
    keywords: 'heated',
    large: true,
    badge: 'Winter pick',
  },
  {
    key: 'night',
    title: 'Night swims',
    sub: 'Lights on, stars out',
    img: IMG.night,
    alt: 'Pool lit at night under palms',
    category: 'night',
    keywords: 'night',
    large: true,
  },
  {
    key: 'birthday',
    title: 'Birthday parties',
    img: IMG.friends,
    alt: 'Friends laughing poolside',
    keywords: 'birthday',
  },
  {
    key: 'family',
    title: 'Family days',
    img: IMG.love,
    alt: 'Sunlit family pool',
    keywords: 'family',
  },
  {
    key: 'date',
    title: 'Date night',
    img: IMG.firePit,
    alt: 'Fire pit lounge by the pool',
    keywords: 'date night',
  },
  {
    key: 'party',
    title: 'Big pool parties',
    img: IMG.day,
    alt: 'Resort-style pool lounge',
    keywords: 'party',
  },
];

// The Swimpark (Bothell, WA) — real listing used for the how-it-works moments and the host block.
export const SWIMPARK = {
  id: '6a1a4c13-02fe-458e-89ba-e33b5fc7612b',
  slug: 'the-swimpark',
  name: 'The Swimpark',
  city: 'Bothell, WA',
  host: 'Jan',
  hostRate: '$125',
  guestRate: '$143.75',
  img: IMG.swimpark,
};

export const KATY = {
  id: '685b3bd3-1e5d-44b8-9483-5f6452306157',
  slug: 'katy-staycation-saltwater-getaway',
  title: 'Katy’s Staycation Saltwater Getaway',
  sub: 'Heated saltwater, private backyard, room for the whole crew.',
  poster: IMG.katyVideoPoster,
};

// Verbatim from the on-record quote list served site-wide (ops/east/tools/cta.js, QUOTES).
// Never paraphrase, extend or re-attribute one of these; if a better quote exists it has to be
// added to that list first.
export const NOTES = [
  {
    quote:
      'I love you guys over at Pool Rental Near Me — the founder and co-founder personally called me to make sure I’m all right.',
    name: 'Demarco',
    where: 'Queens, NY',
  },
  {
    quote: 'Rock on, Derek — I see your hustle this year and it’s legit.',
    name: 'Salty Without The Sharks',
    where: 'Host · CA',
  },
  {
    quote: 'That is amazing that there are zero host fees!!',
    name: 'Katherine',
    where: 'Pool host',
  },
];

export const ACADEMY_TOPICS = [
  {
    label: 'Pricing',
    text: 'Set your hourly rate, holiday premiums and group fees.',
    short: 'Hourly rates, holiday premiums, group fees.',
  },
  {
    label: 'Safety',
    text: 'Waivers, supervision rules and pool-day protocols.',
    short: 'Waivers, supervision rules, pool-day protocols.',
  },
  {
    label: 'Marketing',
    text: 'Photos, listing copy and cross-listing on other platforms.',
    short: 'Photos, listing copy, cross-listing.',
  },
];

export const POOL_TYPES = [
  ['Indoor Pools', 'indoor'],
  ['Heated Pools', 'heated'],
  ['Pools with Hot Tubs', 'hot tub'],
  ['Saltwater Pools', 'saltwater'],
  ['Resort-Style Pools', 'resort'],
  ['Lap Pools', 'lap'],
  ['Infinity Pools', 'infinity'],
  ['Accessible Pools', 'accessible'],
].map(([label, keywords]) => ({ label, keywords }));

export const POPULAR_CITIES = [
  ['Los Angeles, CA', 'los-angeles-ca'],
  ['New York, NY', 'new-york-ny'],
  ['San Diego, CA', 'san-diego-ca'],
  ['Riverside, CA', 'riverside'],
  ['Sacramento, CA', 'sacramento-ca'],
  ['Phoenix, AZ', 'phoenix-az'],
  ['Scottsdale, AZ', 'scottsdale-az'],
  ['Tampa, FL', 'tampa-fl'],
  ['Katy, TX', 'katy-tx'],
  ['Atlanta, GA', 'atlanta'],
  ['Austin, TX', 'austin-tx'],
  ['Baltimore, MD', 'baltimore'],
  ['Las Vegas, NV', 'las-vegas-search-page'],
  ['Fort Worth, TX', 'fort-worth-tx'],
  ['Queens, NY', 'queens'],
  ['Albuquerque, NM', 'albuquerque'],
  ['Boston, MA', 'boston'],
  ['Bakersfield, CA', 'bakersfield'],
  ['Allentown, PA', 'allentown'],
  ['Albany, NY', 'albany'],
  ['Asheville, NC', 'asheville'],
  ['Annapolis, MD', 'annapolis'],
  ['Akron, OH', 'akron'],
  ['Providence, RI', 'providence'],
].map(([name, slug]) => ({ name, href: `/p/${slug}` }));

export const STATES = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
].map((name) => ({ name, href: `/p/pool-rentals/${name.toLowerCase().replace(/ /g, '-')}` }));

export const CITIES = [
  ['Accokeek, MD', 'accokeek-md'],
  ['Agoura Hills, CA', 'agoura-hills-ca'],
  ['Aiken, SC', 'aiken-sc'],
  ['Akron, OH', 'akron'],
  ['Alamo, CA', 'alamo-ca'],
  ['Albany, NY', 'albany'],
  ['Albuquerque, NM', 'albuquerque'],
  ['Aledo, TX', 'aledo-tx'],
  ['Alexandria, VA', 'alexandria'],
  ['Allen, TX', 'allen'],
  ['Allentown, PA', 'allentown'],
  ['Alpharetta, GA', 'alpharetta'],
  ['Alpine, UT', 'alpine-ut'],
  ['Alton, IL', 'alton-il'],
  ['Alvarado, TX', 'alvarado-tx'],
  ['Amarillo, TX', 'amarillo'],
  ['Anaheim, CA', 'anaheim'],
  ['Anchorage, AK', 'anchorage'],
  ['Ann Arbor, MI', 'ann-arbor'],
  ['Annapolis, MD', 'annapolis'],
  ['Appleton, WI', 'appleton'],
  ['Arcadia, OK', 'arcadia-ok'],
  ['Ardmore, PA', 'ardmore-pa'],
  ['Arlington, VA', 'arlington-va'],
  ['Arlington, TX', 'arlington'],
  ['Ashburn, VA', 'ashburn-va'],
  ['Asheville, NC', 'asheville'],
  ['Atascocita, TX', 'atascocita-tx'],
  ['Athens, GA', 'athens'],
  ['Atlanta, GA', 'atlanta'],
  ['Auburn, AL', 'auburn'],
  ['Augusta, GA', 'augusta'],
  ['Aurora, CO', 'aurora'],
  ['Aurora, IL', 'aurora-il'],
  ['Austin, TX', 'austin-tx'],
  ['Bainbridge Island, WA', 'bainbridge-island-wa'],
  ['Bakersfield, CA', 'bakersfield'],
  ['Baltimore, MD', 'baltimore'],
  ['Barrington, IL', 'barrington-il'],
  ['Bartlett, TN', 'bartlett-tn'],
  ['Baton Rouge, LA', 'baton-rouge'],
  ['Beaverton, OR', 'beaverton'],
  ['Bee Cave, TX', 'bee-cave-tx'],
  ['Bellaire, TX', 'bellaire-tx'],
  ['Bellevue, WA', 'bellevue'],
  ['Bellmore, NY', 'bellmore-ny'],
  ['Belmont, CA', 'belmont-ca'],
  ['Bend, OR', 'bend'],
  ['Bentonville, AR', 'bentonville'],
  ['Boston, MA', 'boston'],
  ['Boulder, CO', 'boulder'],
].map(([name, slug]) => ({ name, href: `/p/${slug}` }));

export const FAQS = [
  {
    q: 'How do I rent a pool near me?',
    a: 'Search your city or ZIP, pick a pool, choose a date and hours, and book. The host approves, and the total you see includes everything.',
  },
  {
    q: 'How much does it cost to rent a pool for the day?',
    a: 'Hosts set their own rates, typically $35–$150 per hour. Book the hours you need — the all-in price shows before you pay.',
  },
  {
    q: 'Can I contact a host before booking?',
    a: 'Yes. Message the host from the listing page about depth, parking, music or food. Most reply within an hour.',
  },
  {
    q: 'How does Pool Rental Near Me make money?',
    a: 'Hosts never pay a fee. Guests pay one clear service fee at checkout, which covers payment processing and support.',
  },
  {
    q: 'How do I rent out my pool?',
    a: 'Create a free listing with photos, your hourly rate and house rules. You approve every booking and keep 100% of your rate.',
  },
];

export const SMS_HREF = 'sms:+18556178207';
export const PHONE = { label: '888-940-4247', href: 'tel:18889404247', hours: '10am–5pm PST' };

const links = (arr) => arr.map(([label, href]) => ({ label, href }));
export const FOOTER_GROUPS = [
  {
    title: 'Rent',
    links: links([
      ['Find a pool', '/s'],
      ['How it works', '/p/how-it-works'],
      ['Browse by pool type', '/s'],
      ['All locations', '/p/all-locations'],
      ['Public pools directory', '/public-pools'],
      ['Get the app', '/p/pool-rental-app'],
    ]),
  },
  {
    title: 'Host',
    links: links([
      ['List your pool free', '/l/new'],
      ['How hosting works', '/p/hosting'],
      ['Pool Host Academy', '/p/learningacademy'],
      ['Earnings calculator', '/p/earnings-calculator'],
      ['Host tools', '/p/free-host-tools'],
      ['HOA navigation guide', '/p/elearning-academy-hoa-navigation-guide-pool-hosts'],
      ['Affiliate program', '/p/affiliate-program'],
    ]),
  },
  {
    title: 'Learn',
    links: links([
      ['Blog', '/p/blog'],
      ['Neighbors', '/p/neighbors'],
      ['Host advocacy hub', '/p/host-advocacy'],
      ['State-by-state hosting laws', '/p/host-advocacy'],
      ['Pool maintenance guide', '/p/pool-maintenance'],
      ['PRNM vs Swimply', '/p/swimply-alternative-vs-pool-rental-near-me'],
    ]),
  },
  {
    title: 'Company',
    links: links([
      ['About PRNM Corp', '/p/about-our-company'],
      ['Careers', '/p/careers'],
      ['Investors', '/p/investors'],
      ['Contact', 'mailto:support@poolrentalnearme.com'],
    ]),
  },
  {
    title: 'Help',
    links: links([
      ['Text Derek', SMS_HREF],
      [`Call ${PHONE.label} · ${PHONE.hours}`, PHONE.href],
      ['support@poolrentalnearme.com', 'mailto:support@poolrentalnearme.com'],
      ['Video chat support', 'https://meetn.com/poolrentalnearme'],
      ['Liability waivers', 'https://rentalwaivers.com'],
    ]),
  },
  {
    title: 'Legal',
    links: links([
      ['Terms of service', '/terms-of-service'],
      ['Privacy policy', '/privacy-policy'],
      ['Sitemap', '/sitemap.xml'],
    ]),
  },
  {
    title: 'Social',
    links: links([
      ['Facebook', 'https://www.facebook.com/poolrentalnearme'],
      ['Instagram', 'https://www.instagram.com/poolrentalnearme'],
      ['TikTok', 'https://www.tiktok.com/@poolrentalnearme'],
      ['YouTube', 'https://www.youtube.com/@poolrentalnearme'],
      ['X', 'https://x.com/poolrentalnearm'],
      ['LinkedIn', 'https://www.linkedin.com/company/poolrentalnearme'],
      ['Pinterest', 'https://www.pinterest.com/poolrentalnearme'],
    ]),
  },
];

export const LEGAL_LINE =
  'Pool Rental Near Me is operated by PRNM Corp, a Delaware C-Corporation. © 2026 PRNM Corp · Riverside, CA 92509';

// Real pools from poolrentalnearme.com/s, in the normalized homepage shape. Shown only when the
// live inventory query returns nothing (API down, empty marketplace). `base` is the host rate in
// cents; the card price is still priceWithBookingFee(base) — one pricing rule.
const fakeImage = (url) => ({
  id: url,
  type: 'image',
  attributes: {
    variants: HOME_IMAGE_VARIANTS.reduce(
      (acc, v, i) => ({
        ...acc,
        [v]: { url, width: i === 0 ? 600 : 1200, height: i === 0 ? 315 : 630 },
      }),
      { 'scaled-small': { url, width: 320, height: 168 } }
    ),
  },
});
const ixCrop = (path, sig) => `${IX}${path}?auto=format&crop=edges&fit=crop&h=630&w=1200&s=${sig}`;

export const FALLBACK_LISTINGS = [
  {
    id: '6a713580-85d9-43eb-8f84-35a431128c2f',
    slug: 'the-backyard-oasis',
    title: 'The Backyard Oasis',
    city: 'Coeur d’Alene, ID',
    base: 10000,
    cat: 'indoor',
    heated: true,
    guests: 20,
    tag: 'Indoor · Heated · Fits 20',
    img: ixCrop('6a713580-7604-41a0-a59d-95a2f54e0788', 'ea7da3c745544b27c73d4160bdf2d579'),
  },
  {
    id: '6a5db0ae-61bf-4e2d-abd6-42918180c738',
    slug: 'indoor-pool-retreat-open-year-round-mo',
    title: 'Indoor Pool Retreat — Open Year-round',
    city: 'Powell, MO',
    base: 9000,
    cat: 'indoor',
    heated: true,
    guests: 20,
    tag: 'Indoor · Heated to 86° · Fits 20',
    img: ixCrop('6a5f93fe-4296-4f7a-8523-ec295a1876ca', '7021d2bbac069dc51a0acdd4befdc795'),
  },
  {
    id: '6a5c5f80-2b20-48c2-afea-2800f5042150',
    slug: 'sunshine-oasis',
    title: 'Sunshine Oasis',
    city: 'Rancho Palos Verdes, CA',
    base: 9000,
    cat: 'heated',
    heated: true,
    topHost: true,
    guests: 18,
    tag: 'Heated · Saltwater · Fits 18',
    img: ixCrop('6a5c5f80-60e5-41f1-9f8a-639e1bb306e4', '0defc7d8ffb5fe1a3805f1e1969466ca'),
  },
  {
    id: SWIMPARK.id,
    slug: SWIMPARK.slug,
    title: SWIMPARK.name,
    city: SWIMPARK.city,
    base: 12500,
    cat: 'general',
    heated: true,
    fav: true,
    guests: 50,
    tag: '85° heated · Fits 50',
    img: IMG.swimpark,
  },
  {
    id: '6858bdc8-011c-49e4-b91c-488c57d8cac6',
    slug: 'payton-pool-cabana',
    title: 'Payton Pool & Cabana',
    city: 'Atlanta, GA',
    base: 4500,
    cat: 'general',
    heated: true,
    guests: 20,
    tag: 'Heated saltwater · Fits 20',
    img: ixCrop('6858bf4f-4409-451d-b09f-07efdb415f88', '46e6d11e7f4953c67105ead6f7a0f76c'),
  },
  // Fails eligibility on purpose (pricing not set, bare-ZIP address) — documents the rule.
  {
    id: '6a7bd935-0a32-4de5-9c71-b4520a1773db',
    slug: 'our-backyard-oasis-family-fun-in-the-sun-or-at-night',
    title: 'Our Backyard Oasis – Family Fun in the Sun or at night',
    city: '',
    base: 3000,
    cat: 'night',
    guests: 10,
    topHost: true,
    tag: 'Night swimming · Fits 10',
    img: ixCrop('6a7bdd12-fd5d-4afd-a74c-4962b8e6b4ac', 'ee3aa5e453a6d1700589c9556be16031'),
    flags: ['pricing_not_set', 'address_incomplete'],
  },
].map(({ base, img, ...l }) => ({
  ...l,
  categoryName: '',
  fav: !!l.fav,
  topHost: !!l.topHost,
  flags: l.flags || [],
  published: true,
  author: null,
  // priceLabel is formatted at render time (needs intl); the Money is the same all-in rule as /s.
  price: priceWithBookingFee(new Money(base, 'USD')),
  image: fakeImage(img),
}));
