const integrationSdk = require('api-util/integration');
const { asyncRequestHandler } = require('extensions/common/utils/request');

const OPERATOR_ACCEPT = 'transition/operator-accept';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = asyncRequestHandler(async (req) => {
  const { txId } = req.body;

  // Validate input: txId must be a well-formed UUID.
  if (typeof txId !== 'string' || !UUID_RE.test(txId)) {
    return { status: 400, message: 'A valid txId is required.', data: { success: false } };
  }

  // The route is gated by authenticatedUser(), so req.currentUser is set.
  const currentUserId = req.currentUser?.id?.uuid;
  if (!currentUserId) {
    return { status: 401, message: 'Authentication required.', data: { success: false } };
  }

  const tx = await integrationSdk.transactions.show({
    id: txId,
    include: ['listing', 'customer', 'provider'],
  });

  // AUTHORIZATION: only a party to this transaction (its customer or provider)
  // may trigger the operator-accept transition. Without this check, any
  // logged-in user could force-accept anyone's instant booking by enumerating
  // transaction ids — bypassing review and triggering payment capture/payout.
  const customerId = tx?.customer?.id?.uuid;
  const providerId = tx?.provider?.id?.uuid;
  const isParty = currentUserId === customerId || currentUserId === providerId;
  if (!isParty) {
    return {
      status: 403,
      message: 'You are not authorized to accept this transaction.',
      data: { success: false },
    };
  }

  const isInstantBooking = tx?.listing?.attributes?.publicData?.isInstantBooking;
  if (!isInstantBooking) {
    return {
      status: 200,
      message: 'This transaction is not an instant booking transaction.',
      data: { success: true },
    };
  }

  await integrationSdk.transactions.transition({
    id: txId,
    transition: OPERATOR_ACCEPT,
    params: {},
  });

  return {
    status: 200,
    message: 'Transaction accepted successfully.',
    data: { success: true },
  };
});
