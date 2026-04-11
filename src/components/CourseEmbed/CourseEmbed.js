import React from 'react';
import classNames from 'classnames';

import { getOpenElmsEmbedUrl } from '../../config/hostAcademy';
import css from './CourseEmbed.module.css';

/**
 * CourseEmbed
 * ───────────
 * Iframe wrapper for OpenELMS (openelms.ai) course content.
 *
 * The LMS backend already exists — we just need to render the embed URL.
 * If a course doesn't yet have an openElmsId, we show a "coming soon"
 * placeholder rather than an error, staying consistent with the
 * never-close-the-door philosophy.
 */
const CourseEmbed = ({ course, className, onClose }) => {
  const url = getOpenElmsEmbedUrl(course);

  if (!course) {
    return null;
  }

  return (
    <div className={classNames(css.root, className)}>
      <div className={css.header}>
        <div className={css.headerText}>
          <div className={css.eyebrow}>PRNM Academy · {course.track}</div>
          <h2 className={css.title}>{course.title}</h2>
          {course.description ? <p className={css.description}>{course.description}</p> : null}
        </div>
        {onClose ? (
          <button type="button" className={css.closeBtn} onClick={onClose} aria-label="Close course">
            ✕
          </button>
        ) : null}
      </div>

      {url ? (
        <div className={css.frameWrap}>
          <iframe
            src={url}
            className={css.frame}
            title={course.title}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className={css.placeholder}>
          <div className={css.placeholderIcon}>◆</div>
          <div className={css.placeholderTitle}>Course embed coming soon</div>
          <p className={css.placeholderText}>
            This lesson exists in our catalog but hasn’t been linked to the OpenELMS player yet.
            It’ll be available here shortly — in the meantime, every other course in the academy
            is ready to watch.
          </p>
        </div>
      )}
    </div>
  );
};

export default CourseEmbed;
