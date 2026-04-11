import { useEffect, useState } from 'react';

const getInitialValues = (query, defaultValue) => {
  if (typeof window === 'undefined') {
    return defaultValue;
  }

  return window.matchMedia(query).matches;
};

/**
 * Custom hook that returns a boolean value indicating whether the specified media query matches the current viewport.
 *
 * @param {string} query - The media query to match against the viewport.
 * @param {boolean} [initialValue=false] - The initial value for the matches state.
 * @returns {boolean} - A boolean value indicating whether the media query matches the current viewport.
 *
 * @example
 * const App = () => {
 *    const isMobile = useMediaQuery('(max-width: 768px)', false);
 *    return <div>{isMobile ? 'Mobile' : 'Desktop'}</div>;
 * };
 */
const useMediaQuery = (query, initialValue = false) => {
  const [matches, setMatches] = useState(getInitialValues(query, initialValue));

  useEffect(() => {
    const mediaMatch = window.matchMedia(query);

    const handler = () => setMatches(mediaMatch.matches);
    mediaMatch.addListener(handler);
    return () => mediaMatch.removeListener(handler);
  }, [query]);

  return matches;
};

export default useMediaQuery;
