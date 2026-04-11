import React from 'react';
import { useSelector } from 'react-redux';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import { Page } from '../../components';

/**
 * This component returns a Page component which is connected to Redux store.
 *
 * @component
 * @param {Object} props
 * @param {JSX.Element} props.children
 * @returns {JSX.Element} Page component with scrollingDisabled info from Redux state.
 */
const StaticPage = props => {
  const { children, ...pageProps } = props;
  const scrollingDisabled = useSelector(isScrollingDisabled);

  return (
    <Page {...pageProps} scrollingDisabled={scrollingDisabled}>
      {children}
    </Page>
  );
};


export default StaticPage;
