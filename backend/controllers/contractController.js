const Contract = require('../models/Contract');

// @desc    Get all contracts
// @route   GET /api/contracts
// @access  Private (Admins, Property Managers see all; Tenants see their own)
const getContracts = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'Tenant') {
      query.tenant = req.user._id;
    }

    const contracts = await Contract.find(query)
      .populate('property', 'title address price')
      .populate('tenant', 'name email');

    res.status(200).json(contracts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new lease contract
// @route   POST /api/contracts
// @access  Private (Admin & Property Manager only)
const createContract = async (req, res) => {
  try {
    const { property, tenant, startDate, endDate, rentAmount } = req.body;

    if (!property || !tenant || !startDate || !endDate || !rentAmount) {
      return res.status(400).json({ message: 'Please provide all contract fields' });
    }

    const contract = await Contract.create({
      property,
      tenant,
      startDate,
      endDate,
      rentAmount,
      status: 'Active'
    });

    res.status(201).json(contract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getContracts,
  createContract,
};