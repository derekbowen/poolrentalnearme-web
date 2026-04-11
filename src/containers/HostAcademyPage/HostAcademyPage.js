import React, { useMemo, useState } from 'react';
import { connect } from 'react-redux';

import { Page, LayoutSingleColumn } from '../../components';
import TopbarContainer from '../../containers/TopbarContainer/TopbarContainer';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';
import CourseEmbed from '../../components/CourseEmbed/CourseEmbed';
import CertificationBadge from '../../components/CertificationBadge/CertificationBadge';
import { isScrollingDisabled } from '../../ducks/ui.duck';

import {
  TRACKS,
  CERTIFICATION_TIERS,
  COURSES,
  getCoursesByTrack,
  computeCertificationTier,
  computeLadderProgress,
} from '../../config/hostAcademy';

import css from './HostAcademyPage.module.css';

/**
 * HostAcademyPage
 * ───────────────
 * The PRNM Host Academy — ~140 e-learning courses that define the PRNM standard
 * of service and unlock certification tiers.
 *
 * Three jobs:
 *   1. Certification ladder — Certified → Professional → Master with live progress
 *   2. Track browser — 8 tracks (Safety, Operations, Hospitality, Legal,
 *      Marketing, Revenue, Events, Growth) with course lists
 *   3. Course player — inline OpenELMS iframe via <CourseEmbed />
 *
 * Education is how we grow and solve problems. When a host has trouble, we
 * send them here. When a guest is looking for trust, every certified host
 * has walked the same curriculum.
 */

const TRACK_ORDER = [
  'safety',
  'operations',
  'hospitality',
  'legal',
  'marketing',
  'revenue',
  'events',
  'growth',
];

const TierLadder = ({ completedIds, currentTier }) => {
  const ladder = computeLadderProgress(completedIds);
  const tierIds = ['certified', 'professional', 'master'];

  return (
    <div className={css.ladder}>
      {tierIds.map((tid, idx) => {
        const tier = CERTIFICATION_TIERS[tid];
        const { done, total } = ladder[tid];
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);
        const unlocked = currentTier === tid || (
          currentTier === 'professional' && tid === 'certified'
        ) || (currentTier === 'master');
        const isCurrent = currentTier === tid;

        return (
          <div
            key={tid}
            className={css.ladderStep}
            style={{ '--tier-accent': tier.accent }}
            data-current={isCurrent || undefined}
            data-unlocked={unlocked || undefined}
          >
            <div className={css.ladderStepHead}>
              <div className={css.ladderEmoji}>{tier.badgeEmoji}</div>
              <div>
                <div className={css.ladderLabel}>{tier.label}</div>
                <div className={css.ladderTagline}>{tier.tagline}</div>
              </div>
            </div>
            <div className={css.ladderProgress}>
              <div className={css.ladderBar}>
                <div className={css.ladderFill} style={{ width: `${pct}%` }} />
              </div>
              <div className={css.ladderMeta}>
                {done} / {total} courses · +{Math.round((tier.priceMultiplier - 1) * 100)}% suggested pricing
              </div>
            </div>
            {idx < tierIds.length - 1 ? <div className={css.ladderConnector} /> : null}
          </div>
        );
      })}
    </div>
  );
};

const TrackCard = ({ track, courses, completedIds, onOpen }) => {
  const done = courses.filter(c => completedIds.has(c.id)).length;
  const pct = courses.length === 0 ? 0 : Math.round((done / courses.length) * 100);

  return (
    <button
      type="button"
      className={css.trackCard}
      style={{ '--track-accent': track.accent }}
      onClick={() => onOpen(track.id)}
    >
      <div className={css.trackIcon}>{track.icon}</div>
      <div className={css.trackBody}>
        <div className={css.trackName}>
          {track.name}
          {track.required ? <span className={css.requiredTag}>core</span> : null}
        </div>
        <div className={css.trackTagline}>{track.tagline}</div>
        <div className={css.trackMeta}>
          {courses.length} lessons · {done} completed
        </div>
        <div className={css.trackBar}>
          <div className={css.trackBarFill} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </button>
  );
};

const CourseRow = ({ course, completed, onPlay }) => {
  const tierMeta = CERTIFICATION_TIERS[course.tier];
  return (
    <button
      type="button"
      className={css.courseRow}
      data-completed={completed || undefined}
      onClick={() => onPlay(course)}
    >
      <div className={css.courseCheck}>{completed ? '✓' : '▶'}</div>
      <div className={css.courseBody}>
        <div className={css.courseTitle}>{course.title}</div>
        <div className={css.courseDesc}>{course.description}</div>
      </div>
      <div
        className={css.courseTier}
        style={{ '--tier-accent': tierMeta?.accent || '#d4af37' }}
      >
        {tierMeta?.short || course.tier}
      </div>
    </button>
  );
};

const TrackDetail = ({ trackId, completedIds, onPlay, onBack }) => {
  const track = TRACKS[trackId];
  const courses = useMemo(() => getCoursesByTrack(trackId), [trackId]);

  if (!track) return null;

  return (
    <div className={css.trackDetail} style={{ '--track-accent': track.accent }}>
      <button type="button" className={css.backLink} onClick={onBack}>
        ← All tracks
      </button>
      <div className={css.trackDetailHead}>
        <div className={css.trackDetailIcon}>{track.icon}</div>
        <div>
          <div className={css.trackDetailName}>{track.name}</div>
          <div className={css.trackDetailTagline}>{track.tagline}</div>
        </div>
      </div>
      <p className={css.trackDetailDesc}>{track.description}</p>
      <div className={css.courseList}>
        {courses.map(c => (
          <CourseRow
            key={c.id}
            course={c}
            completed={completedIds.has(c.id)}
            onPlay={onPlay}
          />
        ))}
      </div>
    </div>
  );
};

export const HostAcademyPageComponent = props => {
  const { scrollingDisabled, currentUser } = props;

  // Progress is persisted in currentUser.profile.protectedData.courseProgress
  // as { [courseId]: { completedAt, progress } }.
  const completedIds = useMemo(() => {
    const progress =
      currentUser?.attributes?.profile?.protectedData?.courseProgress || {};
    const done = new Set();
    Object.entries(progress).forEach(([id, meta]) => {
      if (meta?.completedAt || meta?.progress >= 1) done.add(id);
    });
    return done;
  }, [currentUser]);

  const currentTier = useMemo(() => computeCertificationTier(completedIds), [completedIds]);

  const [selectedTrack, setSelectedTrack] = useState(null);
  const [playingCourse, setPlayingCourse] = useState(null);

  const totalCourses = COURSES.length;
  const totalDone = completedIds.size;

  return (
    <Page title="Host Academy · PoolRentalNearMe" scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.pageRoot}>
          <div className={css.shell}>
            <header className={css.hero}>
              <div className={css.heroEyebrow}>PRNM Host Academy</div>
              <h1 className={css.heroTitle}>
                The standard every PoolRentalNearMe host learns.
              </h1>
              <p className={css.heroLede}>
                {totalCourses} lessons across {TRACK_ORDER.length} tracks.
                Every certified host learns the same safety, operations, and
                hospitality SOPs — so guests get the same five-star experience
                at every PRNM pool. When something comes up, we have a course
                that teaches exactly how we do it here.
              </p>
              <div className={css.heroStats}>
                <div className={css.heroStat}>
                  <div className={css.heroStatValue}>{totalDone}</div>
                  <div className={css.heroStatLabel}>completed</div>
                </div>
                <div className={css.heroStatDivider} />
                <div className={css.heroStat}>
                  <div className={css.heroStatValue}>{totalCourses}</div>
                  <div className={css.heroStatLabel}>total lessons</div>
                </div>
                {currentTier ? (
                  <>
                    <div className={css.heroStatDivider} />
                    <div className={css.heroStat}>
                      <CertificationBadge
                        tier={currentTier}
                        size="lg"
                        surface="internal"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </header>

            <section className={css.section}>
              <div className={css.sectionHead}>
                <h2 className={css.sectionTitle}>Certification ladder</h2>
                <p className={css.sectionLede}>
                  Complete course tracks to unlock the next tier. Higher tiers
                  signal trust internally and lift your recommended pricing.
                </p>
              </div>
              <TierLadder completedIds={completedIds} currentTier={currentTier} />
            </section>

            <section className={css.section}>
              <div className={css.sectionHead}>
                <h2 className={css.sectionTitle}>
                  {selectedTrack ? TRACKS[selectedTrack].name : 'Browse by track'}
                </h2>
                <p className={css.sectionLede}>
                  {selectedTrack
                    ? TRACKS[selectedTrack].tagline
                    : 'Eight tracks. Start anywhere. Core tracks are required for certification.'}
                </p>
              </div>

              {selectedTrack ? (
                <TrackDetail
                  trackId={selectedTrack}
                  completedIds={completedIds}
                  onPlay={setPlayingCourse}
                  onBack={() => setSelectedTrack(null)}
                />
              ) : (
                <div className={css.trackGrid}>
                  {TRACK_ORDER.map(tid => (
                    <TrackCard
                      key={tid}
                      track={TRACKS[tid]}
                      courses={getCoursesByTrack(tid)}
                      completedIds={completedIds}
                      onOpen={setSelectedTrack}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {playingCourse ? (
          <div
            className={css.modalBackdrop}
            onClick={() => setPlayingCourse(null)}
          >
            <div className={css.modalShell} onClick={e => e.stopPropagation()}>
              <CourseEmbed
                course={playingCourse}
                onClose={() => setPlayingCourse(null)}
              />
            </div>
          </div>
        ) : null}
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({
  scrollingDisabled: isScrollingDisabled(state),
  currentUser: state.user?.currentUser || null,
});

export default connect(mapStateToProps)(HostAcademyPageComponent);
