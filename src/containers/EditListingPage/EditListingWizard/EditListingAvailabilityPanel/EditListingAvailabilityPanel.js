import React, { useState, useEffect } from 'react';
import classNames from 'classnames';

// Import configs and util modules
import Modal from 'components/Modal/Modal';
import { FormattedMessage } from '../../../../util/reactIntl';
import { getDefaultTimeZoneOnBrowser, timestampToDate } from '../../../../util/dates';
import { AVAILABILITY_MULTIPLE_SEATS, LISTING_STATE_DRAFT } from '../../../../util/types';
import { DAY, isFullDay } from '../../../../transactions/transaction';

// Import shared components
import { Button, H3, InlineTextButton, ListingLink } from '../../../../components';

// Import modules from this directory
import EditListingAvailabilityPlanForm from './EditListingAvailabilityPlanForm';
import EditListingAvailabilityExceptionForm from './EditListingAvailabilityExceptionForm';
import WeeklyCalendar from './WeeklyCalendar/WeeklyCalendar';
import SwimplyCalendar from './SwimplyCalendar';
import CalendarSyncSection from './CalendarSyncSection';
import { listingBookedDates, applyCalendarExceptions } from '../../../../util/api';

import css from './EditListingAvailabilityPanel.module.css';

// This is the order of days as JavaScript understands them
// The number returned by "new Date().getDay()" refers to day of week starting from sunday.
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// This is the order of days as JavaScript understands them
// The number returned by "new Date().getDay()" refers to day of week starting from sunday.
const rotateDays = (days, startOfWeek) => {
  return startOfWeek === 0 ? days : days.slice(startOfWeek).concat(days.slice(0, startOfWeek));
};

const defaultTimeZone = () =>
  typeof window !== 'undefined' ? getDefaultTimeZoneOnBrowser() : 'Etc/UTC';

///////////////////////////////////////////////////
// EditListingAvailabilityExceptionPanel - utils //
///////////////////////////////////////////////////

// Create initial entry mapping for form's initial values
const createEntryDayGroups = (entries = {}) => {
  // Collect info about which days are active in the availability plan form:
  let activePlanDays = [];
  return entries.reduce((groupedEntries, entry) => {
    const { startTime, endTime: endHour, dayOfWeek, seats } = entry;
    const dayGroup = groupedEntries[dayOfWeek] || [];
    activePlanDays = activePlanDays.includes(dayOfWeek)
      ? activePlanDays
      : [...activePlanDays, dayOfWeek];
    return {
      ...groupedEntries,
      [dayOfWeek]: [
        ...dayGroup,
        {
          startTime,
          endTime: endHour === '00:00' ? '24:00' : endHour,
          seats,
        },
      ],
      activePlanDays,
    };
  }, {});
};

// Create initial values for the availability plan
const createInitialPlanValues = availabilityPlan => {
  const { timezone, entries } = availabilityPlan || {};
  const tz = timezone || defaultTimeZone();
  return {
    timezone: tz,
    ...createEntryDayGroups(entries),
  };
};

// Create entries from submit values
const createEntriesFromSubmitValues = values =>
  WEEKDAYS.reduce((allEntries, dayOfWeek) => {
    const dayValues = values[dayOfWeek] || [];
    const dayEntries = dayValues.map(dayValue => {
      const { startTime, endTime, seats } = dayValue;
      // Note: This template doesn't support seats yet.
      return startTime && endTime
        ? {
            dayOfWeek,
            seats: seats ?? 1,
            startTime,
            endTime: endTime === '24:00' ? '00:00' : endTime,
          }
        : null;
    });

    return allEntries.concat(dayEntries.filter(e => !!e));
  }, []);

// Create availabilityPlan from submit values
const createAvailabilityPlan = values => ({
  availabilityPlan: {
    type: 'availability-plan/time',
    timezone: values.timezone,
    entries: createEntriesFromSubmitValues(values),
  },
});

//////////////////////////////////
// EditListingAvailabilityPanel //
//////////////////////////////////

/**
 * @typedef {Object} AvailabilityException
 * @property {string} id
 * @property {'availabilityException'} type 'availabilityException'
 * @property {Object} attributes attributes
 * @property {Date} attributes.start The start of availability exception (inclusive)
 * @property {Date} attributes.end The end of availability exception (exclusive)
 * @property {Number} attributes.seats the number of seats available (0 means 'unavailable')
 */
/**
 * @typedef {Object} ExceptionQueryInfo
 * @property {Object|null} fetchExceptionsError
 * @property {boolean} fetchExceptionsInProgress
 */

/**
 * A panel where provider can set availabilityPlan (weekly default schedule)
 * and AvailabilityExceptions.
 * In addition, it combines the set values of both of those and shows a weekly schedule.
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className
 * @param {string?} props.rootClassName
 * @param {Object} props.params pathparams
 * @param {Object?} props.locationSearch parsed search params
 * @param {Object?} props.listing listing entity from API (draft/published/etc.)
 * @param {Array<Object>} props.listingTypes listing type config from asset delivery API
 * @param {boolean} props.disabled
 * @param {boolean} props.ready
 * @param {Object.<string, ExceptionQueryInfo>?} props.monthlyExceptionQueries E.g. '2022-12': { fetchExceptionsError, fetchExceptionsInProgress }
 * @param {Object.<string, ExceptionQueryInfo>?} props.weeklyExceptionQueries E.g. '2022-12-14': { fetchExceptionsError, fetchExceptionsInProgress }
 * @param {Array<AvailabilityException>} props.allExceptions
 * @param {Function} props.onAddAvailabilityException
 * @param {Function} props.onDeleteAvailabilityException
 * @param {Function} props.onFetchExceptions
 * @param {Function} props.onSubmit
 * @param {Function} props.onManageDisableScrolling
 * @param {Function} props.onNextTab
 * @param {string} props.submitButtonText
 * @param {boolean} props.updateInProgress
 * @param {Object} props.errors
 * @param {Object} props.config app config
 * @param {Object} props.routeConfiguration
 * @param {Object} props.history history from React Router
 * @returns {JSX.Element} containing form that allows adding availability exceptions
 */
const EditListingAvailabilityPanel = props => {
  const {
    className,
    rootClassName,
    params,
    locationSearch,
    listing,
    listingTypes,
    monthlyExceptionQueries,
    weeklyExceptionQueries,
    allExceptions = [],
    onAddAvailabilityException,
    onDeleteAvailabilityException,
    disabled,
    ready,
    onFetchExceptions,
    onSubmit,
    onManageDisableScrolling,
    onNextTab,
    submitButtonText,
    updateInProgress,
    errors,
    config,
    routeConfiguration,
    navigate,
  } = props;
  // Hooks
  const [isEditPlanModalOpen, setIsEditPlanModalOpen] = useState(false);
  const [isEditExceptionsModalOpen, setIsEditExceptionsModalOpen] = useState(false);
  const [valuesFromLastSubmit, setValuesFromLastSubmit] = useState(null);

  // Swimply iCal sync state
  const existingIcalUrl = listing?.attributes?.publicData?.swimplyIcalUrl || '';
  const [icalUrl, setIcalUrl] = useState(existingIcalUrl);
  const [icalSaveInProgress, setIcalSaveInProgress] = useState(false);
  const [icalSaveStatus, setIcalSaveStatus] = useState(null); // 'saved' | 'error'
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const handleIcalSave = () => {
    setIcalSaveInProgress(true);
    setIcalSaveStatus(null);
    onSubmit({ publicData: { swimplyIcalUrl: icalUrl.trim() } })
      .then(() => setIcalSaveStatus('saved'))
      .catch(() => setIcalSaveStatus('error'))
      .finally(() => setIcalSaveInProgress(false));
  };

  const handleIcalSync = async () => {
    if (!listing?.id?.uuid) return;
    setSyncInProgress(true);
    setSyncResult(null);
    try {
      const resp = await fetch('/api/sync-ical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ listingId: listing.id.uuid }),
      });
      const body = await resp.json();
      const errCount = Array.isArray(body.errors) ? body.errors.length : 0;
      // A wrong link (a Swimply web page pasted instead of the feed) is a
      // fixable mistake, not a system error — render it as an amber "warning"
      // that points the host at the right link, not a scary red error.
      const wrongLinkReasons = ['wrong_link', 'not_a_feed', 'fetch_failed'];
      if (!body.ok) {
        if (wrongLinkReasons.includes(body.reason)) {
          setSyncResult({
            kind: 'warning',
            text:
              body.error ||
              "That link didn't work — double-check it's your Swimply calendar feed link (it starts with admin.us.swimply.com).",
          });
        } else {
          setSyncResult({ kind: 'error', text: `Error: ${body.error}` });
        }
      } else if (body.blocked > 0) {
        const b = body.blockedBookings || 0;
        const also = (body.alreadyBookings || 0) > 0 ? ` (plus ${body.alreadyBookings} already synced)` : '';
        const notes = [];
        if (errCount > 0) notes.push(`${errCount} couldn't be imported — please try Sync again`);
        if ((body.skipped || 0) > 0) notes.push(`large feed: run Sync again to import the remaining ${body.skipped}`);
        const tail = notes.length > 0 ? ` — ${notes.join('; ')}` : '';
        setSyncResult({
          kind: 'success',
          text:
            (b > 0
              ? `${b} booking${b === 1 ? '' : 's'} imported and blocked on your calendar ✅${also}`
              : `${body.blocked} time block${body.blocked === 1 ? '' : 's'} imported and blocked on your calendar ✅${also}`) + tail,
        });
      } else if (errCount > 0) {
        // Nothing was created and at least one create failed — never render this
        // as a healthy state, even if some blocks were already in place.
        const inPlace =
          (body.alreadyBlocked || 0) > 0
            ? ` (${body.alreadyBlocked} time block${body.alreadyBlocked === 1 ? '' : 's'} already in place)`
            : '';
        setSyncResult({
          kind: 'error',
          text: `Error: ${errCount} time block${errCount === 1 ? '' : 's'} couldn't be imported${inPlace}. Please try Sync again — if it keeps happening, text us and we'll fix it.`,
        });
      } else if ((body.alreadyBlocked || 0) > 0) {
        const a = body.alreadyBookings || 0;
        const more = (body.skipped || 0) > 0 ? ` Large feed: run Sync again to import the remaining ${body.skipped}.` : '';
        setSyncResult({
          kind: 'success',
          text:
            (a > 0
              ? `Your calendar is already up to date — ${a} booking${a === 1 ? '' : 's'} already synced.`
              : `Your calendar is already up to date — ${body.alreadyBlocked} time block${body.alreadyBlocked === 1 ? '' : 's'} already synced.`) + more,
        });
      } else if ((body.feedEvents || 0) > 0) {
        // Feed has events, just none upcoming — don't blame publishing lag.
        setSyncResult({
          kind: 'success',
          text: 'Your Swimply calendar is connected, but it has no upcoming bookings in the next 12 months — nothing new to import.',
        });
      } else {
        setSyncResult({
          kind: 'success',
          text: "We found your calendar but no bookings in it yet — Swimply can take a little while to publish new bookings to its feed. We'll re-check your calendar automatically every few hours.",
        });
      }
    } catch (e) {
      setSyncResult({ kind: 'error', text: `Error: ${e.message}` });
    } finally {
      setSyncInProgress(false);
    }
  };

  // ── Swimply-style per-day calendar (pricing + variant + hours + closed) ──
  // Stored in publicData.availability.dateOverrides[date] =
  //   { pricePerHour:<subunits>, variant, open, close, closed }.
  // pricePerHour is read by server/api-util/lineItems.js and charges correctly.
  const existingAvailabilityPd = listing?.attributes?.publicData?.availability || {};
  const existingDateOverrides = existingAvailabilityPd.dateOverrides || {};
  const calRows = Object.keys(existingDateOverrides)
    .sort()
    .map(date => {
      const o = existingDateOverrides[date] || {};
      return {
        date,
        price: Number.isInteger(o.pricePerHour) ? String(Math.round(o.pricePerHour / 100)) : '',
        variant: o.variant || '',
        open: Number.isInteger(o.open) ? o.open : 9,
        close: Number.isInteger(o.close) ? o.close : 21,
        closed: !!o.closed,
      };
    });
  const [calValue, setCalValue] = useState(calRows);
  const [bookedDates, setBookedDates] = useState([]);
  const [calSaveStatus, setCalSaveStatus] = useState(null);
  const [calSaveInProgress, setCalSaveInProgress] = useState(false);
  // Bulk range editor (named customer: Molly — she stalled thinking she had to
  // set each summer day one by one). Drives the same dateOverrides the calendar
  // grid renders, then reuses applyCalendarExceptions for enforcement.
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [rangeDow, setRangeDow] = useState('all'); // 'all' | 'weekdays' | 'weekends'
  const [rangeInProgress, setRangeInProgress] = useState(false);
  const [rangeResult, setRangeResult] = useState(null);
  const basePriceDollars = listing?.attributes?.price?.amount
    ? Math.round(listing.attributes.price.amount / 100)
    : null;
  const priceVariants = listing?.attributes?.publicData?.priceVariants || [];

  useEffect(() => {
    const lid = listing?.id?.uuid;
    if (!lid) return undefined;
    let cancelled = false;
    listingBookedDates({ listingId: lid })
      .then(resp => {
        if (!cancelled && resp && Array.isArray(resp.dates)) setBookedDates(resp.dates);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [listing?.id?.uuid]);

  const handleCalSave = () => {
    setCalSaveInProgress(true);
    setCalSaveStatus(null);
    const dov = {};
    (calValue || []).forEach(r => {
      if (!r || !r.date) return;
      const o = { ...(existingDateOverrides[r.date] || {}) };
      if (r.price !== '' && r.price != null) {
        const sub = Math.round(parseFloat(r.price) * 100);
        if (Number.isFinite(sub) && sub >= 0) o.pricePerHour = sub;
        else delete o.pricePerHour;
      } else {
        delete o.pricePerHour;
      }
      if (r.variant) o.variant = r.variant; else delete o.variant;
      if (Number.isInteger(r.open)) o.open = r.open; else delete o.open;
      if (Number.isInteger(r.close)) o.close = r.close; else delete o.close;
      if (r.closed) o.closed = true; else delete o.closed;
      dov[r.date] = o;
    });
    onSubmit({ publicData: { availability: { ...existingAvailabilityPd, dateOverrides: dov } } })
      .then(() => applyCalendarExceptions({ listingId: listing?.id?.uuid }).catch(() => null))
      .then(() => setCalSaveStatus('saved'))
      .catch(() => setCalSaveStatus('error'))
      .finally(() => setCalSaveInProgress(false));
  };

  const RANGE_MAX_DAYS = 366;
  const rangeDates = (from, to, dow) => {
    const out = [];
    const [y, m, d] = from.split('-').map(Number);
    const [ey, em, ed] = to.split('-').map(Number);
    const cur = new Date(Date.UTC(y, m - 1, d));
    const end = new Date(Date.UTC(ey, em - 1, ed));
    while (cur <= end) {
      const wd = cur.getUTCDay(); // 0 Sun .. 6 Sat
      const ok = dow === 'weekdays' ? wd >= 1 && wd <= 5 : dow === 'weekends' ? wd === 0 || wd === 6 : true;
      if (ok) out.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
  };
  const applyRange = (action, from, to, dow, restoreMap) => {
    const isUndo = !!restoreMap;
    const lid = listing?.id?.uuid;
    if (!lid) return;
    if (!from || !to) { setRangeResult({ error: 'Pick a start and end date.' }); return; }
    if (to < from) { setRangeResult({ error: 'End date must be on or after the start date.' }); return; }
    const dates = rangeDates(from, to, dow);
    if (dates.length === 0) { setRangeResult({ error: 'No matching days in that range.' }); return; }
    if (dates.length > RANGE_MAX_DAYS) { setRangeResult({ error: `That is ${dates.length} days - the most you can change at once is ${RANGE_MAX_DAYS}.` }); return; }
    if (!isUndo && typeof window !== 'undefined') {
      const scope = dow === 'weekdays' ? ' weekday' : dow === 'weekends' ? ' weekend' : '';
      const verb = action === 'block' ? 'Block' : 'Open';
      if (!window.confirm(`${verb} ${dates.length}${scope} day(s) from ${from} to ${to}?`)) return;
    }
    // Merge closed=true/false into the per-day rows (keeps price/variant/hours).
    const byDate = {};
    (calValue || []).forEach(r => { if (r && r.date) byDate[r.date] = { ...r }; });
    // Capture each day's PRIOR closed-state so Undo restores it exactly —
    // never force-open a day the host had already closed.
    const prev = {};
    dates.forEach(dt => { prev[dt] = !!(byDate[dt] && byDate[dt].closed); });
    dates.forEach(dt => {
      const row = byDate[dt] || { date: dt };
      row.closed = isUndo ? !!restoreMap[dt] : action === 'block';
      byDate[dt] = row;
    });
    const merged = Object.keys(byDate).sort().map(dt => byDate[dt]);
    setCalValue(merged);
    setRangeInProgress(true);
    setRangeResult(null);
    const dov = {};
    merged.forEach(r => {
      if (!r || !r.date) return;
      const o = { ...(existingDateOverrides[r.date] || {}) };
      if (r.price !== '' && r.price != null) {
        const sub = Math.round(parseFloat(r.price) * 100);
        if (Number.isFinite(sub) && sub >= 0) o.pricePerHour = sub; else delete o.pricePerHour;
      } else { delete o.pricePerHour; }
      if (r.variant) o.variant = r.variant; else delete o.variant;
      if (Number.isInteger(r.open)) o.open = r.open; else delete o.open;
      if (Number.isInteger(r.close)) o.close = r.close; else delete o.close;
      if (r.closed) o.closed = true; else delete o.closed;
      dov[r.date] = o;
    });
    onSubmit({ publicData: { availability: { ...existingAvailabilityPd, dateOverrides: dov } } })
      .then(() => applyCalendarExceptions({ listingId: lid }).catch(() => null))
      .then(() => {
        setRangeResult(
          isUndo
            ? { ok: true, action: 'undo', count: dates.length }
            : { ok: true, action, count: dates.length, from, to, dow, prev }
        );
        return listingBookedDates({ listingId: lid })
          .then(bd => { if (bd && Array.isArray(bd.dates)) setBookedDates(bd.dates); })
          .catch(() => {});
      })
      .catch(() => setRangeResult({ error: 'Could not save - please try again.' }))
      .finally(() => setRangeInProgress(false));
  };

  const firstDayOfWeek = config.localization.firstDayOfWeek;
  const classes = classNames(rootClassName || css.root, className);
  const listingAttributes = listing?.attributes;
  const { listingType, unitType } = listingAttributes?.publicData || {};
  const listingTypeConfig = listingTypes.find(conf => conf.listingType === listingType);

  const useFullDays = isFullDay(unitType);
  const useMultipleSeats = listingTypeConfig?.availabilityType === AVAILABILITY_MULTIPLE_SEATS;

  const hasAvailabilityPlan = !!listingAttributes?.availabilityPlan;
  // Single-calendar consolidation: the Swimply-style per-day calendar below is the one
  // host-facing availability UI. Hide the stock weekly grid + its add-exception button
  // (SwimplyCalendar handles closing/opening dates as exceptions). The weekly-plan setter
  // button stays so the native availabilityPlan (required for bookability) can still be set.
  const SHOW_STOCK_AVAILABILITY = false;
  const isPublished = listing?.id && listingAttributes?.state !== LISTING_STATE_DRAFT;
  const defaultAvailabilityPlan = {
    type: 'availability-plan/time',
    timezone: defaultTimeZone(),
    entries: [
      // { dayOfWeek: 'mon', startTime: '09:00', endTime: '17:00', seats: 1 },
      // { dayOfWeek: 'tue', startTime: '09:00', endTime: '17:00', seats: 1 },
      // { dayOfWeek: 'wed', startTime: '09:00', endTime: '17:00', seats: 1 },
      // { dayOfWeek: 'thu', startTime: '09:00', endTime: '17:00', seats: 1 },
      // { dayOfWeek: 'fri', startTime: '09:00', endTime: '17:00', seats: 1 },
      // { dayOfWeek: 'sat', startTime: '09:00', endTime: '17:00', seats: 1 },
      // { dayOfWeek: 'sun', startTime: '09:00', endTime: '17:00', seats: 1 },
    ],
  };
  const availabilityPlan = listingAttributes?.availabilityPlan || defaultAvailabilityPlan;
  const initialPlanValues = valuesFromLastSubmit
    ? valuesFromLastSubmit
    : createInitialPlanValues(availabilityPlan);

  const handlePlanSubmit = values => {
    setValuesFromLastSubmit(values);

    // Final Form can wait for Promises to return.
    return onSubmit(createAvailabilityPlan(values))
      .then(() => {
        setIsEditPlanModalOpen(false);
      })
      .catch(e => {
        // Don't close modal if there was an error
      });
  };

  const sortedAvailabilityExceptions = allExceptions;

  // Save exception click handler
  const saveException = values => {
    const { availability, exceptionStartTime, exceptionEndTime, exceptionRange, seats } = values;

    const seatCount = seats != null ? seats : availability === 'available' ? 1 : 0;

    // Exception date/time range is given through FieldDateRangeInput or
    // separate time fields.
    const range = useFullDays
      ? {
          start: exceptionRange?.startDate,
          end: exceptionRange?.endDate,
        }
      : {
          start: timestampToDate(exceptionStartTime),
          end: timestampToDate(exceptionEndTime),
        };

    const params = {
      listingId: listing.id,
      seats: seatCount,
      ...range,
    };

    return onAddAvailabilityException(params)
      .then(() => {
        setIsEditExceptionsModalOpen(false);
      })
      .catch(e => {
        // Don't close modal if there was an error
      });
  };

  return (
    <main className={classes}>
      <H3 as="h1" className={css.heading}>
        {isPublished ? (
          <FormattedMessage
            id="EditListingAvailabilityPanel.title"
            values={{ listingTitle: <ListingLink listing={listing} />, lineBreak: <br /> }}
          />
        ) : (
          <FormattedMessage
            id="EditListingAvailabilityPanel.createListingTitle"
            values={{ lineBreak: <br /> }}
          />
        )}
      </H3>

      <div
        style={{
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '8px',
          padding: '12px 16px',
          margin: '0 0 16px',
          fontSize: '14px',
          lineHeight: 1.5,
          color: '#0c4a6e',
        }}
      >
        <strong>Your calendar defaults to available — only block the days you can’t host.</strong>
        <br />
        You don’t need to set each day one by one. Every day stays open for bookings until you block it.
      </div>

      <div style={{ margin: '0 0 18px', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#f8fafc' }}>
        <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a', marginBottom: '4px' }}>
          Block or open a range of dates
        </div>
        <div style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
          Going away, or only hosting on weekends? Set a start and end date and update them all at once - no need to click day by day.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <label style={{ fontSize: '12px', color: '#475569' }}>From
            <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} style={{ display: 'block', marginTop: 4, padding: '8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14 }} />
          </label>
          <label style={{ fontSize: '12px', color: '#475569' }}>To
            <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} style={{ display: 'block', marginTop: 4, padding: '8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14 }} />
          </label>
          <label style={{ fontSize: '12px', color: '#475569' }}>Days
            <select value={rangeDow} onChange={e => setRangeDow(e.target.value)} style={{ display: 'block', marginTop: 4, padding: '8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, background: '#fff' }}>
              <option value="all">All days</option>
              <option value="weekdays">Weekdays only</option>
              <option value="weekends">Weekends only</option>
            </select>
          </label>
          <button type="button" disabled={rangeInProgress} onClick={() => applyRange('block', rangeFrom, rangeTo, rangeDow, false)} style={{ padding: '9px 16px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', background: 'var(--colorPrimaryButton, #009ed8)', color: '#fff', cursor: 'pointer', opacity: rangeInProgress ? 0.6 : 1 }}>
            {rangeInProgress ? 'Working...' : 'Block these dates'}
          </button>
          <button type="button" disabled={rangeInProgress} onClick={() => applyRange('open', rangeFrom, rangeTo, rangeDow, false)} style={{ padding: '9px 16px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', cursor: 'pointer', opacity: rangeInProgress ? 0.6 : 1 }}>
            Open these dates
          </button>
        </div>
        {rangeResult && rangeResult.error ? (
          <div style={{ marginTop: 10, fontSize: 13, color: '#dc2626' }}>{rangeResult.error}</div>
        ) : null}
        {rangeResult && rangeResult.ok ? (
          <div style={{ marginTop: 10, fontSize: 13, color: '#065f46' }}>
            {rangeResult.action === 'undo'
              ? `Reverted ${rangeResult.count} day(s) to how they were.`
              : `${rangeResult.action === 'block' ? 'Blocked' : 'Opened'} ${rangeResult.count} day(s), ${rangeResult.from} to ${rangeResult.to}.`}
            {rangeResult.prev ? (
              <>
                {' '}
                <button type="button" onClick={() => applyRange(rangeResult.action, rangeResult.from, rangeResult.to, rangeResult.dow, rangeResult.prev)} style={{ background: 'none', border: 'none', color: '#0369a1', textDecoration: 'underline', cursor: 'pointer', fontSize: 13, padding: 0 }}>Undo</button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={css.planInfo}>
        {!hasAvailabilityPlan ? (
          <p>
            <FormattedMessage id="EditListingAvailabilityPanel.availabilityPlanInfo" />
          </p>
        ) : null}

        <InlineTextButton
          className={css.editPlanButton}
          onClick={() => setIsEditPlanModalOpen(true)}
        >
          {hasAvailabilityPlan ? (
            <FormattedMessage id="EditListingAvailabilityPanel.editAvailabilityPlan" />
          ) : (
            <FormattedMessage id="EditListingAvailabilityPanel.setAvailabilityPlan" />
          )}
        </InlineTextButton>
      </div>

      {SHOW_STOCK_AVAILABILITY && hasAvailabilityPlan ? (
        <>
          <WeeklyCalendar
            className={css.section}
            headerClassName={css.sectionHeader}
            listingId={listing.id}
            availabilityPlan={availabilityPlan}
            availabilityExceptions={sortedAvailabilityExceptions}
            weeklyExceptionQueries={weeklyExceptionQueries}
            isDaily={unitType === DAY}
            useFullDays={useFullDays}
            useMultipleSeats={useMultipleSeats}
            onDeleteAvailabilityException={onDeleteAvailabilityException}
            onFetchExceptions={onFetchExceptions}
            params={params}
            locationSearch={locationSearch}
            firstDayOfWeek={firstDayOfWeek}
            routeConfiguration={routeConfiguration}
            navigate={navigate}
          />

          <section className={css.section}>
            <InlineTextButton
              className={css.addExceptionButton}
              onClick={() => setIsEditExceptionsModalOpen(true)}
              disabled={disabled || !hasAvailabilityPlan}
              ready={ready}
            >
              <FormattedMessage id="EditListingAvailabilityPanel.addException" />
            </InlineTextButton>
          </section>
        </>
      ) : null}

      {/* ── Swimply-style per-day pricing + availability calendar ── */}
      <section className={css.section} style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 4px' }}>
          Per-day pricing &amp; availability
        </h3>
        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 12px' }}>
          Tap any date to set a custom hourly price, choose a rate, adjust hours, or close it.
        </p>
        <SwimplyCalendar
          value={calValue}
          onChange={setCalValue}
          basePriceDollars={basePriceDollars}
          priceVariants={priceVariants}
          bookedDates={bookedDates}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
          <button
            type="button"
            onClick={handleCalSave}
            disabled={calSaveInProgress}
            style={{ padding: '11px 26px', fontSize: '15px', fontWeight: '600', borderRadius: '10px', border: 'none', background: 'var(--colorPrimaryButton, #009ed8)', color: '#fff', cursor: 'pointer', opacity: calSaveInProgress ? 0.6 : 1 }}
          >
            {calSaveInProgress ? 'Saving…' : 'Save calendar'}
          </button>
          {calSaveStatus === 'saved' ? (
            <span style={{ color: '#15803d', fontSize: '13px', fontWeight: 600 }}>Saved ✓</span>
          ) : null}
          {calSaveStatus === 'error' ? (
            <span style={{ color: '#b91c1c', fontSize: '13px' }}>Couldn’t save — try again</span>
          ) : null}
        </div>

        {/* ── Block specific hours (surface the enforced hourly exception form) ──
            The per-day calendar above closes/opens whole days; to keep most of a
            day open but block a single hour (e.g. keep 7pm, block 8pm) hosts use
            this. It opens the availability-exception form, which for hourly pools
            shows start/end time pickers and writes a real seats:0 exception that
            the booking engine enforces. */}
        {hasAvailabilityPlan && !useFullDays ? (
          <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px', color: '#111827' }}>
              Block specific hours
            </h4>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 10px' }}>
              Want to keep most of a day open but block just an hour or two (say, keep 7pm but
              block 8pm)? Add a blocked time range here — the rest of the day stays bookable.
            </p>
            <button
              type="button"
              onClick={() => setIsEditExceptionsModalOpen(true)}
              disabled={disabled}
              style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, borderRadius: '10px', border: '1px solid var(--marketplaceColor, #009ed8)', background: '#fff', color: 'var(--marketplaceColorDark, #007eb7)', cursor: disabled ? 'not-allowed' : 'pointer' }}
            >
              + Block specific hours
            </button>
          </div>
        ) : null}
      </section>

      {/* ── Calendar Sync: subscribable iCal export feed (feature-flagged) ── */}
      <CalendarSyncSection listingId={listing?.id?.uuid} />

      {/* ── Swimply iCal two-way sync ── */}
      <section className={css.section} style={{ marginTop: '24px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 8px' }}>
          Import your Swimply calendar (block times booked elsewhere)
        </h3>
        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 12px' }}>
          Paste your Swimply calendar <strong>feed link</strong> to block off times you&apos;re already booked on Swimply. Save the URL first, then click &quot;Sync Now&quot;.
        </p>
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', lineHeight: 1.5, margin: '8px 0 12px' }}>
          <strong>Where to find your Swimply calendar feed link:</strong>
          <ol style={{ margin: '6px 0 4px', paddingLeft: '18px' }}>
            <li>Log in at <strong>swimply.com in a web browser</strong> (it&apos;s not in the Swimply app)</li>
            <li>Open your pool&apos;s <strong>Calendar</strong>, then find <strong>&quot;Sync to external calendar&quot;</strong> — the iCal / .ics export link</li>
            <li>Copy that link, paste it below, hit Save, then Sync Now</li>
          </ol>
          <p style={{ margin: '10px 0 0' }}>
            <strong>The correct feed link looks like this:</strong>
            <br />
            <code style={{ display: 'inline-block', marginTop: '4px', fontSize: '12px', background: '#e0f2fe', padding: '3px 6px', borderRadius: '4px', wordBreak: 'break-all' }}>
              https://admin.us.swimply.com/v2/api/listings/<em>…</em>/calendar?user[id]=<em>…</em>&amp;signed=<em>…</em>
            </code>
          </p>
          <p style={{ margin: '10px 0 0', color: '#92400e' }}>
            ⚠️ A link like <code>swimply.com/pooldetails/…</code> or <code>swimply.com/calendar/123</code> is your public pool <em>page</em>, not the feed — it won&apos;t import.
          </p>
          <span style={{ display: 'block', marginTop: '10px', color: '#64748b' }}>Note: Swimply updates this feed up to 24 hours behind, so double-check same-day bookings manually. We also re-check your calendar automatically every few hours.</span>
        </div>
        <p style={{ display: 'none' }}>
        </p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input
            type="url"
            placeholder="https://admin.us.swimply.com/v2/api/listings/…/calendar?…&signed=…"
            value={icalUrl}
            onChange={e => { setIcalUrl(e.target.value); setIcalSaveStatus(null); }}
            style={{ flex: 1, padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
          />
          <button
            type="button"
            onClick={handleIcalSave}
            disabled={icalSaveInProgress || !icalUrl.trim()}
            style={{ padding: '8px 16px', fontSize: '13px', fontWeight: '600', borderRadius: '6px', border: 'none', background: 'var(--marketplaceColor, #009ed8)', color: '#fff', cursor: 'pointer', opacity: (icalSaveInProgress || !icalUrl.trim()) ? 0.6 : 1 }}
          >
            {icalSaveInProgress ? 'Saving…' : 'Save URL'}
          </button>
        </div>
        {icalSaveStatus === 'saved' ? (
          <p style={{ fontSize: '12px', color: '#16a34a', margin: '0 0 8px' }}>URL saved!</p>
        ) : icalSaveStatus === 'error' ? (
          <p style={{ fontSize: '12px', color: '#dc2626', margin: '0 0 8px' }}>Save failed — please try again.</p>
        ) : null}
        <button
          type="button"
          onClick={handleIcalSync}
          disabled={syncInProgress || !icalUrl.trim()}
          style={{ padding: '8px 16px', fontSize: '13px', fontWeight: '600', borderRadius: '6px', border: '1px solid var(--marketplaceColor, #009ed8)', background: '#fff', color: 'var(--marketplaceColor, #009ed8)', cursor: 'pointer', opacity: (syncInProgress || !icalUrl.trim()) ? 0.6 : 1 }}
        >
          {syncInProgress ? 'Syncing…' : 'Sync Now'}
        </button>
        {syncResult ? (
          <div
            style={{
              fontSize: '13px',
              lineHeight: 1.5,
              margin: '10px 0 0',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid',
              ...(syncResult.kind === 'warning'
                ? { color: '#92400e', background: '#fffbeb', borderColor: '#fcd34d' }
                : syncResult.kind === 'error'
                ? { color: '#991b1b', background: '#fef2f2', borderColor: '#fca5a5' }
                : { color: '#166534', background: '#f0fdf4', borderColor: '#86efac' }),
            }}
          >
            {syncResult.text}
          </div>
        ) : null}
      </section>

      {errors.showListingsError ? (
        <p className={css.error}>
          <FormattedMessage id="EditListingAvailabilityPanel.showListingFailed" />
        </p>
      ) : null}

      {!isPublished ? (
        <Button
          className={css.goToNextTabButton}
          onClick={onNextTab}
          disabled={!hasAvailabilityPlan}
        >
          {submitButtonText}
        </Button>
      ) : null}

      {onManageDisableScrolling && isEditPlanModalOpen ? (
        <Modal
          id="EditAvailabilityPlan"
          isOpen={isEditPlanModalOpen}
          onClose={() => setIsEditPlanModalOpen(false)}
          onManageDisableScrolling={onManageDisableScrolling}
          containerClassName={css.modalContainer}
          usePortal
        >
          <EditListingAvailabilityPlanForm
            formId="EditListingAvailabilityPlanForm"
            listingTitle={listingAttributes?.title}
            availabilityPlan={availabilityPlan}
            weekdays={rotateDays(WEEKDAYS, firstDayOfWeek)}
            onSubmit={handlePlanSubmit}
            initialValues={initialPlanValues}
            inProgress={updateInProgress}
            fetchErrors={errors}
            useFullDays={useFullDays}
            useMultipleSeats={useMultipleSeats}
            unitType={unitType}
          />
        </Modal>
      ) : null}

      {onManageDisableScrolling && isEditExceptionsModalOpen ? (
        <Modal
          id="EditAvailabilityExceptions"
          isOpen={isEditExceptionsModalOpen}
          onClose={() => setIsEditExceptionsModalOpen(false)}
          onManageDisableScrolling={onManageDisableScrolling}
          containerClassName={css.modalContainer}
          usePortal
        >
          <EditListingAvailabilityExceptionForm
            formId="EditListingAvailabilityExceptionForm"
            listingId={listing.id}
            allExceptions={allExceptions}
            monthlyExceptionQueries={monthlyExceptionQueries}
            fetchErrors={errors}
            onFetchExceptions={onFetchExceptions}
            onSubmit={saveException}
            timeZone={availabilityPlan.timezone}
            unitType={unitType}
            updateInProgress={updateInProgress}
            useFullDays={useFullDays}
            listingTypeConfig={listingTypeConfig}
          />
        </Modal>
      ) : null}
    </main>
  );
};

export default EditListingAvailabilityPanel;
