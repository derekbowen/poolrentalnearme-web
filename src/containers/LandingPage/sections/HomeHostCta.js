import classNames from 'classnames';
import React from 'react';

import { NamedLink } from '../../../components';
import { SWIMPARK } from '../homeContent';

import shared from '../HomeShared.module.css';
import css from './HomeHostCta.module.css';

/**
 * Host acquisition — "Your pool could pay for itself." The pool stays the hero asset; a small
 * host card shows the real marketplace math (guests pay $143.75 · Jan keeps $125 · host fee $0).
 */
const HomeHostCta = () => (
  <section className={css.root} id="host">
    <div className={css.block}>
      <img
        src={SWIMPARK.img}
        alt={`${SWIMPARK.name}, a heated backyard pool in ${SWIMPARK.city}`}
        className={css.photo}
        loading="lazy"
      />
      <div className={css.scrim} />
      <div className={css.copy}>
        <div className={shared.eyebrow}>For pool owners</div>
        <h2 className={css.title}>Have a heated pool? It could pay for itself.</h2>
        <p className={css.sub}>
          0% host fees. You keep 100% of your listed rate. Winter is when most pools sit unused.
        </p>

        <NamedLink
          name="ListingPage"
          params={{ id: SWIMPARK.id, slug: SWIMPARK.slug }}
          className={css.hostCardMobile}
        >
          <span className={css.avatar}>{SWIMPARK.host.charAt(0)}</span>
          <span className={css.hostCardMobileText}>
            <span className={css.hostCardMobileTitle}>
              {SWIMPARK.host} · {SWIMPARK.name} · {SWIMPARK.city}
            </span>
            <span className={css.hostCardMobileMeta}>
              Guests pay {SWIMPARK.guestRate} / hr · {SWIMPARK.host} keeps {SWIMPARK.hostRate}
            </span>
          </span>
        </NamedLink>

        <div className={css.actions}>
          <NamedLink name="NewListingPage" className={classNames(shared.sun, css.list)}>
            List your pool free
          </NamedLink>
          <a href="/p/hosting" className={css.how}>
            See how hosting works<span className={css.howArrow}> →</span>
          </a>
        </div>
      </div>

      <NamedLink
        name="ListingPage"
        params={{ id: SWIMPARK.id, slug: SWIMPARK.slug }}
        className={css.hostCard}
      >
        <span className={css.avatarLarge}>{SWIMPARK.host.charAt(0)}</span>
        <span>
          <span className={css.hostCardLabel}>Hosted by {SWIMPARK.host} · Top provider</span>
          <span className={css.hostCardTitle}>
            {SWIMPARK.name} · {SWIMPARK.city}
          </span>
          <span className={css.hostCardMeta}>
            Guests pay {SWIMPARK.guestRate} / hr · {SWIMPARK.host} keeps {SWIMPARK.hostRate} · host
            fee $0
          </span>
        </span>
      </NamedLink>
    </div>
  </section>
);

export default HomeHostCta;
