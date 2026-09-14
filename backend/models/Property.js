const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
  unitNumber: { type: String, required: true, default: 'Main Unit' },
  monthlyRate: { type: Number, required: true },
  status: {
    type: String,
    enum: ['Available', 'Occupied', 'Maintenance', 'Reserved'],
    default: 'Available',
  },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});

const propertySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    address: { type: String, required: true },
    propertyType: {
      type: String,
      enum: ['Condo', 'Apartment', 'House', 'Commercial'],
      required: true,
    },
    price: { type: Number, default: 0 }, // Used for single-unit properties like House
    status: {
      type: String,
      enum: ['Available', 'Occupied', 'Pending', 'Under Maintenance'],
      default: 'Available',
    },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    units: [unitSchema], // Array of rooms for Condos/Apartments
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Pre-save Hook: Ensure House properties always initialize as 1 unit
propertySchema.pre('save', function () {
  if (this.propertyType === 'House' && (!this.units || this.units.length === 0)) {
    this.units = [
      {
        unitNumber: 'Main House',
        monthlyRate: this.price || 0,
        status: this.status || 'Available',
      },
    ];
  }
});

module.exports = mongoose.model('Property', propertySchema);