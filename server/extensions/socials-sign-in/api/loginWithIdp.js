const { handleError } = require('../../../api-util/sdk');
const { handleResponse } = require('../../common/utils/response');
const { getSdk } = require('../../../api-util/sdk');
const config = require('../common/config');

exports.bodyParamsSchema = {
  type: 'object',
  properties: {
    idpId: {
      type: 'string',
    },
    idpClientId: {
      type: 'string',
    },
    idpToken: {
      type: 'string',
    },
  },
  required: ['idpId', 'idpClientId', 'idpToken'],
};

const loginWithIdp = async (req, res) => {
  try {
    const { idpId, idpClientId, idpToken } = req.body;

    const sdk = getSdk(req, res, {
      clientSecret: config.clientSecret,
    });
    await sdk.marketplace.show();

    const response = await sdk.loginWithIdp({
      idpId,
      idpClientId,
      idpToken,
    });

    handleResponse({
      data: response.data,
      statusCode: 200,
      req,
      res
    });
  } catch (error) {
    handleError(res, error);
  }
};

exports.loginWithIdp = loginWithIdp;
