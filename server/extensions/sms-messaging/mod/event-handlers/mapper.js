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
  [MESSAGE_CREATED]: [createMessageHandler(MESSAGE_CREATED)],
};

module.exports = SMSMapper;
