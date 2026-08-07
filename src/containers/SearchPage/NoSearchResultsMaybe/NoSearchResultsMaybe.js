import React from 'react';
import { FormattedMessage } from '../../../util/reactIntl';

import css from './NoSearchResultsMaybe.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST_ONBOARD_URL = '/l/draft/00000000-0000-0000-0000-000000000000/new/details';

// Pull the human-readable searched place out of the URL (?address=Sacramento%2C%20CA)
const searchedCity = search => {
  try {
    const a = new URLSearchParams(search || '').get('address');
    return a ? a.trim() : '';
  } catch (e) {
    return '';
  }
};

// Zero-results host-acquisition block: capture the searcher's email + the city
// they wanted (so we know where demand is), invite them to become the first host
// there, and offer a path to browse where pools do exist.
const NoSearchResultsMaybe = props => {
  const { listingsAreLoaded, totalItems, location, resetAll, showCreateListingsLink } = props;
  const hasNoResult = listingsAreLoaded && totalItems === 0;
  const hasSearchParams = location.search?.length > 0;
  const city = searchedCity(location.search);
  const cityLabel = city || 'your area';

  const [email, setEmail] = React.useState('');
  const [done, setDone] = React.useState(false);
  const [err, setErr] = React.useState(false);

  const submit = e => {
    e.preventDefault();
    e.stopPropagation();
    if (!EMAIL_RE.test(email)) {
      setErr(true);
      return;
    }
    setErr(false);
    fetch('/p/waitlist-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, city, source: 'zero_results_search' }),
    })
      .then(() => setDone(true))
      .catch(() => setDone(true));
  };

  if (!hasNoResult) {
    return null;
  }

  return (
    <div className={css.noSearchResults} style={{ textAlign: 'center', padding: '36px 16px', maxWidth: '560px', margin: '0 auto' }}>
      <div style={{ fontSize: '40px', marginBottom: '8px' }} aria-hidden="true">
        🏊
      </div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: '#0b2733' }}>
        No pools in {cityLabel} yet — but you can be the first.
      </div>
      <div style={{ color: '#5a6b73', margin: '8px 0 20px', lineHeight: 1.5 }}>
        We're adding pools every week. Tell us where you're looking and we'll email you the moment
        one opens up near you — or list your own and be the first host in {cityLabel}.
      </div>

      {done ? (
        <div
          style={{
            background: '#e7f6ec',
            color: '#1a7f4b',
            borderRadius: '12px',
            padding: '14px 16px',
            fontWeight: 600,
          }}
        >
          🎉 You're on the list — we'll email you the moment a pool opens up in {cityLabel}.
        </div>
      ) : (
        <form
          onSubmit={submit}
          style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}
        >
          <input
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            aria-label="Email address"
            style={{
              flex: '1 1 220px',
              minWidth: '200px',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid #c6d2d6',
              fontSize: '15px',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '12px 20px',
              borderRadius: '10px',
              border: 'none',
              background: '#0b6bcb',
              color: '#fff',
              fontWeight: 700,
              fontSize: '15px',
              cursor: 'pointer',
            }}
          >
            Notify me
          </button>
        </form>
      )}
      {err ? (
        <div style={{ color: '#b4232a', marginTop: '8px', fontSize: '14px' }}>
          Please enter a valid email.
        </div>
      ) : null}

      <div style={{ marginTop: '22px', display: 'flex', gap: '18px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <a
          href={HOST_ONBOARD_URL}
          style={{ color: '#0b6bcb', fontWeight: 600, textDecoration: 'none' }}
        >
          Become the first host in {cityLabel} →
        </a>
        {hasSearchParams ? (
          <button
            type="button"
            onClick={e => resetAll(e)}
            style={{
              background: 'none',
              border: 'none',
              color: '#5a6b73',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              fontSize: '15px',
            }}
          >
            <FormattedMessage id="SearchPage.resetAllFilters" />
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default NoSearchResultsMaybe;
