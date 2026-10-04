/* eslint-disable react/no-array-index-key -- static decorative coordinate lists that never reorder */
import React from 'react';

import css from './OperatingCeoPage.module.css';

/**
 * Hero art for /operating-ceo: "looking into the future of pools and technology".
 * Pure inline SVG (no network request, crisp at any size). Decorative only, so it is
 * hidden from screen readers; the page H1 carries the meaning.
 */
const FutureHero = () => (
  <div className={css.hero}>
    <svg
      className={css.heroArt}
      viewBox="0 0 1200 520"
      preserveAspectRatio="xMidYMax slice"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="fh-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#050b1f" />
          <stop offset="0.55" stopColor="#0b2350" />
          <stop offset="1" stopColor="#0e3a6b" />
        </linearGradient>
        <radialGradient id="fh-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#7dd3fc" stopOpacity="0.9" />
          <stop offset="0.45" stopColor="#38bdf8" stopOpacity="0.35" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fh-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="0.5" stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#0369a1" />
        </linearGradient>
        <linearGradient id="fh-deck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f2a52" />
          <stop offset="1" stopColor="#081a36" />
        </linearGradient>
        <linearGradient id="fh-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.06" />
        </linearGradient>
        <filter id="fh-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="fh-pool">
          <path d="M330 470 L470 330 L730 330 L870 470 Z" />
        </clipPath>
      </defs>

      {/* night sky */}
      <rect width="1200" height="520" fill="url(#fh-sky)" />
      {[
        [80, 60],
        [190, 120],
        [300, 40],
        [420, 95],
        [540, 30],
        [660, 80],
        [760, 50],
        [880, 110],
        [990, 45],
        [1110, 90],
        [140, 190],
        [1040, 170],
        [620, 150],
        [360, 170],
      ].map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i % 3 === 0 ? 1.8 : 1.1}
          fill="#e0f2fe"
          opacity={0.5 + (i % 4) * 0.12}
        />
      ))}

      {/* horizon glow */}
      <circle cx="600" cy="300" r="260" fill="url(#fh-sun)" />

      {/* city/data skyline */}
      <g fill="#0a1d3d" opacity="0.95">
        {[
          [60, 230, 50],
          [118, 205, 38],
          [162, 245, 30],
          [200, 190, 46],
          [252, 228, 34],
          [892, 222, 40],
          [938, 186, 52],
          [996, 238, 30],
          [1032, 200, 44],
          [1082, 226, 36],
          [1124, 196, 50],
        ].map(([x, top, w], i) => (
          <rect key={i} x={x} y={top} width={w} height={320 - top} rx="3" />
        ))}
      </g>
      <g fill="#38bdf8" opacity="0.55">
        {[
          [214, 210],
          [214, 230],
          [226, 250],
          [950, 205],
          [962, 225],
          [950, 245],
          [1046, 220],
          [1136, 215],
          [1136, 240],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="6" height="4" rx="1" />
        ))}
      </g>

      {/* deck plane with perspective grid */}
      <path d="M0 320 L1200 320 L1200 520 L0 520 Z" fill="url(#fh-deck)" />
      <g stroke="#38bdf8" strokeOpacity="0.28" strokeWidth="1">
        {[-600, -400, -200, 0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800].map((x, i) => (
          <line key={`v${i}`} x1="600" y1="320" x2={x} y2="520" />
        ))}
        {[330, 345, 365, 392, 428, 475].map((y, i) => (
          <line key={`h${i}`} x1="0" y1={y} x2="1200" y2={y} />
        ))}
      </g>

      {/* the pool */}
      <path
        d="M318 482 L462 322 L738 322 L882 482 Z"
        fill="#7dd3fc"
        opacity="0.25"
        filter="url(#fh-glow)"
      />
      <path d="M330 470 L470 330 L730 330 L870 470 Z" fill="url(#fh-water)" />
      <g clipPath="url(#fh-pool)" fill="none" stroke="#e0f2fe" strokeLinecap="round">
        <path
          d="M380 380 C440 360 500 400 560 378 S680 360 740 386"
          strokeWidth="2"
          strokeOpacity="0.55"
        />
        <path
          d="M350 420 C430 400 520 440 600 414 S760 396 840 426"
          strokeWidth="2.5"
          strokeOpacity="0.45"
        />
        <path
          d="M420 352 C480 340 540 362 600 348 S700 338 760 356"
          strokeWidth="1.5"
          strokeOpacity="0.6"
        />
        <path
          d="M330 455 C420 438 520 470 610 450 S780 436 870 458"
          strokeWidth="3"
          strokeOpacity="0.35"
        />
      </g>
      <path
        d="M330 470 L470 330 L730 330 L870 470"
        fill="none"
        stroke="#a5f3fc"
        strokeWidth="3"
        filter="url(#fh-glow)"
      />

      {/* floating app cards */}
      <g filter="url(#fh-glow)">
        <g transform="translate(118 300) rotate(-6)">
          <rect
            width="190"
            height="104"
            rx="16"
            fill="url(#fh-card)"
            stroke="#7dd3fc"
            strokeOpacity="0.6"
          />
          <rect x="18" y="18" width="70" height="10" rx="5" fill="#7dd3fc" opacity="0.9" />
          {[0, 1, 2, 3, 4, 5].map((c) => (
            <rect
              key={c}
              x={18 + c * 26}
              y="44"
              width="18"
              height="18"
              rx="4"
              fill="#e0f2fe"
              opacity={c === 2 ? 0.95 : 0.3}
            />
          ))}
          {[0, 1, 2, 3, 4, 5].map((c) => (
            <rect
              key={`r${c}`}
              x={18 + c * 26}
              y="70"
              width="18"
              height="18"
              rx="4"
              fill="#e0f2fe"
              opacity={c === 4 ? 0.95 : 0.3}
            />
          ))}
        </g>
        <g transform="translate(900 290) rotate(5)">
          <rect
            width="190"
            height="104"
            rx="16"
            fill="url(#fh-card)"
            stroke="#7dd3fc"
            strokeOpacity="0.6"
          />
          <circle cx="40" cy="40" r="16" fill="#22d3ee" opacity="0.9" />
          <path
            d="M33 40 l5 5 l10 -11"
            fill="none"
            stroke="#062a4a"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="66" y="30" width="96" height="9" rx="4.5" fill="#e0f2fe" opacity="0.9" />
          <rect x="66" y="46" width="70" height="8" rx="4" fill="#e0f2fe" opacity="0.45" />
          <rect x="22" y="72" width="146" height="14" rx="7" fill="#22d3ee" opacity="0.35" />
          <rect x="22" y="72" width="104" height="14" rx="7" fill="#22d3ee" opacity="0.9" />
        </g>
        <g transform="translate(540 200)">
          <rect
            width="120"
            height="54"
            rx="27"
            fill="url(#fh-card)"
            stroke="#a5f3fc"
            strokeOpacity="0.7"
          />
          <circle cx="27" cy="27" r="11" fill="#a5f3fc" />
          <rect x="46" y="18" width="56" height="8" rx="4" fill="#e0f2fe" opacity="0.9" />
          <rect x="46" y="31" width="38" height="7" rx="3.5" fill="#e0f2fe" opacity="0.45" />
        </g>
      </g>
      <g stroke="#7dd3fc" strokeOpacity="0.5" strokeDasharray="4 6" fill="none">
        <path d="M308 340 C380 300 460 280 540 240" />
        <path d="M900 330 C830 300 740 270 660 236" />
      </g>
    </svg>
    <div className={css.heroFade} />
  </div>
);

export default FutureHero;
