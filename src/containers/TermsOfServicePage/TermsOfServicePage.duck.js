export const ASSET_NAME = 'terms-of-service';

// The /terms-of-service route now renders the in-repo v2026.1 Terms of Service
// (see TermsOfServicePage.js), not the Sharetribe Console hosted asset. We
// therefore no longer fetch that asset for this route — this guarantees stale
// Console content can never appear in the page's rendered output OR its
// preloaded state. ASSET_NAME is still exported because the signup/login Terms
// modal (AuthenticationPage) references it through its own loader.
export const loadData = () => () => Promise.resolve();
