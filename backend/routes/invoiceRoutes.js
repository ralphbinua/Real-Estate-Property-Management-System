const express = require('express');
const router = express.Router();
const {
  generateMonthlyInvoices,
  getAllInvoices,
  getTenantInvoices,
  updateInvoiceStatus,
  submitPaymentReceipt,
} = require('../controllers/invoiceController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/', protect, authorize('Admin', 'Property Manager', 'Owner', 'Tenant'), getAllInvoices);
router.get('/tenant', protect, authorize('Tenant'), getTenantInvoices);
router.post('/generate', protect, authorize('Admin', 'Property Manager'), generateMonthlyInvoices);
router.put('/:id', protect, authorize('Admin', 'Property Manager'), updateInvoiceStatus);
router.put('/:id/submit-payment', protect, authorize('Tenant'), submitPaymentReceipt);

module.exports = router;