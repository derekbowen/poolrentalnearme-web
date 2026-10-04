import React, { useState } from 'react';

import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import { LayoutComposer, StaticPage } from '../PageBuilder/PageBuilder';

import css from './OperatingCeoPage.module.css';

// Posting text is Derek's (2026-10-04), word for word. The "term" and "who should
// apply" sections were added at his request. Submissions go to
// POST /api/ceo-application, which emails derek@poolrentalnearme.com and texts him.
// Not indexed (SEO changes are frozen); shared by direct link.

const PAGE_TITLE = 'Operating CEO for 2027 | Pool Rental Near Me';
const PAGE_DESCRIPTION =
  'PoolRentalNearMe.com is looking for an Operating CEO for 2027: a successful pool host who can help hundreds of other hosts build their rental businesses.';

const PLATFORMS = ['Pool Rental Near Me', 'Swimply', 'Airbnb / VRBO', 'My own website', 'Other'];
const HOSTING_SINCE = ['Less than 1 year', '1–2 years', '3–5 years', 'More than 5 years'];

const layoutAreas = `
  topbar
  main
  footer
`;

const Field = ({ label, hint, required, children }) => (
  <label className={css.field}>
    <span className={css.label}>
      {label}
      {required ? <span className={css.required}> *</span> : null}
    </span>
    {hint ? <span className={css.hint}>{hint}</span> : null}
    {children}
  </label>
);

const ApplicationForm = () => {
  const [v, setV] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
    platforms: [],
    listingLinks: '',
    hostingSince: '',
    links: '',
    companies: '',
    why: '',
    plan: '',
    website2: '',
  });
  const [state, setState] = useState({ sending: false, done: false, error: null });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const togglePlatform = (p) =>
    setV({
      ...v,
      platforms: v.platforms.includes(p)
        ? v.platforms.filter((x) => x !== p)
        : v.platforms.concat(p),
    });

  const submit = async (e) => {
    e.preventDefault();
    setState({ sending: true, done: false, error: null });
    try {
      const res = await fetch('/api/ceo-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v, platforms: v.platforms.join(', ') }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
      setState({ sending: false, done: true, error: null });
    } catch (err) {
      setState({ sending: false, done: false, error: err.message });
    }
  };

  if (state.done) {
    return (
      <div className={css.success} role="status">
        <h3>Thank you — your application is in.</h3>
        <p>It went straight to Derek. If there’s a fit, you’ll hear back by email at {v.email}.</p>
      </div>
    );
  }

  return (
    <form className={css.form} onSubmit={submit} noValidate={false}>
      <div className={css.row}>
        <Field label="Full name" required>
          <input
            className={css.input}
            value={v.name}
            onChange={set('name')}
            required
            maxLength={120}
            autoComplete="name"
          />
        </Field>
        <Field label="City and state" required>
          <input
            className={css.input}
            value={v.location}
            onChange={set('location')}
            required
            maxLength={120}
            placeholder="Tampa, FL"
          />
        </Field>
      </div>
      <div className={css.row}>
        <Field label="Email" required>
          <input
            className={css.input}
            type="email"
            value={v.email}
            onChange={set('email')}
            required
            maxLength={254}
            autoComplete="email"
          />
        </Field>
        <Field label="Phone" required>
          <input
            className={css.input}
            type="tel"
            value={v.phone}
            onChange={set('phone')}
            required
            maxLength={40}
            autoComplete="tel"
          />
        </Field>
      </div>

      <fieldset className={css.fieldset}>
        <legend className={css.label}>Where do you host today?</legend>
        <div className={css.checks}>
          {PLATFORMS.map((p) => (
            <label key={p} className={css.check}>
              <input
                type="checkbox"
                checked={v.platforms.includes(p)}
                onChange={() => togglePlatform(p)}
              />{' '}
              {p}
            </label>
          ))}
        </div>
      </fieldset>

      <div className={css.row}>
        <Field label="How long have you been hosting?">
          <select className={css.input} value={v.hostingSince} onChange={set('hostingSince')}>
            <option value="">Choose…</option>
            {HOSTING_SINCE.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </Field>
        <Field label="LinkedIn or website">
          <input
            className={css.input}
            value={v.links}
            onChange={set('links')}
            maxLength={500}
            placeholder="https://"
          />
        </Field>
      </div>

      <Field label="Link(s) to your pool listings" hint="Any platform. One per line.">
        <textarea
          className={css.textarea}
          rows={2}
          value={v.listingLinks}
          onChange={set('listingLinks')}
          maxLength={1000}
        />
      </Field>

      <Field label="Companies you’ve built or sold" hint="Optional, but we want to hear about it.">
        <textarea
          className={css.textarea}
          rows={3}
          value={v.companies}
          onChange={set('companies')}
          maxLength={4000}
        />
      </Field>

      <Field
        label="Why should we consider you?"
        hint="Your hosting business, what you’ve learned, and how you’d help other hosts succeed."
        required
      >
        <textarea
          className={css.textarea}
          rows={7}
          value={v.why}
          onChange={set('why')}
          required
          minLength={50}
          maxLength={6000}
        />
      </Field>

      <Field
        label="How would you grow Pool Rental Near Me in 2027?"
        hint="Optional. A rough plan is plenty."
      >
        <textarea
          className={css.textarea}
          rows={5}
          value={v.plan}
          onChange={set('plan')}
          maxLength={6000}
        />
      </Field>

      {/* Honeypot: hidden from people; bots fill it and are ignored. */}
      <div className={css.honeypot} aria-hidden="true">
        <label>
          Leave this empty
          <input tabIndex={-1} autoComplete="off" value={v.website2} onChange={set('website2')} />
        </label>
      </div>

      {state.error ? (
        <p className={css.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <button className={css.submit} type="submit" disabled={state.sending}>
        {state.sending ? 'Sending…' : 'Send my application'}
      </button>
      <p className={css.privacy}>
        Your application goes directly to Derek Bowen, founder. It isn’t shared.
      </p>
    </form>
  );
};

const OperatingCeoPage = () => (
  <StaticPage title={PAGE_TITLE} description={PAGE_DESCRIPTION} shouldIndex={false}>
    <LayoutComposer areas={layoutAreas} className={css.layout}>
      {({ Topbar, Main, Footer }) => (
        <>
          <Topbar as="header">
            <TopbarContainer currentPage="OperatingCeoPage" />
          </Topbar>
          <Main as="main" className={css.main}>
            <article className={css.article}>
              <p className={css.eyebrow}>Now hiring · 2027</p>
              <h1 className={css.title}>Operating CEO for 2027</h1>
              <p className={css.lead}>
                PoolRentalNearMe.com is looking for an Operating CEO for 2027.
              </p>

              <p>
                We’re not looking for a traditional CEO. We’re looking for a successful pool host
                who has built their own rental business and has the time and experience to help
                hundreds of other hosts do the same.
              </p>
              <p>
                You’ll work directly with ownership and our existing technical team. Matthew Ryan
                remains a key part of our infrastructure and product strategy. Matthew has helped
                build hundreds of marketplaces and serves as our experienced marketplace
                advocate—helping us determine what should be built, what shouldn’t, and where we
                should focus.
              </p>
              <p>
                Our technical team continues to expand, including U.S.-based developers and a new
                Pool Rental Near Me iOS app for 2027.
              </p>
              <p>
                We’re also building Founders.click, which takes much of what historically required
                months or years of marketplace development and turns it into reusable
                infrastructure. A founder can connect a marketplace, configure the business, and
                begin generating marketplace pages with AI in roughly 30 minutes. Founders.click is
                currently open to test users but is not yet fully released to the public.
              </p>

              <h2 className={css.h2}>Pool Rental Near Me remains simple:</h2>
              <ul className={css.list}>
                <li>0% host fee</li>
                <li>Guests pay the service fee</li>
                <li>Marketplace insurance</li>
                <li>No monthly host subscription</li>
                <li>Continued technical development</li>
                <li>2027 demand-generation budget</li>
              </ul>

              <p>
                We need someone who understands hosts because they are one. Your job is to operate
                and grow the marketplace while the technical team keeps building the infrastructure
                behind it.
              </p>
              <p>
                Compensation is negotiable and could include a combination of equity/shares and
                booking-based revenue.
              </p>

              <h2 className={css.h2}>2027 is the starting point, not the limit</h2>
              <p>
                One year is the minimum commitment we’re asking for. We’ll re-evaluate together at
                the end of 2027, and for the right person this can become a long-term role.
              </p>

              <h2 className={css.h2}>Who we especially want to hear from</h2>
              <p>
                Pool hosts who have built other successful companies—and maybe sold them—and now
                host on Swimply or another platform are strongly encouraged to apply.
              </p>

              <p className={css.cta}>
                If you’ve built a successful pool-rental business and think you can help other hosts
                build theirs, message me.
              </p>
              <p className={css.signoff}>
                Derek Bowen
                <br />
                Founder, PoolRentalNearMe.com
              </p>

              <section className={css.apply} id="apply">
                <h2 className={css.h2}>Apply</h2>
                <ApplicationForm />
              </section>
            </article>
          </Main>
          <Footer>
            <FooterContainer />
          </Footer>
        </>
      )}
    </LayoutComposer>
  </StaticPage>
);

export default OperatingCeoPage;
