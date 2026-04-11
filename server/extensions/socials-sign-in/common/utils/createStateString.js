/**
 * @param {{[key: string]: string} | null | undefined} query
 * @returns {string} stateString
 */
const createStateString = (query) => {
  const { from, defaultReturn, defaultConfirm } = query || {};
  const params = {
    ...(from ? { from } : {}),
    ...(defaultReturn ? { defaultReturn } : {}),
    ...(defaultConfirm ? { defaultConfirm } : {}),
  };

  return JSON.stringify(params);
};

module.exports = createStateString;
