const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  rentAmount: { type: Number, required: true },
  status: { type: String, enum: ['Active', 'Terminated', 'Pending'], default: 'Pending' }
}, { timestamps: true });

module.exports = mongoose.model('Contract', contractSchema);