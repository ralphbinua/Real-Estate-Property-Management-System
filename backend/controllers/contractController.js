const Contract = require('../models/Contract');
const Property = require('../models/Property'); // Import Property model

// @desc    Get contracts (populated and role-filtered)
// @route   GET /api/contracts
// @access  Private
const getContracts = async (req, res) => {
  try {
    let query = {};
    const userRole = req.user?.role;

    if (userRole === 'Tenant') {
      query.tenant = req.user._id;
    } else if (userRole === 'Owner') {
      const ownedProperties = await Property.find({ owner: req.user._id }).select('_id');
      const propertyIds = ownedProperties.map((p) => p._id);
      query.property = { $in: propertyIds };
    }

    const contracts = await Contract.find(query)
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

    contract.status = 'Terminated';
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