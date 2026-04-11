/**
 * This file contains server side endpoints that can be used to perform backend
 * tasks that can not be handled in the browser.
 *
 * The endpoints should not clash with the application routes. Therefore, the
 * endpoints are prefixed in the main server where this file is used.
 */

const express = require('express');
const bodyParser = require('body-parser');
const marketplaceSdkMiddleware = require('extensions/common/middlewares/marketplaceSdkInstance');
const authenticatedUser = require('extensions/common/middlewares/authenticatedUser');
const { deserialize } = require('./api-util/sdk');

const initiateLoginAs = require('./api/initiate-login-as');
const loginAs = require('./api/login-as');
const transactionLineItems = require('./api/transaction-line-items');
const initiatePrivileged = require('./api/initiate-privileged');
const transitionPrivileged = require('./api/transition-privileged');
const acceptTxViaOperator = require('./api/accept-tx-via-operator');

const generateListing = require('./api/generate-listing');
const evaluateHostApplication = require('./api/evaluate-host-application');
const leadCapture = require('./api/lead-capture');

const boostPurchase = require('./api/boost/purchase');
const boostBeacon = require('./api/boost/beacon');
const boostAttribute = require('./api/boost/attribute');

const calendarIcalExport = require('./api/calendar/ical-export');
const calendarIcalImport = require('./api/calendar/ical-import');
const calendarDemandForecast = require('./api/calendar/demand-forecast');

const weatherPoolForecast = require('./api/weather/pool-forecast');

const createUserWithIdp = require('./api/auth/createUserWithIdp');

const { authenticateFacebook, authenticateFacebookCallback } = require('./api/auth/facebook');
const { authenticateGoogle, authenticateGoogleCallback } = require('./api/auth/google');

const router = express.Router();

// ================ API router middleware: ================ //

// Parse Transit body first to a string
router.use(
  bodyParser.text({
    type: 'application/transit+json',
  })
);

// Deserialize Transit body string to JS data
router.use((req, res, next) => {
  if (req.get('Content-Type') === 'application/transit+json' && typeof req.body === 'string') {
    try {
      req.body = deserialize(req.body);
    } catch (e) {
      console.error('Failed to parse request body as Transit:');
      console.error(e);
      res.status(400).send('Invalid Transit in request body.');
      return;
    }
  }
  next();
});

// ================ API router endpoints: ================ //

router.get('/initiate-login-as', initiateLoginAs);
router.get('/login-as', loginAs);
router.post('/transaction-line-items', transactionLineItems);
router.post('/initiate-privileged', initiatePrivileged);
router.post('/transition-privileged', transitionPrivileged);
router.post('/accept-tx-via-operator', authenticatedUser(), acceptTxViaOperator);

// AI listing generation
router.post('/generate-listing', authenticatedUser(), generateListing);

// AI host application evaluator — always approves, returns a tiered polish plan.
// The door never closes: every applicant is welcomed onto the platform, then
// handed concrete fixes that unlock the next tier.
router.post('/evaluate-host-application', authenticatedUser(), evaluateHostApplication);

// Lead capture (email + geo context). Uses a dedicated JSON body parser
// since the router's default body parser is `application/transit+json`.
router.post('/lead-capture', bodyParser.json({ limit: '32kb' }), leadCapture);

// ─── Promotion (marketplace ads, eBay-style pay-per-booking) ──────────────
// Host toggles promotion ON/OFF. No money changes hands at activation —
// the host only pays 25% of the booking subtotal when a guest books
// after clicking the promoted listing from a Sponsored slot.
//
// `/boost/purchase` is the legacy route name kept for client compatibility
// during the transition. `/boost/promote` is the new preferred alias and
// points at the same handler.
router.post('/boost/purchase', authenticatedUser(), bodyParser.json({ limit: '8kb' }), boostPurchase);
router.post('/boost/promote', authenticatedUser(), bodyParser.json({ limit: '8kb' }), boostPurchase);

// Post-booking attribution — charges 25% of subtotal when a guest books
// after clicking a promoted slot within the 14-day attribution window.
// Called from a Sharetribe transaction transition webhook OR manually
// for backfill. Authenticated — not publicly exposed.
router.post('/boost/attribute', authenticatedUser(), bodyParser.json({ limit: '8kb' }), boostAttribute);

// Impression / click beacon — PUBLIC (no auth) because logged-out visitors
// generate impressions too. Abuse protection via in-memory debounce.
router.post('/boost/beacon', bodyParser.json({ limit: '4kb' }), boostBeacon);

// ─── Calendar ─────────────────────────────────────────────────────────────
// iCal export — public, no auth (listing ID is the "secret" for the feed URL)
router.get('/calendar/ical/:listingId', calendarIcalExport);
// iCal import from external URL (Google, Airbnb, VRBO) — authenticated
router.post('/calendar/ical-import', authenticatedUser(), bodyParser.json({ limit: '8kb' }), calendarIcalImport);
// AI demand forecast — authenticated
router.get('/calendar/demand/:listingId', authenticatedUser(), calendarDemandForecast);

// ─── Weather + AI water temp ────────────────────────────────
// Public endpoint — guests on listing pages hit this to see live water
// temperature. Underlying services are cached (1h forecast, 6h water temp)
// and debounced per IP+listing to protect against abuse.
router.get('/weather/pool-forecast', weatherPoolForecast);

// Create user with identity provider (e.g. Facebook or Google)
// This endpoint is called to create a new user after user has confirmed
// they want to continue with the data fetched from IdP (e.g. name and email)
router.post('/auth/create-user-with-idp', createUserWithIdp);

// Facebook authentication endpoints

// This endpoint is called when user wants to initiate authenticaiton with Facebook
router.get('/auth/facebook', authenticateFacebook);

// This is the route for callback URL the user is redirected after authenticating
// with Facebook. In this route a Passport.js custom callback is used for calling
// loginWithIdp endpoint in Sharetribe Auth API to authenticate user to the marketplace
router.get('/auth/facebook/callback', authenticateFacebookCallback);

// Google authentication endpoints

// This endpoint is called when user wants to initiate authenticaiton with Google
router.get('/auth/google', authenticateGoogle);

// This is the route for callback URL the user is redirected after authenticating
// with Google. In this route a Passport.js custom callback is used for calling
// loginWithIdp endpoint in Sharetribe Auth API to authenticate user to the marketplace
router.get('/auth/google/callback', authenticateGoogleCallback);

require('./loadExtensionsRouter')(router);

module.exports = router;
