import React, { useEffect, useState } from 'react';

import Modal from 'components/Modal/Modal';
import useMounted from 'hooks/useMounted';
import { FormattedMessage } from '../../util/reactIntl';
import { ResponsiveImage } from '../../components';

import ImageCarousel from './ImageCarousel/ImageCarousel';
import ActionBarMaybe from './ActionBarMaybe';

import css from './ListingPage.module.css';
import BookmarkButton from '../../extensions/wishlist/components/BookmarkButton/BookmarkButton';

const SectionHero = props => {
  const mounted = useMounted();

  const {
    title,
    listing,
    isOwnListing,
    editParams,
    currentUser,
    handleViewPhotosClick,
    imageCarouselOpen,
    onImageCarouselClose,
    onManageDisableScrolling,
    noPayoutDetailsSetWithOwnListing,
  } = props;

  const { id, author } = listing || {};
  const hasImages = listing.images && listing.images.length > 0;
  const firstImage = hasImages ? listing.images[0] : null;
  const variants = firstImage
    ? Object.keys(firstImage?.attributes?.variants).filter((k) => k.startsWith('scaled'))
    : [];

  const viewPhotosButton = hasImages ? (
    <button className={css.viewPhotos} onClick={handleViewPhotosClick}>
      <FormattedMessage
        id="ListingPage.viewImagesButton"
        values={{ count: listing.images.length }}
      />
    </button>
  ) : null;

  return (
    <section className={css.sectionHero} data-testid="hero">
      <div className={css.imageWrapperForSectionHero} onClick={handleViewPhotosClick}>
        <BookmarkButton
          listingId={id?.uuid}
          listingAuthor={author}
          rootClassName={css.bookmarkButton}
        />
        {mounted && listing.id && isOwnListing ? (
          <div onClick={e => e.stopPropagation()} className={css.actionBarContainerForHeroLayout}>
            {noPayoutDetailsSetWithOwnListing ? (
              <ActionBarMaybe
                className={css.actionBarForHeroLayout}
                isOwnListing={isOwnListing}
                listing={listing}
                showNoPayoutDetailsSet={noPayoutDetailsSetWithOwnListing}
                currentUser={currentUser}
              />
            ) : null}

            <ActionBarMaybe
              className={css.actionBarForHeroLayout}
              isOwnListing={isOwnListing}
              listing={listing}
              editParams={editParams}
              currentUser={currentUser}
            />
          </div>
        ) : null}

        <ResponsiveImage
          rootClassName={css.rootForImage}
          alt={title}
          image={firstImage}
          variants={variants}
        />
        {viewPhotosButton}
      </div>
      <Modal
        id="ListingPage.imageCarousel"
        scrollLayerClassName={css.carouselModalScrollLayer}
        containerClassName={css.carouselModalContainer}
        lightCloseButton
        isOpen={imageCarouselOpen}
        onClose={onImageCarouselClose}
        usePortal
        onManageDisableScrolling={onManageDisableScrolling}
      >
        <ImageCarousel
          images={listing.images}
          imageVariants={['scaled-small', 'scaled-medium', 'scaled-large', 'scaled-xlarge']}
        />
      </Modal>
    </section>
  );
};

export default SectionHero;
