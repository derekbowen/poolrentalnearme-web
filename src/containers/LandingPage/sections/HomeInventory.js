import React from 'react';
import classNames from 'classnames';

import { NamedLink } from '../../../components';
import HomeListingCard from './HomeListingCard';

import shared from '../HomeShared.module.css';
import css from './HomeInventory.module.css';

/**
 * "Warm swims, open all winter" — the live inventory. Three large cards per desktop row plus
 * the sun "See every pool" tile; a horizontal rail with an iOS segmented control on mobile.
 */
const HomeInventory = (props) => {
  const { heading, status, tabs, listings, more, isAuthenticated } = props;

  const tabButtons = (tabClass, activeClass) =>
    tabs.map((t) => (
      <button
        key={t.key}
        type="button"
        role="tab"
        aria-selected={t.active}
        className={classNames(tabClass, { [activeClass]: t.active })}
        onClick={t.onPick}
      >
        {t.label}
      </button>
    ));

  return (
    <section className={css.root} id="pools">
      <div className={css.head}>
        <div className={css.headMain}>
          <h2 className={shared.h2}>{heading}</h2>
          <div className={css.status}>
            <span className={css.dot} style={{ background: status.color }} />
            <span className={css.statusText}>{status.text}</span>
          </div>
          <div className={css.pills} role="tablist" aria-label="Pool types">
            {tabButtons(
              classNames(shared.buttonReset, shared.glassLight, css.pill),
              css.pillActive
            )}
          </div>
        </div>
        <NamedLink name="SearchPage" className={classNames(shared.glassLight, css.seeAll)}>
          <span className={css.seeAllLong}>See all pools →</span>
          <span className={css.seeAllShort}>See all</span>
        </NamedLink>
      </div>

      <div className={css.segmented} role="tablist" aria-label="Pool types">
        {tabButtons(classNames(shared.buttonReset, css.segment), css.segmentActive)}
      </div>

      <div className={classNames(shared.rail, css.grid)}>
        {listings.map((l) => (
          <HomeListingCard
            key={l.id}
            listing={l}
            isAuthenticated={isAuthenticated}
            sizes="(max-width: 1023px) 320px, (max-width: 1440px) 30vw, 430px"
          />
        ))}
        <NamedLink name="SearchPage" to={more.to} className={classNames(shared.sun, css.moreTile)}>
          <span className={css.moreEyebrow}>{more.eyebrow}</span>
          <span className={css.moreText}>{more.text}</span>
        </NamedLink>
      </div>

      <p className={css.note}>
        <span className={css.noteLong}>
          Prices include all fees. Hosts set their own rates and approve each booking.
        </span>
        <span className={css.noteShort}>Prices include all fees. Hosts approve each booking.</span>
      </p>
    </section>
  );
};

export default HomeInventory;
