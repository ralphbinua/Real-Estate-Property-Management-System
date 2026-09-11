const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please add a property title'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Please add a description'],
    },
    address: {
      type: String,
      required: [true, 'Please add the property address'],
    },
    propertyType: {
      type: String,
      enum: ['Apartment', 'House', 'Condo', 'Commercial'],
      required: true,
    },
    price: {
      type: Number,
      required: [true, 'Please add the rental price or value'],
    },
    status: {
      type: String,
      enum: ['Available', 'Rented', 'Under Maintenance'],
      default: 'Available',
    },
    features: {
      bedrooms: { type: Number, default: 0 },
      bathrooms: { type: Number, default: 0 },
      squareMeters: { type: Number, default: 0 },
    },
    // Link to the User model for the assigned Property Manager
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      ref: 'User', 
    },
    // Link to the User model for the Owner of the property
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      ref: 'User',
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // Automatically tracks when a listing is created or updated
  }
);

module.exports = mongoose.model('Property', propertySchema);