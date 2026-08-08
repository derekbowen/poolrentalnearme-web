import React from 'react';

import css from '../HostOnboardingPage.module.css';

/**
 * Step 1 — "Tell us about your pool".
 *
 * Collects exactly the two fields the existing EditListingDetailsPanel already
 * persists as first-class listing attributes: `title` and `description`. Nothing
 * new is invented here, because the whole point of the redesign is a new UX over
 * the SAME data contract — the app and the web both read these attributes today.
 *
 * The screen is controlled from the page so values survive moving between steps.
 * It does not talk to the SDK itself; persistence is the page's job and is gated
 * separately (see previewAccess.canWritePreviewData).
 *
 * @param {Object} props
 * @param {{title: string, description: string}} props.values current field values
 * @param {Function} props.onChange (patch) => void, merged into the flow's values
 * @param {Function} props.onContinue save this step
 * @param {Function} props.onBack return to the previous screen
 * @param {boolean} [props.readOnly] true when this session has no write path
 * @param {'idle'|'saving'|'saved'|'error'} [props.saveState] outcome of the last save
 */

// Sharetribe stores title as a plain string; the stock wizard caps it so the
// listing card and page heading stay on one or two lines. Matching that cap here
// keeps the preview honest rather than letting a host type something the real
// wizard would reject later.
const TITLE_MAX = 60;
const DESCRIPTION_MIN = 40;

const AboutScreen = (props) => {
  const { values, onChange, onContinue, onBack, readOnly, saveState = 'idle' } = props;
  const title = values?.title || '';
  const description = values?.description || '';

  const saving = saveState === 'saving';
  const titleOk = title.trim().length > 0 && title.length <= TITLE_MAX;
  const descriptionOk = description.trim().length >= DESCRIPTION_MIN;
  const canContinue = titleOk && descriptionOk && !saving;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canContinue) {
      onContinue();
    }
  };

  const buttonLabel = saving ? 'Saving…' : 'Continue';

  return (
    <form className={css.stepForm} onSubmit={handleSubmit} noValidate>
      {readOnly ? (
        <p className={css.previewNotice}>Preview only — nothing you type here is saved yet.</p>
      ) : null}

      {/* Save feedback is announced politely so it reaches a screen reader without
          stealing focus mid-typing. The failure case deliberately keeps every value
          the host typed — the form is never reset and the flow never advances. */}
      <div className={css.saveStatus} role="status" aria-live="polite">
        {saveState === 'saving' ? <span className={css.saving}>Saving…</span> : null}
        {saveState === 'saved' ? <span className={css.saved}>Saved</span> : null}
      </div>

      {saveState === 'error' ? (
        <p className={css.saveError}>We couldn&rsquo;t save your changes. Try again.</p>
      ) : null}

      <div className={css.field}>
        <label className={css.label} htmlFor="onboarding-title">
          What do you call your pool?
        </label>
        <p className={css.hint}>This is the headline guests see on your listing.</p>
        <input
          id="onboarding-title"
          className={css.input}
          type="text"
          value={title}
          maxLength={TITLE_MAX}
          autoComplete="off"
          placeholder="Heated saltwater pool with mountain views"
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <p className={css.counter}>
          {title.length}/{TITLE_MAX}
        </p>
      </div>

      <div className={css.field}>
        <label className={css.label} htmlFor="onboarding-description">
          What should guests know?
        </label>
        <p className={css.hint}>
          Depth, temperature, shade, how private it feels — the things people ask before booking.
        </p>
        <textarea
          id="onboarding-description"
          className={css.textarea}
          value={description}
          rows={6}
          placeholder="Our pool is heated year-round and stays private — the yard is fully fenced with mature trees on three sides."
          onChange={(e) => onChange({ description: e.target.value })}
        />
        <p className={css.counter}>
          {description.trim().length < DESCRIPTION_MIN
            ? `${DESCRIPTION_MIN - description.trim().length} more characters`
            : 'Looks good'}
        </p>
      </div>

      <div className={css.stepActions}>
        <button type="submit" className={css.primaryButton} disabled={!canContinue}>
          {buttonLabel}
        </button>
        <button type="button" className={css.backLink} onClick={onBack}>
          &larr; Back
        </button>
      </div>
    </form>
  );
};

export default AboutScreen;
