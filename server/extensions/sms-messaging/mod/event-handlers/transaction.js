const integrationSdk = require('api-util/integration');
const {
  getSMSReceiver,
  getPhoneNumber,
  getMarketplaceContent,
} = require('extensions/sms-messaging/utils/sms');
const sdk = require('../sdk');
const SMSMapper = require('./mapper');

const handleTransactionTransition = async ({ resource }) => {
  const {
    attributes: { lastTransition },
    id: { uuid: txId },
  } = resource;

  const transaction = await integrationSdk.transactions.show({
    id: txId,
    include: ['customer', 'provider'],
  });

  const marketplaceContent = await getMarketplaceContent(sdk);

  const actions = SMSMapper[lastTransition];
  const receivers = getSMSReceiver({ type: lastTransition });

  const jobs = receivers.reduce((prev, receiver) => {
    const user = transaction[receiver];
    const phoneNumber = getPhoneNumber({ user });

    return prev.concat(
      actions.map((action) =>
        action({
          marketplaceContent,
          phoneNumber,
        })
      )
    );
  }, []);

  await Promise.allSettled(jobs);
};

module.exports = handleTransactionTransition;
