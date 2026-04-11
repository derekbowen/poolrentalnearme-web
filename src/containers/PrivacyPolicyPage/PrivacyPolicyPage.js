import React from 'react';

import { bool, object } from 'prop-types';
import { connect } from 'react-redux';

import { camelize } from '../../util/string';
import { propTypes } from '../../util/types';

import { H1 } from '../PageBuilder/Primitives/Heading';
import FallbackPage, { fallbackSections } from './FallbackPage';
import { ASSET_NAME } from './PrivacyPolicyPage.duck';

import PageBuilder from '../PageBuilder/PageBuilder';
import SectionBuilder from '../PageBuilder/SectionBuilder';

// This "content-only" component can be used in modals etc.
const PrivacyPolicyContent = (props) => {
  const { inProgress, error, data } = props;

  // We don't want to add h1 heading twice to the HTML (SEO issue).
  // Modal's header is mapped as h2
  const hasContent = (data) => typeof data?.content === 'string';
  const exposeContentAsChildren = (data) => {
    return hasContent(data) ? { children: data.content } : {};
  };

  if (!hasContent && inProgress) {
    return null;
  }

  const CustomHeading1 = (props) => <H1 as="h2" {...props} />;

  const hasData = error === null && data;
  const sectionsData = hasData ? data : fallbackSections;

  return (
    <SectionBuilder
      {...sectionsData}
      options={{
        fieldComponents: {
          heading1: { component: CustomHeading1, pickValidProps: exposeContentAsChildren },
        },
        isInsideContainer: true,
      }}
    />
  );
};

// Presentational component for PrivacyPolicyPage
const PrivacyPolicyPageComponent = (props) => {
  const { pageAssetsData, inProgress, error } = props;

  return (
    <PageBuilder
      pageAssetsData={pageAssetsData?.[camelize(ASSET_NAME)]?.data}
      inProgress={inProgress}
      error={error}
      fallbackPage={<FallbackPage />}
    />
  );
};

PrivacyPolicyPageComponent.propTypes = {
  pageAssetsData: object,
  inProgress: bool,
  error: propTypes.error,
};

const mapStateToProps = (state) => {
  const { pageAssetsData, inProgress, error } = state.hostedAssets || {};
  return { pageAssetsData, inProgress, error };
};

const PrivacyPolicyPage = connect(mapStateToProps)(PrivacyPolicyPageComponent);

const PRIVACY_POLICY_ASSET_NAME = ASSET_NAME;
export { PRIVACY_POLICY_ASSET_NAME, PrivacyPolicyPageComponent, PrivacyPolicyContent };

export default PrivacyPolicyPage;
