import React from 'react';

import css from '../HostOnboardingPage.module.css';

/**
 * Shared screen for the two multi-enum steps: features and house rules.
 *
 * Options come from the HOSTED listing-field config, never a hardcoded list.
 * If an option is added or renamed in Console, this screen follows it — and,
 * just as importantly, it can never offer a value the marketplace doesn't
 * actually accept, which is what makes the saved data valid for the filters and
 * the mobile app without any mapping layer.
 *
 * @param {Object} props
 * @param {Array<{option: string, label: string}>} props.options from config
 * @param {Array<string>} props.selected
 * @param {Function} props.onToggle (optionKey) => void
 * @param {Function} props.onContinue
 * @param {Function} props.onBack
 * @param {string} [props.emptyHint] shown when nothing is picked
 * @param {boolean} [props.required] block Continue until one is picked
 * @param {'idle'|'saving'|'saved'|'error'} [props.saveState]
 */
const MultiSelectScreen = (props) => {
  const {
    options,
    selected = [],
    onToggle,
    onContinue,
    onBack,
    emptyHint,
    required = false,
    saveState = 'idle',
  } = props;

  const saving = saveState === 'saving';
  const canContinue = (!required || selected.length > 0) && !saving;

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

      {options.length === 0 ? (
        <p className={css.placeholderNote}>
          No options are configured for this step yet. Nothing will be saved.
        </p>
      ) : (
        <ul className={css.optionGrid}>
          {options.map((opt) => {
            const isOn = selected.includes(opt.option);
            return (
              <li key={opt.option}>
                {/* A real checkbox, not a styled div: it keeps keyboard and
                    screen-reader behaviour without re-implementing either. */}
                <label className={isOn ? css.optionChipOn : css.optionChip}>
                  <input
                    type="checkbox"
                    className={css.optionInput}
                    checked={isOn}
                    onChange={() => onToggle(opt.option)}
                  />
                  <span>{opt.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {selected.length === 0 && emptyHint ? <p className={css.hint}>{emptyHint}</p> : null}

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

export default MultiSelectScreen;
