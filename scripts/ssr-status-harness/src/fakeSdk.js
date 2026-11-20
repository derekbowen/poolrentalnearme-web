// Harness-only stand-in for 'sharetribe-flex-sdk' (aliased in ../vite.config.mjs).
// The real types / transit / util / tokenStore, and a createInstance that hands
// back whatever the runner installed on global.harnessSdk. Nothing in
// here opens a network connection, which is the point: the harness renders real
// routes through the app's own renderApp without touching the Marketplace API.
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const real = nodeRequire('sharetribe-flex-sdk');

export const { types, transit, util, tokenStore, createMultitenantInstance } = real;
export const createInstance = (config) => global.harnessSdk(config, real);
