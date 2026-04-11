const router = require('express').Router();

router.delete('/', require('./delete'));

module.exports = router;
