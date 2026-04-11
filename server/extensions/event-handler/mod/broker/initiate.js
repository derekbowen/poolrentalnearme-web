/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
const cloneDeep = require('lodash/cloneDeep');
const { BrokerAsPromised: Broker } = require('rascal');
const config = require('../../common/config/rabbitmq');

async function initiateBroker() {
  if (this.currentBroker) {
    return this.currentBroker;
  }
  const { marketplaceId, defaultDefinition, deferTime } = config;
  const currentConfig = cloneDeep(defaultDefinition);
  this.currentBroker = await Broker.create(currentConfig);
  this.subscription = await this.currentBroker.subscribe(`${marketplaceId}_subscriber_s`);
  this.subscription.on('message', async (message, content, ackOrNack) => {
    const payload = JSON.parse(content);
    const type = message.fields.routingKey;
    const handlers = this.EventHandlerMap[type];
    if (!handlers) {
      ackOrNack(
        {
          message: `Unknown event type: ${type}`,
        },
        { strategy: 'nack', defer: deferTime }
      );
      return;
    }
    if (handlers.length === 0) {
      ackOrNack(
        {
          message: `No handler for event type: ${type}`,
        },
        { strategy: 'nack', defer: deferTime }
      );
      return;
    }
    try {
      for (const handler of handlers) {
        await handler.fnc(payload);
      }
      ackOrNack();
    } catch (e) {
      console.info('Error while processing message', type, content);
      console.error(e);
      ackOrNack(e, {
        strategy: 'nack',
        defer: deferTime,
      });
    }
  });
  return this.currentBroker;
}

module.exports = initiateBroker;
