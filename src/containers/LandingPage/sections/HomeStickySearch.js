import React from 'react';
import classNames from 'classnames';

import HomeShortcuts from './HomeShortcuts';
import { SearchGlyph } from './HomeSearchForm';

import shared from '../HomeShared.module.css';
import css from './HomeStickySearch.module.css';

/**
 * Mobile scrolled state: once the hero search leaves the viewport, a compact glass pill with the
 * current search summary and the shortcut row sticks to the top. Tapping it returns to the hero
 * search. Hidden on desktop.
 */
const HomeStickySearch = (props) => {
  const { visible, primary, secondary, shortcuts, onTap } = props;
  return (
    <div className={classNames(css.root, { [css.visible]: visible })} aria-hidden={!visible}>
      <button
        type="button"
        className={classNames(shared.buttonReset, css.pill)}
        onClick={onTap}
        tabIndex={visible ? 0 : -1}
      >
        <span className={css.text}>
          <span className={css.primary}>{primary}</span>
          <span className={css.secondary}>{secondary}</span>
        </span>
        <span className={classNames(shared.sun, css.go)}>
          <SearchGlyph className={css.glyph} />
        </span>
      </button>
      <HomeShortcuts items={shortcuts} compact className={css.shortcuts} />
    </div>
  );
};

export default HomeStickySearch;
