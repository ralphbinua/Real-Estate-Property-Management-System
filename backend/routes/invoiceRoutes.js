const express = require('express');
const router = express.Router();
const {
  generateMonthlyInvoices,
  getAllInvoices,
  getTenantInvoices,
  updateInvoiceStatus,
  submitPaymentReceipt,
} = require('../controllers/invoiceController');

router.get('/', getAllInvoices);
router.get('/tenant', getTenantInvoices);
router.post('/generate', generateMonthlyInvoices);
router.put('/:id', updateInvoiceStatus);
router.put('/:id/submit-payment', submitPaymentReceipt);

module.exports = router;