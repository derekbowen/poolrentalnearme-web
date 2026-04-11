const Ajv = require('ajv');
const avjClient = new Ajv();
const path = require('path');
const { BINDING_QUEUE_TYPE, BINDING_CUSTOM_KEY_EVENT } = require('../types');

const schema = {
  type: 'object',
  properties: {
    marketplaceSubscriberUsername: { type: 'string' },
    marketplaceSubscriberPassword: { type: 'string' },
    marketplaceId: { type: 'string' },
    marketplaceSubscriberHost: { type: 'string' },
    // This one is to limit concurrent messages being processed
    // After testing, 3 is currently the optimal value
    messagePrefetch: { type: 'number' },
  },
  required: [
    'marketplaceSubscriberUsername',
    'marketplaceSubscriberPassword',
    'marketplaceId',
    'marketplaceSubscriberHost',
  ],
  additionalProperties: false,
};

const marketplaceId = process.env.MARKETPLACE_ID;
const marketplaceSubscriberUsername = process.env.RABBITMQ_MARKETPLACE_SUBSCRIBER_USERNAME;
const marketplaceSubscriberPassword = process.env.RABBITMQ_MARKETPLACE_SUBSCRIBER_PASSWORD;
const marketplaceSubscriberHost = process.env.RABBITMQ_MARKETPLACE_SUBSCRIBER_HOST;
const marketplaceSubscriberPort = parseInt(
  process.env.RABBITMQ_MARKETPLACE_SUBSCRIBER_PORT || 5671,
  10
);
const messagePrefetch = parseInt(process.env.RABBITMQ_MESSAGE_PREFETCH || 3, 10);

const envValidation = avjClient.validate(schema, {
  marketplaceId,
  marketplaceSubscriberUsername,
  marketplaceSubscriberPassword,
  marketplaceSubscriberHost,
  messagePrefetch,
});

if (!envValidation) {
  throw new Error(avjClient.errors);
}

const rascalDefaultSchemaFolder = path.join(
  process.cwd(),
  '/node_modules/rascal/lib/config/schema.json'
);

const marketplaceVhost = process.env.RABBITMQ_MARKETPLACE_SUBSCRIBER_VHOST || '/';
const namespace = 'marketplace';
const deferTime = 10000;

const config = {
  marketplaceId,
  marketplaceSubscriberUsername,
  marketplaceSubscriberPassword,
  namespace,
  marketplaceVhost,
  deferTime,
  defaultDefinition: {
    $schema: rascalDefaultSchemaFolder,
    vhosts: {
      [`${marketplaceVhost}`]: {
        connection: {
          protocol: 'amqps',
          hostname: marketplaceSubscriberHost,
          user: marketplaceSubscriberUsername,
          password: marketplaceSubscriberPassword,
          port: marketplaceSubscriberPort,
        },
        namespace,
        exchanges: {
          [`${marketplaceId}_e`]: {
            assert: false,
            check: false,
          },
          [`${marketplaceId}_custom_marketplace_e`]: {
            assert: false,
            check: false,
          },
        },
        queues: {
          [`${marketplaceId}_q`]: {
            assert: false,
            check: false,
          },
          [`${marketplaceId}_custom_marketplace_q`]: {
            assert: false,
            check: false,
          },
        },
        bindings: {
          [`${marketplaceId}_custom_marketplace_b`]: {
            source: `${marketplaceId}_custom_marketplace_e`,
            destination: `${marketplaceId}_custom_marketplace_q`,
            destinationType: BINDING_QUEUE_TYPE,
            bindingKeys: [`${marketplaceId}.${BINDING_CUSTOM_KEY_EVENT}`],
          },
        },
        publications: {
          [`${marketplaceId}_subscriber_p`]: {
            exchange: `${marketplaceId}_custom_marketplace_e`,
            vhost: marketplaceVhost,
            confirm: true,
          },
        },
        subscriptions: {
          [`${marketplaceId}_subscriber_s`]: {
            queue: `${marketplaceId}_q`,
            vhost: marketplaceVhost,
            prefetch: messagePrefetch,
          },
        },
      },
    },
  },
};

module.exports = config;
