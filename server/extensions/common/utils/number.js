/* eslint-disable default-param-last */
/**
 * Function to try parsing a string to an integer value.
 * Returns the parsed integer if successful, otherwise returns default value.
 *
 * @param {string} value
 * @param {number} [radix = 10]
 * @param {number} [defaultValue = null]
 * @returns number | null
 */
exports.tryParseInt = (value, radix = 10, defaultValue = null) => {
  const parsedValue = parseInt(value, radix);
  return Number.isNaN(parsedValue) ? defaultValue : parsedValue;
};

/**
 * Function to try parsing a string to an float value.
 * Returns the parsed float if successful, otherwise returns null.
 *
 * @param {string} value
 * @returns number | null
 */
exports.tryParseFloat = (value) => {
  const parsedValue = parseFloat(value);
  return Number.isNaN(parsedValue) ? null : parsedValue;
};
