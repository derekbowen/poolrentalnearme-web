import React from 'react';
import css from './SectionPrnmHero.module.css';

// PRNM birthday redesign (c132): full-bleed photo hero with the love headline, the
// host-love band, the real-pools ticker and the real press row. The old keyword H1
// ("rent a private pool by the hour") stays crawlable in the sub line per SEO rule 1.
// Rendered by PageBuilder via options.sectionComponents in LandingPage.js.
// Real host pool: "Paradise on Paradise" (Shawn G.) at dusk — string lights, palms,
// glowing water. Sell the destination, not a person.
const HERO_IMG =
  'https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a027739-7804-4669-987e-f6dbeee632dd?auto=format&fit=clip&h=1024&w=1024&s=b9811a705702c91a5cf27b77557fe67e';

const TICKER_POOLS = [
  '🏊 Hallico Outdoor Oasis — Spring Hill, TN',
  '🏊 Twin Palms Oasis — Las Vegas, NV',
  '🏊 Nobody Likes A Shady Beach — La Grange, KY',
  '🏊 Richmond Hideout — Richmond, TX',
  '🏊 Backyard Bliss — Union, NJ',
  '🏊 The Backyard Blue — Chestertown, MD',
];

const PRESS = [
  {
    name: 'EIN Presswire',
    url:
      'https://realestate.einnews.com/pr_news/908834379/two-truck-drivers-built-a-national-pool-rental-marketplace-on-their-off-hours',
  },
  {
    name: 'National Law Review',
    url:
      'https://natlawreview.com/press-releases/two-truck-drivers-built-national-pool-rental-marketplace-their-hours',
  },
  {
    name: 'Eagle Country',
    url:
      'https://lifestyle.myeaglecountry.com/story/194280/two-truck-drivers-built-a-national-pool-rental-marketplace-on-their-off-hours/',
  },
  {
    name: 'KBEW 98 Country',
    url:
      'https://lifestyle.kbew98country.com/story/194285/two-truck-drivers-built-a-national-pool-rental-marketplace-on-their-off-hours/',
  },
];

const SectionPrnmHero = props => {
  const { sectionId } = props;
  const tickerRun = [...TICKER_POOLS, ...TICKER_POOLS].join('  ·  ');
  return (
    <section id={sectionId} className={css.root}>
      <div className={css.heroWrap}>
        <img
          className={css.heroImg}
          src={HERO_IMG}
          alt="Paradise on Paradise — a real host's backyard pool at dusk on Pool Rental Near Me"
        />
        <div className={css.heroShade} />
        <div className={css.heroCopy}>
          <h1 className={css.title}>
            Find the pool <span className={css.titleAccent}>you&rsquo;ll fall in love with</span>.
          </h1>
          <p className={css.subtitle}>
            Rent a private pool by the hour — real neighbors, real backyards, booked in minutes.
          </p>
          <div className={css.ctaRow}>
            <a className={css.primaryBtn} href="/s">
              Find pools near me
            </a>
            <a className={css.secondaryBtn} href="/p/hosting">
              Have a pool? Earn with 0% host fees &rarr;
            </a>
          </div>
        </div>
      </div>
      <div className={css.loveBand}>
        <p className={css.loveLine}>
          We love pool hosts — it&rsquo;s why this marketplace is what it is. ❤️ 0% host fees.
          Hosts keep every dollar.
        </p>
        <div className={css.tickerWrap}>
          <div className={css.ticker}>{tickerRun}&nbsp;&nbsp;·&nbsp;&nbsp;</div>
        </div>
      </div>
      <div className={css.pressRow}>
        <span className={css.pressLabel}>As featured in</span>
        <span className={css.pressLinks}>
          {PRESS.map(p => (
            <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer">
              {p.name}
            </a>
          ))}
        </span>
      </div>
    </section>
  );
};

export default SectionPrnmHero;
