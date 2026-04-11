const { getSdk } = require('../../../api-util/sdk');
const config = require('./config');
const { clientSecret, rootUrl } = require('./config');

const setCookieAndRedirect = (res, cookieName, cookieValue, redirectUrl) => {
  return res
    .cookie(cookieName, cookieValue, {
      maxAge: config.cookieMaxAge,
    })
    .redirect(redirectUrl);
};

const loginWithIdp = async ({ error, user, req, res, idpClientId, idpId }) => {
  if (error || !user) {
    return setCookieAndRedirect(
      res,
      'st-autherror',
      {
        status: error?.status || 'Bad Request',
        code: error?.code || 400,
        message: error?.message || 'Failed to fetch user details from identity provider',
      },
      `${rootUrl}/login#`
    );
  }

  const { from, defaultReturn = '/', defaultConfirm = '/confirm' } = user;

  const sdk = getSdk(req, res, {
    clientSecret,
  });

  try {
    await sdk.marketplace.show();
    await sdk.loginWithIdp({
      idpId,
      idpClientId,
      idpToken: user.idpToken,
    });

    const returnPath = from || defaultReturn;
    return res.redirect(`${rootUrl}${returnPath}#`);
  } catch (e) {
    return setCookieAndRedirect(
      res,
      'st-authinfo',
      {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        idpToken: user.idpToken,
        idpId,
        from,
      },
      `${rootUrl}${defaultConfirm}#`
    );
  }
};

module.exports = loginWithIdp;
