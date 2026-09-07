import React from 'react';
import classNames from 'classnames';

import { NamedLink } from '../../../components';

import shared from '../HomeShared.module.css';
import css from './HomeMosaic.module.css';

/**
 * "What are you getting into?" — six editorial photo tiles. Heated escapes and Night swims
 * dominate (the fall/winter version); four smaller occasions below.
 */
const HomeMosaic = (props) => {
  const { tiles } = props;
  return (
    <section className={css.root}>
      <div className={css.head}>
        <div>
          <h2 className={shared.h2}>What are you getting into?</h2>
          <p className={css.sub}>Pick the mood. We’ll find the pool.</p>
        </div>
        <NamedLink name="SearchPage" className={classNames(shared.glassLight, css.browseAll)}>
          Browse everything →
        </NamedLink>
      </div>
      <div className={css.grid}>
        {tiles.map((t) => (
          <NamedLink
            key={t.key}
            name="SearchPage"
            to={t.to}
            className={classNames(css.tile, { [css.tileLarge]: t.large })}
          >
            <img src={t.img} alt={t.alt} className={css.img} loading="lazy" />
            <span className={css.scrim} />
            <span className={css.caption}>
              {t.badge ? <span className={css.badge}>{t.badge}</span> : null}
              <span className={css.title}>{t.title}</span>
              {t.sub ? <span className={css.tileSub}>{t.sub}</span> : null}
            </span>
          </NamedLink>
        ))}
      </div>
    </section>
  );
};

export default HomeMosaic;
