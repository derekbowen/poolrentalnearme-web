import React from 'react';
import classNames from 'classnames';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Import shared components
import {
  AspectRatioWrapper,
  ImageFromFile,
  ResponsiveImage,
  IconSpinner,
} from '../../../../components';

// Import modules from this directory
import css from './ListingImage.module.css';

// Cross shaped button on the top-right corner of the image thumbnail
const RemoveImageButton = props => {
  const { className, rootClassName, onClick } = props;
  const classes = classNames(rootClassName || css.removeImage, className);
  return (
    <button className={classes} onClick={onClick}>
      <svg
        width="10px"
        height="10px"
        viewBox="0 0 10 10"
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g strokeWidth="1" fillRule="evenodd">
          <g transform="translate(-821.000000, -311.000000)">
            <g transform="translate(809.000000, 299.000000)">
              <path
                d="M21.5833333,16.5833333 L17.4166667,16.5833333 L17.4166667,12.4170833 C17.4166667,12.1866667 17.2391667,12 17.00875,12 C16.77875,12 16.5920833,12.18625 16.5920833,12.41625 L16.5883333,16.5833333 L12.4166667,16.5833333 C12.18625,16.5833333 12,16.7695833 12,17 C12,17.23 12.18625,17.4166667 12.4166667,17.4166667 L16.5875,17.4166667 L16.5833333,21.5829167 C16.5829167,21.8129167 16.7691667,21.9995833 16.9991667,22 L16.9995833,22 C17.2295833,22 17.41625,21.81375 17.4166667,21.58375 L17.4166667,17.4166667 L21.5833333,17.4166667 C21.8133333,17.4166667 22,17.23 22,17 C22,16.7695833 21.8133333,16.5833333 21.5833333,16.5833333"
                transform="translate(17.000000, 17.000000) rotate(-45.000000) translate(-17.000000, -17.000000) "
              />
            </g>
          </g>
        </g>
      </svg>
    </button>
  );
};

/**
 * Cropped "thumbnail" of given listing image.
 * The image might be one already uploaded and attached to listing entity
 * or representing local image file (before it's uploaded & attached to listing).
 *
 * @component
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {Object} props.image - The image object
 * @param {string} props.savedImageAltText - The saved image alt text
 * @param {Function} props.onRemoveImage - The remove image function
 * @param {number} [props.aspectWidth] - The aspect width
 * @param {number} [props.aspectHeight] - The aspect height
 * @param {string} [props.variantPrefix] - The variant prefix
 * @returns {JSX.Element}
 */
// Drag handle icon (6-dot grip)
const DragHandle = ({ listeners, attributes }) => (
  <button
    className={css.dragHandle}
    {...listeners}
    {...attributes}
    type="button"
    aria-label="Drag to reorder"
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="3" r="1.5" />
      <circle cx="11" cy="3" r="1.5" />
      <circle cx="5" cy="8" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <circle cx="5" cy="13" r="1.5" />
      <circle cx="11" cy="13" r="1.5" />
    </svg>
  </button>
);

// Cover image badge
const CoverBadge = () => (
  <span className={css.coverBadge}>Cover</span>
);

const ListingImage = props => {
  const {
    className,
    image,
    savedImageAltText,
    onRemoveImage,
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
    id,
    sortable = false,
    isCoverImage = false,
  } = props;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: id || 'placeholder', disabled: !sortable });

  const sortableStyle = sortable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : 'auto',
      }
    : {};

  const handleRemoveClick = e => {
    e.stopPropagation();
    onRemoveImage(image.id);
  };

  if (image.file && !image.attributes) {
    // Add remove button only when the image has been uploaded and can be removed
    const removeButton = image.imageId ? <RemoveImageButton onClick={handleRemoveClick} /> : null;

    // While image is uploading we show overlay on top of thumbnail
    const uploadingOverlay = !image.imageId ? (
      <div className={css.thumbnailLoading}>
        <IconSpinner />
      </div>
    ) : null;

    return (
      <div ref={setNodeRef} style={sortableStyle}>
        <ImageFromFile
          id={image.id}
          className={className}
          file={image.file}
          aspectWidth={aspectWidth}
          aspectHeight={aspectHeight}
        >
          {sortable && image.imageId ? <DragHandle listeners={listeners} attributes={attributes} /> : null}
          {isCoverImage ? <CoverBadge /> : null}
          {removeButton}
          {uploadingOverlay}
        </ImageFromFile>
      </div>
    );
  } else {
    const classes = classNames(css.root, className);

    const variants = image
      ? Object.keys(image?.attributes?.variants).filter(k => k.startsWith(variantPrefix))
      : [];
    const imgForResponsiveImage = image.imageId ? { ...image, id: image.imageId } : image;

    const fallbackWhileDownloading = image.file ? (
      <ImageFromFile
        id={image.id}
        className={css.fallbackWhileDownloading}
        file={image.file}
        aspectWidth={aspectWidth}
        aspectHeight={aspectHeight}
      >
        <div className={css.thumbnailLoading}>
          <IconSpinner />
        </div>
      </ImageFromFile>
    ) : null;

    return (
      <div ref={setNodeRef} style={sortableStyle} className={classes}>
        <div className={css.wrapper}>
          {fallbackWhileDownloading}
          <AspectRatioWrapper width={aspectWidth} height={aspectHeight}>
            <ResponsiveImage
              rootClassName={css.rootForImage}
              image={imgForResponsiveImage}
              alt={savedImageAltText}
              variants={variants}
            />
          </AspectRatioWrapper>
          {sortable ? <DragHandle listeners={listeners} attributes={attributes} /> : null}
          {isCoverImage ? <CoverBadge /> : null}
          <RemoveImageButton onClick={handleRemoveClick} />
        </div>
      </div>
    );
  }
};

export default ListingImage;
