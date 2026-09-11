const Contract = require('../models/Contract');

// @desc    Get all contracts (populated)
// @route   GET /api/contracts
// @access  Private
const getContracts = async (req, res) => {
  try {
    const contracts = await Contract.find({})
      .populate('property', 'title address price')
      .populate('tenant', 'name email');
    res.status(200).json(contracts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create lease contract
// @route   POST /api/contracts
// @access  Private (Admin / Manager)
const createContract = async (req, res) => {
  try {
    const { property, tenant, startDate, endDate, rentAmount } = req.body;

    const contract = await Contract.create({
      property,
      tenant,
      startDate,
      endDate,
      rentAmount,
      status: 'Active',
    });

    const populatedContract = await Contract.findById(contract._id)
      .populate('property', 'title address')
      .populate('tenant', 'name email');

    res.status(201).json(populatedContract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getContracts, createContract };