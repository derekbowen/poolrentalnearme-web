import React, { useEffect, useState } from 'react';

import { savePromoCode, deactivatePromoCode, listPromoCodes } from '../../util/api';

import css from './HostDashboardPage.module.css';

// c152: host-managed promo codes. Hosts arriving from other platforms expect to
// create a named code with an amount, a per-guest cap, an expiry and a total
// redemption limit — so that's exactly what this asks for. Everything is
// validated again server-side; this form is just the friendly front door.
const PERCENTS = [5, 10, 15, 20, 25, 30, 40, 50];

const fmtDiscount = c =>
  c.type === 'fixed' ? `$${(c.value / 100).toFixed(2)} off` : `${c.value}% off`;

const fmtExpiry = iso => {
  if (!iso) return 'No expiration';
  try {
    return `Expires ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } catch (e) {
    return 'No expiration';
  }
};

const PromoCodesPanel = ({ pools }) => {
  const firstId = pools && pools.length ? pools[0].id.uuid : null;
  const [listingId, setListingId] = useState(firstId);
  const [codes, setCodes] = useState([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('percent');
  const [percent, setPercent] = useState(10);
  const [dollars, setDollars] = useState('');
  const [perUser, setPerUser] = useState(1);
  const [limit, setLimit] = useState('');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!listingId) return;
    listPromoCodes(listingId)
      .then(r => setCodes(Array.isArray(r?.codes) ? r.codes : []))
      .catch(() => setCodes([]));
  }, [listingId]);

  if (!pools || pools.length === 0) return null;

  const save = async () => {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const r = await savePromoCode({
        listingId,
        code: name,
        type: kind,
        value: kind === 'percent' ? percent : parseFloat(dollars),
        maxPerUser: perUser,
        maxRedemptions: limit ? parseInt(limit, 10) : null,
        expires: expires || null,
      });
      setCodes(Array.isArray(r?.codes) ? r.codes : codes);
      setMsg(`${r?.code?.code || 'Code'} is live — guests can use it right now.`);
      setName(''); setDollars(''); setLimit(''); setExpires(''); setOpen(false);
    } catch (e) {
      setErr(e?.message || 'Could not save that code. Please try again.');
    }
    setBusy(false);
  };

  const turnOff = async code => {
    setErr(null); setMsg(null);
    try {
      const r = await deactivatePromoCode({ listingId, code });
      setCodes(Array.isArray(r?.codes) ? r.codes : codes);
      setMsg(`${code} is turned off.`);
    } catch (e) {
      setErr(e?.message || 'Could not turn that code off.');
    }
  };

  const active = codes.filter(c => c.active !== false);
  const inactive = codes.filter(c => c.active === false);
  const field = { width: '100%', padding: '11px 12px', fontSize: '15px', border: '1px solid #d1d5db', borderRadius: '8px', marginTop: '4px' };
  const lbl = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginTop: '14px' };

  return (
    <section>
      <h2 className={css.sectionTitle}>Your promo codes {'🎟️'}</h2>
      <p className={css.sectionSub}>
        Give guests a discount they can type at checkout. You choose the amount — it comes out of
        your payout, and we still take 0%.
      </p>

      {pools.length > 1 ? (
        <select style={{ ...field, maxWidth: 380 }} value={listingId || ''} onChange={e => setListingId(e.target.value)}>
          {pools.map(p => (
            <option key={p.id.uuid} value={p.id.uuid}>{p.attributes?.title || 'Your pool'}</option>
          ))}
        </select>
      ) : null}

      {msg ? <p style={{ color: '#047857', fontWeight: 600, marginTop: 12 }}>{msg}</p> : null}
      {err ? <p style={{ color: '#b91c1c', fontWeight: 600, marginTop: 12 }}>{err}</p> : null}

      {active.length ? (
        <div style={{ marginTop: 14 }}>
          {active.map(c => (
            <div key={c.code} className={css.card} style={{ padding: '14px 18px', marginBottom: 10 }}>
              <div className={css.rowTitle}>
                <strong>{c.code}</strong>{' '}
                <span style={{ background: '#0ea5e9', color: '#fff', borderRadius: 999, padding: '2px 10px', fontSize: 13 }}>
                  {fmtDiscount(c)}
                </span>
              </div>
              <div className={css.rowMeta}>
                {(c.redeemed || 0)}{c.maxRedemptions ? `/${c.maxRedemptions}` : ''} used · {fmtExpiry(c.expires)}
              </div>
              <div className={css.pillRow} style={{ marginTop: 10 }}>
                <button type="button" className={css.pillQuiet} onClick={() => turnOff(c.code)}>Turn off</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className={css.cardHint} style={{ marginTop: 12 }}>No codes yet. Make one below.</p>
      )}

      {inactive.length ? (
        <p className={css.cardHint} style={{ marginTop: 4 }}>
          Turned off: {inactive.map(c => c.code).join(', ')}
        </p>
      ) : null}

      {!open ? (
        <div className={css.pillRow} style={{ marginTop: 14 }}>
          <button type="button" className={css.pillSolid} onClick={() => setOpen(true)}>Create promo code</button>
        </div>
      ) : (
        <div className={css.card} style={{ padding: '18px 20px', marginTop: 14 }}>
          <strong style={{ fontSize: 17 }}>New promo code</strong>

          <label style={lbl} htmlFor="promo-name">Code name</label>
          <span className={css.cardHint}>All host codes start with &ldquo;H-&rdquo;</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>H-</span>
            <input id="promo-name" style={{ ...field, flex: 1 }} value={name} placeholder="SUMMER10"
              onChange={e => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={20} />
          </div>

          <label style={lbl} htmlFor="promo-kind">Discount amount</label>
          <select id="promo-kind" style={field} value={kind} onChange={e => setKind(e.target.value)}>
            <option value="percent">Percent off</option>
            <option value="fixed">Dollars off</option>
          </select>
          {kind === 'percent' ? (
            <select style={field} value={percent} onChange={e => setPercent(parseInt(e.target.value, 10))}>
              {PERCENTS.map(p => <option key={p} value={p}>{p}% discount</option>)}
            </select>
          ) : (
            <input style={field} type="number" min="1" step="1" placeholder="e.g. 25"
              value={dollars} onChange={e => setDollars(e.target.value)} />
          )}

          <label style={lbl} htmlFor="promo-peruser">Max redemptions per guest</label>
          <input id="promo-peruser" style={field} type="number" min="1" max="100" value={perUser}
            onChange={e => setPerUser(e.target.value)} />

          <label style={lbl} htmlFor="promo-exp">Expiration (optional)</label>
          <input id="promo-exp" style={field} type="date" value={expires} onChange={e => setExpires(e.target.value)} />

          <label style={lbl} htmlFor="promo-limit">Total redemption limit (optional)</label>
          <input id="promo-limit" style={field} type="number" min="1" max="1000" placeholder="Leave blank for unlimited"
            value={limit} onChange={e => setLimit(e.target.value)} />

          <div className={css.pillRow} style={{ marginTop: 18 }}>
            <button type="button" className={css.pillSolid} disabled={busy || !name} onClick={save}>
              {busy ? 'Saving…' : 'Save code'}
            </button>
            <button type="button" className={css.pillQuiet} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
};

export default PromoCodesPanel;
