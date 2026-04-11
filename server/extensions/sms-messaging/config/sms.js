const {
  TRANSITION_CONFIRM_PAYMENT,
  TRANSITION_EXPIRE,
  TRANSITION_DECLINE,
  TRANSITION_ACCEPT,
  TRANSITION_CANCEL,
  TRANSITION_COMPLETE,
  TRANSITION_OPERATOR_COMPLETE,
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
  [MESSAGE_CREATED]: 'SMS.Content.NewMessage',
};

module.exports = SMSKeys;
