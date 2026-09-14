const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    contract: { type: mongoose.Schema.Types.ObjectId, ref: 'Contract', required: true },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    amount: { type: Number, required: true },
    lateFee: { type: Number, default: 0 },
    totalDue: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['Pending', 'Pending Verification', 'Paid', 'Overdue', 'Cancelled'],
      default: 'Pending',
    },
    paidAt: { type: Date },
    paymentMethod: { type: String, enum: ['Cash', 'Bank Transfer', 'GCash', 'Check', 'N/A'], default: 'N/A' },
    receiptUrl: { type: String, default: '' },
    remarks: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);