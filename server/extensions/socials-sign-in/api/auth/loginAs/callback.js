const { createError } = require('extensions/common/utils/response');
const config = require('../../../common/config');
const integrationSdk = require('../../../../../api-util/integration');
const { handleError } = require('../../../../../api-util/sdk');

const updatingCurrentLoginAsUser = ({ res, userId }) => {
  return res.cookie('st-super-login-as-impersonating', userId).redirect(`${config.rootUrl}/`);
};

const authenticateCallback = async (req, res) => {
  const { userId } = req.params;
  const loginAsUser = await integrationSdk.users.show({ id: userId }).catch(() => null);
  if (!loginAsUser) {
    return handleError(
      res,
      createError({
        status: 404,
        statusText: 'User not found',
        message: 'User not found',
        data: {
          errors: `User with id ${userId} not found.`,
        },
      })
    );
  }
  const {
    attributes: { emailVerified },
  } = loginAsUser;
  if (!emailVerified) {
    return handleError(
      res,
      createError({
        status: 400,
        statusText: 'Email must be verified',
        message: 'Email must be verified',
        data: {
          errors: `Email must be verified`,
        },
      })
    );
  }
  return updatingCurrentLoginAsUser({ res, userId });
};

module.exports = authenticateCallback;
