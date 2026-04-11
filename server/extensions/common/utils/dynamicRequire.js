const log = require('log');

const dynamicRequire = (path) => {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path);
  } catch (e) {
    log.info(`Could not require ${path}, if you are using it, make sure it is installed.`);
    return null;
  }
};

module.exports = dynamicRequire;
