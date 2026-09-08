import React from 'react';
import classNames from 'classnames';

import shared from '../HomeShared.module.css';
import css from './HomeNotes.module.css';

/**
 * "Love notes" — the three real messages from guests and hosts, as a slim strip between the
 * inventory and the host band. Quotes are verbatim and already public on the live homepage;
 * never add one that a real person did not write.
 */
const HomeNotes = (props) => {
  const { notes } = props;
  return (
    <section className={css.root} aria-label="Love notes from guests and hosts">
      <div className={css.head}>
        <span className={shared.eyebrow}>Love notes</span>
        <span className={css.sub}>Five hearts is our whole review system.</span>
      </div>
      <div className={classNames(shared.rail, css.notes)}>
        {notes.map((n) => (
          <figure key={n.name} className={css.note}>
            <div className={css.hearts} aria-label="Five hearts">
              ♥♥♥♥♥
            </div>
            <blockquote className={css.quote}>“{n.quote}”</blockquote>
            <figcaption className={css.author}>
              <span className={css.initial}>{n.name.charAt(0)}</span>
              <span>
                <span className={css.authorName}>{n.name}</span>
                <span className={css.authorWhere}>{n.where}</span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
};

export default HomeNotes;
