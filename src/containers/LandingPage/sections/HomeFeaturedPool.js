import classNames from 'classnames';
import React from 'react';

import { NamedLink } from '../../../components';
import { KATY } from '../homeContent';

import shared from '../HomeShared.module.css';
import css from './HomeFeaturedPool.module.css';

/**
 * Featured pool — Katy's Staycation Saltwater Getaway as a cinematic editorial feature: the
 * video poster on a blurred, saturated backdrop with a play control and "Tour this pool".
 */
const HomeFeaturedPool = () => {
  const params = { id: KATY.id, slug: KATY.slug };
  return (
    <section className={css.root}>
      <img src={KATY.poster} alt="" className={css.backdrop} aria-hidden="true" loading="lazy" />
      <div className={css.inner}>
        <NamedLink name="ListingPage" params={params} className={css.video}>
          <img
            src={KATY.poster}
            alt={`${KATY.title} video tour`}
            className={css.poster}
            loading="lazy"
          />
          <span className={css.playWrap}>
            <span className={css.play}>
              <span className={css.playTriangle} />
            </span>
          </span>
        </NamedLink>
        <div className={css.copy}>
          <div className={classNames(shared.eyebrow, css.eyebrow)}>Featured pool</div>
          <h2 className={css.title}>{KATY.title}</h2>
          <p className={css.sub}>{KATY.sub}</p>
          <div className={css.actions}>
            <NamedLink
              name="ListingPage"
              params={params}
              className={classNames(shared.glassBlue, css.tour)}
            >
              Tour this pool
            </NamedLink>
            <NamedLink name="SearchPage" className={css.browse}>
              Browse all pools →
            </NamedLink>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HomeFeaturedPool;
