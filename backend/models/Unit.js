const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    unitNumber: { type: String, required: true }, // e.g. "Room 101", "A-1"
    floor: { type: Number, default: 1 },
    monthlyRate: { type: Number, required: true },
    depositAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Available', 'Occupied', 'Maintenance', 'Reserved'],
      default: 'Available',
    },
    currentTenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    features: [{ type: String }], // e.g., ["Aircon", "Private Bathroom", "Balcony"]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Unit', unitSchema);