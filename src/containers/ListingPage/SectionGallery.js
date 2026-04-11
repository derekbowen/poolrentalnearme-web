import React from 'react';
import BookmarkButton from '../../extensions/wishlist/components/BookmarkButton/BookmarkButton';
import ListingImageGallery from './ListingImageGallery/ListingImageGallery';

import css from './ListingPage.module.css';

const SectionGallery = (props) => {
  const { listing, variantPrefix } = props;
  const { id, author, images } = listing;
  const imageVariants = ['scaled-small', 'scaled-medium', 'scaled-large', 'scaled-xlarge'];
  const thumbnailVariants = [variantPrefix, `${variantPrefix}-2x`, `${variantPrefix}-4x`];
  return (
    <section className={css.productGallery} data-testid="carousel">
      <BookmarkButton listingId={id.uuid} listingAuthor={author} />
      <ListingImageGallery
        images={images}
        imageVariants={imageVariants}
        thumbnailVariants={thumbnailVariants}
      />
    </section>
  );
};

export default SectionGallery;
