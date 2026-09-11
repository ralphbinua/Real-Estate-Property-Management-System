const express = require('express');
const router = express.Router();
const { getUsers, createUser, updateUserRole } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect, authorize('Admin')); // Protect all user management routes for Admin

router.route('/')
  .get(getUsers)
  .post(createUser);

router.put('/:id/role', updateUserRole);

module.exports = router;