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
const aiGenerateListing = require('./api/ai-generate-listing');
const sendOffer = require('./api/send-offer');
const acceptOffer = require('./api/accept-offer');
const createDeal = require('./api/create-deal');
const acceptDeal = require('./api/accept-deal');
const dealGet = require('./api/deal-get');
const syncIcal = require('./api/sync-ical');
const additionalChargeRequest = require('./api/additional-charge-request');
const additionalChargeInitiate = require('./api/additional-charge-initiate');
const additionalChargeConfirm = require('./api/additional-charge-confirm');
const payouts = require('./api/payouts');
const notifySignup = require('./api/notify-signup');
const wizardLog = require('./api/wizard-log');
const listingBookedDates = require('./api/listing-booked-dates');
const icalFeed = require('./api/ical-feed');
const icalLink = require('./api/ical-link');
const icalRegenerate = require('./api/ical-regenerate');
const calendarApplyExceptions = require('./api/calendar-apply-exceptions');
const wizardTelemetry = require('./api/wizard-telemetry');
const createVerificationSession = require('./api/create-verification-session');
const checkVerificationStatus = require('./api/check-verification-status');

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

// Host package deal: send custom-price offer (JSON body, provider session auth)
router.post('/send-offer', bodyParser.json({ limit: '16kb' }), sendOffer);

// Customer accepts a package deal offer (Transit body, privileged — sets line items)
router.post('/accept-offer', acceptOffer);

// Host "package deal" LINK flow (thread-independent). Host creates a link
// (provider session), guest opens it and accepts — priced server-side from the
// stored deal, never the client.
router.post('/create-deal', bodyParser.json({ limit: '8kb' }), authenticatedUser(), createDeal);
router.get('/deal/:token', dealGet);
router.post('/accept-deal', acceptDeal);

// Swimply iCal two-way sync: fetch Swimply .ics feed and block times in Sharetribe
router.post('/sync-ical', bodyParser.json({ limit: '4kb' }), syncIcal);
router.post('/additional-charge/request', bodyParser.json({ limit: '4kb' }), additionalChargeRequest);
router.post('/additional-charge/initiate', bodyParser.json({ limit: '4kb' }), additionalChargeInitiate);
router.post('/additional-charge/confirm', bodyParser.json({ limit: '4kb' }), additionalChargeConfirm);
router.get('/payouts/summary', payouts.summary);
router.get('/payouts/list', payouts.list);
router.get('/payouts/activity', payouts.activity);
router.post('/notify-signup', bodyParser.json({ limit: '2kb' }), notifySignup);
// Listing-wizard client-error beacon (uploads go browser->Sharetribe, so
// failures are invisible server-side without this). grep WIZARD_LOG.
router.post('/wizard-log', bodyParser.json({ limit: '4kb' }), wizardLog);

// Host calendar: booked-date markers + per-day closed/hours enforcement.
router.post('/listing-booked-dates', bodyParser.json({ limit: '2kb' }), listingBookedDates);

// iCal calendar feeds (Jeremy): public token-authorized read-only feed + owner-gated link/rotate.
// Rate limiting is handled inside ical-feed.js (self-contained, no extra dep).
router.get('/ical/:listingId/:token.ics', icalFeed);
router.post('/ical/link', bodyParser.json({ limit: '1kb' }), icalLink);
router.post('/ical/regenerate', bodyParser.json({ limit: '1kb' }), icalRegenerate);
router.post('/calendar-apply-exceptions', bodyParser.json({ limit: '2kb' }), calendarApplyExceptions);
router.post('/wizard-telemetry', bodyParser.json({ limit: '2kb' }), wizardTelemetry);

// Stripe Identity verification: create a session and check its result
router.post('/create-verification-session', bodyParser.json({ limit: '1kb' }), createVerificationSession);
router.post('/check-verification-status', bodyParser.json({ limit: '1kb' }), checkVerificationStatus);

// AI "list a pool in 30 seconds": host uploads photos → Claude vision returns a
// pre-filled listing. JSON body (not Transit); auth-gated so it can't burn AI credits.
router.post('/ai-generate-listing', bodyParser.json({ limit: '256kb' }), authenticatedUser(), aiGenerateListing);

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

// Twilio inbound SMS webhook: STOP/START/HELP → opt-out mirror (reply-to-accept later).
const { inboundRoute } = require('extensions/sms-messaging/mod/notify/inbound');
router.post('/sms/inbound', ...inboundRoute);
// SMS Concierge: admin command layer + transparent pass-through of all other
// inbound (customers/STOP/START/booking replies) to /api/sms/inbound.
const { conciergeInbound } = require('./concierge/route');
router.post('/concierge/inbound', bodyParser.urlencoded({ extended: false }), conciergeInbound);

// Manual-address fallback: server-side geocoding so a Maps script failure can
// never block signup or listing creation (auth-gated; listing flow requires login).
const geocodeAddress = require('./api/geocode');
const geocodeSuggest = require('./api/geocodeSuggest');
router.post('/geocode', bodyParser.json({ limit: '2kb' }), authenticatedUser(), geocodeAddress);
router.get('/geocode-suggest', geocodeSuggest);

// c152: host promo codes (owner-gated CRUD; pricing engine applies them)
const promoCodes = require('./api/promo-codes');
router.post('/promo-codes/save', bodyParser.json({ limit: '4kb' }), authenticatedUser(), promoCodes.save);
router.post('/promo-codes/deactivate', bodyParser.json({ limit: '2kb' }), authenticatedUser(), promoCodes.deactivate);
router.get('/promo-codes', authenticatedUser(), promoCodes.list);

// c153: owner-gated share-link click stats
const shareLinkStats = require('./api/share-link-stats');
router.get('/share-link-stats', authenticatedUser(), shareLinkStats);

const resumeListing = require('./api/resume-listing');
router.get('/resume-listing', resumeListing);

module.exports = router;
