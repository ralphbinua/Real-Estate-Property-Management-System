const express = require('express');
const router = express.Router();
const { getUsers, createUser, updateUserRole, deleteUser } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/', protect, authorize('Admin', 'Property Manager', 'Owner', 'Agent'), getUsers);
router.post('/', protect, authorize('Admin'), createUser);
router.put('/:id/role', protect, authorize('Admin'), updateUserRole);
router.delete('/:id', protect, authorize('Admin'), deleteUser);

module.exports = router;