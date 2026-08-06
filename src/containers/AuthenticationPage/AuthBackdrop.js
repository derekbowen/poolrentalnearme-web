import React from 'react';
import classNames from 'classnames';

import css from './AuthBackdrop.module.css';

// Real published pools, one per city, pulled from the marketplace. Small square
// CDN variants (480px) - they sit behind a heavy scrim, so detail is wasted and
// weight is not. Refresh with scripts/auth-backdrop-tiles (see README) when the
// mix of cities changes; a tile whose photo 404s falls back to its gradient.
const TILES = [
  { city: "Windham", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a74ba39-a544-4e70-9927-7e265422db70?auto=format&crop=edges&fit=crop&h=480&w=480&s=4a0a4df147d7228754c0f7b1fb92b5eb", tone: "surf" },
  { city: "Auburn", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a728312-0de2-4766-8144-d45e538c24b1?auto=format&crop=edges&fit=crop&h=480&w=480&s=d399805f066431037a203268528fafdc", tone: "lagoon" },
  { city: "Coeur d'Alene", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a71357e-3c86-4394-9881-099600330396?auto=format&crop=edges&fit=crop&h=480&w=480&s=9aa1fbd349f2a526f32d6f0821b2b175", tone: "deep" },
  { city: "Pinole", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a7101a2-d968-4aed-aa68-c5dcbc937d7e?auto=format&crop=edges&fit=crop&h=480&w=480&s=c7201b7961987a910cecf77ea71f29cb", tone: "palm" },
  { city: "Oregon City", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a6f8282-d196-46ca-b3fd-6346d9a6b463?auto=format&crop=edges&fit=crop&h=480&w=480&s=d60a004750063b4309eea401d9bfd60a", tone: "dusk" },
  { city: "Las Vegas", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a656fb1-adae-4ab0-9e2f-e14214bc0de0?auto=format&crop=edges&fit=crop&h=480&w=480&s=01efaf569f2c69f19c88a0405e30812e", tone: "sunset" },
  { city: "Ambler", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a63daae-bf52-49fb-ba69-a18adcdf68a4?auto=format&crop=edges&fit=crop&h=480&w=480&s=dc189e941b4fefd4eab6017a78533b8c", tone: "sun" },
  { city: "Niles", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a62c4de-515d-493f-b2b5-e6b2a231f006?auto=format&crop=edges&fit=crop&h=480&w=480&s=5a0bf59c265725737599011d38726e07", tone: "surf" },
  { city: "Chestertown", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a620f33-ebb7-40ac-93a8-bae4fbe67446?auto=format&crop=edges&fit=crop&h=480&w=480&s=2a154f9cdfbab1bfa79d16ecd823668d", tone: "lagoon" },
  { city: "Portland", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a5fdeb8-8460-4a47-bc5a-7b7301530802?auto=format&crop=edges&fit=crop&h=480&w=480&s=29ddfd79827b9df8d9515114d3633601", tone: "deep" },
  { city: "Norco", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a5edc01-c872-4a4a-8764-4ee7c14d146f?auto=format&crop=edges&fit=crop&h=480&w=480&s=9c4a149522729748396280c8c3f0262b", tone: "palm" },
  { city: "Alexandria", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a5d2eee-6bd2-4466-ba92-9ea254bf13f7?auto=format&crop=edges&fit=crop&h=480&w=480&s=bc245678c616e148d225215520c0cfc9", tone: "dusk" },
  { city: "Rancho Palos Verdes", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a5c5f7d-74f7-4805-b783-d1762f69d307?auto=format&crop=edges&fit=crop&h=480&w=480&s=f3ccd746394844969ac1e4e43beaab6a", tone: "sunset" },
  { city: "Freehold", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a56afd0-63f3-4076-a673-ef3c7f816f65?auto=format&crop=edges&fit=crop&h=480&w=480&s=7a6b2f1ab1d3f2621d3c58bd8a7565d1", tone: "sun" },
  { city: "Olathe", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a5662d0-0c42-413d-bc91-e5e5f7c3d3d0?auto=format&crop=edges&fit=crop&h=480&w=480&s=b051e2ed252a84265cad5eeda4c841d4", tone: "surf" },
  { city: "Powder Springs", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a55c97a-43d8-4085-b406-3008cd499a42?auto=format&crop=edges&fit=crop&h=480&w=480&s=e38c04f1d0f65a5d927ad0618653c446", tone: "lagoon" },
  { city: "Little Falls", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a55102d-e61f-433a-8073-b0e501ef1f8b?auto=format&crop=edges&fit=crop&h=480&w=480&s=0a4b9fdec9f043004b45a72a63c620a9", tone: "deep" },
  { city: "La Grange", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a52c408-af28-404b-b744-e712b2dd0750?auto=format&crop=edges&fit=crop&h=480&w=480&s=4b93c359b547b3c0f96346b12239b9d1", tone: "palm" },
  { city: "Lancaster", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a5287b8-54cb-430c-b371-c64aafa78b3b?auto=format&crop=edges&fit=crop&h=480&w=480&s=a33da92176c4dc5fc0668bcca2ca785a", tone: "dusk" },
  { city: "Silver Spring", src: "https://sharetribe.imgix.net/672444e2-9969-433a-b885-743775a6824c/6a4bf775-df48-403d-a9ec-7556bdab7cc1?auto=format&crop=edges&fit=crop&h=480&w=480&s=3a793fffdb441de6ec51afadb7a5f826", tone: "sunset" }
];

/**
 * Decorative wall of real pools behind the auth card.
 *
 * Presentational only: aria-hidden, and pointer-events are disabled in CSS so
 * it can never sit between a user and the form. Each tile paints its gradient
 * immediately and the photo fades in over it, so there is no blank flash and a
 * dead image URL degrades to a coloured tile rather than a broken-image icon.
 */
const AuthBackdrop = props => {
  const { className } = props;

  return (
    <div className={classNames(css.root, className)} aria-hidden="true">
      <div className={css.grid}>
        {TILES.map(({ city, src, tone }, i) => (
          <div
            key={city}
            className={classNames(css.tile, css[tone])}
            // Staggered so the drift never looks like one synchronised block.
            style={{ '--i': i }}
          >
            <img
              className={css.photo}
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              onError={e => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className={css.city}>{city}</span>
            <span className={css.wave} />
          </div>
        ))}
      </div>
      <div className={css.scrim} />
    </div>
  );
};

export default AuthBackdrop;
