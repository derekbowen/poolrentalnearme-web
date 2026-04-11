const { denormalisedResponseEntities } = require('./data');

const EXCEPTION = [
  'revoke',
  'authInfo',
  'assetsByAlias',
  'assetByAlias',
  'assetsByVersion',
  'assetByVersion',
  'queryListings',
  'queryAssets',
  'exchangeToken',
];

const checkInstanceConfig = (obj) => {
  // eslint-disable-next-line no-prototype-builtins
  return obj?.hasOwnProperty('allowRawResponse');
};

const wrapInstanceWithResponseTransformer = (currentInstance) => {
  const wrappedInstance = {};
  const keys = Object.keys(currentInstance);
  // eslint-disable-next-line no-restricted-syntax
  for (const key of keys) {
    if (EXCEPTION.includes(key)) {
      wrappedInstance[key] = currentInstance[key];
      // eslint-disable-next-line no-continue
      continue;
    }
    if (typeof currentInstance[key] === 'object') {
      wrappedInstance[key] = wrapInstanceWithResponseTransformer(currentInstance[key]);
    } else if (typeof currentInstance[key] === 'function') {
      wrappedInstance[key] = async (...args) => {
        const lastArgument = args[args.length - 1];
        const isInstanceConfig = checkInstanceConfig(lastArgument);
        const sharetribeArgs = isInstanceConfig ? args.slice(0, args.length - 1) : args;
        const response = await currentInstance[key](...sharetribeArgs);
        const formattedResponse = denormalisedResponseEntities(response);
        if (lastArgument?.allowRawResponse) {
          // eslint-disable-next-line no-underscore-dangle
          formattedResponse._raw = response;
        }
        return formattedResponse;
      };
    } else {
      wrappedInstance[key] = currentInstance[key];
    }
  }
  return wrappedInstance;
};

module.exports = wrapInstanceWithResponseTransformer;
