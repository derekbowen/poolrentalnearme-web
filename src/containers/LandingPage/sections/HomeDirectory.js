import React, { useState } from 'react';
import classNames from 'classnames';

import { NamedLink } from '../../../components';
import { CITIES, POPULAR_CITIES, STATES } from '../homeContent';

import shared from '../HomeShared.module.css';
import css from './HomeDirectory.module.css';

/**
 * SEO discovery — "Browse pool rentals by type" and "Pool rentals near me, by city" with the
 * expandable state / city directory. Everything stays in the DOM when collapsed so crawlers keep
 * the internal-link graph; only the visual is progressive.
 */
const HomeDirectory = (props) => {
  const { poolTypes, directoryExpanded = false } = props;
  const [open, setOpen] = useState(directoryExpanded);

  return (
    <section className={css.root}>
      <div className={css.types}>
        <h2 className={css.h2}>Browse pool rentals by type</h2>
        <div className={css.typeGrid}>
          {poolTypes.map((p) => (
            <NamedLink key={p.label} name="SearchPage" to={p.to} className={css.typeLink}>
              <span>{p.label}</span>
              <span className={css.typeArrow}>→</span>
            </NamedLink>
          ))}
        </div>
      </div>

      <div className={css.cities}>
        <div className={css.citiesHead}>
          <h2 className={css.h2}>Pool rentals near me, by city</h2>
          <a href="/public-pools" className={css.publicPoolsDesktop}>
            Free public pools directory →
          </a>
        </div>
        <p className={css.citiesSubMobile}>
          592+ U.S. cities. Also:{' '}
          <a href="/public-pools" className={css.publicPoolsMobile}>
            free public pools directory →
          </a>
        </p>
        <div className={css.chips}>
          {POPULAR_CITIES.map((c, i) => (
            <a
              key={c.name}
              href={c.href}
              className={classNames(css.chip, { [css.chipDesktopOnly]: i >= 12 })}
            >
              {c.name}
            </a>
          ))}
        </div>

        <div className={css.accordion}>
          <button
            type="button"
            className={classNames(shared.buttonReset, css.accordionHead)}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="home-city-directory"
          >
            <span className={css.accordionTitle}>
              Every state, every city<span className={css.accordionTitleLong}> · 592+ cities</span>
            </span>
            <span className={classNames(shared.glassLight, css.accordionToggle)}>
              {open ? 'Hide' : 'Show all'}
            </span>
          </button>
          <div
            id="home-city-directory"
            className={classNames(css.accordionBody, { [css.accordionOpen]: open })}
          >
            <div className={css.accordionInner}>
              <div className={css.states}>
                {STATES.map((s) => (
                  <a key={s.name} href={s.href} className={css.directoryLink}>
                    {s.name}
                  </a>
                ))}
              </div>
              <div className={css.directoryLabel}>
                Cities A–B · <span className={css.directoryLabelLong}>the list </span>continues to Z
              </div>
              <div className={css.cityList}>
                {CITIES.map((c) => (
                  <a key={c.name} href={c.href} className={css.directoryLink}>
                    {c.name}
                  </a>
                ))}
              </div>
              <a href="/p/all-locations" className={css.allLocations}>
                All pool rental locations →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HomeDirectory;
