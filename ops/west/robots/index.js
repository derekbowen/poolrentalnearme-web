// Lets `node --test ops/west/robots/` (the directory form) run the whole suite.
// Node 22 does not expand a directory argument into its test files: without this
// file that command fails with MODULE_NOT_FOUND and runs no test at all. With it,
// Node loads this file as the directory's entry point, and it imports every test
// file below. robots-match.test.mjs checks that this list matches the directory.
//
// The documented command stays the explicit one: node --test ops/west/robots/*.test.mjs
// (it does not pick this file up, so nothing runs twice).
await import('./robots-match.test.mjs');
await import('./robots.test.mjs');
await import('./robots.proposed.test.mjs');
