const {
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
  MESSAGE_CREATED,
} = require('extensions/sms-messaging/config/events');

const SMSKeys = {
  [TRANSITION_CONFIRM_PAYMENT]: 'SMS.Content.ConfirmPayment',
  [TRANSITION_EXPIRE]: 'SMS.Content.Expire',
  [TRANSITION_DECLINE]: 'SMS.Content.Decline',
  [TRANSITION_ACCEPT]: 'SMS.Content.Accept',
  [TRANSITION_CANCEL]: 'SMS.Content.Cancel',
  [TRANSITION_COMPLETE]: 'SMS.Content.Complete',
  [TRANSITION_OPERATOR_COMPLETE]: 'SMS.Content.OperatorComplete',
  // Manual-capture request paths — notify provider of new booking request
  [TRANSITION_REQUEST]: 'SMS.Content.NewBookingRequest',
  [TRANSITION_REQUEST_AFTER_INQUIRY]: 'SMS.Content.NewBookingRequest',
  // Provider decisions on manual-capture requests — notify customer
  [TRANSITION_ACCEPT_WITH_PAYMENT]: 'SMS.Content.Accept',
  [TRANSITION_DECLINE_WITHOUT_PAYMENT]: 'SMS.Content.Decline',
  [TRANSITION_OPERATOR_ACCEPT_WITH_PAYMENT]: 'SMS.Content.Accept',
  [TRANSITION_OPERATOR_DECLINE_WITHOUT_PAYMENT]: 'SMS.Content.Decline',
  // Package deal offer — notify customer
  [TRANSITION_SEND_OFFER]: 'SMS.Content.NewOffer',
  [MESSAGE_CREATED]: 'SMS.Content.NewMessage',
};

module.exports = SMSKeys;
