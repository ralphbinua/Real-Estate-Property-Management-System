const Property = require('../models/Property');
const Contract = require('../models/Contract');

// @desc    Get properties and contracts owned by the logged-in user
// @route   GET /api/owner/portfolio
// @access  Private (Owner only)
const getOwnerPortfolio = async (req, res) => {
  try {
    // Find properties where the owner field matches the logged-in user's ID
    const properties = await Property.find({ owner: req.user._id })
      .populate('manager', 'name email');

    const propertyIds = properties.map(p => p._id);

    // Find active contracts tied to those properties
    const contracts = await Contract.find({ property: { $in: propertyIds } })
      .populate('tenant', 'name email')
      .populate('property', 'title address');

    res.status(200).json({
      properties,
      contracts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getOwnerPortfolio };