'use strict';
/**
 * Log a line at most once per interval; the lines in between are counted, not
 * written. Used for anything a stranger can trigger repeatedly (401s, capped
 * handoffs), so the pm2 log cannot be grown without bound.
 */
function sampler(intervalMs, now = () => Date.now()) {
  let last = -Infinity;
  let suppressed = 0;
  return (write, msg) => {
    const t = now();
    if (t - last >= intervalMs) {
      write(suppressed ? `${msg} (+${suppressed} more since the last line)` : msg);
      last = t;
      suppressed = 0;
      return true;
    }
    suppressed++;
    return false;
  };
}

module.exports = { sampler };
