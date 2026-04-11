const router = require('express').Router();
const { json } = require('body-parser');
const { rateLimit } = require('express-rate-limit');
const { handleError } = require('api-util/sdk');
const { createError } = require('extensions/common/utils/response');
const dataValidator = require('extensions/common/middlewares/dataValidator');
const sendOTP = require('./otp/send');
const verifyOTP = require('./otp/verify');
const { EXCEED_RATE_LIMIT_CODE } = require('../config/otp');
const { limit, windowMs } = require('../config/limiter');
const sendOTPSchema = require('../schemas/sendOTPSchema');
const verifyOTPSchema = require('../schemas/verifyOTPSchema');

const limiter = rateLimit({
  windowMs,
  limit,
  handler: (req, res) => {
    return handleError(
      res,
      createError({
        status: 429,
        statusText: EXCEED_RATE_LIMIT_CODE,
        message: 'Too many requests from this IP, please try again after 1 minute.',
        data: {
          errors: [
            {
              code: EXCEED_RATE_LIMIT_CODE,
              title: 'Rate limit exceeded',
              status: 429,
            },
          ],
        },
      })
    );
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(limiter);
router.use(json());

router.post('/otp', dataValidator(sendOTPSchema, 'body'), sendOTP);
router.post('/otp/verify', dataValidator(verifyOTPSchema, 'body'), verifyOTP);

module.exports = router;
