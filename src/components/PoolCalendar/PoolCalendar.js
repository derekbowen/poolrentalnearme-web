/**
 * PoolCalendar
 * ────────────
 * Flagship host-management calendar. Replaces the basic WeeklyCalendar in the
 * availability panel with a brag-worthy experience:
 *
 *  • FullCalendar month/list view — the industry-standard, trusted UI
 *  • Color-coded day cells: available (green), blocked (red), AI demand (gold)
 *  • Drag-select to block/unblock date ranges in one gesture
 *  • AI demand overlay — Claude Haiku predicts hot days + suggests price bumps
 *  • iCal sync — paste a Google/Airbnb/VRBO/Apple Calendar URL, we import
 *    blocked dates as availability exceptions automatically
 *  • iCal export — subscribe link for hosts to see their pool in any calendar
 *  • Auto-resync stored URLs on mount — "connects based on stored info"
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';

import css from './PoolCalendar.module.css';

// ── Helpers ──────────────────────────────────────────────────────────────

const toYMD = date => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDateDisplay = dateStr => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getDemandForDate = (demandMap, dateStr) => demandMap[dateStr] || null;

// ── Sub-components ───────────────────────────────────────────────────────

const EventCard = ({ event }) => {
  const { extendedProps } = event;
  if (extendedProps?.type === 'blocked') {
    return (
      <div style={{
        background: 'rgba(201,74,90,0.75)',
        borderRadius: 5,
        padding: '2px 6px',
        fontSize: 11,
        color: '#ffd5d9',
        fontWeight: 600,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        Blocked
      </div>
    );
  }
  if (extendedProps?.type === 'external') {
    return (
      <div style={{
        background: 'rgba(74,144,226,0.65)',
        borderRadius: 5,
        padding: '2px 6px',
        fontSize: 11,
        color: '#d0e8ff',
        fontWeight: 600,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        External
      </div>
    );
  }
  return null;
};

// ── PoolCalendar ─────────────────────────────────────────────────────────

const PoolCalendar = ({
  listing,
  allExceptions = [],
  onAddAvailabilityException,
  onDeleteAvailabilityException,
  config,
}) => {
  const calRef = useRef(null);
  const [view, setView] = useState('dayGridMonth');
  const [showAI, setShowAI] = useState(true);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncUrl, setSyncUrl] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null); // { text, error }
  const [copied, setCopied] = useState(false);
  const [demandMap, setDemandMap] = useState({}); // 'YYYY-MM-DD' → { demand, priceMultiplier, tag, reason }
  const [demandLoading, setDemandLoading] = useState(false);

  // Selection / event popups
  const [selectInfo, setSelectInfo] = useState(null); // { start, end, jsEvent }
  const [eventInfo, setEventInfo] = useState(null);   // { event, jsEvent }

  const listingId = listing?.id?.uuid || listing?.id;
  const listingTitle = listing?.attributes?.title || 'Your Pool';
  const storedUrls = listing?.attributes?.publicData?.externalCalendarUrls || [];
  const exportUrl = listingId
    ? `${window.location.origin}/api/calendar/ical/${listingId}`
    : '';

  // ── Fetch AI demand on mount and when view changes ───────────────────
  const fetchDemand = useCallback(async () => {
    if (!listingId || !showAI) return;
    setDemandLoading(true);
    try {
      const today = toYMD(new Date());
      const to = toYMD(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
      const res = await fetch(`/api/calendar/demand/${listingId}?from=${today}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        const map = {};
        (data.forecast || []).forEach(f => { map[f.date] = f; });
        setDemandMap(map);
      }
    } catch {
      // Silently fail — demand overlay is enhancement, not core
    } finally {
      setDemandLoading(false);
    }
  }, [listingId, showAI]);

  useEffect(() => { fetchDemand(); }, [fetchDemand]);

  // ── Auto-resync stored external calendar URLs on mount ──────────────
  useEffect(() => {
    if (!storedUrls.length || !listingId) return;
    storedUrls.forEach(url => {
      fetch('/api/calendar/ical-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, icalUrl: url }),
      }).catch(() => {});
    });
    // Fire-and-forget: silently resync, user sees results in calendar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Switch FullCalendar view ─────────────────────────────────────────
  const switchView = v => {
    setView(v);
    calRef.current?.getApi().changeView(v);
  };

  // ── Build FullCalendar events from availability exceptions ───────────
  const calendarEvents = allExceptions.map(ex => ({
    id: ex.id,
    start: ex.attributes.start,
    end: ex.attributes.end,
    allDay: false,
    extendedProps: {
      type: ex.attributes.seats === 0 ? 'blocked' : 'available-override',
      exceptionId: ex.id,
    },
  }));

  // ── Day cell class names (demand + blocked overlay) ──────────────────
  const dayCellClassNames = useCallback(
    ({ date }) => {
      const dateStr = toYMD(date);
      const classes = [];

      // Blocked day?
      const isBlocked = allExceptions.some(
        ex =>
          ex.attributes.seats === 0 &&
          new Date(ex.attributes.start) <= date &&
          new Date(ex.attributes.end) > date
      );
      if (isBlocked) classes.push('prnm-blocked');

      // AI demand
      if (showAI) {
        const d = demandMap[dateStr];
        if (d) classes.push(`prnm-demand-${Math.min(10, Math.max(1, Math.round(d.demand)))}`);
      }

      return classes;
    },
    [allExceptions, demandMap, showAI]
  );

  // ── Day cell content (day number + demand badge) ─────────────────────
  const dayCellContent = useCallback(
    ({ date, dayNumberText }) => {
      const dateStr = toYMD(date);
      const d = showAI ? demandMap[dateStr] : null;
      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
          <span style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 15,
            color: 'rgba(247,241,223,0.65)',
            padding: '3px 2px',
          }}>
            {dayNumberText}
          </span>
          {d && d.demand >= 7 && (
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: d.demand >= 9 ? '#e6c55a' : '#b89530',
              background: 'rgba(212,175,55,0.14)',
              borderRadius: 4,
              padding: '2px 5px',
              marginTop: 4,
              textTransform: 'uppercase',
            }}>
              {d.tag === 'holiday-weekend' ? 'HOL' : d.tag === 'peak' ? 'PEAK' : '🔥'}
            </span>
          )}
        </div>
      );
    },
    [demandMap, showAI]
  );

  // ── Drag-select to block ─────────────────────────────────────────────
  const handleSelect = useCallback(info => {
    setEventInfo(null);
    setSelectInfo({
      start: info.startStr.split('T')[0],
      end: toYMD(new Date(info.end.getTime() - 1)), // end is exclusive in FC
      startDate: info.start,
      endDate: info.end,
      jsEvent: info.jsEvent,
    });
    info.view.calendar.unselect();
  }, []);

  const handleBlockConfirm = useCallback(async () => {
    if (!selectInfo || !onAddAvailabilityException) return;
    try {
      await onAddAvailabilityException({
        listingId: listing?.id,
        seats: 0,
        start: selectInfo.startDate,
        end: selectInfo.endDate,
      });
    } catch {}
    setSelectInfo(null);
  }, [selectInfo, onAddAvailabilityException, listing]);

  // ── Click event to unblock ───────────────────────────────────────────
  const handleEventClick = useCallback(info => {
    setSelectInfo(null);
    setEventInfo({
      event: info.event,
      jsEvent: info.jsEvent,
    });
  }, []);

  const handleUnblock = useCallback(async () => {
    if (!eventInfo || !onDeleteAvailabilityException) return;
    const exId = eventInfo.event.extendedProps?.exceptionId;
    if (!exId) return;
    try {
      await onDeleteAvailabilityException(exId);
    } catch {}
    setEventInfo(null);
  }, [eventInfo, onDeleteAvailabilityException]);

  // ── iCal import ──────────────────────────────────────────────────────
  const handleSync = useCallback(async (urlToSync) => {
    const url = urlToSync || syncUrl.trim();
    if (!url || !listingId) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/calendar/ical-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, icalUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setSyncMsg({ text: `Synced — ${data.created} blocked period${data.created !== 1 ? 's' : ''} imported.` });
      if (!urlToSync) setSyncUrl('');
    } catch (err) {
      setSyncMsg({ text: err.message, error: true });
    } finally {
      setSyncing(false);
    }
  }, [syncUrl, listingId]);

  // ── Copy export URL ──────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    if (!exportUrl) return;
    navigator.clipboard?.writeText(exportUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [exportUrl]);

  // ── Popup positioning ────────────────────────────────────────────────
  const popupStyle = jsEvent => {
    if (!jsEvent) return {};
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = jsEvent.clientX;
    const y = jsEvent.clientY;
    return {
      top: y + 12 > vh - 200 ? y - 180 : y + 12,
      left: x + 260 > vw ? x - 270 : x + 8,
    };
  };

  return (
    <div className={css.root}>
      {/* ── Header ── */}
      <div className={css.header}>
        <div className={css.headerLeft}>
          <h2 className={css.headerTitle}>Availability</h2>
          <span className={css.headerBadge}>Smart Calendar</span>
        </div>
        <div className={css.headerActions}>
          {/* View toggle */}
          <div className={css.viewToggle}>
            <button
              className={`${css.viewBtn}${view === 'dayGridMonth' ? ` ${css.viewBtnActive}` : ''}`}
              onClick={() => switchView('dayGridMonth')}
            >
              Month
            </button>
            <button
              className={`${css.viewBtn}${view === 'listMonth' ? ` ${css.viewBtnActive}` : ''}`}
              onClick={() => switchView('listMonth')}
            >
              List
            </button>
          </div>

          {/* AI demand toggle */}
          <button
            className={`${css.aiToggle}${showAI ? ` ${css.aiToggleActive}` : ''}`}
            onClick={() => setShowAI(v => !v)}
            title="Toggle AI demand heatmap"
          >
            <span className={css.aiIcon}>✦</span>
            AI Demand
            {demandLoading && <span style={{ opacity: 0.5 }}>…</span>}
          </button>

          {/* Sync */}
          <button
            className={`${css.syncBtn}${syncOpen ? ` ${css.syncBtnOpen}` : ''}`}
            onClick={() => setSyncOpen(v => !v)}
          >
            ⇄ Sync
          </button>
        </div>
      </div>

      {/* ── Sync panel ── */}
      {syncOpen && (
        <div className={css.syncPanel}>
          {/* Import new URL */}
          <div>
            <div className={css.syncLabel}>Import from Google, Airbnb, VRBO, Apple Calendar</div>
            <div className={css.syncRow}>
              <input
                className={css.syncInput}
                type="url"
                placeholder="Paste iCal URL (webcal:// or https://...)"
                value={syncUrl}
                onChange={e => setSyncUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSync()}
              />
              <button
                className={css.syncSubmit}
                onClick={() => handleSync()}
                disabled={syncing || !syncUrl.trim()}
              >
                {syncing ? 'Syncing…' : 'Import'}
              </button>
            </div>
          </div>

          {syncMsg && (
            <div className={`${css.syncFeedback}${syncMsg.error ? ` ${css.syncFeedbackError}` : ''}`}>
              {syncMsg.text}
            </div>
          )}

          {/* Previously stored URLs */}
          {storedUrls.length > 0 && (
            <div className={css.storedUrls}>
              <div className={css.syncLabel}>Connected calendars</div>
              {storedUrls.map((url, i) => (
                <div key={i} className={css.storedUrl}>
                  <span className={css.storedUrlText}>{url}</span>
                  <button
                    className={css.storedUrlResync}
                    onClick={() => handleSync(url)}
                    disabled={syncing}
                  >
                    Re-sync
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Export URL */}
          {exportUrl && (
            <div className={css.exportRow}>
              <span className={css.exportLabel}>Your feed URL:</span>
              <span className={css.exportUrl}>{exportUrl}</span>
              <button className={css.copyBtn} onClick={handleCopy}>
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Legend ── */}
      <div className={css.legend}>
        <div className={css.legendItem}>
          <span className={`${css.legendDot} ${css.legendBlocked}`} /> Blocked
        </div>
        {showAI && (
          <div className={css.legendItem}>
            <span className={`${css.legendDot} ${css.legendDemand}`} /> High demand (AI)
          </div>
        )}
        {storedUrls.length > 0 && (
          <div className={css.legendItem}>
            <span className={`${css.legendDot} ${css.legendExternal}`} /> External sync
          </div>
        )}
        <div className={css.legendItem} style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(247,241,223,0.3)' }}>
          Drag to block · Click to unblock
        </div>
      </div>

      {/* ── Calendar ── */}
      <div className={css.calendarWrap}>
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, interactionPlugin, listPlugin]}
          initialView={view}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '',
          }}
          height="auto"
          selectable={true}
          selectMirror={true}
          unselectAuto={true}
          events={calendarEvents}
          eventContent={renderProps => <EventCard event={renderProps.event} />}
          dayCellClassNames={dayCellClassNames}
          dayCellContent={dayCellContent}
          select={handleSelect}
          eventClick={handleEventClick}
          firstDay={config?.localization?.firstDayOfWeek ?? 0}
          listDayFormat={{ weekday: 'long', month: 'long', day: 'numeric' }}
          listDaySideFormat={false}
          noEventsContent={() => (
            <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(247,241,223,0.3)', fontSize: 13 }}>
              No blocked periods in this range.
            </div>
          )}
        />
      </div>

      {/* ── Selection popup (block confirmation) ── */}
      {selectInfo && (
        <div className={css.selectPopup} style={popupStyle(selectInfo.jsEvent)}>
          <p className={css.selectPopupTitle}>Block these dates?</p>
          <p className={css.selectPopupDates}>
            {formatDateDisplay(selectInfo.start)}
            {selectInfo.start !== selectInfo.end ? ` → ${formatDateDisplay(selectInfo.end)}` : ''}
          </p>
          <div className={css.selectPopupActions}>
            <button className={css.blockBtn} onClick={handleBlockConfirm}>
              Block
            </button>
            <button className={css.cancelPopupBtn} onClick={() => setSelectInfo(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Event popup (unblock) ── */}
      {eventInfo && eventInfo.event.extendedProps?.type === 'blocked' && (
        <div className={css.eventPopup} style={popupStyle(eventInfo.jsEvent)}>
          <p className={css.eventPopupType}>Blocked period</p>
          <p className={css.eventPopupTitle}>
            {formatDateDisplay(toYMD(eventInfo.event.start))}
            {eventInfo.event.end && toYMD(eventInfo.event.end) !== toYMD(eventInfo.event.start)
              ? ` → ${formatDateDisplay(toYMD(new Date(eventInfo.event.end.getTime() - 1)))}`
              : ''}
          </p>
          <button className={css.unblockBtn} onClick={handleUnblock}>
            Unblock these dates
          </button>
          <button className={css.closePopupBtn} onClick={() => setEventInfo(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default PoolCalendar;
