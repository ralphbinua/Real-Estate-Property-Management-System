const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    unitId: { type: mongoose.Schema.Types.ObjectId, required: true },
    unitNumber: { type: String, required: true }, // e.g., "Room 101"
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    rentAmount: { type: Number, required: true },
    status: { type: String, enum: ['Active', 'Terminated', 'Expired'], default: 'Active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Contract', contractSchema);