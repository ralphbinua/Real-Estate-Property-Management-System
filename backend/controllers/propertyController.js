const Property = require('../models/Property');

// @desc    Get all properties
// @route   GET /api/properties
// @access  Private (All authenticated roles)
const getProperties = async (req, res) => {
  try {
    // Populate pulls in the name and email of the linked manager and owner
    const properties = await Property.find()
      .populate('manager', 'name email')
      .populate('owner', 'name email');
    res.status(200).json(properties);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new property
// @route   POST /api/properties
// @access  Private (Admin & Property Manager only)
const createProperty = async (req, res) => {
  try {
    const { title, description, address, propertyType, price, features, owner } = req.body;

    const property = await Property.create({
      title,
      description,
      address,
      propertyType,
      price,
      features,
      manager: req.user._id, // Automatically assigns the logged-in user making the request
      owner
    });

    res.status(201).json(property);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getProperties, createProperty };