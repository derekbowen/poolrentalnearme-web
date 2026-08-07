import React, { useEffect, useState } from 'react';
import { icalGetLink, icalRegenerate } from '../../../../util/api';

/**
 * "Calendar Sync" — shows the host a subscribable iCal feed URL for THIS listing
 * that they can paste into Google Calendar, Apple Calendar, Outlook, or a CRM
 * (GoHighLevel). Feature-flagged server-side: if the feed isn't enabled for this
 * host, the API returns { enabled:false } and this section renders nothing.
 *
 * The feed contains only generic "Booked"/"Unavailable" events — no guest data.
 */
const CalendarSyncSection = ({ listingId }) => {
  const [state, setState] = useState({ enabled: null, url: '' });
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!listingId) return undefined;
    icalGetLink({ listingId })
      .then(resp => {
        if (!cancelled) setState({ enabled: !!(resp && resp.enabled), url: (resp && resp.url) || '' });
      })
      .catch(() => {
        if (!cancelled) setState({ enabled: false, url: '' });
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  if (state.enabled !== true || !state.url) return null;

  const copy = () => {
    try {
      navigator.clipboard.writeText(state.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      /* clipboard may be blocked; the field is selectable as a fallback */
    }
  };

  const regenerate = () => {
    if (regenerating) return;
    const ok = window.confirm(
      'Generate a new link? Your current calendar link will stop working and you’ll need to re-paste the new one wherever you use it.'
    );
    if (!ok) return;
    setRegenerating(true);
    icalRegenerate({ listingId })
      .then(resp => {
        if (resp && resp.url) setState(s => ({ ...s, url: resp.url }));
      })
      .catch(() => {})
      .then(() => setRegenerating(false));
  };

  const label = { fontSize: '13px', color: '#64748b', margin: '0 0 12px' };
  const btn = {
    padding: '9px 16px',
    fontSize: '14px',
    fontWeight: 600,
    borderRadius: '8px',
    border: 'none',
    background: 'var(--marketplaceColor, #009ed8)',
    color: '#fff',
    cursor: 'pointer',
  };
  const courseLink = {
    display: 'inline-block',
    margin: '0 0 14px',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--marketplaceColor, #009ed8)',
    textDecoration: 'none',
  };

  return (
    <section style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 4px' }}>
        Export your calendar (to Google, Apple, or Outlook)
      </h3>
      <p style={label}>
        Paste this link into Google Calendar, Apple Calendar, Outlook, or your CRM to see this pool’s
        bookings and blocked time — it refreshes automatically. Only “Booked”/“Unavailable” times are
        shared; no guest details.
      </p>
      <a
        href="https://www.poolrentalnearme.com/p/course/calendar-sync-warfare-preventing-double-bookings?utm_source=host_dashboard&utm_medium=help_link&utm_campaign=feature_course&utm_content=calendar_sync"
        target="_blank"
        rel="noopener noreferrer"
        style={courseLink}
      >
        Learn how: Calendar Sync Warfare →
      </a>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          readOnly
          value={state.url}
          onFocus={e => e.target.select()}
          style={{
            flex: '1 1 320px',
            minWidth: '260px',
            padding: '10px 12px',
            fontSize: '13px',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            background: '#f8fafc',
            color: '#334155',
          }}
        />
        <button type="button" onClick={copy} style={btn}>
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={regenerate}
          disabled={regenerating}
          style={{
            ...btn,
            background: 'transparent',
            color: '#64748b',
            border: '1px solid #cbd5e1',
            opacity: regenerating ? 0.6 : 1,
          }}
        >
          {regenerating ? 'Regenerating…' : 'Regenerate link'}
        </button>
      </div>
    </section>
  );
};

export default CalendarSyncSection;
