/**
   Implements .env file loading that mimicks the way create-react-app
   does it. We want this to get consistent configuration handling
   between client and node server.
*/

const fs = require('fs');

const VITE_ENV = process.env.VITE_ENV;

if (!VITE_ENV) {
  throw new Error('The VITE_ENV environment variable is required but was not specified.');
}

// https://github.com/bkeepers/dotenv#what-other-env-files-can-i-use
var dotenvFiles = [
  `.env.${VITE_ENV}.local`,
  // Don't include `.env.local` for `test` environment
  // since normally you expect tests to produce the same
  // results for everyone
  VITE_ENV !== 'test' && `.env.local`,
  `.env.${VITE_ENV}`,
  '.env',
].filter(Boolean);

const configureEnv = () => {
  // Load environment variables from .env* files. Suppress warnings using silent
  // if this file is missing. dotenv will never modify any environment variables
  // that have already been set.
  // https://github.com/motdotla/dotenv
  dotenvFiles.forEach(dotenvFile => {
    if (fs.existsSync(dotenvFile)) {
      console.log('Loading env from file:' + dotenvFile);
      require('dotenv-expand')(
        require('dotenv').config({
          path: dotenvFile,
        })
      );
    }
  });
};

module.exports = {
  configureEnv: configureEnv,
};
