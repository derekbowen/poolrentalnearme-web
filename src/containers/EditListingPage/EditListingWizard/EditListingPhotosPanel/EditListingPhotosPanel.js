import React, { useCallback, useMemo, useState } from 'react';
import classNames from 'classnames';

// Import configs and util modules
import { FormattedMessage } from '../../../../util/reactIntl';
import { LISTING_STATE_DRAFT } from '../../../../util/types';

// Import shared components
import { H3, ListingLink } from '../../../../components';

// Import modules from this directory
import EditListingPhotosForm from './EditListingPhotosForm';
import css from './EditListingPhotosPanel.module.css';

const getInitialValues = (params) => {
  const { images = [] } = params;
  return { images };
};

/**
 * The EditListingPhotosPanel component.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {Object} props.errors - The errors object
 * @param {boolean} props.disabled - Whether the form is disabled
 * @param {boolean} props.ready - Whether the form is ready
 * @param {Array} props.images - The images array
 * @param {propTypes.ownListing} props.listing - The listing object
 * @param {Function} props.onImageUpload - The image upload function
 * @param {string} props.submitButtonText - The submit button text
 * @param {boolean} props.panelUpdated - Whether the panel is updated
 * @param {boolean} props.updateInProgress - Whether the update is in progress
 * @param {Function} props.onSubmit - The submit function
 * @param {Function} props.onRemoveImage - The remove image function
 * @param {Object} props.listingImageConfig - The listing image config
 * @returns {JSX.Element}
 */
const EditListingPhotosPanel = (props) => {
  const {
    className,
    rootClassName,
    errors,
    disabled,
    ready,
    listing,
    onImageUpload,
    submitButtonText,
    panelUpdated,
    updateInProgress,
    onSubmit,
    onRemoveImage,
    listingImageConfig,
    images,
    onAutofill,
  } = props;

  const rootClass = rootClassName || css.root;
  const classes = classNames(rootClass, className);
  const isPublished = listing?.id && listing?.attributes?.state !== LISTING_STATE_DRAFT;

  const handleSubmit = useCallback((values) => {
    const { addImage, ...updateValues } = values;
    onSubmit(updateValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialValues = useMemo(() => getInitialValues({ images }), [images]);

  // Claude autofill: read the host's own photos and draft the whole listing.
  // Writing here (rather than on submit) means every later tab opens pre-filled.
  const [aiState, setAiState] = useState({ status: 'idle', error: null, notes: null });
  const readyImageUrls = (images || [])
    .map(i => i?.attributes?.variants?.['scaled-medium']?.url || i?.attributes?.variants?.default?.url)
    .filter(Boolean);
  const canAutofill = !!onAutofill && readyImageUrls.length > 0 && aiState.status !== 'loading';

  const handleAutofill = useCallback(() => {
    setAiState({ status: 'loading', error: null, notes: null });
    fetch('/api/ai-generate-listing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ imageUrls: readyImageUrls.slice(0, 3) }),
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Could not write your listing.');
        return data.listing;
      })
      .then(l => {
        const publicData = {};
        if (Number.isInteger(l.guestallowed)) publicData.guestallowed = l.guestallowed;
        if (l.poolAmenities?.length) publicData.poolAmenities = l.poolAmenities;
        if (l.vibe?.length) publicData.vibe = l.vibe;
        return onAutofill({ title: l.title, description: l.description, publicData }).then(() =>
          setAiState({ status: 'done', error: null, notes: l.notes || null })
        );
      })
      .catch(e => setAiState({ status: 'idle', error: e.message, notes: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyImageUrls.join('|'), onAutofill]);

  return (
    <div className={classes}>
      <H3 as="h1">
        {isPublished ? (
          <FormattedMessage
            id="EditListingPhotosPanel.title"
            values={{ listingTitle: <ListingLink listing={listing} />, lineBreak: <br /> }}
          />
        ) : (
          <FormattedMessage
            id="EditListingPhotosPanel.createListingTitle"
            values={{ lineBreak: <br /> }}
          />
        )}
      </H3>
      {onAutofill ? (
        <div style={{ margin: '0 0 24px' }}>
          <button
            type="button"
            onClick={handleAutofill}
            disabled={!canAutofill}
            style={{
              display: 'inline-block', padding: '14px 24px', borderRadius: '999px',
              border: 'none', background: canAutofill ? '#0B4A6F' : '#B7C6CF',
              color: '#fff', fontWeight: 700, fontSize: '15px',
              cursor: canAutofill ? 'pointer' : 'default', minHeight: '48px',
            }}
          >
            {aiState.status === 'loading'
              ? 'Reading your photos…'
              : aiState.status === 'done'
              ? 'Rewrite from my photos'
              : 'Write my listing from these photos'}
          </button>
          <div style={{ marginTop: '8px', fontSize: '14px', color: '#4A4A4A', lineHeight: 1.45 }}>
            {readyImageUrls.length === 0
              ? 'Add a photo first, then I can write your title and description for you.'
              : aiState.status === 'done'
              ? "Done — your title and details are filled in. Edit anything that isn't right."
              : 'Takes about ten seconds. You can change every word afterwards.'}
          </div>
          {aiState.notes ? (
            <div style={{ marginTop: '8px', fontSize: '13px', color: '#6B6B6B' }}>{aiState.notes}</div>
          ) : null}
          {aiState.error ? (
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#B00020' }}>{aiState.error}</div>
          ) : null}
        </div>
      ) : null}
      <EditListingPhotosForm
        className={css.form}
        disabled={disabled}
        ready={ready}
        fetchErrors={errors}
        initialValues={initialValues}
        onImageUpload={onImageUpload}
        onSubmit={handleSubmit}
        onRemoveImage={onRemoveImage}
        saveActionMsg={submitButtonText}
        updated={panelUpdated}
        updateInProgress={updateInProgress}
        listingImageConfig={listingImageConfig}
      />
    </div>
  );
};

export default EditListingPhotosPanel;
