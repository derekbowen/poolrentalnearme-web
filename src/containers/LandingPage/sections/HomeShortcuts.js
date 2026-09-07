import React from 'react';
import classNames from 'classnames';

import { NamedLink } from '../../../components';

import shared from '../HomeShared.module.css';
import css from './HomeShortcuts.module.css';

/**
 * Seasonal browse shortcuts (Indoor · Heated · Hot tubs · Night swims · Pool parties · Family
 * pools). Centred chips on desktop, an edge-to-edge rail on mobile; `compact` is the smaller
 * variant used inside the sticky mobile search.
 */
const HomeShortcuts = (props) => {
  const { items, compact = false, className } = props;
  return (
    <div className={classNames(css.root, className, { [css.compact]: compact })}>
      {items.map((s) => (
        <NamedLink
          key={s.key}
          name="SearchPage"
          to={s.to}
          className={classNames(shared.glassLight, css.chip)}
        >
          {s.imageUrl ? (
            <img src={s.imageUrl} alt="" className={css.img} loading="lazy" />
          ) : (
            <span className={css.slot} aria-hidden="true" />
          )}
          {s.label}
        </NamedLink>
      ))}
    </div>
  );
};

export default HomeShortcuts;
