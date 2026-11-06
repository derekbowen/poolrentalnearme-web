import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ROLES,
  topicsFor,
  findTopic,
  buildPrefill,
  buildSmsHref,
  buildMailtoHref,
  phoneDisplay,
} from './textUsContent';
import { STEP, canSms, isIntlSite, track } from './textUsLogic';

import css from './TextUsBubble.module.css';

// Floating "Text us" help bubble (replaces the removed Intercom launcher).
// Loaded client-side only, after hydration, by TextUsMount in
// src/routing/AppRouter.jsx, so server HTML never contains it.
//
// It never sends anything and has no text entry of any kind: every path ends
// in the visitor's own SMS app (sms: link) or mail client (mailto: link). The
// phone number is assembled only when the visitor taps "Text us".

// /tools/cta.js (injected by nginx on WEST) renders the host CTA #prnm-cta
// bottom-right at z-index 2147483000. Derek's decision (2026-11-05): the CTA
// stays, the bubble sits bottom-left, and the CTA is hidden while the bubble's
// panel is open (the panel spans most of a phone's width), then restored.
//
// The CTA is hidden with `visibility: hidden`, not removed or display:none:
// that hides it from sight, pointer and screen readers, while its box stays
// measurable, so the launcher (lifted above the CTA where they would overlap)
// does not jump down the moment the panel opens.
const CTA_ID = 'prnm-cta';
const CTA_GAP_PX = 12;

const useCtaCoordination = (open, launcherRef) => {
  const [clearance, setClearance] = useState(0);
  const openRef = useRef(open);
  const hiddenRef = useRef(null); // { el, prev } while we hide the CTA

  const restoreCta = useCallback(() => {
    const hidden = hiddenRef.current;
    hiddenRef.current = null;
    if (hidden) hidden.el.style.visibility = hidden.prev;
  }, []);

  const hideCta = useCallback(
    (el) => {
      if (!el || (hiddenRef.current && hiddenRef.current.el === el)) return;
      restoreCta();
      hiddenRef.current = { el, prev: el.style.visibility };
      el.style.visibility = 'hidden';
    },
    [restoreCta]
  );

  // Hide while open; restore on close. Restore on unmount too, whatever the
  // reason (route hides the bubble, a modal opens, the page unloads it).
  useEffect(() => {
    openRef.current = open;
    if (typeof document === 'undefined') return;
    if (open) hideCta(document.getElementById(CTA_ID));
    else restoreCta();
  }, [open, hideCta, restoreCta]);

  useEffect(() => restoreCta, [restoreCta]);

  // Lift the launcher above the CTA only where the two would overlap. The CTA
  // is bottom-right; on narrow phones (<= about 440px) its max-width
  // min(78vw, 300px) reaches the bottom-left launcher.
  useEffect(() => {
    if (typeof window === 'undefined' || !document.body) return undefined;
    let frame = 0;
    let observed = null;
    let resizeObserver = null;

    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const el = document.getElementById(CTA_ID);
        const launcher = launcherRef.current;
        if (!el || !launcher) {
          setClearance(0);
          return;
        }
        const cta = el.getBoundingClientRect();
        const own = launcher.getBoundingClientRect();
        const visible = cta.width > 0 && cta.height > 0;
        const inLowerHalf = cta.top > window.innerHeight / 2;
        const overlapsX = cta.left < own.right + CTA_GAP_PX && cta.right > own.left - CTA_GAP_PX;
        setClearance(
          visible && inLowerHalf && overlapsX
            ? Math.round(window.innerHeight - cta.top + CTA_GAP_PX)
            : 0
        );
      });
    };

    // The CTA is appended to <body> after load and removed when dismissed; it
    // also grows when opened and slides in with a transform.
    const watchCta = () => {
      const el = document.getElementById(CTA_ID);
      if (el === observed) return;
      if (observed) observed.removeEventListener('transitionend', measure);
      if (resizeObserver) resizeObserver.disconnect();
      resizeObserver = null;
      observed = el;
      if (!el) return;
      // A CTA that appears while the panel is open is hidden at once.
      if (openRef.current) hideCta(el);
      el.addEventListener('transitionend', measure);
      if (typeof window.ResizeObserver === 'function') {
        resizeObserver = new window.ResizeObserver(measure);
        resizeObserver.observe(el);
      }
    };

    const onBodyChange = () => {
      watchCta();
      measure();
    };

    const mutationObserver =
      typeof window.MutationObserver === 'function'
        ? new window.MutationObserver(onBodyChange)
        : null;
    if (mutationObserver) mutationObserver.observe(document.body, { childList: true });
    window.addEventListener('resize', measure);
    onBodyChange();

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      if (mutationObserver) mutationObserver.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      if (observed) observed.removeEventListener('transitionend', measure);
    };
  }, [launcherRef, hideCta]);

  return clearance;
};

// The number block shown after "Text us" on desktop, on international hosts,
// and on a phone as the fallback under the SMS app. The live region is always
// rendered (empty until the reveal) so screen readers announce the number when
// it appears; focus then moves to the number itself.
const ContactDetails = ({ contact, copyState, onCopy, onEmail, numberRef }) => {
  let copyMessage = '';
  if (copyState === 'copied') copyMessage = 'Copied';
  if (copyState === 'failed') copyMessage = 'Select the number to copy it.';
  return (
    <div className={contact ? css.contact : undefined}>
      <div aria-live="polite" aria-atomic="true">
        {contact ? (
          <>
            <p className={css.contactLabel}>{contact.label}</p>
            <p ref={numberRef} tabIndex={-1} className={css.number}>
              {contact.display}
            </p>
          </>
        ) : null}
      </div>
      {contact ? (
        <>
          <div className={css.numberRow}>
            <button type="button" className={css.secondaryButton} onClick={onCopy}>
              Copy
            </button>
            <a className={css.emailLink} href={contact.mailto} onClick={onEmail}>
              Email us
            </a>
          </div>
          <p className={css.copyStatus} aria-live="polite">
            {copyMessage}
          </p>
        </>
      ) : null}
    </div>
  );
};

const isEscape = (e) => e.key === 'Escape' || e.key === 'Esc';

const TextUsBubble = ({ pathname }) => {
  const uid = useId();
  const panelId = `textus-panel${uid}`;
  const titleId = `textus-title${uid}`;

  const [open, setOpen] = useState(false);
  const [roleId, setRoleId] = useState(null);
  const [topicId, setTopicId] = useState(null);
  const [contact, setContact] = useState(null);
  const [copyState, setCopyState] = useState('idle');

  const rootRef = useRef(null);
  const launcherRef = useRef(null);
  const titleRef = useRef(null);
  const numberRef = useRef(null);
  const clearance = useCtaCoordination(open, launcherRef);

  const role = roleId ? ROLES.find((r) => r.id === roleId) : null;
  const topic = roleId && topicId ? findTopic(roleId, topicId) : null;
  let step = 'role';
  if (topic) step = 'answer';
  else if (role) step = 'topics';

  const resetContact = () => {
    setContact(null);
    setCopyState('idle');
  };

  const close = useCallback((returnFocus) => {
    setOpen(false);
    if (returnFocus && launcherRef.current) launcherRef.current.focus();
  }, []);

  // A new page starts fresh.
  useEffect(() => {
    setOpen(false);
    setRoleId(null);
    setTopicId(null);
    setContact(null);
    setCopyState('idle');
  }, [pathname]);

  // Move focus to the step heading when the panel opens or the step changes,
  // so keyboard and screen-reader users land on the new content.
  useEffect(() => {
    if (open && titleRef.current) titleRef.current.focus();
  }, [open, roleId, topicId]);

  // When the number appears, move focus to it (the live region around it has
  // already announced it).
  useEffect(() => {
    if (contact && numberRef.current) numberRef.current.focus();
  }, [contact]);

  // Escape closes the panel, but only an Escape nobody else has handled
  // (defaultPrevented) and only while focus is in the bubble or nowhere in
  // particular (<body>). An Escape meant for an autocomplete, a date picker or
  // a modal elsewhere on the page leaves the bubble alone. A tap or click
  // outside closes. No focus trap, no scroll lock.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (!isEscape(e) || e.defaultPrevented) return;
      const active = document.activeElement;
      const inside = !!(active && rootRef.current && rootRef.current.contains(active));
      const onBody = !active || active === document.body || active === document.documentElement;
      if (!inside && !onBody) return;
      e.preventDefault();
      close(true);
    };
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close]);

  const onLauncher = () => {
    if (open) {
      close(false);
      return;
    }
    setOpen(true);
    track(STEP.open());
  };

  const onRole = (id) => {
    setRoleId(id);
    setTopicId(null);
    resetContact();
    track(STEP.role(id));
  };

  const onTopic = (id) => {
    setTopicId(id);
    resetContact();
    track(STEP.topic(id));
  };

  const onBack = () => {
    resetContact();
    if (topicId) setTopicId(null);
    else setRoleId(null);
  };

  const onTextUs = () => {
    const text = buildPrefill(roleId, topic ? topic.label : '');
    if (canSms()) {
      track(STEP.sms(topic.id));
      window.location.href = buildSmsHref(text);
    } else {
      track(STEP.reveal(topic.id));
    }
    // Desktop and international hosts: this is the way to reach us. US phone:
    // a fallback for a device that has no SMS app to open.
    setContact({
      label: isIntlSite() ? 'Our US text line:' : 'Text us from your phone:',
      display: phoneDisplay(),
      mailto: buildMailtoHref(text),
    });
    setCopyState('idle');
  };

  const onCopy = () => {
    track(STEP.copy(topic.id));
    const done = (ok) => setCopyState(ok ? 'copied' : 'failed');
    try {
      const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : null;
      if (clipboard && typeof clipboard.writeText === 'function') {
        clipboard.writeText(contact.display).then(
          () => done(true),
          () => done(false)
        );
      } else {
        done(false);
      }
    } catch (e) {
      done(false);
    }
  };

  const onEmail = () => track(STEP.email(topic.id));

  let title = (
    <>
      Hey <span aria-hidden="true">👋</span> what do you need?
    </>
  );
  if (step === 'topics') title = role.label;
  if (step === 'answer') title = topic.label;

  const rootStyle = clearance > 0 ? { '--textUsCtaClear': `${clearance}px` } : undefined;

  return (
    <div ref={rootRef} className={css.root} style={rootStyle} data-textus="">
      {open ? (
        <div
          id={panelId}
          className={css.panel}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
        >
          <div className={css.header}>
            {step !== 'role' ? (
              <button type="button" className={css.backButton} onClick={onBack}>
                <span aria-hidden="true">←</span> Back
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              className={css.closeButton}
              onClick={() => close(true)}
              aria-label="Close"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <h2 id={titleId} ref={titleRef} tabIndex={-1} className={css.title}>
            {title}
          </h2>

          {step === 'role' ? (
            <ul className={css.choices}>
              {ROLES.map((r) => (
                <li key={r.id}>
                  <button type="button" className={css.choice} onClick={() => onRole(r.id)}>
                    <span className={css.choiceLabel}>{r.label}</span>
                    {r.hint ? <span className={css.choiceHint}>{r.hint}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {step === 'topics' ? (
            <ul className={css.choices}>
              {topicsFor(roleId).map((t) => (
                <li key={t.id}>
                  <button type="button" className={css.choice} onClick={() => onTopic(t.id)}>
                    <span className={css.choiceLabel}>{t.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {step === 'answer' ? (
            <div className={css.answerBlock}>
              <p className={css.answer}>{topic.answer}</p>
              {!topic.humanOnly && topic.link ? (
                <a className={css.answerLink} href={topic.link.href}>
                  {topic.link.label} <span aria-hidden="true">→</span>
                </a>
              ) : null}
              <div className={css.textUsArea}>
                <div className={css.textUsRow}>
                  {!topic.humanOnly ? <span className={css.stillStuck}>Still stuck?</span> : null}
                  <button type="button" className={css.primaryButton} onClick={onTextUs}>
                    <span aria-hidden="true">💬</span> Text us
                  </button>
                </div>
                <ContactDetails
                  key={topic.id}
                  contact={contact}
                  copyState={copyState}
                  onCopy={onCopy}
                  onEmail={onEmail}
                  numberRef={numberRef}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        ref={launcherRef}
        type="button"
        className={css.launcher}
        aria-label="Text us"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onLauncher}
      >
        <span className={css.launcherIcon} aria-hidden="true">
          💬
        </span>
        <span className={css.launcherText} aria-hidden="true">
          Text us
        </span>
      </button>
    </div>
  );
};

export default TextUsBubble;
