// Twilio inbound signature verification. Unsigned / bad-signature = dropped + logged.
// Reuses the `twilio` module already present in the prod container.
// NOTE: validates against AUTH_TOKEN. On token rotation, follow the
// secondary -> verify-both-directions -> promote runbook (Design Doc R1).
'use strict';
let twilio; try { twilio = require('twilio'); } catch { twilio = null; }

function verify({ authToken, signature, url, params }) {
  if (!authToken || !signature || !url) return false;
  if (!twilio) return false; // no lib => cannot verify => drop (fail closed)
  try { return twilio.validateRequest(authToken, signature, url, params || {}); }
  catch { return false; }
}
module.exports = { verify, hasLib: () => !!twilio };
