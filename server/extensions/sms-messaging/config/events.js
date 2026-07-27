const TRANSACTION_TRANSITIONED = 'transaction/transitioned';
const MESSAGE_CREATED = 'message/created';

const SUPPORTED_EVENTS = [TRANSACTION_TRANSITIONED, MESSAGE_CREATED];

const BOOKING_NEW_REQUEST = 'booking-new-request';

const TRANSITION_CONFIRM_PAYMENT = 'transition/confirm-payment';
const TRANSITION_EXPIRE = 'transition/expire';
const TRANSITION_DECLINE = 'transition/decline';
const TRANSITION_ACCEPT = 'transition/accept';
const TRANSITION_CANCEL = 'transition/cancel';
const TRANSITION_COMPLETE = 'transition/complete';
const TRANSITION_OPERATOR_COMPLETE = 'transition/operator-complete';

// Manual-capture booking request paths (provider must accept-with-payment)
const TRANSITION_REQUEST = 'transition/request';
const TRANSITION_REQUEST_AFTER_INQUIRY = 'transition/request-after-inquiry';
const TRANSITION_ACCEPT_WITH_PAYMENT = 'transition/accept-with-payment';
const TRANSITION_DECLINE_WITHOUT_PAYMENT = 'transition/decline-without-payment';
const TRANSITION_OPERATOR_ACCEPT_WITH_PAYMENT = 'transition/operator-accept-with-payment';
const TRANSITION_OPERATOR_DECLINE_WITHOUT_PAYMENT = 'transition/operator-decline-without-payment';

// Host package deal / custom price offer
const TRANSITION_SEND_OFFER = 'transition/send-offer';

const USER_ROLE_PROVIDER = 'provider';
const USER_ROLE_CUSTOMER = 'customer';

module.exports = {
  TRANSACTION_TRANSITIONED,
  MESSAGE_CREATED,
  SUPPORTED_EVENTS,
  BOOKING_NEW_REQUEST,
  TRANSITION_CONFIRM_PAYMENT,
  TRANSITION_EXPIRE,
  TRANSITION_DECLINE,
  TRANSITION_ACCEPT,
  TRANSITION_CANCEL,
  TRANSITION_COMPLETE,
  TRANSITION_OPERATOR_COMPLETE,
  TRANSITION_REQUEST,
  TRANSITION_REQUEST_AFTER_INQUIRY,
  TRANSITION_ACCEPT_WITH_PAYMENT,
  TRANSITION_DECLINE_WITHOUT_PAYMENT,
  TRANSITION_OPERATOR_ACCEPT_WITH_PAYMENT,
  TRANSITION_OPERATOR_DECLINE_WITHOUT_PAYMENT,
  TRANSITION_SEND_OFFER,
  USER_ROLE_PROVIDER,
  USER_ROLE_CUSTOMER,
};
