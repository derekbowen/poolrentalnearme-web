/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
import { bool, number, object, string } from 'prop-types';
import { useEffect } from 'react';
import merge from 'lodash/merge';

const DEFAULT_BAR_COLORS = {
  0: 'rgba(26,  188, 156, .9)',
  '.25': 'rgba(52,  152, 219, .9)',
  '.50': 'rgba(241, 196, 15,  .9)',
  '.75': 'rgba(230, 126, 34,  .9)',
  '1.0': 'rgba(211, 84,  0,   .9)',
};

const TopbarLoadingIndicator = ({
  autoRun = true,
  barThickness = 5,
  barColors: barColorsProps = {},
  shadowBlur = 10,
  shadowColor = 'rgba(0,   0,   0,   .6)',
}) => {
  const barColors = merge(DEFAULT_BAR_COLORS, barColorsProps);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let currentProgress;
    let showing = false;
    let keepDelayTimerId = null;
    let keepFadeTimerId = null;
    let keepProgressTimerId = null;

    const canvas = document.createElement('canvas');
    const { style } = canvas;
    style.position = 'fixed';
    style.top = 0;
    style.left = 0;
    style.right = 0;
    style.margin = 0;
    style.padding = 0;
    style.zIndex = 100001;
    style.display = 'none';

    const repaint = () => {
      canvas.width = window.innerWidth;
      canvas.height = barThickness * 5;

      const ctx = canvas.getContext('2d');
      ctx.shadowBlur = shadowBlur;
      ctx.shadowColor = shadowColor;

      const lineGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      for (const stop in barColors) lineGradient.addColorStop(stop, barColors[stop]);
      ctx.lineWidth = barThickness;
      ctx.beginPath();
      ctx.moveTo(0, barThickness / 2);
      ctx.lineTo(Math.ceil(currentProgress * canvas.width), barThickness / 2);
      ctx.strokeStyle = lineGradient;
      ctx.stroke();
    };

    window.addEventListener('resize', repaint);

    const progress = (to) => {
      if (typeof to === 'undefined') return currentProgress;
      if (typeof to === 'string') {
        // eslint-disable-next-line no-param-reassign
        to = (to.indexOf('+') >= 0 || to.indexOf('-') >= 0 ? currentProgress : 0) + parseFloat(to);
      }
      currentProgress = to > 1 ? 1 : to;
      repaint();
      return currentProgress;
    };

    const show = (delay) => {
      if (showing) return;
      if (!delay) {
        showing = true;
        if (keepFadeTimerId !== null) window.cancelAnimationFrame(keepFadeTimerId);
        if (!canvas.parentElement) document.body.appendChild(canvas);
        canvas.style.opacity = 1;
        canvas.style.display = 'block';
        progress(0);
        if (autoRun) {
          (function loop() {
            keepProgressTimerId = window.requestAnimationFrame(loop);
            progress(`+${0.05 * (1 - Math.sqrt(currentProgress)) ** 2}`);
          })();
        }
      } else if (!keepDelayTimerId) {
        keepDelayTimerId = setTimeout(() => show(), delay);
      }
    };

    show();

    const hide = () => {
      clearTimeout(keepDelayTimerId);
      keepDelayTimerId = null;
      if (!showing) return;
      showing = false;
      if (keepProgressTimerId) {
        window.cancelAnimationFrame(keepProgressTimerId);
        keepProgressTimerId = null;
      }
      (function loop() {
        if (progress('+.1') >= 1) {
          canvas.style.opacity -= 0.05;
          if (canvas.style.opacity <= 0.05) {
            canvas.style.display = 'none';
            keepFadeTimerId = null;
            document.body.removeChild(canvas);
            return;
          }
        }
        keepFadeTimerId = window.requestAnimationFrame(loop);
      })();
    };

    // eslint-disable-next-line consistent-return
    return () => {
      window.removeEventListener('resize', repaint);
      hide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

TopbarLoadingIndicator.propTypes = {
  autoRun: bool,
  barThickness: number,
  barColors: object,
  shadowBlur: number,
  shadowColor: string,
};

export default TopbarLoadingIndicator;
