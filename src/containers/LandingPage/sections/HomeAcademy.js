import classNames from 'classnames';
import React from 'react';

import { ACADEMY_TOPICS, IMG } from '../homeContent';

import shared from '../HomeShared.module.css';
import css from './HomeAcademy.module.css';

/**
 * Pool Host Academy — compact editorial block: Fred, "193 free classes for pool hosts.",
 * three topic cards and the glass CTA.
 */
const HomeAcademy = () => (
  <section className={css.root}>
    <div className={css.block}>
      <div className={css.intro}>
        <img
          src={IMG.fred}
          alt="Fred, your Pool Host Academy guide"
          className={css.fred}
          loading="lazy"
        />
        <div className={css.introText}>
          <div className={classNames(shared.eyebrow, css.eyebrow)}>
            Pool Host Academy<span className={css.eyebrowLong}> · only on PRNM</span>
          </div>
          <h2 className={css.title}>193 free classes for pool hosts.</h2>
          <p className={css.sub}>
            Five minutes each, with Fred. No sign-up.
            <span className={css.subLong}> English &amp; Español.</span>
          </p>
          <a href="/p/learningacademy" className={classNames(shared.iosPill, css.ctaDesktop)}>
            Explore Pool Host Academy →
          </a>
        </div>
      </div>

      <div className={css.topics}>
        {ACADEMY_TOPICS.map((t) => (
          <div key={t.label} className={css.topic}>
            <span className={css.topicLabel}>{t.label}</span>
            <span className={css.topicText}>
              <span className={css.topicLong}>{t.text}</span>
              <span className={css.topicShort}>{t.short}</span>
            </span>
            <span className={css.topicFoot}>5-minute classes · Free</span>
          </div>
        ))}
      </div>

      <a href="/p/learningacademy" className={classNames(shared.iosPill, css.ctaMobile)}>
        Explore Pool Host Academy →
      </a>
    </div>
  </section>
);

export default HomeAcademy;
