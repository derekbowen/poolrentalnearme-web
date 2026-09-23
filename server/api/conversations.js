// Conversation read state for the signed-in user. See api-util/conversationSeen.js.
//
// GET  /api/conversations/unread  -> { unread: [{ transactionId, role, otherName, listingTitle, latestInboundAt }] }
// POST /api/conversations/seen    { transactionId, through? } -> { seenAt }
//
// Both run with the caller's own session (getSdk): Sharetribe only returns a
// transaction's messages to its participants, which is the access check.
const { types } = require('sharetribe-flex-sdk');
const { getSdk, handleError } = require('../api-util/sdk');
const { makeHandlers } = require('../api-util/conversationSeen');

module.exports = makeHandlers({ getSdk, handleError, toUUID: id => new types.UUID(id) });
