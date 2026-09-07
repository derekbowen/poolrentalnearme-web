import React, { useState } from 'react';
import classNames from 'classnames';

import { NamedLink } from '../../../components';
import { FOOTER_GROUPS, IMG, LEGAL_LINE } from '../homeContent';

import shared from '../HomeShared.module.css';
import css from './HomeFooter.module.css';

const isExternal = (href) => /^https?:\/\//.test(href);

const FooterLink = ({ link }) => (
  <a
    href={link.href}
    className={css.link}
    {...(isExternal(link.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
  >
    {link.label}
  </a>
);

/**
 * Marketplace footer: Rent · Host · Learn · Company · Help · Legal · Social. Four wrapping
 * columns on desktop; accordion groups on mobile with every link still rendered for crawlers.
 */
const HomeFooter = () => {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <footer className={css.root}>
      <div className={css.groups}>
        {FOOTER_GROUPS.map((g, i) => {
          const open = i === openIndex;
          return (
            <div key={g.title} className={css.group}>
              <h4 className={css.groupTitle}>{g.title}</h4>
              <button
                type="button"
                className={classNames(shared.buttonReset, css.groupToggle)}
                onClick={() => setOpenIndex(open ? -1 : i)}
                aria-expanded={open}
              >
                <span>{g.title}</span>
                <span className={css.groupIcon} aria-hidden="true">
                  {open ? '–' : '+'}
                </span>
              </button>
              <div className={classNames(css.links, { [css.linksOpen]: open })}>
                <div className={css.linksInner}>
                  {g.links.map((k) => (
                    <FooterLink key={k.label} link={k} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className={css.bottom}>
        <NamedLink name="LandingPage" className={css.logoBox} aria-label="Pool Rental Near Me home">
          <img src={IMG.logo} alt="Pool Rental Near Me" className={css.logo} />
        </NamedLink>
        <p className={css.legal}>{LEGAL_LINE}</p>
      </div>
    </footer>
  );
};

export default HomeFooter;
