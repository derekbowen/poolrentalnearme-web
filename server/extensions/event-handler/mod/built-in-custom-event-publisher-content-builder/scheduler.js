const config = require("../../common/config/rabbitmq");
const {
  CUSTOM_ACTION_TYPE_SCHEDULE_EVENT,
  BINDING_CUSTOM_KEY_EVENT,
  CUSTOM_ACTION_TYPE_BATCH_SCHEDULE_EVENTS,
} = require("../../common/types");

const createScheduledEventPayload = ({
  scheduledTime,
  eventTypeToSchedule,
  metadata,
  marketplaceId,
}) => {
  if (typeof eventTypeToSchedule !== "string") {
    throw new Error("eventTypeToSchedule must be a string");
  }

  if (typeof scheduledTime !== "number") {
    throw new Error(
      "scheduledTime must be a number in milliseconds since epoch"
    );
  }

  const data = {
    eventTypeToSchedule,
    scheduledTime,
    marketplaceId,
  };

  if (metadata) {
    data.metadata = metadata;
  }

  return data;
};

/**
 * Create a single scheduled event message
 * @param {Object} event
 * @param {number} event.scheduledTime - in milliseconds since epoch, the time to trigger the event handler on our side
 * @param {string} event.eventTypeToSchedule - the event type to handle on our side
 * @param {*} [event.metadata] - optional external data to pass to the event handler
 * @returns {Object} message
 * @returns {string} message.routingKey - the routing key for the message
 * @returns {Object} message.payload - the payload for the message
 * @returns {string} message.payload.handlerType - the type of handler to use
 * @returns {Object} message.payload.payload - the payload for the handler
 * @example
 * createScheduledEventMessage({
 *  scheduledTime: 1620000000000,
 *  eventTypeToSchedule: 'create-payout',
 *  metadata: { transactionId: '123' }
 * });
 */
const createScheduledEventMessage = ({
  scheduledTime,
  eventTypeToSchedule,
  metadata,
}) => {
  const { marketplaceId } = config;
  const data = createScheduledEventPayload({
    scheduledTime,
    eventTypeToSchedule,
    metadata,
    marketplaceId,
  });

  return {
    routingKey: `${marketplaceId}.${BINDING_CUSTOM_KEY_EVENT}`,
    payload: {
      handlerType: CUSTOM_ACTION_TYPE_SCHEDULE_EVENT,
      payload: data,
    },
  };
};

exports.createScheduledEventMessage = createScheduledEventMessage;

/**
 * Create multiple scheduled event messages in batch
 * @param {Object[]} events
 * @param {number} events[].scheduledTime - in milliseconds since epoch, the time to trigger the event handler on our side
 * @param {string} events[].eventTypeToSchedule - the event type to handle on our side
 * @param {*} [events[].metadata] - optional external data to pass to the event handler
 * @returns {Object} message
 * @returns {string} message.routingKey - the routing key for the message
 * @returns {Object} message.payload - the payload for the message
 * @returns {string} message.payload.handlerType - the type of handler to use
 * @returns {Object} message.payload.payload - the payload for the handler
 * @example
 * createBatchScheduledEventMessages([{
 *  scheduledTime: 1620000000000,
 *  eventTypeToSchedule: 'create-payout',
 *  metadata: { transactionId: '123' }
 * }, {
 *  scheduledTime: 1620000000001,
 *  eventTypeToSchedule: 'create-payout',
 * }]);
 */
const createBatchScheduledEventMessages = (events) => {
  const { marketplaceId } = config;
  const payload = events.map((e) =>
    createScheduledEventPayload({ ...e, marketplaceId })
  );

  return {
    routingKey: `${marketplaceId}.${BINDING_CUSTOM_KEY_EVENT}`,
    payload: {
      handlerType: CUSTOM_ACTION_TYPE_BATCH_SCHEDULE_EVENTS,
      payload,
    },
  };
};

exports.createBatchScheduledEventMessages = createBatchScheduledEventMessages;
