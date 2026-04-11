const config = require("../../../common/config/rabbitmq");
const { BINDING_CUSTOM_KEY_EVENT } = require("../../../common/types");

async function publishMessage({ routingKey, payload }) {
  if (!this.currentBroker) {
    throw new Error("Broker not initialized");
  }

  const { marketplaceId } = config;

  if (routingKey !== `${marketplaceId}.${BINDING_CUSTOM_KEY_EVENT}`) {
    throw new Error(`Unknown binding key: ${routingKey}`);
  }

  return new Promise((resolve, reject) => {
    this.currentBroker.publish(
      `${marketplaceId}_subscriber_p`,
      JSON.stringify(payload),
      routingKey,
      (err, publication) => {
        if (err) return reject(err);
        publication
          .on("success", (messageId) => {
            return resolve(messageId);
          })
          .on("error", (err) => {
            return reject(err);
          })
          .on("return", (message) => {
            console.warn(
              `Message was returned, it was published but not routed ${marketplaceId}: `,
              message
            );
          });
      }
    );
  });
}

module.exports = publishMessage;
