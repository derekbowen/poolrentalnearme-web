import React from 'react';

import css from '../HostOnboardingPage.module.css';

/**
 * Step 8 — "Ready to go live?".
 *
 * Two jobs. Show the host what they actually built, and be honest about what
 * happens after Publish — specifically that a published listing still cannot be
 * paid out until Stripe is connected. The audit found a host in exactly that
 * state: a guest can reach `requested` with a card saved, and the HOST is then
 * blocked at accept with a 409. Discovering that at the moment of your first
 * booking is the worst possible time.
 *
 * @param {Object} props
 * @param {Object} props.summary
 * @param {Array<string>} props.missing blocking gaps
 * @param {boolean} props.stripeConnected
 * @param {Function} props.onPublish
 * @param {Function} props.onEditStep (stepId) => void
 * @param {Function} props.onBack
 * @param {'idle'|'saving'|'saved'|'error'} [props.saveState]
 */
const ReviewScreen = (props) => {
  const {
    summary,
    missing = [],
    stripeConnected,
    onPublish,
    onEditStep,
    onBack,
    saveState = 'idle',
  } = props;

  const saving = saveState === 'saving';
  const canPublish = missing.length === 0 && !saving;

  const rows = [
    { label: 'Name', value: summary.title, step: 'about' },
    { label: 'Where', value: summary.location, step: 'location' },
    { label: 'Features', value: summary.features, step: 'features' },
    { label: 'House rules', value: summary.rules, step: 'rules' },
    { label: 'Photos', value: summary.photos, step: 'photos' },
    { label: 'Rate', value: summary.price, step: 'pricing' },
    { label: 'Open', value: summary.availability, step: 'availability' },
  ];

  return (
    <div className={css.stepForm}>
      <div className={css.saveStatus} role="status" aria-live="polite">
        {saving ? <span className={css.saving}>Publishing&hellip;</span> : null}
        {saveState === 'saved' ? <span className={css.saved}>Published</span> : null}
      </div>

      {saveState === 'error' ? (
        <p className={css.saveError}>We couldn&rsquo;t publish your listing. Try again.</p>
      ) : null}

      <ul className={css.summaryList}>
        {rows.map((r) => (
          <li key={r.label} className={css.summaryRow}>
            <div>
              <span className={css.summaryLabel}>{r.label}</span>
              <span className={css.summaryValue}>{r.value || <em>Not set</em>}</span>
            </div>
            <button type="button" className={css.summaryEdit} onClick={() => onEditStep(r.step)}>
              Edit
            </button>
          </li>
        ))}
      </ul>

      {missing.length > 0 ? (
        <p className={css.saveError}>Still needed before you can publish: {missing.join(', ')}.</p>
      ) : null}

      {!stripeConnected ? (
        <p className={css.previewNotice}>
          You&rsquo;ll need to connect your bank details through Stripe before you can accept a
          booking. Your listing can go live now &mdash; we&rsquo;ll walk you through payouts next.
        </p>
      ) : null}

      <div className={css.stepActions}>
        <button
          type="button"
          className={css.primaryButton}
          disabled={!canPublish}
          onClick={onPublish}
        >
          {saving ? 'Publishing…' : 'Publish my pool'}
        </button>
        <button type="button" className={css.backLink} onClick={onBack}>
          &larr; Back
        </button>
      </div>
    </div>
  );
};

export default ReviewScreen;
