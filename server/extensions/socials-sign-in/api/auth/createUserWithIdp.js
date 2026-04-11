const { handleError } = require('../../../../api-util/sdk');
const { getSdk, serialize } = require('../../../../api-util/sdk');
const config = require('../../common/config');

module.exports = async (req, res) => {
  try {
    const sdk = getSdk(req, res, {
      clientSecret: config.clientSecret,
    });

    const { idpToken, idpId, ...rest } = req.body;

    const idpClientId = config.idpClientIdMapping[idpId];

    await sdk.currentUser.createWithIdp({ idpId, idpClientId, idpToken, ...rest });
    const apiResponse = await sdk.loginWithIdp({
      idpId,
      idpClientId,
      idpToken,
    });
    const { status, statusText, data } = apiResponse;
    res
      .clearCookie('st-authinfo')
      .status(status)
      .set('Content-Type', 'application/transit+json')
      .send(
        serialize({
          status,
          statusText,
          data,
        })
      )
      .end();
  } catch (e) {
    handleError(res, e);
  }
};
