import Intercom from '@intercom/messenger-js-sdk';
import { intercomAppId } from '../../config/intercom';

let intercomInitiated = false;

// The mobile bottom tab bar (BottomNav) is fixed at the bottom on viewports <= 1024px,
// so push the Intercom launcher up to clear it (~80px nav + the iOS home indicator).
// On desktop there's no bottom nav, so keep the default spacing.
const launcherPadding = () =>
  typeof window !== 'undefined' && window.innerWidth <= 1024 ? 110 : 20;

const initIntercom = () => {
  if (!intercomInitiated) {
    Intercom({
      app_id: intercomAppId,
      vertical_padding: launcherPadding(),
    });
    intercomInitiated = true;

    // Keep the launcher clear of the bottom nav across resize / orientation / breakpoint changes.
    if (typeof window !== 'undefined') {
      let lastPad = launcherPadding();
      window.addEventListener('resize', () => {
        const pad = launcherPadding();
        if (pad !== lastPad && typeof window.Intercom === 'function') {
          lastPad = pad;
          window.Intercom('update', { vertical_padding: pad });
        }
      });
    }
  }
};

export default initIntercom;
