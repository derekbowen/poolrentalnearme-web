import PropTypes, { bool, elementType, string } from 'prop-types';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { NamedRedirect } from '../components';

const WithAuthCheck = ({
  component: Component,
  auth = false,
  authPage = 'SignupPage',
  extraProps = {},
}) => {
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const canShow = auth ? isAuthenticated : true;
  const { pathname, search, hash } = useLocation();
  return canShow ? (
    <Component {...extraProps} />
  ) : (
    <NamedRedirect
      name={authPage}
      state={{
        from: pathname + search + hash,
      }}
    />
  );
};

WithAuthCheck.propTypes = {
  component: elementType.isRequired,
  auth: bool,
  authPage: string,
  extraProps: PropTypes.object,
};

export default WithAuthCheck;
