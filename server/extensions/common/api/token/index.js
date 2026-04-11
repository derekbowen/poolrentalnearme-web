const router = require('express').Router();
const signJwt = require('extensions/common/mod/jwt/sign');

const createDataToSign = ({ impersonator, currentUser }) => {
  const data = {};

  if (impersonator) {
    data.loggedInAsUser = {
      id: {
        uuid: currentUser.id.uuid,
      },
    };
    data.currentUser = {
      id: {
        uuid: impersonator.id.uuid,
      },
      attributes: {
        profile: {
          metadata: {
            permissions: impersonator.attributes.profile.metadata.permissions || {},
          },
        },
      },
    };
  } else {
    data.currentUser = {
      id: {
        uuid: currentUser.id.uuid,
      },
      attributes: {
        profile: {
          metadata: {
            permissions: currentUser.attributes.profile.metadata.permissions || {},
          },
        },
      },
    };
  }
  return data;
};

router.get('/', async (req, res) => {
  const { impersonator, currentUser } = req;
  if (!impersonator && !currentUser) {
    throw new Error('This route must always be called after the authenticatedUser middleware');
  }
  const jwt = await signJwt({
    payload: createDataToSign({
      impersonator,
      currentUser,
    }),
  });

  return res.status(200).send({ data: { bearer: jwt } });
});

module.exports = router;
