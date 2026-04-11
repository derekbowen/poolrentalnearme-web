import React, { useState, memo, useCallback } from 'react';
import { ARRAY_ERROR } from 'final-form';
import { Form as FinalForm, Field } from 'react-final-form';
import arrayMutators from 'final-form-arrays';
import { FieldArray } from 'react-final-form-arrays';
import isEqual from 'lodash/isEqual';
import classNames from 'classnames';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';

// Import configs and util modules
import { FormattedMessage, useIntl } from '../../../../util/reactIntl';
import { nonEmptyArray, composeValidators } from '../../../../util/validators';
import { isUploadImageOverLimitError } from '../../../../util/errors';

// Import shared components
import { Button, Form, AspectRatioWrapper } from '../../../../components';

// Import modules from this directory
import ListingImage from './ListingImage';
import css from './EditListingPhotosForm.module.css';

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

// Component that shows listing images from "images" field array
const FieldListingImage = props => {
  const { name, intl, onRemoveImage, aspectWidth, aspectHeight, variantPrefix, index } = props;
  return (
    <Field name={name}>
      {fieldProps => {
        const { input } = fieldProps;
        const image = input.value;
        const imageId = image?.id?.uuid || image?.id;
        return image ? (
          <ListingImage
            image={image}
            key={imageId}
            id={imageId}
            className={css.thumbnail}
            savedImageAltText={intl.formatMessage({
              id: 'EditListingPhotosForm.savedImageAltText',
            })}
            onRemoveImage={() => onRemoveImage(image?.id)}
            aspectWidth={aspectWidth}
            aspectHeight={aspectHeight}
            variantPrefix={variantPrefix}
            isCoverImage={index === 0}
            sortable
          />
        ) : null;
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

  const onImageUploadHandler = file => {
    if (file) {
      setState({ imageUploadRequested: true });

      onImageUpload({ id: `${file.name}_${Date.now()}`, file }, listingImageConfig).finally(() => {
        setState({ imageUploadRequested: false });
      });
    }
  };
  const intl = useIntl();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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
                const imageIds = fields.value?.map(
                  img => img?.id?.uuid || img?.id
                ) || [];

                const handleDragEnd = event => {
                  const { active, over } = event;
                  if (active && over && active.id !== over.id) {
                    const oldIndex = imageIds.indexOf(active.id);
                    const newIndex = imageIds.indexOf(over.id);
                    if (oldIndex !== -1 && newIndex !== -1) {
                      fields.move(oldIndex, newIndex);
                    }
                  }
                };

                return (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={imageIds} strategy={rectSortingStrategy}>
                      {images.length > 1 ? (
                        <p className={css.reorderHint}>
                          <FormattedMessage id="EditListingPhotosForm.reorderHint" />
                        </p>
                      ) : null}
                      <div className={css.imagesFieldArray}>
                        {fields.map((name, index) => (
                          <FieldListingImage
                            key={name}
                            name={name}
                            index={index}
                            onRemoveImage={imageId => {
                              fields.remove(index);
                              onRemoveImage(imageId);
                            }}
                            intl={intl}
                            aspectWidth={aspectWidth}
                            aspectHeight={aspectHeight}
                            variantPrefix={variantPrefix}
                          />
                        ))}

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
                    </SortableContext>
                  </DndContext>
                );
              }}
            </FieldArray>

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

