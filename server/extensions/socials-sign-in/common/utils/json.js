const tryParse = (value, defaultValue = {}) => {
  try {
    return JSON.parse(value);
  } catch (e) {
    return defaultValue;
  }
};

exports.tryParse = tryParse;
