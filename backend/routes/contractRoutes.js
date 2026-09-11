const express = require('express');
const router = express.Router();
const {
  getContracts,
  createContract,
  terminateContract,
} = require('../controllers/contractController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Base routes: /api/contracts
router.route('/')
  .get(protect, getContracts)
  .post(protect, authorize('Admin', 'Property Manager'), createContract);

// Specific sub-route MUST be declared before generic /:id routes
router.put('/:id/terminate', protect, authorize('Admin', 'Property Manager'), terminateContract);

module.exports = router;