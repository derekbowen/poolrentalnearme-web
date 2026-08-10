import React, { Fragment } from 'react';

import { H1 } from '../PageBuilder/Primitives/Heading';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import { LayoutComposer, StaticPage } from '../PageBuilder/PageBuilder';
import SectionBuilder from '../PageBuilder/SectionBuilder';
import renderMarkdown from '../PageBuilder/markdownProcessor';

import FallbackPage, { fallbackSections } from './FallbackPage';
import { ASSET_NAME } from './TermsOfServicePage.duck';

import TERMS_OF_SERVICE_2026_1 from './terms-2026-1';
import css from './TermsOfServicePage.module.css';

// SEO — ported verbatim from the previous Console hosted asset.
const PAGE_TITLE = 'Terms of Service | Pool Rental Marketplace Agreement & Pool Sharing Rules';
const PAGE_DESCRIPTION =
  'Review the Terms of Service for our pool rental marketplace. This agreement covers pool rental, pool sharing, and booking procedures to ensure a safe and smooth experience for both pool hosts and customers.';
const CANONICAL_URL = 'https://www.poolrentalnearme.com/terms-of-service';
const VERSION_LINE = 'Version 2026.2 — Effective May 6, 2026 · Updated August 10, 2026';

// --- Content-only component (used in signup/login modals). Behavior unchanged:
// still renders the Console-hosted asset passed in by AuthenticationPage. ---
const ModalHeading = (props) => <H1 as="h2" {...props} />;

const TermsOfServiceContent = (props) => {
  const { inProgress, error, data } = props;

  const hasContent = (d) => typeof d?.content === 'string';
  const exposeContentAsChildren = (d) => (hasContent(d) ? { children: d.content } : {});

  if (!hasContent && inProgress) {
    return null;
  }

  const hasData = error === null && data;
  const sectionsData = hasData ? data : fallbackSections;

  return (
    <SectionBuilder
      {...sectionsData}
      options={{
        fieldComponents: {
          heading1: { component: ModalHeading, pickValidProps: exposeContentAsChildren },
        },
        isInsideContainer: true,
      }}
    />
  );
};

// --- Legal-document renderer for the /terms-of-service page ---

// Flatten React children (markdown headings can contain inline nodes) to text.
const childrenToText = (children) =>
  React.Children.toArray(children)
    .map((c) => {
      if (typeof c === 'string') return c;
      if (c && c.props && c.props.children) return childrenToText(c.props.children);
      return '';
    })
    .join('');

const slugify = (children) =>
  childrenToText(children)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

// Heading with a stable id + a subtle "#" self-anchor for per-section links.
const makeHeading = (Tag) => {
  const Heading = ({ children }) => {
    const id = slugify(children);
    return (
      <Tag id={id} className={css.heading}>
        <a href={`#${id}`} className={css.anchorLink} aria-hidden="true" tabIndex={-1}>
          #
        </a>
        {children}
      </Tag>
    );
  };
  return Heading;
};

// The single document H1 ("# POOL RENTAL NEAR ME") gets the version line beneath it.
const DocTitle = ({ children }) => (
  <>
    <h1 className={css.docTitle}>{children}</h1>
    <p className={css.version}>{VERSION_LINE}</p>
  </>
);

const MarkdownLink = ({ href, children }) => (
  <a href={href} className={css.link} rel="noopener noreferrer">
    {children}
  </a>
);

const MARKDOWN_COMPONENTS = {
  h1: DocTitle,
  h2: makeHeading('h2'),
  h3: makeHeading('h3'),
  a: MarkdownLink,
};

const layoutAreas = `
  topbar
  main
  footer
`;

const pageSchema = {
  '@context': 'http://schema.org',
  '@type': 'WebPage',
  name: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  url: CANONICAL_URL,
};

const TermsOfServicePage = () => (
  <StaticPage title={PAGE_TITLE} description={PAGE_DESCRIPTION} schema={pageSchema}>
    <LayoutComposer areas={layoutAreas} className={css.layout}>
      {({ Topbar, Main, Footer }) => (
        <>
          <Topbar as="header" className={css.topbar}>
            <TopbarContainer currentPage="TermsOfServicePage" />
          </Topbar>
          <Main as="main" className={css.main}>
            <article className={css.legalDoc}>
              {renderMarkdown(TERMS_OF_SERVICE_2026_1, MARKDOWN_COMPONENTS)}
            </article>
          </Main>
          <Footer>
            <FooterContainer />
          </Footer>
        </>
      )}
    </LayoutComposer>
  </StaticPage>
);

const TOS_ASSET_NAME = ASSET_NAME;
export { TOS_ASSET_NAME, TermsOfServiceContent, FallbackPage };

export default TermsOfServicePage;
