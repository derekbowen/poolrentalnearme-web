import React, { useRef } from 'react';

import css from '../HostOnboardingPage.module.css';

/**
 * Step 5 — "Show off your pool".
 *
 * Uploads happen immediately on pick, one request per file, and each thumbnail
 * shows its own state. A single failed file therefore costs that file, not the
 * whole batch — which matters because hosts select ten photos at once from a
 * phone on a patchy connection.
 *
 * The first photo is the cover, and it says so: hosts consistently assume the
 * best photo will be chosen for them, and then their listing leads with a shot
 * of a fence.
 *
 * @param {Object} props
 * @param {Array<{key: string, url?: string, status: string}>} props.photos
 * @param {Function} props.onFilesPicked (FileList) => void
 * @param {Function} props.onRemove (key) => void
 * @param {Function} props.onContinue
 * @param {Function} props.onBack
 * @param {'idle'|'saving'|'saved'|'error'} [props.saveState]
 */
const PhotosScreen = (props) => {
  const { photos = [], onFilesPicked, onRemove, onContinue, onBack, saveState = 'idle' } = props;
  const fileRef = useRef(null);

  const saving = saveState === 'saving';
  const ready = photos.filter((p) => p.status === 'done');
  const uploading = photos.some((p) => p.status === 'uploading');
  // One photo is genuinely enough to publish, and saying so removes the most
  // common reason a host stops here: believing they need a full gallery first.
  const canContinue = ready.length > 0 && !uploading && !saving;

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

      <ul className={css.photoGrid}>
        {photos.map((p, i) => (
          <li key={p.key} className={css.photoCell}>
            {p.url ? <img src={p.url} alt="" className={css.photoThumb} /> : null}
            {p.status === 'uploading' ? <span className={css.photoState}>Uploading…</span> : null}
            {p.status === 'error' ? <span className={css.photoStateBad}>Failed</span> : null}
            {i === 0 && p.status === 'done' ? <span className={css.coverBadge}>Cover</span> : null}
            <button
              type="button"
              className={css.photoRemove}
              aria-label="Remove photo"
              onClick={() => onRemove(p.key)}
            >
              &times;
            </button>
          </li>
        ))}

        <li>
          <button
            type="button"
            className={css.photoAdd}
            onClick={() => fileRef.current && fileRef.current.click()}
          >
            + Add photos
          </button>
        </li>
      </ul>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className={css.hiddenFile}
        onChange={(e) => {
          onFilesPicked(e.target.files);
          // Reset so picking the same file again still fires a change event.
          e.target.value = '';
        }}
      />

      <p className={css.hint}>
        One photo is enough to publish. The first one is what guests see first &mdash; lead with the
        whole backyard, not a close-up.
      </p>

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

export default PhotosScreen;
