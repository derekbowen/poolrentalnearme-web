import React, { useState } from 'react';
import { connect } from 'react-redux';

import { Page, LayoutSingleColumn } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import { isScrollingDisabled } from '../../ducks/ui.duck';

const BLUE = '#009ed8';
const BLUE_DARK = '#007eb7';
const NAVY = '#0b2733';

const FOR_EVERYONE = [
  ['👶', 'Kids learning water safety', 'Calm, confidence-building first lessons.'],
  ['🏊', 'Adults finally learning to swim', 'Private, judgment-free, at your own pace.'],
  ['🏅', 'Athletes training privately', 'Refine stroke and technique with no crowds.'],
  ['🧕', 'Culturally modest settings', 'A private pool means a truly private lesson.'],
  ['👨‍👩‍👧', 'Families nearby, flexible times', 'An instructor and a pool close to home.'],
];

const QUOTES = [
  ['Sofia', 'Certified Swim Coach', 'Private backyard pools let beginners learn faster and feel safer.'],
  ['David', 'Former YMCA Director', 'Teaching on PRNM means more attention and better results for my swimmers.'],
];

export const LessonsPageComponent = ({ scrollingDisabled }) => {
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);

  const submit = e => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr(true);
      return;
    }
    setErr(false);
    fetch('/api/notify-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, location: city, source: 'lessons' }),
    })
      .then(() => setDone(true))
      .catch(() => setDone(true));
  };

  return (
    <Page
      title="Private Swim Lessons — Pool Rental Near Me"
      description="Private swim lessons with certified instructors at private pools near you. Join the waitlist for your city."
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 20px 64px', color: NAVY }}>
          {/* HERO */}
          <div
            style={{
              background: `linear-gradient(150deg, ${BLUE}, ${BLUE_DARK})`,
              borderRadius: '18px',
              padding: '48px 32px',
              color: '#fff',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.9, marginBottom: '12px' }}>
              Pool Rental Near Me · Lessons
            </div>
            <div style={{ fontSize: '34px', fontWeight: 700, lineHeight: 1.12, letterSpacing: '-.02em', maxWidth: '520px' }}>
              Private swim lessons, right in your neighborhood.
            </div>
            <div style={{ fontSize: '17px', opacity: 0.92, margin: '14px 0 24px', maxWidth: '500px' }}>
              Certified instructors. Private pools. A calm, safe place to learn — at every age.
            </div>
            <a
              href="#lessons-waitlist"
              style={{ display: 'inline-block', background: '#fff', color: BLUE_DARK, borderRadius: '999px', padding: '14px 30px', fontSize: '16px', fontWeight: 700, textDecoration: 'none' }}
            >
              Join the waitlist
            </a>
            <div style={{ marginTop: '20px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,.15)', borderRadius: '12px', padding: '10px 14px', fontSize: '13px' }}>
              <span aria-hidden="true">🚀</span> Launching with hundreds of certified instructors — your city in 2026
            </div>
          </div>

          {/* FOR EVERYONE */}
          <div style={{ padding: '44px 0 6px' }}>
            <div style={{ fontSize: '26px', fontWeight: 700, textAlign: 'center', letterSpacing: '-.01em' }}>
              Swim lessons that are truly for everyone
            </div>
            <div style={{ marginTop: '22px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '620px', marginLeft: 'auto', marginRight: 'auto' }}>
              {FOR_EVERYONE.map(([icon, title, text]) => (
                <div key={title} style={{ display: 'flex', alignItems: 'center', gap: '16px', background: '#f6fafc', border: '1px solid #e3edf2', borderRadius: '14px', padding: '16px 18px' }}>
                  <span style={{ fontSize: '26px', lineHeight: 1 }} aria-hidden="true">{icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '16px' }}>{title}</div>
                    <div style={{ fontSize: '14px', color: '#4a6573' }}>{text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* INSTRUCTOR QUOTES */}
          <div style={{ padding: '34px 0 6px' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '14px', textAlign: 'center' }}>
              Why local instructors are excited
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', maxWidth: '620px', margin: '0 auto' }}>
              {QUOTES.map(([name, role, quote]) => (
                <div key={name} style={{ background: '#f6fafc', border: '1px solid #e3edf2', borderRadius: '14px', padding: '16px 18px' }}>
                  <div style={{ fontSize: '14px', color: '#4a6573', lineHeight: 1.5 }}>“{quote}”</div>
                  <div style={{ marginTop: '12px', fontWeight: 700, fontSize: '14px' }}>{name}</div>
                  <div style={{ fontSize: '12px', color: '#7a8b93' }}>{role}</div>
                </div>
              ))}
            </div>
          </div>

          {/* WAITLIST */}
          <div id="lessons-waitlist" style={{ marginTop: '36px', background: NAVY, borderRadius: '18px', padding: '34px 28px', color: '#fff' }}>
            {done ? (
              <div style={{ textAlign: 'center', fontSize: '18px', fontWeight: 600 }}>
                🎉 You're on the list — we'll email you the moment lessons open up near you.
              </div>
            ) : (
              <>
                <div style={{ fontSize: '22px', fontWeight: 700 }}>Get notified when lessons launch in your city</div>
                <div style={{ fontSize: '14px', opacity: 0.85, margin: '6px 0 18px' }}>
                  Be first in line when we add instructors near you.
                </div>
                <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <input
                    style={{ flex: '1 1 220px', border: 'none', borderRadius: '10px', padding: '13px 15px', fontSize: '14px', color: NAVY }}
                    type="email"
                    placeholder="you@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    aria-label="Email address"
                  />
                  <input
                    style={{ flex: '1 1 150px', border: 'none', borderRadius: '10px', padding: '13px 15px', fontSize: '14px', color: NAVY }}
                    type="text"
                    placeholder="City, State"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    aria-label="City and state"
                  />
                  <button
                    type="submit"
                    style={{ flex: '0 0 auto', background: BLUE, color: '#fff', border: 'none', borderRadius: '10px', padding: '13px 24px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Notify me
                  </button>
                </form>
                {err ? (
                  <div style={{ marginTop: '10px', fontSize: '13px', background: 'rgba(255,255,255,.9)', color: '#b00020', padding: '6px 10px', borderRadius: '8px', display: 'inline-block' }}>
                    Please enter a valid email.
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({ scrollingDisabled: isScrollingDisabled(state) });

const LessonsPage = connect(mapStateToProps)(LessonsPageComponent);

export default LessonsPage;
