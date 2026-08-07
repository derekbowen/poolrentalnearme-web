import React from 'react';
import css from './SectionTwoWays.module.css';

// PRNM birthday redesign (c132): the two-audience split with the love copy —
// renters young and fun, hosting granny-simple ("if you can text a photo, you can host").
const SectionTwoWays = props => {
  const { sectionId } = props;
  return (
    <section id={sectionId} className={css.root}>
      <div className={css.inner}>
        <h2 className={css.heading}>Two ways to fall for summer</h2>
        <div className={css.grid}>
          <div className={`${css.card} ${css.cardSky}`}>
            <div className={css.cardEmoji} aria-hidden="true">
              🏖️
            </div>
            <h3 className={css.cardTitle}>Find a pool for the day</h3>
            <p className={css.cardText}>
              By the hour, near you. Bring the cousins, the cake, the floats.
            </p>
            <a className={css.primaryBtn} href="/s">
              Find pools near me
            </a>
          </div>
          <div className={`${css.card} ${css.cardCoral}`}>
            <div className={css.cardEmoji} aria-hidden="true">
              💙
            </div>
            <h3 className={css.cardTitle}>Share the pool you love</h3>
            <p className={css.cardText}>
              If you can text a photo, you can host. We set it all up with you — and you keep
              every dollar. 0% host fees.
            </p>
            <a className={css.quietBtn} href="/p/hosting">
              List my pool free
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SectionTwoWays;
