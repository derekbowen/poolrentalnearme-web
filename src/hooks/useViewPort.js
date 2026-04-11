import throttle from 'lodash/throttle';
import { useEffect, useState } from 'react';

const getWindowDimensions = () => {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }
  const { innerWidth: width, innerHeight: height } = window;
  return { width, height };
};

const WAIT_MS = 100;

const defaultOptions = { waitMs: WAIT_MS };

/**
 *
 * Custom hook that provides the dimensions of the current viewport.
 *
 * @typedef {Object} ViewPortDimensions
 * @property {number} width - The width of the viewport.
 * @property {number} height - The height of the viewport.
 *
 * @param {Object} options - The options for the hook.
 * @param {number} options.waitMs - The delay in milliseconds before updating the viewport dimensions.
 * @returns {ViewPortDimensions} - The dimensions of the current viewport.
 */
const useViewPort = ({ waitMs } = defaultOptions) => {
  const [windowDimensions, setWindowDimensions] = useState(getWindowDimensions());

  useEffect(() => {
    const setViewport = () => {
      setWindowDimensions(getWindowDimensions());
    };
    const handleResize = throttle(setViewport, waitMs, {
      trailing: true,
    });
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [waitMs]);

  return windowDimensions;
};

export default useViewPort;
