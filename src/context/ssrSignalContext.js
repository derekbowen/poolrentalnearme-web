import React, { createContext, useContext } from 'react';

/**
 * Per-request server-render signal.
 *
 * c194 taught the renderer to send a real 404 when the router itself misses.
 * That left a second class of soft-404: routes that DO match but whose data
 * turns out not to exist — a listing id that no longer resolves, a CMS page
 * id with no hosted asset, a capitalised path that React Router matched
 * case-insensitively. Those render <NotFoundPage> inside a matched route, so
 * the router is happy and the response went out as HTTP 200 with a
 * "Page not found" title. Google indexes that shape as a soft 404.
 *
 * NotFoundPage used to set `staticContext.notfound` for the React Router v5
 * StaticRouter; v6's data router never provides that prop, so the flag was
 * dead code. This context is its replacement: entry-server creates one plain
 * object per request, hands it to the app through this provider AND to the
 * renderer through res.locals, and NotFoundPage flips `notFound` on it while
 * rendering. The object is created per request, so concurrent renders never
 * share it.
 *
 * On the client the provider is absent and the hook returns null.
 */
const SsrSignalContext = createContext(null);

export const SsrSignalProvider = SsrSignalContext.Provider;

export const useSsrSignal = () => useContext(SsrSignalContext);

export const createSsrSignal = () => ({ notFound: false });

export default SsrSignalContext;
