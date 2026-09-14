const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect, authorize('Admin'));

router.route('/')
  .get(getSettings)
  .put(updateSettings);

module.exports = router;
