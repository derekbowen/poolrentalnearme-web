import React from 'react';
import css from './SectionAcademy.module.css';

// PRNM birthday redesign (c132): Learn with Fred v2 — Fred's real artwork, a speech
// bubble, topic chips and three real course covers linking to their real course pages.
// Fee copy fixed to the 0% host fees promo (the old version still said 10%).
const FRED_IMG = '/fw-assets/fred-BbXWBvj5.png';

const TOPICS = ['📸 Photos', '💵 Pricing & taxes', '🛟 Safety', '🎉 Parties', '💬 Guests', '🤖 AI for hosts'];

const COURSES = [
  {
    cover:
      'https://qbzpjsiahqgyoazjurqy.supabase.co/storage/v1/object/public/course-covers/after-dark-hosting.jpg',
    title: 'After-Dark Hosting: Lights & Night Swims',
    href: '/p/course/after-dark-hosting-lighting-aesthetics-night-swims',
  },
  {
    cover:
      'https://qbzpjsiahqgyoazjurqy.supabase.co/storage/v1/object/public/course-covers/2026-tax-guide.jpg',
    title: '2026 Pool Host Tax Guide: Keep More',
    href: '/p/course/2026-pool-host-tax-guide-keep-more-of-what-you-earn',
  },
  {
    cover:
      'https://qbzpjsiahqgyoazjurqy.supabase.co/storage/v1/object/public/course-covers/backyard-carnivals.jpg',
    title: 'Backyard Carnivals & Themed Mega-Parties',
    href: '/p/course/backyard-carnivals-themed-mega-parties',
  },
];

const SectionAcademy = props => {
  const { sectionId } = props;
  return (
    <section id={sectionId} className={css.root}>
      <div className={css.inner}>
        <div className={css.fredRow}>
          <img className={css.fredImg} src={FRED_IMG} alt="Fred, the Pool Host Academy teacher" />
          <div className={css.bubble}>
            <span className={css.bubbleTail} />
            <p className={css.bubbleHi}>Hi, I&rsquo;m Fred! 👋</p>
            <p className={css.bubbleText}>I teach pool people how to earn more and stress less.</p>
          </div>
        </div>
        <h2 className={css.heading}>
          Learn with Fred — <span className={css.headingAccent}>the only Pool Host Academy on the internet.</span>
        </h2>
        <p className={css.sub}>193 free classes. Five minutes each. Zero homework, all heart.</p>
        <div className={css.chips}>
          {TOPICS.map(t => (
            <span key={t} className={css.chip}>
              {t}
            </span>
          ))}
        </div>
        <div className={css.courses}>
          {COURSES.map(c => (
            <a key={c.title} className={css.course} href={c.href}>
              <img className={css.courseImg} src={c.cover} alt={c.title} />
              <span className={css.courseTitle}>{c.title}</span>
            </a>
          ))}
        </div>
        <a className={css.primaryBtn} href="/p/learningacademy">
          Start class with Fred — free →
        </a>
      </div>
    </section>
  );
};

export default SectionAcademy;
