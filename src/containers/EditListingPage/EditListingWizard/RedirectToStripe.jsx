import { func } from 'prop-types';
import { useEffect } from 'react';
import { FormattedMessage } from 'react-intl';

const RedirectToStripe = ({ redirectFn }) => {
  useEffect(() => {
    const redirect = redirectFn('custom_account_verification');
    redirect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <FormattedMessage id="EditListingWizard.redirectingToStripe" />;
};

RedirectToStripe.propTypes = {
  redirectFn: func.isRequired,
};

export default RedirectToStripe;
