const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: 'PropManage' },
    currencySymbol: { type: String, default: '₱' },
    gracePeriodDays: { type: Number, default: 5 },
    lateFeePercentage: { type: Number, default: 5 },
    defaultDepositMonths: { type: Number, default: 2 },
    autoInvoiceGenerationDay: { type: Number, default: 1 },
    supportEmail: { type: String, default: 'support@propmanage.com' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);