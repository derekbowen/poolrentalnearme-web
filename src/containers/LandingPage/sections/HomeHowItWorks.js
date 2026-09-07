import React from 'react';
import classNames from 'classnames';

import { NOTES, SWIMPARK } from '../homeContent';

import shared from '../HomeShared.module.css';
import css from './HomeHowItWorks.module.css';

const DAYS = [
  ['Thu', '10'],
  ['Fri', '11'],
  ['Sat', '12'],
  ['Sun', '13'],
  ['Mon', '14'],
];
const SLOTS = ['10 am – 1 pm', '1 – 4 pm', '4 – 7 pm'];

/**
 * "Find it. Pick your hours. Jump in." — three real product moments built on The Swimpark's
 * $125/hr rate and its 3-hour weekend minimum (3 × $143.75 all-in = $431.25), followed by the
 * Love notes.
 */
const HomeHowItWorks = () => (
  <section className={css.root} id="how">
    <div className={css.head}>
      <h2 className={classNames(shared.h2, css.h2)}>Find it. Pick your hours. Jump in.</h2>
      <a href="/p/how-it-works" className={css.howLink}>
        How it works →
      </a>
    </div>

    <div className={css.steps}>
      {/* 01 Find it */}
      <div className={css.card}>
        <div className={css.mock}>
          <div className={css.mockSearch}>
            <span>Bothell, WA</span>
            <span className={css.mockSearchBtn}>
              <span className={css.mockSearchRing} />
            </span>
          </div>
          <div className={css.mockResult}>
            <img src={SWIMPARK.img} alt="" className={css.mockThumb} loading="lazy" />
            <div className={css.mockResultMain}>
              <div className={css.mockResultName}>{SWIMPARK.name}</div>
              <div className={css.mockResultMeta}>85° heated · Fits 50</div>
            </div>
            <div className={css.mockResultPrice}>
              {SWIMPARK.guestRate}
              <span className={css.mockResultUnit}>/hr</span>
            </div>
          </div>
          <div className={css.mockChips}>
            <span className={css.mockChip}>Heated</span>
            <span className={css.mockChip}>Diving board</span>
            <span className={css.mockChip}>Mountain views</span>
          </div>
        </div>
        <div className={css.stepHead}>
          <span className={css.stepNum}>01</span>
          <h3 className={css.stepTitle}>Find it</h3>
        </div>
        <p className={css.stepText}>Search your city. Real backyards, hourly rates.</p>
      </div>

      {/* 02 Pick your hours */}
      <div className={css.card}>
        <div className={css.mock}>
          <div className={css.mockDays}>
            {DAYS.map(([d, n]) => (
              <div
                key={d}
                className={classNames(css.mockDay, { [css.mockDayActive]: d === 'Sat' })}
              >
                <div className={css.mockDayName}>{d}</div>
                <div className={css.mockDayNum}>{n}</div>
              </div>
            ))}
          </div>
          <div className={css.mockSlots}>
            {SLOTS.map((s) => (
              <div
                key={s}
                className={classNames(css.mockSlot, { [css.mockSlotActive]: s === '1 – 4 pm' })}
              >
                <span className={css.slotLong}>{s}</span>
                <span className={css.slotShort}>
                  {s.replace(' am – 1 pm', ' – 1').replace('4 – 7 pm', '4 – 7')}
                </span>
              </div>
            ))}
          </div>
          <div className={css.mockTotal}>
            <span>Sat 12 · 1 – 4 pm</span>
            <span>3 hrs · $431.25</span>
          </div>
        </div>
        <div className={css.stepHead}>
          <span className={css.stepNum}>02</span>
          <h3 className={css.stepTitle}>Pick your hours</h3>
        </div>
        <p className={css.stepText}>
          <span className={css.textLong}>
            Choose a date and a block of hours. All-in total before you pay.
          </span>
          <span className={css.textShort}>A date, a block of hours, the all-in total.</span>
        </p>
      </div>

      {/* 03 Jump in */}
      <div className={css.card}>
        <div className={css.mock}>
          <div className={css.mockConfirmed}>
            <span className={css.mockCheck}>✓</span>
            <div>
              <div className={css.mockConfirmedTitle}>Booking confirmed</div>
              <div className={css.mockConfirmedMeta}>{SWIMPARK.name} · Sat 12 · 1 – 4 pm</div>
            </div>
          </div>
          <div className={css.mockRows}>
            <div className={css.mockRow}>
              <span className={css.mockRowLabel}>Waiver</span>
              <span className={css.mockRowGood}>Signed</span>
            </div>
            <div className={css.mockRow}>
              <span className={css.mockRowLabel}>Host approval</span>
              <span className={css.mockRowGood}>{SWIMPARK.host} approved</span>
            </div>
            <div className={classNames(css.mockRow, css.mockRowDesktop)}>
              <span className={css.mockRowLabel}>Total</span>
              <span className={css.mockRowStrong}>$431.25 · all fees included</span>
            </div>
          </div>
        </div>
        <div className={css.stepHead}>
          <span className={css.stepNum}>03</span>
          <h3 className={css.stepTitle}>Jump in</h3>
        </div>
        <p className={css.stepText}>Sign the waiver, the host approves, the pool is yours.</p>
      </div>
    </div>

    <div className={css.notesHead}>
      <h2 className={css.notesTitle}>Love notes</h2>
      <span className={css.notesSub}>Five hearts is our whole review system.</span>
    </div>
    <div className={classNames(shared.rail, css.notes)}>
      {NOTES.map((n) => (
        <div key={n.name} className={css.note}>
          <div className={css.hearts} aria-label="Five hearts">
            ♥♥♥♥♥
          </div>
          <p className={css.quote}>“{n.quote}”</p>
          <div className={css.author}>
            <span className={css.initial}>{n.name.charAt(0)}</span>
            <div>
              <div className={css.authorName}>{n.name}</div>
              <div className={css.authorWhere}>{n.where}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  </section>
);

export default HomeHowItWorks;
