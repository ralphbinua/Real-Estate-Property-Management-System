const express = require('express');
const router = express.Router();
const { getOwnerPortfolio } = require('../controllers/ownerController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/portfolio', protect, authorize('Owner'), getOwnerPortfolio);

module.exports = router;