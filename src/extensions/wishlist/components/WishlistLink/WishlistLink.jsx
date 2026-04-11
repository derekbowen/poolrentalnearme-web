import React from 'react';
import { string } from 'prop-types';
import { useIntl } from 'react-intl';
import { NamedLink } from '../../../../components';

const WishlistLink = (props) => {
  const { linkClassName, linkLabelClassName } = props;

  const intl = useIntl();
  return (
    <NamedLink className={linkClassName} name="WishlistPage">
      <span className={linkLabelClassName}>
        {intl.formatMessage({ id: 'TopbarDesktop.myWishlistLink' })}
      </span>
    </NamedLink>
  );
};

WishlistLink.defaultProps = {
  linkClassName: null,
  linkLabelClassName: null,
};

WishlistLink.propTypes = {
  linkClassName: string,
  linkLabelClassName: string,
};

export default WishlistLink;
