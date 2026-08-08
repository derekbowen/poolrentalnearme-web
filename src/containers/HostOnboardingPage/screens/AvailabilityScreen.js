import React from 'react';

import css from '../HostOnboardingPage.module.css';

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

// Half-hour marks across a plausible swimming day. 24:00 is the legal way to
// express "midnight at the end of this day" in an availability plan — 00:00
// would mean the start of the day and produce a zero-length window.
const TIMES = (() => {
  const out = [];
  for (let h = 6; h <= 23; h += 1) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    out.push(`${String(h).padStart(2, '0')}:30`);
  }
  out.push('24:00');
  return out;
})();

const pretty = (t) => {
  if (t === '24:00') return 'midnight';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, '0')}${suffix}`;
};

/**
 * Step 7 — "When can guests book?".
 *
 * Deliberately one time range applied to the chosen days, not a per-day grid.
 * Most hosts open the same hours every day they open at all, and the existing
 * wizard's full per-day editor is still there for anyone who needs it. Getting
 * a host to "open" at all matters far more than expressing an unusual schedule.
 *
 * Selecting no days is allowed and means the listing is not bookable yet — the
 * honest state for someone who hasn't decided, and safer than inventing hours.
 *
 * @param {Object} props
 * @param {Array<string>} props.days selected day keys
 * @param {Function} props.onToggleDay
 * @param {string} props.startTime
 * @param {string} props.endTime
 * @param {Function} props.onStartChange
 * @param {Function} props.onEndChange
 * @param {string} props.timezone
 * @param {Function} props.onContinue
 * @param {Function} props.onBack
 * @param {'idle'|'saving'|'saved'|'error'} [props.saveState]
 */
const AvailabilityScreen = (props) => {
  const {
    days = [],
    onToggleDay,
    startTime,
    endTime,
    onStartChange,
    onEndChange,
    timezone,
    onContinue,
    onBack,
    saveState = 'idle',
  } = props;

  const saving = saveState === 'saving';
  const rangeValid = TIMES.indexOf(endTime) > TIMES.indexOf(startTime);
  const canContinue = rangeValid && !saving;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canContinue) {
      onContinue();
    }
  };

  return (
    <form className={css.stepForm} onSubmit={handleSubmit} noValidate>
      <div className={css.saveStatus} role="status" aria-live="polite">
        {saving ? <span className={css.saving}>Saving&hellip;</span> : null}
        {saveState === 'saved' ? <span className={css.saved}>Saved</span> : null}
      </div>

      {saveState === 'error' ? (
        <p className={css.saveError}>We couldn&rsquo;t save your changes. Try again.</p>
      ) : null}

      <div className={css.field}>
        <span className={css.label}>Which days?</span>
        <p className={css.hint}>You can change any of this later.</p>
        <ul className={css.optionGrid}>
          {DAYS.map((d) => {
            const isOn = days.includes(d.key);
            return (
              <li key={d.key}>
                <label className={isOn ? css.optionChipOn : css.optionChip}>
                  <input
                    type="checkbox"
                    className={css.optionInput}
                    checked={isOn}
                    onChange={() => onToggleDay(d.key)}
                  />
                  <span>{d.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={css.field}>
        <span className={css.label}>What hours?</span>
        <div className={css.timeRow}>
          <select
            className={css.select}
            value={startTime}
            aria-label="Opening time"
            onChange={(e) => onStartChange(e.target.value)}
          >
            {TIMES.map((t) => (
              <option key={t} value={t}>
                {pretty(t)}
              </option>
            ))}
          </select>
          <span className={css.timeDash}>to</span>
          <select
            className={css.select}
            value={endTime}
            aria-label="Closing time"
            onChange={(e) => onEndChange(e.target.value)}
          >
            {TIMES.map((t) => (
              <option key={t} value={t}>
                {pretty(t)}
              </option>
            ))}
          </select>
        </div>
        {!rangeValid ? (
          <p className={css.fieldHint}>Closing time needs to be after opening time.</p>
        ) : null}
        <p className={css.hint}>Times are in {timezone || 'your local time zone'}.</p>
      </div>

      {days.length === 0 ? (
        <p className={css.previewNotice}>
          No days selected. Your pool will stay visible but guests won&rsquo;t be able to book it
          until you pick at least one.
        </p>
      ) : null}

      <div className={css.stepActions}>
        <button type="submit" className={css.primaryButton} disabled={!canContinue}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
        <button type="button" className={css.backLink} onClick={onBack}>
          &larr; Back
        </button>
      </div>
    </form>
  );
};

export { DAYS, TIMES };
export default AvailabilityScreen;
