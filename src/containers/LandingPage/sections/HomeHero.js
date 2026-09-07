import React from 'react';
import classNames from 'classnames';

import { IMG } from '../homeContent';
import HomeSearchForm from './HomeSearchForm';

import shared from '../HomeShared.module.css';
import css from './HomeHero.module.css';

const TRUST = ['Prices include all fees', 'Real hosts approve every booking', 'Pay by the hour'];

/**
 * Full-bleed marketplace hero: sunlit pool photo, the headline, the inventory tabs, the
 * booking search (Where? / When? / How many? / Search) and three trust facts.
 * On mobile the search card overlaps the bottom edge of the photo.
 */
const HomeHero = (props) => {
  const { eyebrow, tabs, searchFormProps, searchAnchorRef } = props;

  return (
    <section className={css.root}>
      <img
        src={IMG.hero}
        alt="Private backyard pool at golden hour"
        className={css.photo}
        fetchpriority="high"
      />
      <div className={css.scrim} />
      <div className={css.content}>
        <span className={css.eyebrow}>{eyebrow}</span>
        <h1 className={css.title}>Rent a pool you’ll fall in love with.</h1>
        <p className={css.sub}>
          Private pools by the hour.<span className={css.subDesktop}> Booked in minutes.</span>
        </p>
        <div className={css.tabs} role="tablist" aria-label="Pool types">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.active}
              className={classNames(shared.buttonReset, shared.glassSmoke, css.tab, {
                [css.tabActive]: t.active,
              })}
              onClick={t.onPick}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className={css.searchAnchor} ref={searchAnchorRef}>
          <HomeSearchForm {...searchFormProps} />
        </div>
        <ul className={css.trust}>
          {TRUST.map((t) => (
            <li key={t}>✓ {t}</li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default HomeHero;
