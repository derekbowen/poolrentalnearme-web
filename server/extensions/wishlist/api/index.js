const express = require('express');
const authMiddleware = require('../../common/middlewares/authenticatedUser');

const router = express.Router();

router.use(authMiddleware());
router.put('/', require('./add'));
router.delete('/:listingId', require('./remove'));

module.exports = router;
