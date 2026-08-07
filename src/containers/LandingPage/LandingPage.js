import React from 'react';

import { bool, object } from 'prop-types';
import { compose } from 'redux';
import { connect } from 'react-redux';

import { camelize } from '../../util/string';
import { propTypes } from '../../util/types';

import FallbackPage from './FallbackPage';
import { ASSET_NAME } from './LandingPage.duck';
import PageBuilder from '../PageBuilder/PageBuilder';
import SectionPrnmHero from './SectionPrnmHero';
import SectionTwoWays from './SectionTwoWays';
import SectionHowItWorks from './SectionHowItWorks';
import SectionPoolTypes from './SectionPoolTypes';
import SectionAcademy from './SectionAcademy';
import SectionLoveFooter from './SectionLoveFooter';

// PRNM redesign: the Console landing page ships an old generic "Explore hosting with us" hero
// (with a kids-in-pool background video), an old "How It Works", and a cluttered "List Your
// Pool" host-link cluster. We replace all three with our own www-style sections — filter them
// out of the Console content and inject ours. c132 adds the birthday/love skin: photo hero with
// host-love band + ticker + press, love TwoWays, Learn-with-Fred academy, and a love closer
// (socials, smart app link, Text Derek) appended AFTER the Console sections so every
// Console-managed crawlable section still renders untouched between them.
const isOldHero = (s) => /explore hosting with us/i.test(s?.title?.content || '');
const isOldHowItWorks = (s) => /how it works/i.test(s?.title?.content || '');
const isOldHostLinks = (s) => /list your pool/i.test(s?.title?.content || '');

export const LandingPageComponent = (props) => {
  const { pageAssetsData, inProgress, error, currentUser } = props;

  // c144: this component is a hand-ported duplicate of the EAST homepage and
  // only renders via in-app navigation (nginx serves "/" from EAST on every
  // fresh load). Instead of maintaining two homepages, route people to where
  // "Home" actually means something for them. Full page loads on purpose:
  // one code path, no router coupling, and the anonymous case must reach
  // nginx to get the real homepage.
  const isBrowser = typeof window !== 'undefined';
  React.useEffect(() => {
    if (!isBrowser) return;
    window.__homeRedirectV1 = true;
    const userType = currentUser?.attributes?.profile?.publicData?.userType;
    if (userType === 'provider') {
      window.location.replace('/dashboard');
    } else if (currentUser?.id) {
      window.location.replace('/s');
    } else {
      window.location.replace('/');
    }
  }, [isBrowser, currentUser]);
  if (isBrowser) return null;

  const data = pageAssetsData?.[camelize(ASSET_NAME)]?.data;
  const customSections = [
    { sectionType: 'prnmHero', sectionId: 'prnm-hero' },
    { sectionType: 'prnmTwoWays', sectionId: 'prnm-two-ways' },
    { sectionType: 'prnmHowItWorks', sectionId: 'prnm-how-it-works' },
    { sectionType: 'prnmPoolTypes', sectionId: 'prnm-pool-types' },
    { sectionType: 'prnmAcademy', sectionId: 'prnm-academy' },
  ];
  const closingSections = [{ sectionType: 'prnmLoveFooter', sectionId: 'prnm-love-footer' }];
  const consoleSections = (data?.sections || []).filter(
    (s) => !isOldHero(s) && !isOldHowItWorks(s) && !isOldHostLinks(s)
  );
  const dataWithHero = data
    ? { ...data, sections: [...customSections, ...consoleSections, ...closingSections] }
    : data;

  return (
    <PageBuilder
      pageAssetsData={dataWithHero}
      options={{
        sectionComponents: {
          prnmHero: { component: SectionPrnmHero },
          prnmTwoWays: { component: SectionTwoWays },
          prnmHowItWorks: { component: SectionHowItWorks },
          prnmPoolTypes: { component: SectionPoolTypes },
          prnmAcademy: { component: SectionAcademy },
          prnmLoveFooter: { component: SectionLoveFooter },
        },
      }}
      inProgress={inProgress}
      error={error}
      fallbackPage={<FallbackPage error={error} />}
    />
  );
};

LandingPageComponent.propTypes = {
  pageAssetsData: object,
  inProgress: bool,
  error: propTypes.error,
};

const mapStateToProps = (state) => {
  const { pageAssetsData, inProgress, error } = state.hostedAssets || {};
  const { currentUser } = state.user || {};
  return { pageAssetsData, inProgress, error, currentUser };
};

const LandingPage = compose(connect(mapStateToProps))(LandingPageComponent);

export default LandingPage;
