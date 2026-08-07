import React, { useState } from 'react';
import classNames from 'classnames';
import css from './SwimplyCalendar.module.css';

// Swimply-style availability + pricing calendar.
// Per-day data model (one row per customized date), persisted by the panel into
// publicData.availability.dateOverrides[date] = { pricePerHour, variant, open, close, closed }:
//   value: [{ date:'YYYY-MM-DD', price:'75', variant:'Weekend', open:9, close:21, closed:false }]
// Pricing (pricePerHour) is read by server/api-util/lineItems.js and charges correctly today.
// open/close/closed are stored now; enforcement + booked indicators land in later increments.

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayKey = () => { const t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()); };
const hr = h => { const ap = h < 12 ? 'am' : 'pm'; let hh = h % 12; if (hh === 0) hh = 12; return `${hh}${ap}`; };

const SwimplyCalendar = ({ value = [], onChange, basePriceDollars, priceVariants = [], bookedDates = [] }) => {
  const bookedSet = new Set(bookedDates || []);
  const now = new Date();
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [picked, setPicked] = useState({});
  const [bulkDraft, setBulkDraft] = useState({ price: '', variant: '', closed: false });

  const map = {};
  (value || []).forEach(r => { if (r && r.date) map[r.date] = r; });

  const commit = next => onChange((next || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)));
  const upsert = row => {
    const others = (value || []).filter(r => r && r.date !== row.date);
    commit([...others, row]);
  };
  const removeDate = date => commit((value || []).filter(r => r && r.date !== date));

  const exitBulk = () => { setPicked({}); setBulkMode(false); setBulkDraft({ price: '', variant: '', closed: false }); };
  const onDayClick = date => {
    if (bulkMode) {
      setPicked(p => { const n = { ...p }; if (n[date]) delete n[date]; else n[date] = true; return n; });
    } else {
      openDay(date);
    }
  };
  const applyBulk = () => {
    const dates = Object.keys(picked);
    if (!dates.length) return;
    const others = (value || []).filter(r => r && !picked[r.date]);
    const added = dates.map(date => {
      const ex = map[date] || {};
      const priceStr = bulkDraft.price !== '' ? String(Math.round(parseFloat(bulkDraft.price))) : (ex.price || '');
      return {
        date,
        price: bulkDraft.closed ? '' : priceStr,
        variant: bulkDraft.closed ? '' : (bulkDraft.variant || ex.variant || ''),
        open: Number.isInteger(ex.open) ? ex.open : 9,
        close: Number.isInteger(ex.close) ? ex.close : 21,
        closed: !!bulkDraft.closed,
      };
    });
    commit([...others, ...added]);
    exitBulk();
  };

  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const today = todayKey();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const openDay = date => {
    const r = map[date] || {};
    setSel(date);
    setDraft({
      price: r.price != null ? String(r.price) : '',
      variant: r.variant || '',
      open: Number.isInteger(r.open) ? r.open : 9,
      close: Number.isInteger(r.close) ? r.close : 21,
      closed: !!r.closed,
      rateOn: r.price != null || !!r.variant,
      // Interior blocked hour ranges, e.g. [[20,21]] = block 8pm–9pm while the
      // rest of the day stays open. Distinct from open/close (which trims the
      // day's edges) and closed (whole day). Applied as seats:0 exceptions.
      blocks: Array.isArray(r.blocks) ? r.blocks.filter(b => Array.isArray(b) && b.length === 2) : [],
      blkStart: 20,
      blkEnd: 21,
    });
  };

  // Normalize + validate a blocked interval within the day, clamped and ordered.
  const addBlock = () => {
    setDraft(d => {
      const s = Math.max(0, Math.min(23, parseInt(d.blkStart, 10)));
      const e = Math.max(1, Math.min(24, parseInt(d.blkEnd, 10)));
      if (!(e > s)) return d;
      const exists = (d.blocks || []).some(b => b[0] === s && b[1] === e);
      if (exists) return d;
      const next = [...(d.blocks || []), [s, e]].sort((a, b) => a[0] - b[0]);
      return { ...d, blocks: next };
    });
  };
  const removeBlock = idx =>
    setDraft(d => ({ ...d, blocks: (d.blocks || []).filter((_, i) => i !== idx) }));

  const saveDay = () => {
    if (!sel || !draft) return;
    const priceNum = draft.rateOn && draft.price !== '' ? Math.round(parseFloat(draft.price)) : null;
    const blocks = draft.closed
      ? []
      : (draft.blocks || []).filter(b => Array.isArray(b) && b.length === 2 && b[1] > b[0]);
    const isDefault =
      !draft.closed &&
      priceNum == null &&
      !draft.variant &&
      draft.open === 9 &&
      draft.close === 21 &&
      blocks.length === 0;
    if (isDefault) {
      removeDate(sel); // back to normal day → drop the override
    } else {
      upsert({
        date: sel,
        price: priceNum != null ? String(priceNum) : '',
        variant: draft.variant || '',
        open: draft.open,
        close: draft.close,
        closed: draft.closed,
        blocks,
      });
    }
    setSel(null);
    setDraft(null);
  };

  const pickVariant = v => {
    const dollars = Math.round((v.priceInSubunits || 0) / 100);
    setDraft(d => ({ ...d, variant: v.name, price: String(dollars), rateOn: true }));
  };

  const prevMonth = () => setView(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const nextMonth = () => setView(v => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));
  const customCount = Object.keys(map).length;

  const cellState = r => {
    if (!r) return 'open';
    if (r.closed) return 'closed';
    if (Array.isArray(r.blocks) && r.blocks.length) return 'custom';
    if (r.variant || (r.price != null && r.price !== '')) return 'custom';
    return 'open';
  };

  return (
    <div className={css.wrap}>
      <div className={css.calendar}>
        <div className={css.header}>
          <button type="button" className={css.nav} onClick={prevMonth} aria-label="Previous month">‹</button>
          <div className={css.monthLabel}>{MONTHS[view.m]} {view.y}</div>
          <button type="button" className={css.nav} onClick={nextMonth} aria-label="Next month">›</button>
        </div>

        <div className={css.toolbar}>
          <button
            type="button"
            className={classNames(css.bulkBtn, { [css.bulkBtnOn]: bulkMode })}
            onClick={() => (bulkMode ? exitBulk() : setBulkMode(true))}
          >
            {bulkMode ? 'Done selecting' : 'Bulk select dates'}
          </button>
          {bulkMode ? (
            <span className={css.bulkHint}>{Object.keys(picked).length} selected — tap days, then set below</span>
          ) : null}
        </div>

        <div className={css.dowRow}>
          {DOW.map(d => <div key={d} className={css.dow}>{d}</div>)}
        </div>

        <div className={css.grid}>
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} className={css.empty} />;
            const date = ymd(view.y, view.m, d);
            const r = map[date];
            const isPast = date < today;
            const isBooked = bookedSet.has(date);
            const stateCls = r && r.closed ? 'closed' : isBooked ? 'booked' : cellState(r);
            return (
              <button
                type="button"
                key={date}
                disabled={isPast}
                onClick={() => onDayClick(date)}
                className={classNames(css.day, css[stateCls], { [css.past]: isPast, [css.selected]: sel === date, [css.picked]: bulkMode && !!picked[date] })}
              >
                <span className={css.dayNum}>{pad(d)}</span>
                {r && r.closed ? (
                  <span className={css.tag}>Closed</span>
                ) : isBooked ? (
                  <span className={css.tag}>Booked ✓</span>
                ) : r && (r.price || r.variant) ? (
                  <span className={css.price}>${r.price || basePriceDollars}/hr</span>
                ) : (
                  <span className={css.priceMuted}>{basePriceDollars ? `$${basePriceDollars}/hr` : ''}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className={css.legend}>
          <span><i className={classNames(css.dot, css.dotOpen)} /> Open</span>
          <span><i className={classNames(css.dot, css.dotCustom)} /> Custom price</span>
          <span><i className={classNames(css.dot, css.dotClosed)} /> Closed</span>
          <span className={css.count}>{customCount} day{customCount === 1 ? '' : 's'} customized</span>
        </div>

        {bulkMode ? (
          <div className={css.bulkBar}>
            <div className={css.bulkBarTitle}>
              Set {Object.keys(picked).length} selected day{Object.keys(picked).length === 1 ? '' : 's'}
            </div>
            <div className={css.rateInputRow}>
              <span>$</span>
              <input
                type="number"
                min="0"
                step="1"
                className={css.rateInput}
                placeholder="rate"
                value={bulkDraft.price}
                disabled={bulkDraft.closed}
                onChange={e => setBulkDraft(b => ({ ...b, price: e.target.value, variant: '' }))}
              />
              <span className={css.perHr}>/ hour</span>
            </div>
            {priceVariants && priceVariants.length ? (
              <div className={css.chips}>
                {priceVariants.map(v => (
                  <button
                    type="button"
                    key={v.name}
                    className={classNames(css.chip, { [css.chipOn]: bulkDraft.variant === v.name })}
                    disabled={bulkDraft.closed}
                    onClick={() =>
                      setBulkDraft(b => ({ ...b, variant: v.name, price: String(Math.round((v.priceInSubunits || 0) / 100)) }))
                    }
                  >
                    {v.name} <span className={css.chipPrice}>${Math.round((v.priceInSubunits || 0) / 100)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <label className={css.bulkClosed}>
              <input
                type="checkbox"
                checked={bulkDraft.closed}
                onChange={e => setBulkDraft(b => ({ ...b, closed: e.target.checked }))}
              />{' '}
              Mark selected as closed
            </label>
            <button type="button" className={css.save} disabled={!Object.keys(picked).length} onClick={applyBulk}>
              Apply to {Object.keys(picked).length} day{Object.keys(picked).length === 1 ? '' : 's'}
            </button>
          </div>
        ) : null}
      </div>

      {sel && draft ? (
        <div className={css.panel}>
          <div className={css.panelHead}>
            <span className={css.panelTitle}>{MONTHS[view.m]} {parseInt(sel.slice(-2), 10)}, {view.y}</span>
            <button type="button" className={css.close} aria-label="Close" onClick={() => { setSel(null); setDraft(null); }}>✕</button>
          </div>

          <label className={css.sliderLabel}>Open · <b>{hr(draft.open)}</b></label>
          <input type="range" min="6" max="22" step="1" value={draft.open}
            onChange={e => setDraft(d => ({ ...d, open: parseInt(e.target.value, 10) }))} className={css.slider} />
          <label className={css.sliderLabel}>Close · <b>{hr(draft.close)}</b></label>
          <input type="range" min="7" max="23" step="1" value={draft.close}
            onChange={e => setDraft(d => ({ ...d, close: parseInt(e.target.value, 10) }))} className={css.slider} />

          {/* Block specific hours inside the day — keep the rest open. */}
          {!draft.closed ? (
            <div className={css.blockSection}>
              <span className={css.rateTitle}>Block specific hours</span>
              <p className={css.blockHint}>Keep the day open but block just an hour or two (e.g. block 8pm, keep 7pm and 9pm).</p>
              {(draft.blocks || []).length ? (
                <div className={css.blockList}>
                  {draft.blocks.map((b, i) => (
                    <span key={`${b[0]}-${b[1]}-${i}`} className={css.blockPill}>
                      {hr(b[0])} – {hr(b[1])}
                      <button type="button" className={css.blockRemove} aria-label="Remove block" onClick={() => removeBlock(i)}>✕</button>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className={css.blockAddRow}>
                <select className={css.blockSelect} value={draft.blkStart}
                  onChange={e => setDraft(d => ({ ...d, blkStart: parseInt(e.target.value, 10) }))}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hr(h)}</option>)}
                </select>
                <span className={css.blockTo}>to</span>
                <select className={css.blockSelect} value={draft.blkEnd}
                  onChange={e => setDraft(d => ({ ...d, blkEnd: parseInt(e.target.value, 10) }))}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h + 1} value={h + 1}>{hr(h + 1)}</option>)}
                </select>
                <button type="button" className={css.blockAdd} onClick={addBlock}>+ Block</button>
              </div>
            </div>
          ) : null}

          <div className={css.rateRow}>
            <span className={css.rateTitle}>Hourly rate</span>
            <label className={css.toggleLabel}>
              <input type="checkbox" checked={draft.rateOn}
                onChange={e => setDraft(d => ({ ...d, rateOn: e.target.checked }))} /> custom
            </label>
          </div>
          {draft.rateOn ? (
            <>
              <div className={css.rateInputRow}>
                <span>$</span>
                <input type="number" min="0" step="1" className={css.rateInput} placeholder={basePriceDollars || 'rate'}
                  value={draft.price} onChange={e => setDraft(d => ({ ...d, price: e.target.value, variant: '' }))} />
                <span className={css.perHr}>/ hour</span>
              </div>
              {priceVariants && priceVariants.length ? (
                <div className={css.chips}>
                  {priceVariants.map(v => (
                    <button type="button" key={v.name}
                      className={classNames(css.chip, { [css.chipOn]: draft.variant === v.name })}
                      onClick={() => pickVariant(v)}>
                      {v.name} <span className={css.chipPrice}>${Math.round((v.priceInSubunits || 0) / 100)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          <div className={css.toggleRow}>
            <span>Mark as closed</span>
            <input type="checkbox" checked={draft.closed}
              onChange={e => setDraft(d => ({ ...d, closed: e.target.checked }))} />
          </div>

          <button type="button" className={css.save} onClick={saveDay}>Save changes</button>
        </div>
      ) : null}
    </div>
  );
};

export default SwimplyCalendar;
