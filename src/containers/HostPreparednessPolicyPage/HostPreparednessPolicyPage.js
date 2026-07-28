import React from 'react';

import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import { LayoutComposer, StaticPage } from '../PageBuilder/PageBuilder';
import renderMarkdown from '../PageBuilder/markdownProcessor';

import HOST_PREPAREDNESS_2026_1 from './host-preparedness-2026-1';

// Shared with TermsOfServicePage on purpose: both routes render a legal
// document and must look identical, including the print stylesheet used to
// export clean PDF copies for underwriting.
import css from '../TermsOfServicePage/TermsOfServicePage.module.css';

const PAGE_TITLE = 'Host Preparedness & Issue Resolution Policy | Pool Rental Near Me';
const PAGE_DESCRIPTION =
  'Preparedness standards for pool hosts, guest count and additional guest charges, how to escalate an issue during a booking, damage and cleaning claims, and payment dispute handling on Pool Rental Near Me.';
const CANONICAL_URL = 'https://www.poolrentalnearme.com/host-standards';
const VERSION_LINE = 'Version 2026.1 — Effective August 27, 2026';

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

// The single document H1 gets the version line beneath it.
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

const HostPreparednessPolicyPage = () => (
  <StaticPage title={PAGE_TITLE} description={PAGE_DESCRIPTION} schema={pageSchema}>
    <LayoutComposer areas={layoutAreas} className={css.layout}>
      {({ Topbar, Main, Footer }) => (
        <>
          <Topbar as="header" className={css.topbar}>
            <TopbarContainer currentPage="HostPreparednessPolicyPage" />
          </Topbar>
          <Main as="main" className={css.main}>
            <article className={css.legalDoc}>
              {renderMarkdown(HOST_PREPAREDNESS_2026_1, MARKDOWN_COMPONENTS)}
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

export default HostPreparednessPolicyPage;
