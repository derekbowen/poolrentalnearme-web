/* eslint-disable react/prop-types */
import React, { useEffect, useState } from 'react';
import memoize from 'lodash/memoize';
import useMounted from 'hooks/useMounted';

memoize.Cache = Map;

// We are standing on the shoulders of giants.
// This component is adapted from the great work done
// in React Layout Areas and Atomic Layouts projects!
// - https://github.com/giuseppeg/react-layout-areas
// - https://github.com/kettanaito/atomic-layout

// Split areas string to rows from line breaks and remove empty lines.
const splitToRows = (areasString) => areasString.trim().split('\n').filter(Boolean);
// Split rows to words (area names) from white-space and remove empty strings
const splitToAreaNames = (rowString) => rowString.split(/\s+/).filter(Boolean);
// kebab-case to camelCase
const camelize = (s) => s.replace(/-(.)/g, (l) => l[1].toUpperCase());
// Capitalize initial letter
const capitalizeWord = (s) => `${s.charAt(0).toUpperCase()}${s.substr(1)}`;

const createComponent = (areaName) => {
  const Component = React.forwardRef((props, ref) => {
    const { as, style, ...otherProps } = props;
    const Tag = as || 'div';
    return <Tag {...otherProps} style={{ ...style, gridArea: areaName }} ref={ref} />;
  });

  const displayName = camelize(capitalizeWord(areaName));
  Component.displayName = `LayoutArea.${displayName}`;
  return { displayName, Component };
};

/**
 * Parses CSS Grid template areas string.
 * For example:
 * `
 *  topbar
 *  main
 *  footer
 * `
 *
 * @param {String} areas for CSS Grid
 * @returns object containing generated Area *components* and *gridTemplateAreas*. E.g. "'topbar' 'main' 'footer' "
 */
const parseAreas = memoize((areas) => {
  return splitToRows(areas)
    .map(splitToAreaNames)
    .reduce(
      (acc, areaNames) => {
        areaNames.forEach((areaName) => {
          const { displayName, Component } = createComponent(areaName);
          acc.components[displayName] = Component;
        });
        acc.gridTemplateAreas += `'${areaNames.join(' ')}' `;
        return acc;
      },
      { components: {}, gridTemplateAreas: '' }
    );
});

// Handle resize event:
// if event matches with the rule set to MediaQueryList, call callback with parsed areas
const resize = (config, callback) => (e) => {
  // If media query matches
  if (e.matches) {
    callback(parseAreas(config.areas));
  }
};

// Set the current areas according to responsiveAreas config and adds listeners for MediaQueryList changes
const handleResponsiveAreasOnBrowser = (responsiveAreas, setAreas) => {
  const resizeListeners = [];
  const entries = Object.entries(responsiveAreas);
  entries.forEach(([, config]) => {
    const { mediaQuery, areas } = config;
    const mediaQueryList = window.matchMedia(mediaQuery);
    // Set areas if current viewport matches
    if (mediaQueryList.matches) {
      setAreas(parseAreas(areas));
    }
    // Create listener for future matches of MQL rule
    const resizeListener = resize(config, setAreas);
    // Save MQL and listener for future "removeEventListener" call
    resizeListeners.push({ mediaQueryList, resizeListener });
    // Add the created resizeListener to MQL
    mediaQueryList.addEventListener('change', resizeListener);
  });
  return resizeListeners;
};

// Parse default areas for state hook.
const parseDefaultAreasFromProps = (props) => {
  const { areas, responsiveAreas } = props;
  if (areas) {
    return parseAreas(areas);
  }
  if (responsiveAreas) {
    const firstKey = Object.keys(responsiveAreas)[0];
    const firstAreasString = responsiveAreas?.[firstKey]?.areas;
    if (firstAreasString) {
      return parseAreas(firstAreasString);
    }
  }
  throw new Error(
    'LayoutComposer needs to have either "areas" or "responsiveAreas" included into props.'
  );
};

/**
 * LayoutComposer creates container and area wrappers using CSS Grid Template Areas.
 *
 * @example
 * const layoutAreas = `
 *   topbar
 *   main
 *   footer
 * `;
 *
 * return (
 *   <LayoutComposer areas={layoutAreas} className={css.layout}>
 *     {props => {
 *       const { Topbar, Main, Footer } = props;
 *       return (
 *         <>
 *           <Topbar as="h1" className={css.topbar}>
 *             Hello world!
 *           </Topbar>
 *           <Main as="main" className={css.main}>
 *             Some custom content.
 *           </Main>
 *           <Footer>
 *             Contact us
 *           </Footer>
 *         </>
 *       );
 *     }}
 *   </LayoutComposer>
 * );
 *
 * Note: "areas" and "responsiveAreas" are alternative props.
 * For the "responsiveAreas", the content should look like this:
 *
 * @example
 * {
 *    areasSmall: {
 *      mediaQuery: '(max-width: 767px)',
 *      areas: `
 *        topbar
 *        main
 *        extra
 *        footer
 *      `,
 *    },
 *    areasMedium: {
 *      mediaQuery: '(min-width: 768px) and (max-width: 1023px)',
 *      areas: `
 *      topbar topbar
 *      main extra
 *      footer footer
 *      `,
 *    },
 *    areasLarge: {
 *      mediaQuery: '(min-width: 1024px)',
 *      areas: `
 *      topbar topbar topbar
 *      main extra footer
 *      `,
 *    },
 * }
 *
 * @component
 * @param {Object} props
 * @param {string?} props.display
 * @param {string?} props.areas
 * @param {Object} props.responsiveAreas
 * @param {string} props.responsiveAreas.mediaQuery
 * @param {string} props.responsiveAreas.areas
 * @param {ReactNode?} props.children
 * @param {ReactNode} props.as tag for the container. Defaults to 'div'
 * @param {Object} props.style
 * @returns {JSX.Element} LayoutComposer that expects children to be a function.
 */
const LayoutComposer = React.forwardRef((props, ref) => {
  const mounted = useMounted();
  const [currentAreas, setAreas] = useState(parseDefaultAreasFromProps(props));
  const {
    children,
    style = {},
    areas,
    responsiveAreas,
    display = 'grid',
    as,
    ...otherProps
  } = props;

  useEffect(() => {
    let resizeListeners = [];
    if (mounted && responsiveAreas) {
      resizeListeners = handleResponsiveAreasOnBrowser(responsiveAreas, setAreas);
    }

    return () => {
      resizeListeners.forEach((listener) => {
        const { mediaQueryList, resizeListener } = listener;
        mediaQueryList.removeEventListener('change', resizeListener);
      });
    };
  }, [responsiveAreas, mounted]);

  const { components, gridTemplateAreas } = currentAreas;
  const Tag = as || 'div';

  return (
    <Tag
      {...otherProps}
      style={{
        ...style,
        gridTemplateAreas,
        display: display === 'inline' ? 'grid-inline' : 'grid',
      }}
      ref={ref}
    >
      {children(components)}
    </Tag>
  );
});
LayoutComposer.displayName = 'LayoutComposer';

export default LayoutComposer;
