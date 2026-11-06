/*
 * "Text us" bubble for the EAST marketing site (fresh-web). Replaces the removed
 * Intercom launcher. Design approved by Derek; see ops/east/text-us-bubble/README.md.
 *
 * Rules this file must keep:
 * - Client-only. It renders null on the server and on the first client render,
 *   so the server HTML is byte-identical with or without it.
 * - No free-text input, no network calls, no third-party scripts. It only opens the
 *   visitor's own SMS app (sms:) or mail client (mailto:). Nothing is ever sent from here.
 * - The text-line number is assembled from parts only after the visitor taps a topic,
 *   so it never sits in page HTML and never appears as one contiguous string in the bundle.
 * - Every answer below is copied verbatim from the fact-checked content list. Do not add,
 *   reword or "improve" an answer without Derek's approval (CLAUDE.md rules 1 and 8).
 *   Insurance, liability, coverage, claims, damage, injury, disputes and privacy topics are
 *   human-only: they get no canned answer, only "Text us".
 * - Signed by nobody.
 * - The prefill strings are matched by the server to route texts to Derek and Brandon.
 *   Change them only together with that router.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Role = "swimmer" | "host" | "other";

type Topic = {
  id: string;
  label: string;
  answer: string;
  humanOnly: boolean;
  link?: { label: string; href: string };
};

type RoleGroup = { role: Role; choice: string; topics: Topic[] };

const NEEDS_A_PERSON = "This one needs a person. Text us and we'll get back to you.";
const FEE_TERMS = {
  label: "See our fee terms",
  href: "https://www.poolrentalnearme.com/terms-of-service#4-1-fee-structure",
};

const GROUPS: RoleGroup[] = [
  {
    role: "swimmer",
    choice: "I'm a swimmer",
    topics: [
      {
        id: "swimmer-safety-dispute",
        label: "Safety, injury, damage or a refund dispute",
        answer: NEEDS_A_PERSON,
        humanOnly: true,
      },
    ],
  },
  {
    role: "host",
    choice: "I'm a host",
    topics: [
      {
        id: "host-fees",
        label: "Fees & pricing",
        answer:
          "You set your own price and can change it any time. You can also offer paid add-ons. We charge hosts 0%, so you keep 100% of your listed price. Guests pay a separate 15% service fee, shown in their total before they book. It's our published fee, not a promo.",
        humanOnly: false,
        link: FEE_TERMS,
      },
      {
        id: "host-insurance-damage",
        label: "Insurance, damage, injury or a dispute",
        answer: NEEDS_A_PERSON,
        humanOnly: true,
      },
    ],
  },
  {
    role: "other",
    choice: "Something else",
    topics: [
      {
        id: "other-partnerships",
        label: "Partnerships & press",
        answer:
          "This one's best with a person. Text us who you are and what you have in mind, and we'll get back to you.",
        humanOnly: true,
      },
      {
        id: "other-account-privacy",
        label: "Delete my account or data",
        answer: NEEDS_A_PERSON,
        humanOnly: true,
      },
      {
        id: "other-general",
        label: "Another question",
        answer: "Text us your question and we'll get back to you.",
        humanOnly: true,
      },
    ],
  },
];

// Exact routing prefixes (straight apostrophe). The server detects these.
function prefill(role: Role, topic: Topic): string {
  if (role === "other") return "Hi! I have a question about Pool Rental Near Me: ";
  return "Hi! I'm a " + role + " on Pool Rental Near Me. Question about " + topic.label + ": ";
}

// Called only after a tap. Parts keep the number out of the HTML and out of the bundle as one string.
function textLine(): { e164: string; display: string } {
  const p = ["855", "617", "8207"];
  return { e164: ["+", "1"].concat(p).join(""), display: "(" + p[0] + ") " + p[1] + "-" + p[2] };
}

const SUPPORT_EMAIL = "support@poolrentalnearme.com";
const PANEL_ID = "prnm-text-us-panel";
const MARKER = "prnm-text-us-v1";

function canSms(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
  } catch {
    /* ignore */
  }
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

function track(step: string) {
  try {
    const w = window as unknown as {
      plausible?: (event: string, opts: { props: { step: string } }) => void;
    };
    if (typeof w.plausible === "function") w.plausible("TextUs", { props: { step } });
  } catch {
    /* analytics must never break the widget */
  }
}

const rowBtn =
  "flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";
const pillBtn =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none";
const quietBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";
const iconBtn =
  "rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";

function Chevron({ back = false }: { back?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <polyline points={back ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
    </svg>
  );
}

function Contact({ role, topic, smsOk }: { role: Role; topic: Topic; smsOk: boolean }) {
  const [reveal, setReveal] = useState(topic.humanOnly);
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const numRef = useRef<HTMLSpanElement>(null);
  const text = prefill(role, topic);
  const cta = topic.humanOnly ? "Text us" : "Still stuck? Text us";

  if (smsOk) {
    const href = "sms:" + textLine().e164 + "?&body=" + encodeURIComponent(text);
    return (
      <a href={href} className={pillBtn} onClick={() => track("sms:" + topic.id)}>
        <span aria-hidden="true">💬</span>
        {cta}
      </a>
    );
  }

  if (!reveal) {
    return (
      <button
        type="button"
        className={pillBtn}
        onClick={() => {
          setReveal(true);
          track("reveal:" + topic.id);
        }}
      >
        <span aria-hidden="true">💬</span>
        {cta}
      </button>
    );
  }

  const line = textLine();
  const copy = async () => {
    track("copy:" + topic.id);
    try {
      await navigator.clipboard.writeText(line.display);
      setCopied("ok");
      return;
    } catch {
      /* fall back to selecting the number */
    }
    try {
      const el = numRef.current;
      const sel = window.getSelection();
      if (!el || !sel) throw new Error("no selection");
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      setCopied(document.execCommand("copy") ? "ok" : "fail");
    } catch {
      setCopied("fail");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">Text us from your phone</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span ref={numRef} className="select-all text-lg font-semibold tracking-wide text-foreground">
          {line.display}
        </span>
        <button type="button" className={quietBtn} onClick={copy}>
          {copied === "ok" ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {copied === "ok" ? "Number copied" : copied === "fail" ? "Copy failed. The number is selected." : ""}
      </p>
      <a
        href={"mailto:" + SUPPORT_EMAIL + "?subject=" + encodeURIComponent(text)}
        className="mt-3 inline-flex text-sm font-semibold text-primary underline underline-offset-2 hover:no-underline"
        onClick={() => track("email:" + topic.id)}
      >
        Email us
      </a>
    </div>
  );
}

export function TextUsBubble({ pathname }: { pathname?: string }) {
  const [mounted, setMounted] = useState(false);
  const [smsOk, setSmsOk] = useState(false);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setSmsOk(canSms());
    setMounted(true);
  }, []);

  const reset = useCallback(() => {
    setOpen(false);
    setRole(null);
    setTopicId(null);
  }, []);

  const close = useCallback(() => {
    reset();
    launcherRef.current?.focus();
  }, [reset]);

  // Client-side navigation closes the panel without moving focus.
  useEffect(() => {
    reset();
  }, [pathname, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Move focus to the current step's heading on open and on every step change.
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open, role, topicId]);

  if (!mounted) return null;

  const group = role ? GROUPS.find((g) => g.role === role) ?? null : null;
  const topic = group && topicId ? group.topics.find((t) => t.id === topicId) ?? null : null;

  const back = () => {
    if (topic) setTopicId(null);
    else setRole(null);
  };

  const heading = topic ? topic.label : group ? "What's it about?" : "Hey 👋 what do you need?";

  return (
    <>
      {open && <style>{"#prnm-cta{visibility:hidden!important}"}</style>}
      <button
        ref={launcherRef}
        type="button"
        aria-label="Text us"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? PANEL_ID : undefined}
        data-prnm={MARKER}
        onClick={() => {
          if (open) {
            close();
          } else {
            setOpen(true);
            track("open");
          }
        }}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-3 z-[45] inline-flex h-12 w-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none sm:left-4 sm:w-auto sm:px-4 lg:bottom-6 lg:left-6"
      >
        <span aria-hidden="true" className="text-xl leading-none">
          💬
        </span>
        <span className="hidden sm:inline">Text us</span>
      </button>

      {open && (
        <div
          id={PANEL_ID}
          role="dialog"
          aria-label="Text Pool Rental Near Me"
          className="fixed bottom-[calc(8.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[45] max-h-[max(11rem,calc(100dvh-14rem))] overflow-y-auto rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 sm:left-4 sm:right-auto sm:w-[22rem] lg:bottom-[5.5rem] lg:left-6"
        >
          <div className="flex items-center gap-2">
            {group && (
              <button type="button" onClick={back} className={iconBtn + " inline-flex items-center gap-1 pr-2.5 text-sm"}>
                <Chevron back />
                Back
              </button>
            )}
            <span className="flex-1" />
            <button type="button" aria-label="Close" onClick={close} className={iconBtn}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-base font-semibold text-foreground focus:outline-none">
            {heading}
          </h2>

          {!group && (
            <ul className="mt-3 flex flex-col gap-2">
              {GROUPS.map((g) => (
                <li key={g.role}>
                  <button
                    type="button"
                    className={rowBtn}
                    onClick={() => {
                      setRole(g.role);
                      track("role:" + g.role);
                    }}
                  >
                    {g.choice}
                    <Chevron />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {group && !topic && (
            <ul className="mt-3 flex flex-col gap-2">
              {group.topics.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={rowBtn}
                    onClick={() => {
                      setTopicId(t.id);
                      track("topic:" + t.id);
                    }}
                  >
                    {t.label}
                    <Chevron />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {group && topic && (
            <div className="mt-2 flex flex-col gap-3">
              <p className="text-sm leading-relaxed text-foreground">{topic.answer}</p>
              {!topic.humanOnly && topic.link && (
                <a
                  href={topic.link.href}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline underline-offset-2 hover:no-underline"
                >
                  {topic.link.label}
                  <Chevron />
                </a>
              )}
              <Contact key={topic.id} role={group.role} topic={topic} smsOk={smsOk} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
