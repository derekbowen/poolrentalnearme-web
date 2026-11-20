// The app's own Vite config, plus one alias: 'sharetribe-flex-sdk' resolves to
// the harness fake so a render can never reach the Marketplace API.
import path from 'node:path';
import baseFactory from '../../vite.config.mjs';

export default async (env) => {
  const base = await baseFactory(env);
  base.resolve.alias = [
    { find: /^sharetribe-flex-sdk$/, replacement: path.resolve(__dirname, 'src/fakeSdk.js') },
    ...base.resolve.alias,
  ];
  return base;
};
