// Bundle entry for the SSR status harness: the app's real server entry, the
// repo's own hosted-configuration fixture, and the server's status rules.
import ssrStatus from '../../../server/api-util/ssrStatus';

export { renderApp } from '../../../src/entry-server';
export { getHostedConfiguration } from '../../../src/util/testHelpers';
export { ssrStatus };
