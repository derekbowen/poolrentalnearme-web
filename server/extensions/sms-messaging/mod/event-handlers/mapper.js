const send = require('extensions/common/mod/sms/send');
const {
  MESSAGE_CREATED,
  TRANSITION_OPERATOR_COMPLETE,
  TRANSITION_COMPLETE,
  TRANSITION_CANCEL,
  TRANSITION_ACCEPT,
  TRANSITION_DECLINE,
  TRANSITION_EXPIRE,
  TRANSITION_CONFIRM_PAYMENT,
  TRANSITION_REQUEST,
  TRANSITION_REQUEST_AFTER_INQUIRY,
  TRANSITION_ACCEPT_WITH_PAYMENT,
  TRANSITION_DECLINE_WITHOUT_PAYMENT,
  TRANSITION_OPERATOR_ACCEPT_WITH_PAYMENT,
  TRANSITION_OPERATOR_DECLINE_WITHOUT_PAYMENT,
  TRANSITION_SEND_OFFER,
} = require('extensions/sms-messaging/config/events');
const { getSMSContent } = require('extensions/sms-messaging/utils/sms');

const createMessageHandler =
  (type) =>
  ({ marketplaceContent, phoneNumber }) => {
    const content = getSMSContent({
      marketplaceContent,
      type,
    });
    send({
      body: content,
      phoneNumber,
    });
  };

const SMSMapper = {
  [TRANSITION_CONFIRM_PAYMENT]: [createMessageHandler(TRANSITION_CONFIRM_PAYMENT)],
  [TRANSITION_EXPIRE]: [createMessageHandler(TRANSITION_EXPIRE)],
  [TRANSITION_DECLINE]: [createMessageHandler(TRANSITION_DECLINE)],
  [TRANSITION_ACCEPT]: [createMessageHandler(TRANSITION_ACCEPT)],
  [TRANSITION_CANCEL]: [createMessageHandler(TRANSITION_CANCEL)],
  [TRANSITION_COMPLETE]: [createMessageHandler(TRANSITION_COMPLETE)],
  [TRANSITION_OPERATOR_COMPLETE]: [createMessageHandler(TRANSITION_OPERATOR_COMPLETE)],
  // Manual-capture booking request paths
  [TRANSITION_REQUEST]: [createMessageHandler(TRANSITION_REQUEST)],
  [TRANSITION_REQUEST_AFTER_INQUIRY]: [createMessageHandler(TRANSITION_REQUEST_AFTER_INQUIRY)],
  [TRANSITION_ACCEPT_WITH_PAYMENT]: [createMessageHandler(TRANSITION_ACCEPT_WITH_PAYMENT)],
  [TRANSITION_DECLINE_WITHOUT_PAYMENT]: [createMessageHandler(TRANSITION_DECLINE_WITHOUT_PAYMENT)],
  [TRANSITION_OPERATOR_ACCEPT_WITH_PAYMENT]: [createMessageHandler(TRANSITION_OPERATOR_ACCEPT_WITH_PAYMENT)],
  [TRANSITION_OPERATOR_DECLINE_WITHOUT_PAYMENT]: [createMessageHandler(TRANSITION_OPERATOR_DECLINE_WITHOUT_PAYMENT)],
  // Package deal offer
  [TRANSITION_SEND_OFFER]: [createMessageHandler(TRANSITION_SEND_OFFER)],
  [MESSAGE_CREATED]: [createMessageHandler(MESSAGE_CREATED)],
};

module.exports = SMSMapper;
