const { handleError } = require('../../../api-util/sdk');
const verifyPermissions = require('../permissions/mod/verifier');
const { createError } = require('../utils/response');

const sendUnauthorized = (res) => {
  res.status(401).send({ errors: [{ message: 'Unauthorized' }] });
};

const permissionManager =
  ({ requiredPermissions, getCurrentImpactedResourceId = () => {} }) =>
  async (req, res, next) => {
    const { currentUser } = req;
    if (!currentUser) {
      return sendUnauthorized(res);
    }
    const { error } = verifyPermissions({
      currentUser,
      requiredPermissions,
      currentImpactedResourceId: getCurrentImpactedResourceId(req),
    });
    if (error) {
      return handleError(res, createError(error));
    }
    return next();
  };

module.exports = permissionManager;
