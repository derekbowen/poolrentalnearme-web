import React from 'react';

import { FormattedMessage } from '../../util/reactIntl';

import { Heading } from '../../components';

import css from './ListingPage.module.css';

const SectionAddonMaybe = (props) => {
  const { key, heading, options } = props;

  return options.length > 0 ? (
    <section className={css.sectionDetails} key={key}>
      <Heading as="h2" rootClassName={css.sectionHeading}>
        <FormattedMessage id={heading} />
      </Heading>
      <ul className={css.details}>
        {options.map((detail) => (
          <li key={detail.key} className={css.detailsRow}>
            <span className={css.detailLabel}>{detail.label}</span>
            <span className={css.detailValue}>{detail.value}</span>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
};

export default SectionAddonMaybe;
