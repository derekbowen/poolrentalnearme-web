import React from 'react';
import classNames from 'classnames';
import { Heading } from '../../components';

import css from './ListingPage.module.css';

// Option labels may contain host-entered emoji (e.g. "🌞 All-day sun").
// The brand style uses an SVG icon as the primary icon, so strip any
// leading emoji from the label text.
// (No unicode-property regex here: the legacy-browser transpile chokes on \p escapes.)
const isEmojiCodePoint = (cp) =>
  (cp >= 0x1f000 && cp <= 0x1ffff) ||
  (cp >= 0x2600 && cp <= 0x27bf) ||
  (cp >= 0x2b00 && cp <= 0x2bff) ||
  cp === 0xfe0f ||
  cp === 0x200d;
const stripLeadingEmoji = (label) => {
  if (typeof label !== 'string') {
    return label;
  }
  let i = 0;
  let strippedAny = false;
  while (i < label.length) {
    const cp = label.codePointAt(i);
    if (isEmojiCodePoint(cp)) {
      i += cp > 0xffff ? 2 : 1;
      strippedAny = true;
      continue;
    }
    if (strippedAny && (label[i] === ' ' || label[i] === '\t')) {
      i += 1;
      continue;
    }
    break;
  }
  const stripped = label.slice(i);
  return stripped.length > 0 ? stripped : label;
};

const IconFeature = ({ isSelected }) => (
  <svg
    className={css.featureIcon}
    width="14"
    height="14"
    viewBox="0 0 14 14"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {isSelected ? (
      <path
        d="M11.6 3.6 5.7 9.5 2.4 6.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : (
      <path d="M3.5 7h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    )}
  </svg>
);

const SectionMultiEnumMaybe = (props) => {
  const { heading, options, selectedOptions = [], showUnselectedOptions = true } = props;
  const hasContent = showUnselectedOptions || selectedOptions?.length > 0;
  if (!heading || !options || !hasContent) {
    return null;
  }

  const shownOptions = showUnselectedOptions
    ? options
    : options.filter((o) => selectedOptions.includes(o.key));

  return (
    <section className={css.sectionMultiEnum}>
      <Heading as="h2" rootClassName={css.sectionHeading}>
        {heading}
      </Heading>
      <ul className={css.featureList}>
        {shownOptions.map((option) => {
          const isSelected = selectedOptions.includes(option.key);
          return (
            <li
              key={option.key}
              className={classNames(css.featureItem, { [css.featureItemUnselected]: !isSelected })}
            >
              <span
                className={classNames(css.featureIconChip, {
                  [css.featureIconChipMuted]: !isSelected,
                })}
              >
                <IconFeature isSelected={isSelected} />
              </span>
              <span className={css.featureLabel}>{stripLeadingEmoji(option.label)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default SectionMultiEnumMaybe;
