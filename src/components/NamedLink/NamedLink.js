import React from 'react';
import { Link, useMatch } from 'react-router-dom';
import classNames from 'classnames';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { pathByRouteName } from '../../util/routes';

/**
 * This component wraps React-Router's Link by providing name-based routing.
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className
 * @param {string?} props.activeClassName class applied, when the link is the current link
 * @param {string?} props.name - name of the route in routeConfiguration
 * @param {Object?} props.params - path params for the named route and its pathname prop
 * @param {Object?} props.to - props for the React Router Link
 * @param {string?} props.to.search - search params for the React Router Link
 * @param {string?} props.to.hash - hash for the React Router Link
 * @param {Object?} props.to.state - state for the React Router Link (history.pushstate)
 * @param {any} props.children - the content of the link
 * @param {Object?} props.style - inline css for the link
 * @param {string?} props.title - title attribute for the 'a' element.
 * @param {Object?} props.match - match from React Router
 * @returns {JSX.Element} containing form that allows adding availability exceptions
 */
const NamedLink = ({
  activeClassName = 'NamedLink_active',
  children,
  className,
  name,
  params = {},
  style = {},
  title,
  to = {},
}) => {
  const routeConfiguration = useRouteConfiguration();

  const pathname = pathByRouteName(name, routeConfiguration, params);
  const matched = useMatch(pathname);
  const active = matched?.pathname === pathname;

  const aElemProps = {
    className: classNames(className, { [activeClassName]: active }),
    style,
    title,
  };

  // Remove `state` from `to` object to avoid passing it to the `Link` component
  const { state, ...restTo } = to;

  return (
    <Link unstable_viewTransition state={state} to={{ pathname, ...restTo }} {...aElemProps}>
      {children}
    </Link>
  );
};

export default NamedLink;
