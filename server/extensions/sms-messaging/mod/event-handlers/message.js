const integrationSdk = require('api-util/integration');
const {
  USER_ROLE_CUSTOMER,
  USER_ROLE_PROVIDER,
} = require('extensions/sms-messaging/config/events');
const { getPhoneNumber, getMarketplaceContent } = require('extensions/sms-messaging/utils/sms');
const sdk = require('../sdk');
const SMSMapper = require('./mapper');

const handleMessageCreated = async ({ resource, eventType }) => {
  const {
    relationships: {
      sender: {
        data: {
          id: { uuid: senderId },
        },
      },
      transaction: {
        data: {
          id: { uuid: txId },
        },
      },
    },
  } = resource;

  const transaction = await integrationSdk.transactions.show({
    id: txId,
    include: ['customer', 'provider'],
  });
  const {
    provider: {
      id: { uuid: providerId },
    },
  } = transaction;

  const marketplaceContent = await getMarketplaceContent(sdk);
  const actions = SMSMapper[eventType];

  const receiverType = senderId === providerId ? USER_ROLE_CUSTOMER : USER_ROLE_PROVIDER;
  const user = transaction[receiverType];
  const phoneNumber = getPhoneNumber({ user });

  await Promise.allSettled(actions.map((action) => action({ marketplaceContent, phoneNumber })));
};

module.exports = handleMessageCreated;
