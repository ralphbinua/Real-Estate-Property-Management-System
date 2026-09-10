const express = require('express');
const router = express.Router();
const { getContracts, createContract } = require('../controllers/contractController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getContracts)
  .post(protect, authorize('Admin', 'Property Manager'), createContract);

module.exports = router;