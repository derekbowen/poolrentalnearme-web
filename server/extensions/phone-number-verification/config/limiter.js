const REQUEST_PER_MINUTE = 6;
const WINDOW_MS = 60 * 1000;

module.exports = {
  limit: REQUEST_PER_MINUTE,
  windowMs: WINDOW_MS,
};
