import { bool, object, string } from 'prop-types';
import React from 'react';
import { connect } from 'react-redux';
import { useParams } from 'react-router-dom';
import NotFoundPage from '../NotFoundPage/NotFoundPage';
import PageBuilder from '../PageBuilder/PageBuilder';

export const CMSPageComponent = (props) => {
  const { pageAssetsData, inProgress, error, pageId } = props;
  const params = useParams();
  const selectedId = params.pageId || pageId;

  const isNotInvestorsPage = selectedId !== 'investors';

  if (!inProgress && error?.status === 404) {
    return <NotFoundPage />;
  }

  return (
    <PageBuilder
      pageAssetsData={pageAssetsData?.[selectedId]?.data}
      inProgress={inProgress}
      schemaType="Article"
      shouldIndex={isNotInvestorsPage}
    />
  );
};

CMSPageComponent.propTypes = {
  pageAssetsData: object,
  inProgress: bool,
  error: object,
  pageId: string,
};

const mapStateToProps = (state) => {
  const { pageAssetsData, inProgress, error } = state.hostedAssets || {};
  return { pageAssetsData, inProgress, error };
};

const CMSPage = connect(mapStateToProps)(CMSPageComponent);

export default CMSPage;
