const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    unitId: { type: mongoose.Schema.Types.ObjectId, default: null }, // Optional for standalone single-unit properties
    unitNumber: { type: String, default: 'Main Unit' },             // Defaults to 'Main Unit' for standalone properties
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    rentAmount: { type: Number, required: true },
    status: { type: String, enum: ['Active', 'Terminated', 'Expired'], default: 'Active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Contract', contractSchema);