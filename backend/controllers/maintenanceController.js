const MaintenanceRequest = require('../models/MaintenanceRequest');

// @desc    Get all maintenance requests
// @route   GET /api/maintenance
// @access  Private (Admin, Property Manager see all; Tenants see their own)
const getMaintenanceRequests = async (req, res) => {
  try {
    let query = {};
    // If the user is a Tenant, only show their own maintenance requests
    if (req.user.role === 'Tenant') {
      query.tenant = req.user._id;
    }

    const requests = await MaintenanceRequest.find(query)
      .populate('property', 'title address')
      .populate('tenant', 'name email');
      
    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new maintenance request
// @route   POST /api/maintenance
// @access  Private (Tenant only)
const createMaintenanceRequest = async (req, res) => {
  try {
    const { property, issueDescription } = req.body;

    if (!property || !issueDescription) {
      return res.status(400).json({ message: 'Please provide property and issue description' });
    }

    const maintenanceRequest = await MaintenanceRequest.create({
      property,
      tenant: req.user._id, // Automatically assign the logged-in tenant
      issueDescription,
      status: 'Open'
    });

    res.status(201).json(maintenanceRequest);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update maintenance request status
// @route   PATCH /api/maintenance/:id
// @access  Private (Admin & Property Manager only)
const updateMaintenanceStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    const request = await MaintenanceRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Maintenance request not found' });
    }

    request.status = status || request.status;
    const updatedRequest = await request.save();

    res.status(200).json(updatedRequest);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMaintenanceRequests,
  createMaintenanceRequest,
  updateMaintenanceStatus,
};