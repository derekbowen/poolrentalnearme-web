const { marketplaceId } = require('./rabbitmq');

const SHARETRIBE_EVENT = `${marketplaceId}.sharetribe`;
const SHARETRIBE_HORIZON_EVENT = `${marketplaceId}.sharetribehorizon`;
const SHARETRIBE_HORIZON_CUSTOM_KEY_EVENT = `${marketplaceId}.custom`;

module.exports = {
  SHARETRIBE_EVENT,
  SHARETRIBE_HORIZON_EVENT,
  SHARETRIBE_HORIZON_CUSTOM_KEY_EVENT,
};
