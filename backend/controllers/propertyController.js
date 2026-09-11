const Property = require('../models/Property');
const Contract = require('../models/Contract');

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

// @desc    Create new property
// @route   POST /api/properties
// @access  Private (Admin / Property Manager)
const createProperty = async (req, res) => {
  try {
    const propertyData = { ...req.body };

    // Remove empty string references so Mongoose doesn't attempt to cast "" to ObjectId
    if (!propertyData.owner || propertyData.owner === '') {
      delete propertyData.owner;
    }
    if (!propertyData.manager || propertyData.manager === '') {
      delete propertyData.manager;
    }

    const property = await Property.create(propertyData);
    res.status(201).json(property);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update property details
// @route   PUT /api/properties/:id
// @access  Private (Admin/Manager)
const updateProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: 'Property not found' });

    const updatedProperty = await Property.findByIdAndUpdate(req.params.id, req.body, { new: true });

    // If price was updated, sync active lease contracts for this property
    if (req.body.price) {
      await Contract.updateMany(
        { property: req.params.id, status: 'Active' },
        { rentAmount: Number(req.body.price) }
      );
    }

    res.status(200).json(updatedProperty);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete property
// @route   DELETE /api/properties/:id
// @access  Private (Admin)
const deleteProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: 'Property not found' });

    await property.deleteOne();
    res.status(200).json({ message: 'Property deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getProperties, createProperty, updateProperty, deleteProperty };