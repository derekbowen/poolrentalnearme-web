import React, { useState } from 'react';
import classNames from 'classnames';

import { FAQS, IMG, PHONE, SMS_HREF } from '../homeContent';

import shared from '../HomeShared.module.css';
import css from './HomeFaq.module.css';

/**
 * "Questions? Ask." — compact expandable FAQ (answers stay in the DOM for crawlers) plus the
 * founder-led support card: "Stuck on anything? Text Derek."
 */
const HomeFaq = () => {
  const [openIndex, setOpenIndex] = useState(0);

  const derekCard = (
    <div className={css.derek}>
      <div className={css.derekHead}>
        <img
          src={IMG.derek}
          alt="Derek, founder of Pool Rental Near Me"
          className={css.derekPhoto}
          loading="lazy"
        />
        <div>
          <div className={css.derekTitle}>Stuck on anything? Text Derek.</div>
          <div className={css.derekSub}>He founded Pool Rental Near Me and answers himself.</div>
        </div>
      </div>
      <div className={css.derekActions}>
        <a href={SMS_HREF} className={classNames(shared.glassBlue, css.textDerek)}>
          Text Derek
        </a>
        <span className={css.call}>
          or call{' '}
          <a href={PHONE.href} className={css.phone}>
            {PHONE.label}
          </a>{' '}
          · {PHONE.hours}
        </span>
      </div>
    </div>
  );

  return (
    <section className={css.root} id="faq">
      <div className={css.left}>
        <h2 className={css.h2}>Questions? Ask.</h2>
        <div className={css.derekDesktop}>{derekCard}</div>
      </div>
      <div className={css.list}>
        {FAQS.map((f, i) => {
          const open = i === openIndex;
          return (
            <div key={f.q} className={css.item}>
              <button
                type="button"
                className={classNames(shared.buttonReset, css.question)}
                onClick={() => setOpenIndex(open ? -1 : i)}
                aria-expanded={open}
              >
                <span>{f.q}</span>
                <span className={classNames(shared.glassLight, css.icon)} aria-hidden="true">
                  {open ? '–' : '+'}
                </span>
              </button>
              <div className={classNames(css.answer, { [css.answerOpen]: open })}>
                <p className={css.answerText}>{f.a}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className={css.derekMobile}>{derekCard}</div>
    </section>
  );
};

export default HomeFaq;
