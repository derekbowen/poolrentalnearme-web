const router = require('express').Router();

const { getStripeConnected } = require('./get/stripeConnected');
const { acceptWithPayment } = require('./post/accept');

const authMiddleware = require('../../common/middlewares/authenticatedUser');
const dataValidator = require('../../common/middlewares/dataValidator');
const acceptWithPaymentSchema = require('../schemas/acceptWithPaymentSchema');

router.use(authMiddleware());

router.get('/stripe-connected/:userId', getStripeConnected);
router.post('/accept', dataValidator(acceptWithPaymentSchema, 'body'), acceptWithPayment);

module.exports = router;
