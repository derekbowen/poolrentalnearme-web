const { fetchMarketplaceContent } = require('api-util/sdk');
const {
  TRANSITION_CONFIRM_PAYMENT,
  TRANSITION_EXPIRE,
  TRANSITION_DECLINE,
  TRANSITION_ACCEPT,
  TRANSITION_CANCEL,
  TRANSITION_COMPLETE,
  TRANSITION_OPERATOR_COMPLETE,
  MESSAGE_CREATED,
  USER_ROLE_PROVIDER,
  USER_ROLE_CUSTOMER,
} = require('../config/events');
const SMSKeys = require('../config/sms');

const getSMSContent = ({ marketplaceContent, type }) => {
  return marketplaceContent[SMSKeys[type]];
};

const getSMSReceiver = ({ type }) => {
  switch (type) {
    case TRANSITION_EXPIRE:
    case TRANSITION_DECLINE:
    case TRANSITION_ACCEPT:
      return [USER_ROLE_CUSTOMER];
    case TRANSITION_CONFIRM_PAYMENT:
    case TRANSITION_COMPLETE:
    case TRANSITION_OPERATOR_COMPLETE:
      return [USER_ROLE_PROVIDER];
    case TRANSITION_CANCEL:
    case MESSAGE_CREATED:
      return [USER_ROLE_PROVIDER, USER_ROLE_CUSTOMER];
    default:
      return null;
  }
};

const getPhoneNumber = ({ user }) => user?.attributes?.profile?.protectedData?.phoneNumber;

const getMarketplaceContent = async (sdk) => {
  const marketplaceData = await fetchMarketplaceContent(sdk);
  return marketplaceData?.attributes?.data || {};
};

module.exports = {
  getSMSContent,
  getSMSReceiver,
  getPhoneNumber,
  getMarketplaceContent,
};
