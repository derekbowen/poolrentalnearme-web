import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';

import { FormattedMessage } from '../../util/reactIntl';
import { ensureCurrentUser } from '../../util/data';
import { getPayoutSummary } from '../../util/api';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import { getMarketplaceEntities } from '../../ducks/marketplaceData.duck';

import Avatar from 'components/Avatar/Avatar';
import {
  H3,
  IconSpinner,
  NamedLink,
  NamedRedirect,
  Page,
  LayoutSingleColumn,
} from '../../components';

import TopbarContainer from '../../containers/TopbarContainer/TopbarContainer';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';

import PromoCodesPanel from './PromoCodesPanel';
import ShareStatsBadge from './ShareStatsBadge';
import css from './HostDashboardPage.module.css';

// Transitions that leave the ball in the HOST's court. Kept as plain strings so
// this file has no opinion about which process a transaction belongs to.
const AWAITING_HOST = [
  'transition/confirm-payment',
  'transition/request-payment-after-enquiry',
  'transition/send-offer',
];
const IS_INQUIRY = ['transition/inquire'];
const IS_UPCOMING = [
  'transition/accept',
  'transition/accept-with-payment',
  'transition/operator-accept',
  'transition/operator-accept-with-payment',
  'transition/accept-offer',
];

const money = cents =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);

const prettyDate = d =>
  d
    ? new Date(d).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : null;

const prettyTime = d =>
  d ? new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;

const guestName = tx => tx?.customer?.attributes?.profile?.displayName || 'A guest';
const guestFirst = tx => String(guestName(tx)).split(' ')[0];
const listingTitle = tx => tx?.listing?.attributes?.title || 'your pool';

const slugify = t =>
  (t || 'pool')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'pool';

const listingImg = (l, variant) =>
  l?.images?.[0]?.attributes?.variants?.[variant]?.url ||
  l?.images?.[0]?.attributes?.variants?.['square-small2x']?.url ||
  l?.images?.[0]?.attributes?.variants?.['square-small']?.url;

/**
 * HostDashboardPage v3 — "her Facebook wall on her birthday."
 * Ported from Derek's approved Magic Patterns export. Same data spine as v1/v2
 * (one transactions query + ownListings + payout summary); only the rendering
 * changed. Every number a host sees here is real.
 */
export const HostDashboardPageComponent = props => {
  const { currentUser, transactions, ownListings, fetchInProgress, fetchError, scrollingDisabled } = props;

  const [payout, setPayout] = useState(null);
  const [payoutState, setPayoutState] = useState('loading'); // loading | ready | none
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPayoutSummary()
      .then(s => {
        if (cancelled) return;
        // 200 with stripeAccount:null is the normal "never set up" state.
        if (!s || !s.stripeAccount) {
          setPayoutState('none');
          return;
        }
        setPayout(s);
        setPayoutState('ready');
      })
      .catch(() => {
        if (!cancelled) setPayoutState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const user = ensureCurrentUser(currentUser);
  if (!user.id) {
    return <NamedRedirect name="LandingPage" />;
  }

  const txs = transactions || [];
  const pools = ownListings || [];
  const lastTransition = tx => tx?.attributes?.lastTransition;

  const needsAction = txs.filter(tx => AWAITING_HOST.includes(lastTransition(tx)));
  const inquiries = txs.filter(tx => IS_INQUIRY.includes(lastTransition(tx)));
  const upcoming = txs
    .filter(tx => IS_UPCOMING.includes(lastTransition(tx)))
    .sort((a, b) => {
      const as = a?.booking?.attributes?.start ? new Date(a.booking.attributes.start) : 0;
      const bs = b?.booking?.attributes?.start ? new Date(b.booking.attributes.start) : 0;
      return as - bs;
    });

  const nowMs = Date.now();
  const happeningNow = upcoming.find(tx => {
    const b = tx?.booking?.attributes;
    return b?.start && b?.end && new Date(b.start).getTime() <= nowMs && nowMs <= new Date(b.end).getTime();
  });

  const waitingCount = needsAction.length + inquiries.length;
  const firstName = user.attributes?.profile?.firstName;
  const hostSinceYear = user.attributes?.createdAt
    ? new Date(user.attributes.createdAt).getFullYear()
    : null;

  const firstPool = pools[0];
  const totalHearts = pools.reduce(
    (n, l) => n + ((l.attributes?.metadata?.likedByUserIds || []).length || 0),
    0
  );

  const shareSlug = slugify(firstPool?.attributes?.title || listingTitle(txs[0]));
  const shareUrl = firstPool?.id
    ? `https://www.poolrentalnearme.com/go/${shareSlug}-${firstPool.id.uuid.slice(0, 8)}`
    : 'https://www.poolrentalnearme.com';

  const poolPhoto = listingImg(firstPool, 'landscape-crop');
  const happeningGuest = happeningNow?.customer;
  const firstRequest = needsAction[0];

  // Her people, for the scrapbook: most recent distinct guests across all txs.
  const recentGuests = [];
  const seenGuests = new Set();
  for (const t of txs) {
    const cId = t?.customer?.id?.uuid;
    if (cId && !seenGuests.has(cId)) {
      seenGuests.add(cId);
      recentGuests.push(t.customer);
    }
  }
  const collageGuestA = happeningGuest || recentGuests[0];
  const collageGuestB = recentGuests.find(c => c?.id?.uuid !== collageGuestA?.id?.uuid);

  // ---- the top two inches: headline + one fat happy button ---------------
  const headline = happeningNow ? (
    <>
      Hi {firstName} &mdash;{' '}
      <span className={css.partyHeadlineAccent}>
        {guestFirst(happeningNow)} is swimming at your pool right now
      </span>{' '}
      <span aria-hidden="true">{'💦'}</span>
    </>
  ) : needsAction.length > 0 ? (
    <>
      Hi {firstName} &mdash;{' '}
      <span className={css.partyHeadlineAccent}>
        {needsAction.length === 1 ? 'someone wants' : `${needsAction.length} people want`} to swim!
      </span>{' '}
      <span aria-hidden="true">{'🎉'}</span>
    </>
  ) : inquiries.length > 0 ? (
    <>
      Hi {firstName} &mdash;{' '}
      <span className={css.partyHeadlineAccent}>
        {inquiries.length === 1
          ? `${guestFirst(inquiries[0])} sent you a message`
          : `${inquiries.length} guests sent you messages`}
      </span>{' '}
      <span aria-hidden="true">{'👋'}</span>
    </>
  ) : (
    <>
      Hi {firstName} &mdash;{' '}
      <span className={css.partyHeadlineAccent}>your pool made people happy</span>{' '}
      <span aria-hidden="true">{'❤️'}</span>
    </>
  );

  const bigHappy =
    payoutState === 'none' && txs.length > 0 ? (
      <NamedLink className={css.bigHappy} name="StripePayoutPage">
        <span className={css.bigHappyTitle}>Let&rsquo;s get your pool paying you {'🎉'}</span>
        <span className={css.bigHappyAction}>Add where to send my money &rarr;</span>
      </NamedLink>
    ) : firstRequest ? (
      <NamedLink
        className={css.bigHappy}
        name="SaleDetailsPage"
        params={{ id: firstRequest.id.uuid }}
      >
        <span className={css.bigHappyTitle}>Someone wants to swim!</span>
        <span className={css.bigHappyAction}>Respond to {guestFirst(firstRequest)} &rarr;</span>
      </NamedLink>
    ) : inquiries.length > 0 ? (
      <NamedLink
        className={css.bigHappy}
        name="SaleDetailsPage"
        params={{ id: inquiries[0].id.uuid }}
      >
        <span className={css.bigHappyTitle}>New message! {'👋'}</span>
        <span className={css.bigHappyAction}>Reply to {guestFirst(inquiries[0])} &rarr;</span>
      </NamedLink>
    ) : null;

  const partyHeader = (
    <header>
      <h1 className={css.partyHeadline}>{headline}</h1>
      <p className={css.tagline}>Share the pool you love.</p>

      {poolPhoto ? (
        <div className={css.collage}>
          <div aria-hidden="true">
            <span className={css.floatEmoji} style={{ left: -4, top: 24, fontSize: 44, transform: 'rotate(-8deg)' }}>{'😄'}</span>
            <span className={css.floatEmoji} style={{ right: 4, top: 0, fontSize: 30, transform: 'rotate(10deg)' }}>{'☀️'}</span>
            <span className={css.floatEmoji} style={{ left: '42%', top: -8, fontSize: 26, transform: 'rotate(-12deg)' }}>{'🌴'}</span>
            <span className={css.floatEmoji} style={{ left: 4, bottom: 8, fontSize: 24, transform: 'rotate(8deg)' }}>{'💦'}</span>
          </div>

          <div className={css.shotMain}>
            <div className={css.polaroid}>
              <img src={poolPhoto} alt={firstPool?.attributes?.title || 'Your pool'} />
            </div>
          </div>

          {collageGuestA ? (
            <div className={css.shotTall}>
              <div className={css.polaroid} style={{ position: 'relative' }}>
                <Avatar className={css.collageAvatar} user={collageGuestA} disableProfileLink />
                {happeningNow ? <span className={css.swimBadge}>Swimming now</span> : null}
              </div>
            </div>
          ) : null}
          {collageGuestB ? (
            <div className={css.shotSmall}>
              <div className={css.polaroid}>
                <Avatar className={css.collageAvatarSmall} user={collageGuestB} disableProfileLink />
              </div>
            </div>
          ) : null}

          {totalHearts > 0 ? (
            <>
              <div className={css.heartBadge}>
                <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>{'❤️'}</span>
                <span className={css.heartBadgeNum}>{totalHearts}</span>
              </div>
              <p className={css.heartsCaption}>hearts on your pool</p>
            </>
          ) : null}

          <div className={css.hostAvatarRing}>
            <Avatar className={css.hostAvatar} user={user} disableProfileLink />
          </div>
        </div>
      ) : null}

      <p className={css.hostName}>
        {firstName}
        <span className={css.hostMeta}>
          {hostSinceYear ? `Host since ${hostSinceYear}` : 'Host'}
          {firstPool?.attributes?.title ? ` · ${firstPool.attributes.title}` : ''}
        </span>
      </p>
    </header>
  );

  const requestCard = tx => (
    <li key={tx.id.uuid} className={css.guestCard}>
      <div className={`${css.guestPhoto} ${css.tiltL}`}>
        <Avatar className={css.guestPhotoImg} user={tx.customer} disableProfileLink />
      </div>
      <div className={css.rowMain}>
        <div className={css.rowTitle}>
          <strong>{guestFirst(tx)}</strong> wants to book {listingTitle(tx)}
        </div>
        <div className={css.rowMeta}>
          {prettyDate(tx?.booking?.attributes?.start)}
          {tx?.attributes?.payoutTotal?.amount ? (
            <>
              {' · you earn '}
              <span className={css.earnGreen}>{money(tx.attributes.payoutTotal.amount)}</span>
            </>
          ) : null}
        </div>
        <NamedLink className={css.pillQuiet} name="SaleDetailsPage" params={{ id: tx.id.uuid }}>
          Respond to {guestFirst(tx)}
        </NamedLink>
      </div>
    </li>
  );

  const content = fetchInProgress ? (
    <div className={css.loading}>
      <IconSpinner />
    </div>
  ) : fetchError ? (
    <p className={css.error}>We couldn&rsquo;t load your bookings just now. Please refresh the page.</p>
  ) : (
    <div className={css.sections}>
      {bigHappy}

      {/* ---------- happening now ---------- */}
      {happeningNow ? (
        <section className={`${css.card} ${css.cardSky}`}>
          <h2 className={css.eyebrow}>
            <span className={css.liveDot} /> Happening now {'🌊'}
          </h2>
          <div className={css.hnRow}>
            <div className={`${css.guestPhoto} ${css.tiltL}`}>
              <Avatar className={css.guestPhotoImg} user={happeningGuest} disableProfileLink />
            </div>
            <div className={css.rowMain}>
              <div className={css.hnTitle}>{guestFirst(happeningNow)} is swimming</div>
              <div className={css.rowMeta}>{listingTitle(happeningNow)}</div>
              <div className={css.rowMeta}>
                Today {prettyTime(happeningNow?.booking?.attributes?.start)}&ndash;
                {prettyTime(happeningNow?.booking?.attributes?.end)}
                {happeningNow?.attributes?.payoutTotal?.amount
                  ? ` · ${money(happeningNow.attributes.payoutTotal.amount)}`
                  : null}
              </div>
            </div>
          </div>
          <NamedLink
            className={css.pillSolid}
            style={{ width: '100%', marginTop: 16 }}
            name="SaleDetailsPage"
            params={{ id: happeningNow.id.uuid }}
          >
            Charge extra {'💰'}
          </NamedLink>
          <p className={css.cardHint}>
            More guests showed up? Grabbed an add-on? Put it on the same card &mdash;{' '}
            {guestFirst(happeningNow)} taps OK, you get paid.
          </p>
        </section>
      ) : null}

      {/* ---------- someone wants to swim ---------- */}
      <section>
        <h2 className={css.sectionTitle}>
          Someone wants to swim! {'🏊'}
          {needsAction.length > 0 ? <span className={css.redDot} /> : null}
        </h2>
        {needsAction.length === 0 && inquiries.length > 0 ? (
          <div className={css.card}>
            <p className={css.cardHint} style={{ margin: 0 }}>
              {'👋'} No booking requests yet &mdash; but{' '}
              {inquiries.length === 1
                ? `${guestFirst(inquiries[0])} sent you a message`
                : `${inquiries.length} guests sent you messages`}
              . It&rsquo;s waiting just below, under &ldquo;People saying hello&rdquo;.
            </p>
          </div>
        ) : needsAction.length === 0 ? (
          <div className={css.card}>
            <p className={css.cardHint} style={{ margin: 0 }}>
              {'🌴'} All quiet right now. When someone asks to book your pool, they show
              up here first &mdash; with a big button to say yes.
            </p>
          </div>
        ) : (
          <>
            <p className={css.sectionSub}>
              {needsAction.length === 1
                ? '1 person is waiting on your yes.'
                : `${needsAction.length} people are waiting on your yes.`}
            </p>
            <ul className={css.cardList}>{needsAction.map(requestCard)}</ul>
          </>
        )}
      </section>

      {/* ---------- people saying hello ---------- */}
      {inquiries.length > 0 ? (
        <section>
          <h2 className={css.sectionTitle}>People saying hello {'👋'}</h2>
          <p className={css.sectionSub}>
            {inquiries.length === 1 ? '1 new message.' : `${inquiries.length} new messages.`} A
            quick reply keeps them swimming.
          </p>
          <ul className={css.cardList}>
            {inquiries.map(tx => (
              <li key={tx.id.uuid} className={css.guestCard}>
                <div className={`${css.guestPhoto} ${css.tiltR}`}>
                  <Avatar className={css.guestPhotoImg} user={tx.customer} disableProfileLink />
                </div>
                <div className={css.rowMain}>
                  <div className={css.rowTitle}>
                    <strong>{guestFirst(tx)}</strong>
                    <span className={css.newChip}>New</span>
                  </div>
                  <div className={css.rowMeta}>asked about {listingTitle(tx)}</div>
                </div>
                <NamedLink className={css.pillQuiet} name="SaleDetailsPage" params={{ id: tx.id.uuid }}>
                  Reply
                </NamedLink>
              </li>
            ))}
          </ul>
          <NamedLink
            className={css.pillQuiet}
            style={{ width: '100%', marginTop: 14 }}
            name="InboxPage"
            params={{ tab: 'sales' }}
          >
            Read all messages
          </NamedLink>
        </section>
      ) : null}

      {/* ---------- what your pool earned you ---------- */}
      <section>
        <h2 className={css.sectionTitle}>What your pool earned you {'💰'}</h2>
        {payoutState === 'loading' ? (
          <p className={css.sectionSub}>Checking&hellip;</p>
        ) : payoutState === 'error' ? (
          <div className={css.card}>
            <p className={css.cardHint} style={{ margin: 0 }}>
              We couldn&rsquo;t load your payout numbers just now &mdash; your account is
              fine, this is on us. They&rsquo;re all on{' '}
              <NamedLink name="PayoutDashboardPage">your payouts page</NamedLink>.
            </p>
          </div>
        ) : payoutState === 'none' ? (
          <div className={`${css.card} ${css.cardSun}`}>
            <p className={css.rowTitle} style={{ marginBottom: 6 }}>
              Let&rsquo;s get your pool paying you {'🎉'}
            </p>
            <p className={css.cardHint} style={{ marginTop: 0 }}>
              We&rsquo;re holding your money safely. Tell us where to send it &mdash; about five
              minutes, once.
            </p>
            <NamedLink className={css.pillSolid} style={{ width: '100%', marginTop: 14 }} name="StripePayoutPage">
              Add where to send my money
            </NamedLink>
          </div>
        ) : (
          <>
            <div className={css.moneyGrid}>
              <div className={`${css.moneyTile} ${css.moneyTileGreen}`}>
                <div className={`${css.moneyBig} ${css.moneyBigGreen}`}>{money(payout?.pendingAmount)}</div>
                <div className={css.moneyLabel}>On the way to your bank</div>
              </div>
              <div className={`${css.moneyTile} ${css.moneyTileSun}`}>
                <div className={css.moneyBig}>{money(payout?.availableAmount)}</div>
                <div className={css.moneyLabel}>Available</div>
              </div>
            </div>
            <NamedLink className={css.moneyLink} name="PayoutDashboardPage">
              See every payout
            </NamedLink>
          </>
        )}
      </section>

      {/* ---------- your pools ---------- */}
      {pools.length > 0 ? (
        <section>
          <h2 className={css.sectionTitle}>Your pools {'🏡'}</h2>
          <div className={css.poolCards}>
            {pools.map(l => {
              const slug = slugify(l.attributes?.title);
              const img = listingImg(l, 'landscape-crop');
              const isOpen = l.attributes?.state === 'published';
              const hearts = (l.attributes?.metadata?.likedByUserIds || []).length;
              return (
                <div key={l.id.uuid} className={css.card} style={{ padding: 0, overflow: 'hidden' }}>
                  {img ? <img className={css.poolCardImg} src={img} alt={l.attributes?.title || 'Your pool'} /> : null}
                  <div style={{ padding: '18px 20px 20px' }}>
                    <div className={css.rowTitle}>
                      <strong>{l.attributes?.title || 'Your pool'}</strong>
                      {hearts > 0 ? ` · ❤️ ${hearts}` : ''}
                    </div>
                    <div className={css.rowMeta}>
                      {l.attributes?.price ? `${money(l.attributes.price.amount)} per hour` : ''}
                    </div>
                    {!isOpen ? (
                      <p className={css.closedNote}>
                        This one is closed, so nobody can find it yet.
                      </p>
                    ) : null}
                    <div className={css.pillRow}>
                      <NamedLink
                        className={isOpen ? css.pillQuiet : css.pillSolid}
                        name="EditListingPage"
                        params={{ id: l.id.uuid, slug, type: 'edit', tab: 'details' }}
                      >
                        {isOpen ? 'Edit this pool' : 'Open this pool again'}
                      </NamedLink>
                      <NamedLink
                        className={css.pillQuiet}
                        name="EditListingPage"
                        params={{ id: l.id.uuid, slug, type: 'edit', tab: 'availability' }}
                      >
                        Change your days
                      </NamedLink>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <PromoCodesPanel pools={pools} />

      {/* ---------- your pool's reach ---------- */}
      <section className={`${css.card} ${css.cardSky}`}>
        <h2 className={css.sectionTitle}>Your pool&rsquo;s reach {'🌴'}</h2>
        {totalHearts > 0 ? (
          <div className={css.heartsRow}>
            <span aria-hidden="true">{'❤️'.repeat(Math.min(totalHearts, 5))}</span>
            <span>
              {totalHearts} {totalHearts === 1 ? 'person has' : 'people have'} saved your pool
            </span>
          </div>
        ) : (
          <p className={css.cardHint} style={{ marginTop: 0 }}>
            When swimmers save your pool to their wishlist, their hearts show up here.
          </p>
        )}
        <div className={css.pillRow} style={{ marginTop: 16 }}>
          <button
            type="button"
            className={css.pillSolid}
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              }
            }}
          >
            {copied ? 'Copied! ❤️' : 'Copy your link'}
          </button>
          <a
            className={css.pillQuiet}
            href={`sms:?&body=${encodeURIComponent(`Come swim at my pool! ${shareUrl}`)}`}
          >
            Text it to a friend
          </a>
        </div>
        <div className={css.pillRow} style={{ marginTop: 10 }}>
          <a
            className={css.pillQuiet}
            target="_blank"
            rel="noopener noreferrer"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
          >
            Share on Facebook
          </a>
          <a
            className={css.pillQuiet}
            target="_blank"
            rel="noopener noreferrer"
            href={`https://nextdoor.com/sharekit/?body=${encodeURIComponent(`Rent my pool by the hour! ${shareUrl}`)}`}
          >
            Share on Nextdoor
          </a>
        </div>
        <ShareStatsBadge listingId={firstPool?.id?.uuid} />
      </section>

      {/* ---------- pool school ---------- */}
      <section className={`${css.card} ${css.cardSun}`}>
        <h2 className={css.sectionTitle}>Pool School {'🎓'}</h2>
        <p className={css.sectionSub}>Short, friendly lessons. No rush.</p>
        <a className={css.schoolRow} href="https://www.poolrentalnearme.com/p/learningacademy">
          {'📸'} Take photos people fall in love with
        </a>
        <a className={css.schoolRow} href="https://www.poolrentalnearme.com/p/learningacademy">
          {'💬'} What to say when someone asks to book
        </a>
        <a className={css.schoolRow} href="https://www.poolrentalnearme.com/p/learningacademy">
          {'🧰'} Keeping swim days safe and easy
        </a>
      </section>

      {/* ---------- text derek ---------- */}
      <section className={`${css.card} ${css.cardCoral}`} style={{ textAlign: 'center' }}>
        <div aria-hidden="true" style={{ fontSize: 28 }}>{'👋'}</div>
        <h2 className={css.sectionTitle} style={{ marginTop: 6 }}>Stuck on anything? Text Derek.</h2>
        <p className={css.sectionSub}>
          He founded Pool Rental Near Me and answers hosts himself, usually within the hour.
        </p>
        <a
          className={css.pillQuiet}
          style={{ width: '100%' }}
          href={`sms:+19092728096?&body=${encodeURIComponent(
            `Hi, I'm ${firstName || 'a PRNM host'} with ${firstPool?.attributes?.title || 'my pool'} — I have a question.`
          )}`}
        >
          Text Derek: 909-272-8096
        </a>
      </section>

      {/* ---------- love footer ---------- */}
      <div className={css.loveFooter}>
        <p className={css.loveFooterTitle}>Made with {'❤️'} for pool people.</p>
        <div className={css.loveFooterLinks}>
          <NamedLink name="ManageListingsPage">Your pools</NamedLink>
          <NamedLink name="InboxPage" params={{ tab: 'sales' }}>All messages</NamedLink>
          <NamedLink name="ProfileSettingsPage">Your profile</NamedLink>
        </div>
      </div>
    </div>
  );

  return (
    <Page title="Your pool" scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn
        topbar={<TopbarContainer currentPage="HostDashboardPage" />}
        footer={<FooterContainer />}
      >
        <div className={css.root}>
          <div className={css.content}>
            {partyHeader}
            {content}
          </div>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => {
  const { currentUser } = state.user;
  const { transactionRefs, ownListingRefs, fetchInProgress, fetchError } = state.HostDashboardPage;
  return {
    currentUser,
    transactions: getMarketplaceEntities(state, transactionRefs),
    ownListings: getMarketplaceEntities(state, ownListingRefs || []),
    fetchInProgress,
    fetchError,
    scrollingDisabled: isScrollingDisabled(state),
  };
};

const HostDashboardPage = connect(mapStateToProps)(HostDashboardPageComponent);

export default HostDashboardPage;
