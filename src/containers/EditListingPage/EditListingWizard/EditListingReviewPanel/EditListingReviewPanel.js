import React, { useState, useEffect } from 'react';
import classNames from 'classnames';

import { FormattedMessage, useIntl } from '../../../../util/reactIntl';
import { ensureListing } from '../../../../util/data';
import { Button, Heading } from '../../../../components';
import { generateListing, mapAIOutputToPublicData, mapAIOutputToListingFields } from '../../../../util/listingAI/generateListing';

import EditListingReviewForm from './EditListingReviewForm';
import css from './EditListingReviewPanel.module.css';

const EditListingReviewPanel = props => {
  const {
    className,
    rootClassName,
    listing,
    disabled,
    ready,
    submitButtonText,
    panelUpdated,
    updateInProgress,
    errors,
    images,
    config,
    marketplaceCurrency,
    listingMinimumPriceSubUnits,
    onSubmit,
    onManageDisableScrolling,
    ...rest
  } = props;

  const intl = useIntl();
  const currentListing = ensureListing(listing);
  const { title, description, price, publicData = {}, availabilityPlan } = currentListing.attributes;

  const [aiGenerated, setAiGenerated] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [generatedData, setGeneratedData] = useState(null);

  // Get image URLs from listing images for AI analysis
  const getImageUrls = () => {
    if (!currentListing.images?.length) return [];
    return currentListing.images
      .map(img => {
        const variants = img?.attributes?.variants || {};
        return variants['scaled-large']?.url || variants['landscape-crop2x']?.url;
      })
      .filter(Boolean);
  };

  const handleGenerateWithAI = async () => {
    setAiLoading(true);
    setAiError(null);

    try {
      const imageUrls = getImageUrls();
      const location = publicData.location || {};
      const address = location.address || '';

      // Parse city and state from address
      const addressParts = address.split(',').map(s => s.trim());
      const city = addressParts.length >= 2 ? addressParts[addressParts.length - 2] : '';
      const stateZip = addressParts.length >= 1 ? addressParts[addressParts.length - 1] : '';
      const state = stateZip.split(' ')[0] || '';

      const result = await generateListing({
        imageUrls,
        address,
        city,
        state,
        coordinates: currentListing.attributes.geolocation ? {
          lat: currentListing.attributes.geolocation.lat,
          lng: currentListing.attributes.geolocation.lng,
        } : null,
        listingId: currentListing.id?.uuid,
      });

      setGeneratedData(result);
      setAiGenerated(true);
    } catch (err) {
      console.error('AI generation failed:', err);
      setAiError(err.message || 'Failed to generate listing. You can fill in the details manually.');
    } finally {
      setAiLoading(false);
    }
  };

  // Build initial values from generated data or existing listing data
  const getInitialValues = () => {
    const source = generatedData || {};
    const aiPublicData = generatedData ? mapAIOutputToPublicData(source) : {};
    const aiListingFields = generatedData ? mapAIOutputToListingFields(source) : {};

    return {
      title: aiListingFields.title || title || '',
      description: aiListingFields.description || description || '',
      price: aiListingFields.price || (price ? { amount: price.amount, currency: price.currency } : { amount: 5000, currency: 'USD' }),
      // Pool fields from AI or existing
      poolType: aiPublicData.poolType || publicData.poolType || '',
      poolSize: aiPublicData.poolSize || publicData.poolSize || '',
      capacity: aiPublicData.capacity || publicData.capacity || '',
      heated: aiPublicData.heated ?? publicData.heated ?? false,
      depth: aiPublicData.depth || publicData.depth || '',
      amenities: aiPublicData.amenities || publicData.amenities || [],
      safetyFeatures: aiPublicData.safetyFeatures || publicData.safetyFeatures || [],
      // Rules
      childrenAllowed: aiPublicData.childrenAllowed ?? publicData.childrenAllowed ?? true,
      eventsAllowed: aiPublicData.eventsAllowed ?? publicData.eventsAllowed ?? false,
      alcoholAllowed: aiPublicData.alcoholAllowed ?? publicData.alcoholAllowed ?? false,
      petsAllowed: aiPublicData.petsAllowed ?? publicData.petsAllowed ?? false,
      musicAllowed: aiPublicData.musicAllowed ?? publicData.musicAllowed ?? false,
      smokingAllowed: aiPublicData.smokingAllowed ?? publicData.smokingAllowed ?? false,
      maxGuests: aiPublicData.maxGuests || publicData.maxGuests || '',
      minimumNotice: aiPublicData.minimumNotice || publicData.minimumNotice || '',
      // Style
      listingStyle: aiPublicData.listingStyle || publicData.listingStyle || 'clean',
    };
  };

  const handleSubmit = values => {
    const {
      title: formTitle,
      description: formDescription,
      price: formPrice,
      poolType, poolSize, capacity, heated, depth,
      amenities, safetyFeatures,
      childrenAllowed, eventsAllowed, alcoholAllowed, petsAllowed,
      musicAllowed, smokingAllowed, maxGuests, minimumNotice,
      listingStyle,
    } = values;

    const updateValues = {
      title: formTitle,
      description: formDescription,
      price: formPrice,
      availabilityPlan: availabilityPlan || {
        type: 'availability-plan/day',
        entries: [
          { dayOfWeek: 'mon', seats: 1 },
          { dayOfWeek: 'tue', seats: 1 },
          { dayOfWeek: 'wed', seats: 1 },
          { dayOfWeek: 'thu', seats: 1 },
          { dayOfWeek: 'fri', seats: 1 },
          { dayOfWeek: 'sat', seats: 1 },
          { dayOfWeek: 'sun', seats: 1 },
        ],
      },
      publicData: {
        poolType,
        poolSize,
        capacity: capacity ? Number(capacity) : undefined,
        heated,
        depth,
        amenities,
        safetyFeatures,
        childrenAllowed,
        eventsAllowed,
        alcoholAllowed,
        petsAllowed,
        musicAllowed,
        smokingAllowed,
        maxGuests: maxGuests ? Number(maxGuests) : undefined,
        minimumNotice: minimumNotice ? Number(minimumNotice) : undefined,
        listingStyle,
      },
    };

    onSubmit(updateValues);
  };

  const classes = classNames(rootClassName || css.root, className);

  return (
    <div className={classes}>
      <Heading as="h1" rootClassName={css.title}>
        <FormattedMessage id="EditListingReviewPanel.title" />
      </Heading>

      {!aiGenerated && !aiLoading && (
        <div className={css.aiSection}>
          <p className={css.aiDescription}>
            <FormattedMessage id="EditListingReviewPanel.aiDescription" />
          </p>
          <Button
            className={css.aiButton}
            onClick={handleGenerateWithAI}
            disabled={!currentListing.images?.length}
          >
            <FormattedMessage id="EditListingReviewPanel.generateButton" />
          </Button>
          {!currentListing.images?.length && (
            <p className={css.aiHint}>
              <FormattedMessage id="EditListingReviewPanel.noPhotosHint" />
            </p>
          )}
          <p className={css.skipHint}>
            <FormattedMessage id="EditListingReviewPanel.skipHint" />
          </p>
        </div>
      )}

      {aiLoading && (
        <div className={css.aiLoading}>
          <div className={css.spinner} />
          <p className={css.loadingText}>
            <FormattedMessage id="EditListingReviewPanel.analyzing" />
          </p>
        </div>
      )}

      {aiError && (
        <p className={css.error}>{aiError}</p>
      )}

      {generatedData?.uniqueAngle && (
        <div className={css.uniqueAngle}>
          <strong>Your pool's standout feature:</strong> {generatedData.uniqueAngle}
        </div>
      )}

      <EditListingReviewForm
        initialValues={getInitialValues()}
        onSubmit={handleSubmit}
        saveActionMsg={submitButtonText}
        disabled={disabled}
        ready={ready}
        updated={panelUpdated}
        updateInProgress={updateInProgress}
        fetchErrors={errors}
        config={config}
        marketplaceCurrency={marketplaceCurrency}
        listingMinimumPriceSubUnits={listingMinimumPriceSubUnits}
        generatedData={generatedData}
      />
    </div>
  );
};

export default EditListingReviewPanel;
