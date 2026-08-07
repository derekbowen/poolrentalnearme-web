import React from 'react';
import { useConfiguration } from '../../context/configurationContext';
import SectionBuilder from '../PageBuilder/SectionBuilder';

const FooterComponent = () => {
  const { footer = {}, topbar } = useConfiguration();

  // If footer asset is not set, let's not render Footer at all.
  if (Object.keys(footer).length === 0) {
    return null;
  }

  // The footer asset does not specify sectionId or sectionType. However, the SectionBuilder
  // expects sectionId and sectionType in order to identify the section. We add those
  // attributes here before passing the asset to SectionBuilder.
  const footerSection = {
    ...footer,
    sectionId: 'footer',
    sectionType: 'footer',
    linkLogoToExternalSite: topbar?.logoLink,
  };

  return (
    <>
      <SectionBuilder sections={[footerSection]} />
      <div style={{ background: '#0b2733', textAlign: 'center', padding: '14px 16px' }}>
        <a
          href="/public-pools"
          style={{ color: '#9fd6ef', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}
        >
          Browse the free public pools directory →
        </a>
      </div>
    </>
  );
};

// NOTE: if you want to add dynamic data to FooterComponent,
//       you could just connect this FooterContainer to Redux Store
//
// const mapStateToProps = state => {
//   const { currentUser } = state.user;
//   return { currentUser };
// };
// const FooterContainer = compose(connect(mapStateToProps))(FooterComponent);
// export default FooterContainer;

export default FooterComponent;
