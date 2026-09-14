const Property = require('../models/Property');

exports.getAllProperties = async (req, res) => {
  try {
    let filter = { isDeleted: { $ne: true } };

    if (req.user?.role === 'Owner') {
      filter.owner = req.user._id;
    }

    const properties = await Property.find(filter)
      .populate('owner', 'name email')
      .populate('manager', 'name email')
      .populate('units.tenant', 'name email')
      .sort({ createdAt: -1 });

    const formatted = properties.map((prop) => {
      const p = prop.toObject();

      // For multi-unit types (Condo, Apartment)
      if (['Condo', 'Apartment'].includes(p.propertyType) && Array.isArray(p.units) && p.units.length > 0) {
        const totalUnits = p.units.length;
        const occupiedCount = p.units.filter((u) => u.status === 'Occupied').length;
        const rates = p.units.map((u) => u.monthlyRate).filter((r) => typeof r === 'number');
        const lowestRate = rates.length > 0 ? Math.min(...rates) : p.price || 0;

        return {
          ...p,
          totalUnits,
          occupiedUnits: occupiedCount,
          monthlyRate: lowestRate,
          isMultiUnit: true,
          status: occupiedCount === totalUnits ? 'Rented' : 'Available',
        };
      }

      // Standalone properties (House, Commercial) -> Always 1 Unit
      return {
        ...p,
        totalUnits: 1,
        occupiedUnits: ['occupied', 'rented'].includes(p.status?.toLowerCase()) ? 1 : 0,
        monthlyRate: p.price || (p.units?.[0]?.monthlyRate) || 0,
        isMultiUnit: false,
        status: p.status || 'Available',
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('Error fetching properties:', err);
    res.status(500).json({ message: 'Failed to fetch properties.' });
  }
};

// Fetch a single property by ID
exports.getPropertyById = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('manager', 'name email');

    if (!property) {
      return res.status(404).json({ message: 'Property not found.' });
    }

    res.json(property);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch property details.' });
  }
};

// Create a new property
exports.createProperty = async (req, res) => {
  try {
    const property = await Property.create(req.body);
    res.status(201).json(property);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create property.' });
  }
};

// Update an existing property
exports.updateProperty = async (req, res) => {
  try {
    const property = await Property.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!property) {
      return res.status(404).json({ message: 'Property not found.' });
    }

    res.json(property);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update property.' });
  }
};

// Delete a property
exports.deleteProperty = async (req, res) => {
  try {
    const property = await Property.findByIdAndDelete(req.params.id);

    if (!property) {
      return res.status(404).json({ message: 'Property not found.' });
    }

    res.json({ message: 'Property deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete property.' });
  }
};

// Batch auto-generate 20 units with floor-based dynamic pricing
exports.generateUnitsForProperty = async (req, res) => {
  try {
    const { totalUnits = 20, baseRate = 8500, premiumRate = 14000 } = req.body;
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ message: 'Property not found.' });
    }

    const units = [];
    for (let i = 1; i <= totalUnits; i++) {
      const roomNum = i <= 10 ? `Room 10${i}` : `Room 2${i - 10 < 10 ? '0' + (i - 10) : i - 10}`;
      const isCornerUnit = i === 11 || i === 20;
      const rate = i > 10 && isCornerUnit ? premiumRate : i > 10 ? 11000 : baseRate;

      units.push({
        unitNumber: roomNum,
        monthlyRate: rate,
        status: 'Available',
      });
    }

    property.units = units;
    await property.save();

    res.json({ message: `Successfully generated ${units.length} units!`, property });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate property units.' });
  }
};

// Update status or monthly rate for a specific sub-unit
exports.updateUnitStatus = async (req, res) => {
  try {
    const { status, monthlyRate, tenant } = req.body;
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ message: 'Property not found.' });
    }

    const unit = property.units.id(req.params.unitId);
    if (!unit) {
      return res.status(404).json({ message: 'Unit not found inside property.' });
    }

    if (status) unit.status = status;
    if (monthlyRate !== undefined) unit.monthlyRate = monthlyRate;
    if (tenant !== undefined) unit.tenant = tenant;

    await property.save();
    res.json({ message: 'Unit updated successfully.', unit });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update unit.' });
  }
};