const Contract = require('../models/Contract');
const Property = require('../models/Property'); // Import Property model

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

    // Automatically set property status to 'Rented'
    if (property) {
      await Property.findByIdAndUpdate(property, { status: 'Rented' });
    }

    const populatedContract = await Contract.findById(contract._id)
      .populate('property', 'title address price')
      .populate('tenant', 'name email');

    res.status(201).json(populatedContract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Manually terminate/complete a lease contract
// @route   PUT /api/contracts/:id/terminate
// @access  Private (Admin / Property Manager)
const terminateContract = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ message: 'Contract not found' });

    contract.status = 'Completed';
    await contract.save();

    // Revert the property status to 'Available'
    if (contract.property) {
      await Property.findByIdAndUpdate(contract.property, { status: 'Available' });
    }

    const updatedContract = await Contract.findById(contract._id)
      .populate('property', 'title address price')
      .populate('tenant', 'name email');

    res.status(200).json(updatedContract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getContracts, createContract, terminateContract };