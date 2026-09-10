const mongoose = require('mongoose');

const maintenanceSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  issueDescription: { type: String, required: true },
  status: { type: String, enum: ['Open', 'In Progress', 'Resolved'], default: 'Open' }
}, { timestamps: true });

module.exports = mongoose.model('MaintenanceRequest', maintenanceSchema);