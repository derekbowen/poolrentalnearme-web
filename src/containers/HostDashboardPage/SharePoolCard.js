import React, { useMemo, useState } from 'react';

import ShareStatsBadge from './ShareStatsBadge';
import css from './HostDashboardPage.module.css';

// c160: the share card.
//
// The dashboard already had share buttons (c153) and 52 of 97 hosts still never
// posted their link. The buttons were never the missing piece — the missing
// piece was the words. "Share your link" quietly asks the host to go write a
// Facebook post about their own pool, and almost nobody does that unprompted.
//
// So this card writes the post for them, out of facts already on the listing
// (title, city, hourly price). It is a plain editable textarea: whatever the
// host sends is whatever they can see and change first. Nothing here invents a
// detail about anybody's pool.
//
// Only PUBLISHED pools can be shared — /go/ resolves against published listings
// (see server/api/go-redirect.js), so a draft's link would land on /s.

const slugify = t =>
  (t || 'pool')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'pool';

const poolImg = l =>
  l?.images?.[0]?.attributes?.variants?.['landscape-crop2x']?.url ||
  l?.images?.[0]?.attributes?.variants?.['landscape-crop']?.url ||
  l?.images?.[0]?.attributes?.variants?.['square-small2x']?.url;

// City for the caption. publicData.location holds either a full address or a
// bare city depending on how the listing was created; prefer the shorter, more
// natural-sounding half of an address ("Buffalo Grove, IL 60089" -> "Buffalo Grove").
const poolCity = l => {
  const loc = l?.attributes?.publicData?.location || {};
  const raw = loc.city || loc.address || '';
  return String(raw).split(',')[0].trim();
};

const poolPrice = l => {
  const p = l?.attributes?.price;
  return p && typeof p.amount === 'number' ? Math.round(p.amount / 100) : null;
};

const shareUrlFor = l =>
  l?.id
    ? `https://www.poolrentalnearme.com/go/${slugify(l.attributes?.title)}-${l.id.uuid.slice(0, 8)}`
    : null;

// Built only from what is on the listing record. The host edits it before it
// goes anywhere.
const defaultCaption = l => {
  const title = l?.attributes?.title || 'my pool';
  const city = poolCity(l);
  const price = poolPrice(l);
  const where = city ? ` in ${city}` : '';
  const rate = price ? ` It's $${price}/hour.` : '';
  return (
    `You can rent my pool by the hour — ${title}${where}.${rate}\n\n` +
    `Grab a few hours for your people:`
  );
};

const SharePoolCard = ({ pools = [], totalHearts = 0 }) => {
  const published = useMemo(
    () => pools.filter(l => l?.attributes?.state === 'published'),
    [pools]
  );

  const [idx, setIdx] = useState(0);
  const [edited, setEdited] = useState({}); // listingId -> caption
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const pool = published[Math.min(idx, published.length - 1)];
  const listingId = pool?.id?.uuid;
  const url = shareUrlFor(pool);
  const caption = listingId && edited[listingId] != null ? edited[listingId] : defaultCaption(pool);
  const fullPost = `${caption}\n${url}`;
  const photo = poolImg(pool);

  const flash = setter => {
    setter(true);
    setTimeout(() => setter(false), 2500);
  };

  const copyPost = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(fullPost).then(() => flash(setCopied), () => {});
  };

  // Facebook strips any caption you pass it, so put the words on the clipboard
  // on the way out — the host lands in the composer with their post ready to paste.
  const openWithCopy = href => () => {
    if (navigator.clipboard) navigator.clipboard.writeText(fullPost).catch(() => {});
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const nativeShare = () => {
    if (!navigator.share) return;
    navigator
      .share({ title: pool?.attributes?.title || 'My pool', text: caption, url })
      .then(() => flash(setShared))
      .catch(() => {});
  };

  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  if (!published.length) {
    return (
      <section className={`${css.card} ${css.cardSky}`}>
        <h2 className={css.sectionTitle}>Share your pool {'📣'}</h2>
        <p className={css.cardHint} style={{ marginTop: 0 }}>
          As soon as your pool is live, this is where you&rsquo;ll grab a ready-to-post
          message and your own tracked link.
        </p>
      </section>
    );
  }

  return (
    <section className={`${css.card} ${css.cardSky}`}>
      <h2 className={css.sectionTitle}>Share your pool {'📣'}</h2>
      <p className={css.sectionSub}>
        The people most likely to book your pool already know you. Here&rsquo;s the post —
        change anything you like.
      </p>

      {published.length > 1 ? (
        <div className={css.sharePoolPicker}>
          {published.map((l, i) => (
            <button
              key={l.id.uuid}
              type="button"
              className={i === idx ? css.sharePoolTabOn : css.sharePoolTab}
              onClick={() => setIdx(i)}
            >
              {l.attributes?.title || 'Pool'}
            </button>
          ))}
        </div>
      ) : null}

      <div className={css.sharePreview}>
        {photo ? <img className={css.sharePhoto} src={photo} alt="" /> : null}
        <textarea
          className={css.shareCaption}
          value={caption}
          rows={5}
          aria-label="Your post"
          onChange={e => setEdited({ ...edited, [listingId]: e.target.value })}
        />
        <div className={css.shareUrlLine}>{url}</div>
      </div>

      <div className={css.pillRow}>
        {canNativeShare ? (
          <button type="button" className={css.pillSolid} onClick={nativeShare}>
            {shared ? 'Sent! 🎉' : 'Share'}
          </button>
        ) : null}
        <button type="button" className={canNativeShare ? css.pillQuiet : css.pillSolid} onClick={copyPost}>
          {copied ? 'Copied! ❤️' : 'Copy post'}
        </button>
        <a className={css.pillQuiet} href={`sms:?&body=${encodeURIComponent(fullPost)}`}>
          Text it
        </a>
      </div>

      <div className={css.pillRow} style={{ marginTop: 10 }}>
        <button
          type="button"
          className={css.pillQuiet}
          onClick={openWithCopy(
            `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
          )}
        >
          Facebook
        </button>
        <button
          type="button"
          className={css.pillQuiet}
          onClick={openWithCopy(
            `https://nextdoor.com/sharekit/?url=${encodeURIComponent(
              url
            )}&body=${encodeURIComponent(fullPost)}`
          )}
        >
          Nextdoor
        </button>
        {photo ? (
          <a className={css.pillQuiet} href={photo} target="_blank" rel="noopener noreferrer">
            Open photo
          </a>
        ) : null}
      </div>

      <p className={css.cardHint} style={{ marginTop: 12 }}>
        Posting to Instagram? Tap <strong>Copy post</strong>, then <strong>Open photo</strong> and
        press and hold it to save.
      </p>

      {totalHearts > 0 ? (
        <div className={css.heartsRow} style={{ marginTop: 16 }}>
          <span aria-hidden="true">{'❤️'.repeat(Math.min(totalHearts, 5))}</span>
          <span>
            {totalHearts} {totalHearts === 1 ? 'person has' : 'people have'} saved your pool
          </span>
        </div>
      ) : null}

      <ShareStatsBadge listingId={listingId} />
    </section>
  );
};

export default SharePoolCard;
