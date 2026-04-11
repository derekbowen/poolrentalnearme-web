import React, { useState, useMemo } from 'react';
import { connect } from 'react-redux';

import { Page, LayoutSingleColumn } from '../../components';
import TopbarContainer from '../../containers/TopbarContainer/TopbarContainer';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import {
  evaluateHostApplication,
  getTierMeta,
} from '../../util/listingAI/evaluateHostApplication';

import css from './HostApplicationPage.module.css';

/**
 * HostApplicationPage
 * ───────────────────
 * A multi-step wizard that onboards new pool hosts.
 *
 * Philosophy: WE GIVE YOU OPPORTUNITY. The door never closes.
 * Every applicant is welcomed. The AI places them on a tier ladder
 * (Starter → Verified → Top-Tier) and returns a personalized Polish Plan
 * of concrete fixes they can work through at their own pace.
 *
 * Wizard flow:
 *   1. Welcome — sets the tone (coaching, not gatekeeping)
 *   2. Photos — upload 3+ pool photos
 *   3. Pool basics — name, city, capacity
 *   4. Safety checklist — self-attestation (honest answers unlock higher tiers)
 *   5. Hospitality questionnaire — amenities, response time, host story
 *   6. Review + submit
 *   7. Result — welcome message, tier badge, Polish Plan, "Create my listing" CTA
 */

const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'photos', label: 'Photos' },
  { id: 'basics', label: 'Pool Basics' },
  { id: 'safety', label: 'Safety Check' },
  { id: 'hospitality', label: 'Hospitality' },
  { id: 'review', label: 'Review' },
];

const SAFETY_QUESTIONS = [
  { key: 'hasFence', label: 'The pool area has a fence or full barrier' },
  { key: 'hasGateLatch', label: 'Gates have a functional self-latching lock' },
  { key: 'hasLifeRing', label: 'A life ring, shepherd\u2019s hook, or rescue equipment is on site' },
  { key: 'waterIsClear', label: 'Pool water is crystal clear (bottom visible from deck)' },
  { key: 'hasPostedRules', label: 'Pool rules are posted where guests can see them' },
  { key: 'hasFirstAid', label: 'A first aid kit is accessible at the pool' },
  { key: 'noHazards', label: 'No exposed wiring, broken decking, or sharp edges' },
];

const HOSPITALITY_QUESTIONS = [
  { key: 'seatingCount', label: 'How many people can comfortably sit around the pool?', type: 'number', placeholder: '8' },
  { key: 'hasShade', label: 'Is there shade (umbrella, pergola, tree canopy)?', type: 'boolean' },
  { key: 'hasRestroom', label: 'Do guests have access to a restroom?', type: 'boolean' },
  { key: 'hasOutdoorShower', label: 'Outdoor shower or rinse area?', type: 'boolean' },
  { key: 'responseTimeHours', label: 'How fast do you typically reply to messages? (hours)', type: 'number', placeholder: '1' },
  { key: 'hostStory', label: 'What do guests love most about your pool? (1-2 sentences)', type: 'textarea', placeholder: 'The kids always jump straight into the shallow end \u2014 it\u2019s warm year-round and the waterfall makes it feel like a resort.' },
];

const initialState = {
  step: 0,
  photos: [], // object URLs for preview, plus file refs
  photoUrls: [], // remote urls (mocked for now — real impl uploads to Sharetribe images)
  poolName: '',
  hostName: '',
  city: '',
  state: '',
  capacity: '',
  safety: SAFETY_QUESTIONS.reduce((acc, q) => ({ ...acc, [q.key]: false }), {}),
  hospitality: HOSPITALITY_QUESTIONS.reduce((acc, q) => ({ ...acc, [q.key]: q.type === 'boolean' ? false : '' }), {}),
  submitting: false,
  result: null,
  submitError: null,
};

const PhotoUploader = ({ photos, onChange }) => {
  const handleFiles = e => {
    const files = Array.from(e.target.files || []);
    const additions = files.map(f => ({
      id: `${f.name}-${f.size}-${Date.now()}`,
      name: f.name,
      url: URL.createObjectURL(f),
      file: f,
    }));
    onChange([...photos, ...additions]);
  };
  const removeOne = id => onChange(photos.filter(p => p.id !== id));

  return (
    <div className={css.photoUploader}>
      <label className={css.photoDropzone}>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleFiles}
          className={css.hiddenInput}
        />
        <div className={css.dropzoneInner}>
          <div className={css.dropzoneIcon}>+</div>
          <div className={css.dropzoneTitle}>Add pool photos</div>
          <div className={css.dropzoneHint}>
            3+ photos work best. Hero shot, deck/seating, safety features.
          </div>
        </div>
      </label>

      {photos.length > 0 && (
        <div className={css.photoGrid}>
          {photos.map(p => (
            <div key={p.id} className={css.photoTile}>
              <img src={p.url} alt={p.name} />
              <button
                type="button"
                className={css.photoRemove}
                onClick={() => removeOne(p.id)}
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const StepDots = ({ currentStep }) => (
  <div className={css.stepDots}>
    {STEPS.map((s, i) => (
      <div
        key={s.id}
        className={[
          css.stepDot,
          i === currentStep ? css.stepDotActive : '',
          i < currentStep ? css.stepDotDone : '',
        ].join(' ')}
      >
        <div className={css.stepDotCircle}>{i < currentStep ? '\u2713' : i + 1}</div>
        <div className={css.stepDotLabel}>{s.label}</div>
      </div>
    ))}
  </div>
);

const WelcomeStep = ({ onNext }) => (
  <div className={css.stepBody}>
    <div className={css.welcomeBadge}>Apply to Host</div>
    <h1 className={css.welcomeTitle}>Every pool has a place here.</h1>
    <p className={css.welcomeLead}>
      We built PoolRentalNearMe as a coaching marketplace, not a gated one.
      Everyone who applies is welcomed onto the platform. Your tier — Starter,
      Verified, or Top-Tier — is determined by our safety + hospitality scorecard,
      and you can climb it on your own schedule.
    </p>
    <div className={css.welcomeBullets}>
      <div className={css.welcomeBullet}>
        <span className={css.welcomeBulletIcon}>◆</span>
        <div>
          <strong>No rejections.</strong> You'll receive a personalized
          Polish Plan, not a denial letter.
        </div>
      </div>
      <div className={css.welcomeBullet}>
        <span className={css.welcomeBulletIcon}>◆</span>
        <div>
          <strong>Transparent tiers.</strong> See exactly what unlocks the
          Verified and Top-Tier badges before you submit.
        </div>
      </div>
      <div className={css.welcomeBullet}>
        <span className={css.welcomeBulletIcon}>◆</span>
        <div>
          <strong>Climb at your pace.</strong> Start earning today; polish
          toward a higher tier on your schedule.
        </div>
      </div>
    </div>
    <button type="button" className={css.primaryCta} onClick={onNext}>
      Start my application →
    </button>
  </div>
);

const PhotosStep = ({ state, setState, onBack, onNext }) => (
  <div className={css.stepBody}>
    <h2 className={css.stepTitle}>Show us your pool</h2>
    <p className={css.stepLead}>
      Upload a few photos — a wide hero shot, the deck, and any safety features
      (fence, gate, life ring). These feed directly into our AI evaluator.
    </p>
    <PhotoUploader
      photos={state.photos}
      onChange={photos => setState(s => ({ ...s, photos }))}
    />
    <div className={css.stepFooter}>
      <button type="button" className={css.ghostCta} onClick={onBack}>
        ← Back
      </button>
      <button
        type="button"
        className={css.primaryCta}
        onClick={onNext}
        disabled={state.photos.length === 0}
      >
        Continue →
      </button>
    </div>
  </div>
);

const BasicsStep = ({ state, setState, onBack, onNext }) => {
  const canContinue = state.poolName.trim() && state.city.trim();
  return (
    <div className={css.stepBody}>
      <h2 className={css.stepTitle}>The basics</h2>
      <p className={css.stepLead}>Name your pool and tell us where it lives.</p>

      <div className={css.fieldGrid}>
        <label className={css.field}>
          <span className={css.fieldLabel}>Pool name</span>
          <input
            type="text"
            className={css.textInput}
            value={state.poolName}
            onChange={e => setState(s => ({ ...s, poolName: e.target.value }))}
            placeholder="Backyard Oasis with Hot Tub"
          />
        </label>

        <label className={css.field}>
          <span className={css.fieldLabel}>Your first name</span>
          <input
            type="text"
            className={css.textInput}
            value={state.hostName}
            onChange={e => setState(s => ({ ...s, hostName: e.target.value }))}
            placeholder="Alex"
          />
        </label>

        <label className={css.field}>
          <span className={css.fieldLabel}>City</span>
          <input
            type="text"
            className={css.textInput}
            value={state.city}
            onChange={e => setState(s => ({ ...s, city: e.target.value }))}
            placeholder="Riverside"
          />
        </label>

        <label className={css.field}>
          <span className={css.fieldLabel}>State</span>
          <input
            type="text"
            className={css.textInput}
            value={state.state}
            onChange={e => setState(s => ({ ...s, state: e.target.value }))}
            placeholder="CA"
            maxLength={2}
          />
        </label>

        <label className={css.field}>
          <span className={css.fieldLabel}>Max capacity</span>
          <input
            type="number"
            className={css.textInput}
            value={state.capacity}
            onChange={e => setState(s => ({ ...s, capacity: e.target.value }))}
            placeholder="12"
          />
        </label>
      </div>

      <div className={css.stepFooter}>
        <button type="button" className={css.ghostCta} onClick={onBack}>
          ← Back
        </button>
        <button
          type="button"
          className={css.primaryCta}
          onClick={onNext}
          disabled={!canContinue}
        >
          Continue →
        </button>
      </div>
    </div>
  );
};

const SafetyStep = ({ state, setState, onBack, onNext }) => {
  const toggle = key =>
    setState(s => ({ ...s, safety: { ...s.safety, [key]: !s.safety[key] } }));

  const checkedCount = Object.values(state.safety).filter(Boolean).length;

  return (
    <div className={css.stepBody}>
      <h2 className={css.stepTitle}>Safety checklist</h2>
      <p className={css.stepLead}>
        Honest answers unlock your tier. Missing items aren't blockers —
        they become action items in your Polish Plan.
      </p>

      <div className={css.checklistCard}>
        <div className={css.checklistHeader}>
          <div className={css.checklistCounter}>
            <strong>{checkedCount}</strong> / {SAFETY_QUESTIONS.length}
          </div>
          <div className={css.checklistHint}>
            You're still in even if nothing is checked. We'll guide you.
          </div>
        </div>
        {SAFETY_QUESTIONS.map(q => (
          <label key={q.key} className={css.checklistRow}>
            <input
              type="checkbox"
              checked={state.safety[q.key]}
              onChange={() => toggle(q.key)}
            />
            <span className={css.checklistLabel}>{q.label}</span>
          </label>
        ))}
      </div>

      <div className={css.stepFooter}>
        <button type="button" className={css.ghostCta} onClick={onBack}>
          ← Back
        </button>
        <button type="button" className={css.primaryCta} onClick={onNext}>
          Continue →
        </button>
      </div>
    </div>
  );
};

const HospitalityStep = ({ state, setState, onBack, onNext }) => {
  const updateField = (key, value) =>
    setState(s => ({ ...s, hospitality: { ...s.hospitality, [key]: value } }));

  return (
    <div className={css.stepBody}>
      <h2 className={css.stepTitle}>Hospitality</h2>
      <p className={css.stepLead}>
        These details power your listing and boost your search rank.
      </p>

      <div className={css.fieldStack}>
        {HOSPITALITY_QUESTIONS.map(q => {
          const value = state.hospitality[q.key];
          if (q.type === 'boolean') {
            return (
              <label key={q.key} className={css.booleanRow}>
                <span className={css.fieldLabel}>{q.label}</span>
                <div className={css.toggleGroup}>
                  <button
                    type="button"
                    className={[css.toggleBtn, value === true ? css.toggleBtnActive : ''].join(' ')}
                    onClick={() => updateField(q.key, true)}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className={[css.toggleBtn, value === false ? css.toggleBtnActive : ''].join(' ')}
                    onClick={() => updateField(q.key, false)}
                  >
                    No
                  </button>
                </div>
              </label>
            );
          }
          if (q.type === 'textarea') {
            return (
              <label key={q.key} className={css.field}>
                <span className={css.fieldLabel}>{q.label}</span>
                <textarea
                  className={css.textArea}
                  value={value}
                  onChange={e => updateField(q.key, e.target.value)}
                  placeholder={q.placeholder}
                  rows={3}
                />
              </label>
            );
          }
          return (
            <label key={q.key} className={css.field}>
              <span className={css.fieldLabel}>{q.label}</span>
              <input
                type={q.type || 'text'}
                className={css.textInput}
                value={value}
                onChange={e => updateField(q.key, e.target.value)}
                placeholder={q.placeholder}
              />
            </label>
          );
        })}
      </div>

      <div className={css.stepFooter}>
        <button type="button" className={css.ghostCta} onClick={onBack}>
          ← Back
        </button>
        <button type="button" className={css.primaryCta} onClick={onNext}>
          Continue →
        </button>
      </div>
    </div>
  );
};

const ReviewStep = ({ state, onBack, onSubmit }) => (
  <div className={css.stepBody}>
    <h2 className={css.stepTitle}>Ready to meet your coach?</h2>
    <p className={css.stepLead}>
      Our AI evaluator will review your photos and answers, welcome you to
      your tier, and hand back a personalized Polish Plan. No gatekeeping —
      just a clear path forward.
    </p>

    <div className={css.reviewCard}>
      <div className={css.reviewRow}>
        <span>Pool</span>
        <strong>{state.poolName || '\u2014'}</strong>
      </div>
      <div className={css.reviewRow}>
        <span>Location</span>
        <strong>
          {state.city}
          {state.state ? `, ${state.state}` : ''}
        </strong>
      </div>
      <div className={css.reviewRow}>
        <span>Photos</span>
        <strong>{state.photos.length} uploaded</strong>
      </div>
      <div className={css.reviewRow}>
        <span>Capacity</span>
        <strong>{state.capacity || '\u2014'} guests</strong>
      </div>
      <div className={css.reviewRow}>
        <span>Safety items confirmed</span>
        <strong>
          {Object.values(state.safety).filter(Boolean).length} / {SAFETY_QUESTIONS.length}
        </strong>
      </div>
    </div>

    {state.submitError && (
      <div className={css.errorBanner}>{state.submitError}</div>
    )}

    <div className={css.stepFooter}>
      <button type="button" className={css.ghostCta} onClick={onBack} disabled={state.submitting}>
        ← Back
      </button>
      <button
        type="button"
        className={css.primaryCta}
        onClick={onSubmit}
        disabled={state.submitting}
      >
        {state.submitting ? 'Evaluating\u2026' : 'Submit application →'}
      </button>
    </div>
  </div>
);

const ResultView = ({ result, onReset }) => {
  const tierMeta = getTierMeta(result.tier);
  const scoreTotal = result.scores?.total ?? 0;
  const scoreBars = [
    { label: 'Safety', value: result.scores?.safety ?? 0, max: 50 },
    { label: 'Cleanliness', value: result.scores?.cleanliness ?? 0, max: 20 },
    { label: 'Amenities', value: result.scores?.amenities ?? 0, max: 15 },
    { label: 'Communication', value: result.scores?.communication ?? 0, max: 15 },
  ];

  return (
    <div className={css.resultWrap}>
      <div className={css.resultHero} style={{ '--tier-accent': tierMeta.accent }}>
        <div className={css.resultApprovedPill}>
          <span className={css.resultApprovedDot} />
          Application approved
        </div>
        <div className={css.resultTierBadge}>
          <span className={css.resultTierEmoji}>{tierMeta.badgeEmoji}</span>
          <div>
            <div className={css.resultTierLabel}>{tierMeta.label}</div>
            <div className={css.resultTierTagline}>{tierMeta.tagline}</div>
          </div>
        </div>
        <p className={css.resultWelcome}>{result.welcomeMessage}</p>
      </div>

      <div className={css.resultScoreCard}>
        <div className={css.resultScoreHeader}>
          <div>
            <div className={css.resultScoreLabel}>Your scorecard</div>
            <div className={css.resultScoreTotal}>{scoreTotal}<span>/100</span></div>
          </div>
          {result.nextTier && (
            <div className={css.resultNextTier}>
              <div className={css.resultNextTierLabel}>Next tier</div>
              <div className={css.resultNextTierValue}>{getTierMeta(result.nextTier).label}</div>
            </div>
          )}
        </div>
        <div className={css.resultScoreBars}>
          {scoreBars.map(b => (
            <div key={b.label} className={css.scoreBar}>
              <div className={css.scoreBarLabel}>
                <span>{b.label}</span>
                <span>{b.value}/{b.max}</span>
              </div>
              <div className={css.scoreBarTrack}>
                <div
                  className={css.scoreBarFill}
                  style={{ width: `${Math.round((b.value / b.max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {result.tierUnlockMessage && (
          <div className={css.resultUnlockMessage}>
            <strong>Unlock {result.nextTier ? getTierMeta(result.nextTier).label : 'next tier'}:</strong>{' '}
            {result.tierUnlockMessage}
          </div>
        )}
      </div>

      <div className={css.polishPlanCard}>
        <div className={css.polishPlanHeader}>
          <div className={css.polishPlanTitle}>Your Polish Plan</div>
          <div className={css.polishPlanMeta}>
            {result.polishPlan?.length || 0} items · est. {result.estimatedEffort || 'afternoon'}
          </div>
        </div>
        <div className={css.polishPlanList}>
          {(result.polishPlan || []).map((item, i) => (
            <div key={i} className={[css.polishPlanItem, css[`priority_${item.priority}`]].join(' ')}>
              <div className={css.polishPlanItemNum}>{i + 1}</div>
              <div className={css.polishPlanItemBody}>
                <div className={css.polishPlanItemAction}>{item.action}</div>
                <div className={css.polishPlanItemWhy}>{item.why}</div>
              </div>
              <div className={[css.polishPlanItemPriority, css[`priority_${item.priority}_pill`]].join(' ')}>
                {item.priority}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={css.resultCtas}>
        <button type="button" className={css.primaryCta}>
          Create my listing →
        </button>
        <button type="button" className={css.ghostCta} onClick={onReset}>
          Submit another application
        </button>
      </div>
    </div>
  );
};

export const HostApplicationPageComponent = props => {
  const { scrollingDisabled } = props;
  const [state, setState] = useState(initialState);

  const currentStep = STEPS[state.step];

  const next = () => setState(s => ({ ...s, step: Math.min(s.step + 1, STEPS.length - 1) }));
  const back = () => setState(s => ({ ...s, step: Math.max(s.step - 1, 0) }));
  const reset = () => setState(initialState);

  const handleSubmit = async () => {
    setState(s => ({ ...s, submitting: true, submitError: null }));
    try {
      // NOTE: in production we'd upload the photo files to Sharetribe Images API
      // and pass the resulting URLs. For the MVP we pass the local object URLs;
      // the server will gracefully fall back to the template evaluation if the
      // model can't reach them (see buildFallbackEvaluation in the endpoint).
      const result = await evaluateHostApplication({
        imageUrls: state.photos.map(p => p.url),
        poolName: state.poolName,
        hostName: state.hostName,
        city: state.city,
        state: state.state,
        questionnaire: {
          capacity: state.capacity,
          safety: state.safety,
          hospitality: state.hospitality,
        },
      });
      setState(s => ({ ...s, submitting: false, result }));
    } catch (err) {
      setState(s => ({ ...s, submitting: false, submitError: err.message }));
    }
  };

  const stepContent = useMemo(() => {
    if (state.result) return <ResultView result={state.result} onReset={reset} />;
    switch (currentStep.id) {
      case 'welcome':
        return <WelcomeStep onNext={next} />;
      case 'photos':
        return <PhotosStep state={state} setState={setState} onBack={back} onNext={next} />;
      case 'basics':
        return <BasicsStep state={state} setState={setState} onBack={back} onNext={next} />;
      case 'safety':
        return <SafetyStep state={state} setState={setState} onBack={back} onNext={next} />;
      case 'hospitality':
        return <HospitalityStep state={state} setState={setState} onBack={back} onNext={next} />;
      case 'review':
        return <ReviewStep state={state} onBack={back} onSubmit={handleSubmit} />;
      default:
        return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Page title="Apply to host · PoolRentalNearMe" scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.pageRoot}>
          <div className={css.shell}>
            {!state.result && <StepDots currentStep={state.step} />}
            {stepContent}
          </div>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({
  scrollingDisabled: isScrollingDisabled(state),
});

export default connect(mapStateToProps)(HostApplicationPageComponent);
