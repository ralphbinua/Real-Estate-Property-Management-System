const Contract = require('../models/Contract');
const Property = require('../models/Property');

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
      .populate('property', 'title address price propertyType')
      .populate('tenant', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json(contracts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create lease contract (Unit-Aware)
// @route   POST /api/contracts
// @access  Private (Admin / Property Manager)
const createContract = async (req, res) => {
  try {
    const { property, unitId, unitNumber, tenant, startDate, endDate, rentAmount } = req.body;

    // 1. Create Contract with unit details
    const contract = await Contract.create({
      property,
      unitId: unitId || null,
      unitNumber: unitNumber || 'Main Unit',
      tenant,
      startDate,
      endDate,
      rentAmount,
      status: 'Active',
    });

    // 2. Update specific room inside Property.units array if unitId exists
    if (unitId) {
      const propertyDoc = await Property.findById(property);
      if (propertyDoc && Array.isArray(propertyDoc.units)) {
        const unit = propertyDoc.units.id(unitId);
        if (unit) {
          unit.status = 'Occupied';
          unit.tenant = tenant;
          await propertyDoc.save();
        }
      }
    } else if (property) {
      // Fallback for standalone house
      await Property.findByIdAndUpdate(property, { status: 'Occupied' });
    }

    const populatedContract = await Contract.findById(contract._id)
      .populate('property', 'title address price')
      .populate('tenant', 'name email');

    res.status(201).json(populatedContract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Manually terminate/complete a lease contract (Unit-Aware Sync)
// @route   PUT /api/contracts/:id/terminate
// @access  Private (Admin / Property Manager)
const terminateContract = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json({ message: 'Contract not found.' });
    }

    // 1. Mark Contract as Terminated
    contract.status = 'Terminated';
    await contract.save();

    // 2. Revert Sub-Unit Status to Available safely
    if (contract.property) {
      const property = await Property.findById(contract.property);
      
      if (property && Array.isArray(property.units) && property.units.length > 0) {
        // Find matching unit either by sub-document ID or unitNumber string
        const unit = property.units.find(
          (u) =>
            (contract.unitId && u._id.toString() === contract.unitId.toString()) ||
            (contract.unitNumber && u.unitNumber === contract.unitNumber)
        );

        if (unit) {
          unit.status = 'Available';
          unit.tenant = null;
          await property.save();
        }
      } else if (property) {
        // Fallback for standalone house
        property.status = 'Available';
        await property.save();
      }
    }

    res.json({ message: 'Lease terminated successfully.' });
  } catch (err) {
    console.error('Error in terminateContract:', err);
    res.status(500).json({ message: err.message || 'Failed to terminate contract.' });
  }
};

module.exports = { getContracts, createContract, terminateContract };