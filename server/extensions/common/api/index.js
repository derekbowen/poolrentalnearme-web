const authenticatedUser = require('extensions/common/middlewares/authenticatedUser');

const router = require('express').Router();

router.use(authenticatedUser());

router.use('/token', require('./token'));

module.exports = router;
