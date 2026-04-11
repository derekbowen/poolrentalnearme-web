import React from 'react';
import classNames from 'classnames';
import { useLocation } from 'react-router-dom';

import { useRouteConfiguration } from '../../../../context/routeConfigurationContext';
import { matchPathname } from '../../../../util/routes';

import { NamedLink, ExternalLink } from '../../../../components/index';
import css from './Link.module.css';

/**
 * Link element which internally uses NamedLink or ExternalLink
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to components own css.root
 * @param {string?} props.rootClassName overwrite components own css.root
 * @param {ReactNode} props.children
 * @param {string} props.href link destination. In-app links need to start with '/'.
 * @returns {JSX.Element} link element
 */
 export const Link = React.forwardRef((props, ref) => {
   const location = useLocation();
   const routes = useRouteConfiguration();
 
   const { className, rootClassName, href, title, children } = props;
   const classes = classNames(rootClassName || css.link, className);
   const titleMaybe = title ? { title } : {};
   
   // Markdown parser (rehype-sanitize) might return undefined href
   if (!href || !children) {
     return null;
   }
 
   // Finalize href to ensure correct format
   let finalizedHref = href;
   const isValidExternalUrl = /^https?:\/\//.test(href);
   const isValidHashLink = href.charAt(0) === '#';
   const isValidInternalPath = href.charAt(0) === '/';
   
   // If href doesn't start with http://, https://, #, or /, add '/' prefix
   if (!isValidExternalUrl && !isValidHashLink && !isValidInternalPath) {
     finalizedHref = '/' + href;
   }
   
   // Update linkProps with finalized href
   const linkProps = { className: classes, href: finalizedHref, children, ...titleMaybe };
 
   if (finalizedHref.charAt(0) === '/') {
     // Internal link
     const testURL = new URL('http://my.marketplace.com' + finalizedHref);
     const matchedRoutes = matchPathname(testURL.pathname, routes);
     if (matchedRoutes.length > 0) {
       const found = matchedRoutes[0];
       const to = { search: testURL.search, hash: testURL.hash };
       return (
         <NamedLink name={found.route.name} params={found.params} to={to} {...linkProps} ref={ref} />
       );
     }
   }
 
   if (finalizedHref.charAt(0) === '#') {
     if (typeof window !== 'undefined') {
       const hash = finalizedHref;
       let testURL = new URL(
         `http://my.marketplace.com${location.pathname}${location.hash}${location.search}`
       );
       testURL.hash = hash;
       const matchedRoutes = matchPathname(testURL.pathname, routes);
       if (matchedRoutes.length > 0) {
         const found = matchedRoutes[0];
         const to = { search: testURL.search, hash: testURL.hash };
         return (
           <NamedLink
             name={found.route.name}
             params={found.params}
             to={to}
             {...linkProps}
             ref={ref}
           />
         );
       }
     }
   }
 
   return <ExternalLink {...linkProps} ref={ref} />;
 });


Link.displayName = 'Link';
