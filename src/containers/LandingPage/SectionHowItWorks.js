import React from 'react';
import css from './SectionHowItWorks.module.css';

// PRNM redesign: clean three-step "how it works" replacing the old Console hero's steps.
const STEPS = [
  { icon: '🔍', title: 'Search', text: 'Browse private pools near you and filter by date, size, and amenities.' },
  { icon: '📅', title: 'Book', text: 'Reserve by the hour and pay securely — every booking is insured.' },
  { icon: '🏊', title: 'Swim', text: 'Show up and enjoy your private pool. No membership, no hassle.' },
];

const SectionHowItWorks = props => {
  const { sectionId } = props;
  return (
    <section id={sectionId} className={css.root}>
      <div className={css.inner}>
        <h2 className={css.heading}>How it works</h2>
        <p className={css.sub}>Three easy steps from search to swim.</p>
        <ol className={css.steps}>
          {STEPS.map((s, i) => (
            <li key={s.title} className={css.step}>
              <span className={css.num}>{i + 1}</span>
              <span className={css.icon} aria-hidden="true">
                {s.icon}
              </span>
              <span className={css.stepTitle}>{s.title}</span>
              <span className={css.stepText}>{s.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default SectionHowItWorks;
