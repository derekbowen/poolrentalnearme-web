const {
  SUPPORTED_EVENTS,
  TRANSACTION_TRANSITIONED,
  MESSAGE_CREATED,
} = require('extensions/sms-messaging/config/events');
const handleTransactionTransition = require('./transaction');
const handleMessageCreated = require('./message');

const EventMapper = {
  [TRANSACTION_TRANSITIONED]: ({ resource }) => handleTransactionTransition({ resource }),
  [MESSAGE_CREATED]: ({ resource, eventType }) => handleMessageCreated({ resource, eventType }),
};

const createTransactionEventHandler = async (eventResource) => {
  const { eventType, resource } = eventResource.attributes;
  if (!SUPPORTED_EVENTS.includes(eventType)) {
    return null;
  }

  const action = EventMapper[eventType];
  return action({ resource, eventType });
};

module.exports = createTransactionEventHandler;
