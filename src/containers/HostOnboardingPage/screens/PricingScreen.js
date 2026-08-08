import React from 'react';

import css from '../HostOnboardingPage.module.css';

/**
 * Step 6 — "Set your hourly rate".
 *
 * Shows the host BOTH numbers, because the two most damaging pricing surprises
 * on this marketplace are a host thinking our fee comes out of their payout, and
 * a displayed "all-in" price that doesn't match what the guest is charged. So:
 * they type what they keep, and we show what the guest pays right underneath,
 * computed with the same 15% used at checkout.
 *
 * @param {Object} props
 * @param {string} props.value whole-dollar hourly rate as typed
 * @param {Function} props.onChange
 * @param {number} props.guestFeePercent
 * @param {Function} props.onContinue
 * @param {Function} props.onBack
 * @param {'idle'|'saving'|'saved'|'error'} [props.saveState]
 */
const PricingScreen = (props) => {
  const { value, onChange, guestFeePercent, onContinue, onBack, saveState = 'idle' } = props;

  const saving = saveState === 'saving';
  const dollars = Number(value);
  const valid = Number.isFinite(dollars) && dollars > 0;
  const canContinue = valid && !saving;

  // Rounded to cents the same way the line items are, so the number shown here
  // is the number the guest actually sees at checkout rather than an estimate.
  const guestTotal = valid ? Math.round(dollars * (1 + guestFeePercent / 100) * 100) / 100 : null;

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
        <label className={css.label} htmlFor="onboarding-price">
          What do you want to earn per hour?
        </label>
        <p className={css.hint}>This is what you keep. We don&rsquo;t take a cut of it.</p>
        <div className={css.moneyRow}>
          <span className={css.moneyPrefix}>$</span>
          <input
            id="onboarding-price"
            className={css.moneyInput}
            type="number"
            inputMode="decimal"
            min="1"
            step="1"
            value={value}
            placeholder="75"
            onChange={(e) => onChange(e.target.value)}
          />
          <span className={css.moneySuffix}>/hour</span>
        </div>
      </div>

      {valid ? (
        <div className={css.priceBreakdown}>
          <div className={css.priceRow}>
            <span>You keep</span>
            <strong>${dollars.toFixed(2)}/hr</strong>
          </div>
          <div className={css.priceRow}>
            <span>Guest pays (incl. our {guestFeePercent}% fee)</span>
            <strong>${guestTotal.toFixed(2)}/hr</strong>
          </div>
          <p className={css.priceNote}>
            Our fee is added on top for the guest. It never comes out of your {' '}payout.
          </p>
        </div>
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

export default PricingScreen;
