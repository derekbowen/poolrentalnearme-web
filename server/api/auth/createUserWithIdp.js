const http = require('http');
const https = require('https');
const sharetribeSdk = require('sharetribe-flex-sdk');
const { handleError, serialize, typeHandlers } = require('../../api-util/sdk');

const CLIENT_ID = process.env.VITE_SHARETRIBE_SDK_CLIENT_ID;
const CLIENT_SECRET = process.env.SHARETRIBE_SDK_CLIENT_SECRET;
const TRANSIT_VERBOSE = process.env.VITE_SHARETRIBE_SDK_TRANSIT_VERBOSE === 'true';
const { usingSSL } = require('../../api-util/secureCookies');
const USING_SSL = usingSSL();
const BASE_URL = process.env.VITE_SHARETRIBE_SDK_BASE_URL;

const FACBOOK_APP_ID = process.env.VITE_FACEBOOK_APP_ID;
const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;

const FACEBOOK_IDP_ID = 'facebook';
const GOOGLE_IDP_ID = 'google';

// Instantiate HTTP(S) Agents with keepAlive set to true.
// This will reduce the request time for consecutive requests by
// reusing the existing TCP connection, thus eliminating the time used
// for setting up new TCP connections.
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const baseUrl = BASE_URL ? { baseUrl: BASE_URL } : {};

module.exports = async (req, res) => {
  try {
    const tokenStore = sharetribeSdk.tokenStore.expressCookieStore({
      clientId: CLIENT_ID,
      req,
      res,
      secure: USING_SSL,
    });

    const sdk = sharetribeSdk.createInstance({
      transitVerbose: TRANSIT_VERBOSE,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      httpAgent,
      httpsAgent,
      tokenStore,
      typeHandlers,
      ...baseUrl,
    });

    const { idpToken, idpId, ...rest } = req.body;

    // Choose the idpClientId based on which authentication method is used.
    const idpClientId =
      idpId === FACEBOOK_IDP_ID
        ? FACBOOK_APP_ID
        : idpId === GOOGLE_IDP_ID
          ? GOOGLE_CLIENT_ID
          : null;

    const apiResponse = await sdk.currentUser.createWithIdp(
      {
        idpId,
        idpClientId,
        idpToken,
        ...rest,
      },
      { expand: true }
    );
    // After the user is created, we need to call loginWithIdp endpoint
    // so that the user will be logged in.
    sdk.loginWithIdp({
      idpId,
      idpClientId: `${idpClientId}`,
      idpToken: `${idpToken}`,
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
