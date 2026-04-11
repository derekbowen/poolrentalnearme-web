const { config } = require('process');
const { denormalisedResponseEntities } = require('api-util/data');
const { getSdk, handleError } = require('../../../api-util/sdk');
const { handleResponse } = require('../../common/utils/response');

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
    email: {
      type: 'string',
    },
    firstName: {
      type: 'string',
    },
    lastName: { type: 'string' },
    displayName: { type: 'string', nullable: true },
    bio: { type: 'string', nullable: true },
    publicData: { type: 'object', nullable: true },
    privateData: { type: 'object', nullable: true },
    protectedData: { type: 'object', nullable: true },
  },
  required: ['idpId', 'idpClientId', 'idpToken', 'firstName', 'lastName', 'email'],
};

const createUserWithIdp = async (req, res) => {
  try {
    const {
      idpId,
      idpClientId,
      idpToken,
      firstName,
      lastName,
      publicData,
      protectedData,
      privateData,
      displayName,
      bio,
      email,
    } = req.body;

    const sdk = getSdk(req, res, {
      clientSecret: config.clientSecret,
    });

    const extendedData = {
      ...(displayName ? { displayName } : {}),
      ...(bio ? { bio } : {}),
      publicData: publicData || {},
      protectedData: protectedData || {},
      privateData: privateData || {},
    };

    const response = await sdk.currentUser.createWithIdp(
      {
        idpId,
        idpClientId,
        idpToken,
        firstName,
        lastName,
        email,
        ...extendedData,
      },
      { expand: true }
    );
    const user = denormalisedResponseEntities(response);
    const {
      id: { uuid },
      attributes: {
        profile: {
          publicData: { userType },
        },
      },
    } = user;

    handleResponse({
      data: response.data,
      statusCode: 200,
      req,
      res,
    });
  } catch (error) {
    handleError(res, error);
  }
};

exports.createUserWithIdp = createUserWithIdp;
