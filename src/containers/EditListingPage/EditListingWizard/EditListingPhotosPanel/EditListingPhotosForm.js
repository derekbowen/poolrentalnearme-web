import React, { useState, memo } from 'react';
import { ARRAY_ERROR } from 'final-form';
import { Form as FinalForm, Field } from 'react-final-form';
import arrayMutators from 'final-form-arrays';
import { FieldArray } from 'react-final-form-arrays';
import isEqual from 'lodash/isEqual';
import classNames from 'classnames';

// Import configs and util modules
import { FormattedMessage, useIntl } from '../../../../util/reactIntl';
import { nonEmptyArray, composeValidators } from '../../../../util/validators';
import { isUploadImageOverLimitError } from '../../../../util/errors';
import { ensureUploadableImage } from '../../../../util/heic';

// Import shared components
import { Button, Form, AspectRatioWrapper } from '../../../../components';

// Import modules from this directory
import ListingImage from './ListingImage';
import css from './EditListingPhotosForm.module.css';

// Stock cross-platform value. NOTE: do NOT append explicit ".heic,.heif" tokens —
// on Android/Samsung Chrome that combination makes the picker open the Files app
// (or show nothing) instead of the gallery, which dead-ends Android hosts. iOS
// reports HEIC under "image/*" so HEIC photos are still selectable, and any HEIC
// that comes through is transcoded to JPEG by ensureUploadableImage() below —
// so this is safe on iOS and fixes Android.
const ACCEPT_IMAGES = 'image/*';

const ImageUploadError = (props) => {
  return props.uploadOverLimit ? (
    <p className={css.error}>
      <FormattedMessage id="EditListingPhotosForm.imageUploadFailed.uploadOverLimit" />
    </p>
  ) : props.uploadImageError ? (
    <p className={css.error}>
      <FormattedMessage id="EditListingPhotosForm.imageUploadFailed.uploadFailed" />
    </p>
  ) : null;
};

// NOTE: PublishListingError and ShowListingsError are here since Photos panel is the last visible panel
// before creating a new listing. If that order is changed, these should be changed too.
// Create and show listing errors are shown above submit button
const PublishListingError = props => {
  return props.error ? (
    <p className={css.error}>
      <FormattedMessage id="EditListingPhotosForm.publishListingFailed" />
    </p>
  ) : null;
};

const ShowListingsError = props => {
  return props.error ? (
    <p className={css.error}>
      <FormattedMessage id="EditListingPhotosForm.showListingFailed" />
    </p>
  ) : null;
};

// Field component that uses file-input to allow user to select images.
export const FieldAddImage = props => {
  const { formApi, onImageUploadHandler, aspectWidth = 1, aspectHeight = 1, ...rest } = props;
  return (
    <Field form={null} {...rest}>
      {fieldprops => {
        const { accept, input, label, disabled: fieldDisabled } = fieldprops;
        const { name, type } = input;
        const onChange = e => {
          const file = e.target.files[0];
          formApi.change(`addImage`, file);
          formApi.blur(`addImage`);
          onImageUploadHandler(file);
        };
        const inputProps = { accept, id: name, name, onChange, type };
        return (
          <div className={css.addImageWrapper}>
            <AspectRatioWrapper width={aspectWidth} height={aspectHeight}>
              {fieldDisabled ? null : <input {...inputProps} className={css.addImageInput} />}
              <label htmlFor={name} className={css.addImage}>
                {label}
              </label>
            </AspectRatioWrapper>
          </div>
        );
      }}
    </Field>
  );
};

// Component that shows listing images from "images" field array.
// Wrapped in a draggable container so hosts can reorder photos; the first photo
// is the cover/hero (Sharetribe stores image order natively from the submitted array).
const FieldListingImage = props => {
  const {
    name,
    intl,
    onRemoveImage,
    aspectWidth,
    aspectHeight,
    variantPrefix,
    index,
    isCover,
    isDragging,
    isDropTarget,
    onDragStart,
    onDragEnter,
    onDrop,
    onDragEnd,
    onMakeCover,
    total,
    onMoveUp,
    onMoveDown,
  } = props;
  return (
    <Field name={name}>
      {fieldProps => {
        const { input } = fieldProps;
        const image = input.value;
        if (!image) return null;
        const wrapperClasses = classNames(css.imageWrapper, {
          [css.dragging]: isDragging,
          [css.dropTarget]: isDropTarget,
        });
        return (
          <div
            className={wrapperClasses}
            draggable
            onDragStart={() => onDragStart(index)}
            onDragEnter={() => onDragEnter(index)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              onDrop(index);
            }}
            onDragEnd={onDragEnd}
          >
            <ListingImage
              image={image}
              key={image?.id?.uuid || image?.id}
              className={css.thumbnail}
              savedImageAltText={intl.formatMessage({
                id: 'EditListingPhotosForm.savedImageAltText',
              })}
              onRemoveImage={() => onRemoveImage(image?.id)}
              aspectWidth={aspectWidth}
              aspectHeight={aspectHeight}
              variantPrefix={variantPrefix}
            />
            {isCover ? (
              <div className={css.coverBadge}>★ Cover photo</div>
            ) : (
              <button
                type="button"
                className={css.makeCoverButton}
                onClick={() => onMakeCover(index)}
              >
                Make cover
              </button>
            )}
            {!isCover ? (
              <div className={css.reorderControls}>
                <button
                  type="button"
                  className={css.reorderBtn}
                  aria-label="Move photo earlier"
                  disabled={index <= 1}
                  onClick={() => onMoveUp(index)}
                >
                  {'\u25B2'}
                </button>
                <button
                  type="button"
                  className={css.reorderBtn}
                  aria-label="Move photo later"
                  disabled={index >= total - 1}
                  onClick={() => onMoveDown(index)}
                >
                  {'\u25BC'}
                </button>
              </div>
            ) : null}
          </div>
        );
      }}
    </Field>
  );
};

/**
 * The EditListingPhotosForm component.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {boolean} props.disabled - Whether the form is disabled
 * @param {boolean} props.ready - Whether the form is ready
 * @param {boolean} props.updated - Whether the form is updated
 * @param {boolean} props.updateInProgress - Whether the update is in progress
 * @param {Object} props.fetchErrors - The fetch errors object
 * @param {propTypes.error} props.fetchErrors.publishListingError - The publish listing error
 * @param {propTypes.error} props.fetchErrors.showListingsError - The show listings error
 * @param {propTypes.error} props.fetchErrors.uploadImageError - The upload image error
 * @param {propTypes.error} props.fetchErrors.updateListingError - The update listing error
 * @param {string} props.saveActionMsg - The save action message
 * @param {Function} props.onSubmit - The submit function
 * @param {Function} props.onImageUpload - The image upload function
 * @param {Function} props.onRemoveImage - The remove image function
 * @param {Object} props.listingImageConfig - The listing image config
 * @param {number} props.listingImageConfig.aspectWidth - The aspect width
 * @param {number} props.listingImageConfig.aspectHeight - The aspect height
 * @param {string} props.listingImageConfig.variantPrefix - The variant prefix
 * @returns {JSX.Element}
 */
const EditListingPhotosForm = ({
  listingImageConfig,
  onImageUpload,
  className,
  fetchErrors,
  onRemoveImage,
  saveActionMsg,
  updateInProgress,
  updated,
  ready,
  disabled,
  ...props
}) => {
  const [state, setState] = useState({ imageUploadRequested: false });
  const [submittedImages, setSubmittedImages] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);

  const onImageUploadHandler = file => {
    if (file) {
      setState({ imageUploadRequested: true });

      // iPhone HEIC/HEIF photos are transcoded to JPEG before upload (Sharetribe
      // rejects HEIC). Non-HEIC files pass through unchanged.
      ensureUploadableImage(file)
        .then(uploadable =>
          onImageUpload({ id: `${uploadable.name}_${Date.now()}`, file: uploadable }, listingImageConfig)
        )
        .catch(e => {
          // Surface failures instead of silently stopping the spinner — a host on
          // a flaky mobile connection (or a rejected file) now sees the upload
          // error via uploadImageError rather than a photo that just never appears.
          // eslint-disable-next-line no-console
          console.error('Image upload failed', e);
        })
        .finally(() => {
          setState({ imageUploadRequested: false });
        });
    }
  };
  const intl = useIntl();

  return (
    <FinalForm
      {...props}
      mutators={{ ...arrayMutators }}
      render={formRenderProps => {
        const {
          form,
          handleSubmit,
          invalid,
          touched,
          errors,
          values,
        } = formRenderProps;

        const images = values.images || [];
        const { aspectWidth = 1, aspectHeight = 1, variantPrefix } = listingImageConfig;

        const { publishListingError, showListingsError, updateListingError, uploadImageError } =
          fetchErrors || {};
        const uploadOverLimit = isUploadImageOverLimitError(uploadImageError);

        // imgs can contain added images (with temp ids) and submitted images with uniq ids.
        const arrayOfImgIds = imgs => imgs?.map(i => (typeof i.id === 'string' ? i.imageId : i.id));
        const imageIdsFromProps = arrayOfImgIds(images);
        const imageIdsFromPreviousSubmit = arrayOfImgIds(submittedImages);
        const imageArrayHasSameImages = isEqual(imageIdsFromProps, imageIdsFromPreviousSubmit);
        const submittedOnce = submittedImages.length > 0;
        const pristineSinceLastSubmit = submittedOnce && imageArrayHasSameImages;

        const submitReady = (updated && pristineSinceLastSubmit) || ready;
        const submitInProgress = updateInProgress;
        const submitDisabled =
          invalid || disabled || submitInProgress || state.imageUploadRequested || ready;
        const imagesError = touched.images && errors?.images && errors.images[ARRAY_ERROR];

        const classes = classNames(css.root, className);

        return (
          <Form
            className={classes}
            onSubmit={e => {
              setSubmittedImages(images);
              handleSubmit(e);
            }}
          >
            {updateListingError ? (
              <p className={css.error}>
                <FormattedMessage id="EditListingPhotosForm.updateFailed" />
              </p>
            ) : null}

            {images.length > 1 ? (
              <p className={css.reorderHint}>
                Use the ▲ ▼ buttons on each photo to reorder your gallery (dragging also
                works on a computer). Your first photo is the cover guests see first — tap
                “Make cover” on any photo to move it to the front.
              </p>
            ) : null}
            <div className={css.imagesFieldArray}>
              <FieldArray
                name="images"
                validate={composeValidators(
                  nonEmptyArray(
                    intl.formatMessage({
                      id: 'EditListingPhotosForm.imageRequired',
                    })
                  )
                )}
              >
                {({ fields }) => {
                  const total = fields.length;
                  const moveImage = (from, to) => {
                    if (from == null || to == null || from === to) return;
                    fields.move(from, to);
                  };
                  // Reorder that keeps the cover (index 0) pinned — never moves
                  // the cover and never lets another photo take slot 0. Cover
                  // changes only via the explicit "Make cover" control (spec #3).
                  const reorderImage = (from, to) => {
                    if (from == null || to == null || from === 0) return;
                    const clamped = Math.max(1, Math.min(total - 1, to));
                    if (clamped === from) return;
                    fields.move(from, clamped);
                  };
                  return fields.map((name, index) => (
                    <FieldListingImage
                      key={name}
                      name={name}
                      index={index}
                      isCover={index === 0}
                      isDragging={dragIndex === index}
                      isDropTarget={dropIndex === index && dragIndex !== index}
                      onDragStart={i => setDragIndex(i)}
                      onDragEnter={i => setDropIndex(i)}
                      onDrop={i => {
                        reorderImage(dragIndex, i);
                        setDragIndex(null);
                        setDropIndex(null);
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDropIndex(null);
                      }}
                      onMakeCover={i => moveImage(i, 0)}
                      total={total}
                      onMoveUp={i => reorderImage(i, i - 1)}
                      onMoveDown={i => reorderImage(i, i + 1)}
                      onRemoveImage={imageId => {
                        fields.remove(index);
                        onRemoveImage(imageId);
                      }}
                      intl={intl}
                      aspectWidth={aspectWidth}
                      aspectHeight={aspectHeight}
                      variantPrefix={variantPrefix}
                    />
                  ));
                }}
              </FieldArray>

              <FieldAddImage
                id="addImage"
                name="addImage"
                accept={ACCEPT_IMAGES}
                label={
                  <span className={css.chooseImageText}>
                    <span className={css.chooseImage}>
                      <FormattedMessage id="EditListingPhotosForm.chooseImage" />
                    </span>
                    <span className={css.imageTypes}>
                      <FormattedMessage id="EditListingPhotosForm.imageTypes" />
                    </span>
                  </span>
                }
                type="file"
                disabled={state.imageUploadRequested}
                formApi={form}
                onImageUploadHandler={onImageUploadHandler}
                aspectWidth={aspectWidth}
                aspectHeight={aspectHeight}
              />
            </div>

            {imagesError ? <div className={css.arrayError}>{imagesError}</div> : null}

            <ImageUploadError
              uploadOverLimit={uploadOverLimit}
              uploadImageError={uploadImageError}
            />

            <p className={css.tip}>
              <FormattedMessage id="EditListingPhotosForm.addImagesTip" />
            </p>

            <PublishListingError error={publishListingError} />
            <ShowListingsError error={showListingsError} />

            <Button
              className={css.submitButton}
              type="submit"
              inProgress={submitInProgress}
              disabled={submitDisabled}
              ready={submitReady}
            >
              {saveActionMsg}
            </Button>
          </Form>
        );
      }}
    />
  );
};

export default memo(EditListingPhotosForm, isEqual);

