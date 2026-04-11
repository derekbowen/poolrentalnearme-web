import React from 'react';

// Utils
import { useIntl } from 'react-intl';
import { SCHEMA_TYPE_MULTI_ENUM, SCHEMA_TYPE_TEXT, SCHEMA_TYPE_YOUTUBE } from '../../util/types';
import {
  isFieldForCategory,
  pickCategoryFields,
  pickCustomFieldProps,
} from '../../util/fieldHelpers';

import SectionDetailsMaybe from './SectionDetailsMaybe';
import SectionMultiEnumMaybe from './SectionMultiEnumMaybe';
import SectionTextMaybe from './SectionTextMaybe';
import SectionYoutubeVideoMaybe from './SectionYoutubeVideoMaybe';
import SectionAddonMaybe from './SectionAddonMaybe';

/**
 * Renders custom listing fields.
 * - SectionDetailsMaybe is used if schemaType is 'enum', 'long', or 'boolean'
 * - SectionMultiEnumMaybe is used if schemaType is 'multi-enum'
 * - SectionTextMaybe is used if schemaType is 'text'
 *
 * @param {*} props include publicData, metadata, listingFieldConfigs, categoryConfiguration
 * @returns React.Fragment containing aforementioned components
 */
const CustomListingFields = (props) => {
  const intl = useIntl();
  const { publicData, metadata, listingFieldConfigs, categoryConfiguration } = props;

  const { key: categoryPrefix, categories: listingCategoriesConfig } = categoryConfiguration;
  const categoriesObj = pickCategoryFields(publicData, categoryPrefix, 1, listingCategoriesConfig);
  const currentCategories = Object.values(categoriesObj);

  const isFieldForSelectedCategories = (fieldConfig) => {
    const isTargetCategory = isFieldForCategory(currentCategories, fieldConfig);
    return isTargetCategory;
  };
  const propsForCustomFields =
    pickCustomFieldProps(
      publicData,
      metadata,
      listingFieldConfigs,
      'listingType',
      isFieldForSelectedCategories
    ) || [];

  const { amenities } = publicData ?? {};

  const amenitiesOptions = (amenities || []).map((amenity) => {
    return {
      key: amenity.id,
      label: amenity.name,
      value: amenity.description,
    };
  });

  const amentitiesDetailField = {
    key: 'amenities',
    heading: 'ListingPage.amenities',
    options: amenitiesOptions,
  };

  return (
    <>
      <SectionDetailsMaybe {...props} isFieldForCategory={isFieldForSelectedCategories} />
      <SectionAddonMaybe {...amentitiesDetailField} />
      {propsForCustomFields.map((customFieldProps) => {
        const { schemaType, key, ...fieldProps } = customFieldProps;
        return schemaType === SCHEMA_TYPE_MULTI_ENUM ? (
          <SectionMultiEnumMaybe key={key} {...fieldProps} />
        ) : schemaType === SCHEMA_TYPE_TEXT ? (
          <SectionTextMaybe key={key} {...fieldProps} />
        ) : schemaType === SCHEMA_TYPE_YOUTUBE ? (
          <SectionYoutubeVideoMaybe key={key} {...fieldProps} />
        ) : null;
      })}
      {propsForCustomFields.map((customFieldProps) => {
        const { schemaType, ...fieldProps } = customFieldProps;
        return schemaType === SCHEMA_TYPE_YOUTUBE ? (
          <SectionYoutubeVideoMaybe {...fieldProps} />
        ) : null;
      })}
    </>
  );
};

export default CustomListingFields;
