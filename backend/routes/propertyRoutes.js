const express = require('express');
const router = express.Router();
const {
  getAllProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
  generateUnitsForProperty,
  updateUnitStatus,
} = require('../controllers/propertyController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Standard Property Routes
router.route('/')
  .get(protect, getAllProperties)
  .post(protect, authorize('Admin', 'Property Manager'), createProperty);

router.route('/:id')
  .get(protect, getPropertyById)
  .put(protect, authorize('Admin', 'Property Manager'), updateProperty)
  .delete(protect, authorize('Admin', 'Property Manager'), deleteProperty);

// Unit Management Routes
router.post('/:id/generate-units', protect, authorize('Admin', 'Property Manager'), generateUnitsForProperty);
router.put('/:id/units/:unitId', protect, authorize('Admin', 'Property Manager'), updateUnitStatus);

module.exports = router;