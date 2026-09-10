const express = require('express');
const router = express.Router();
const {
  getMaintenanceRequests,
  createMaintenanceRequest,
  updateMaintenanceStatus,
} = require('../controllers/maintenanceController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getMaintenanceRequests)
  .post(protect, authorize('Tenant'), createMaintenanceRequest);

router.route('/:id')
  .patch(protect, authorize('Admin', 'Property Manager'), updateMaintenanceStatus);

module.exports = router;