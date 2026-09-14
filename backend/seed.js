const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

// Load Models
const User = require('./models/User');
const Property = require('./models/Property');
const Contract = require('./models/Contract');
const MaintenanceRequest = require('./models/MaintenanceRequest');
const Invoice = require('./models/Invoice');

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/propmanage');
    console.log('MongoDB Connected for Seeding…');

    // Clear existing data across all collections
    await User.deleteMany({});
    await Property.deleteMany({});
    await Contract.deleteMany({});
    await MaintenanceRequest.deleteMany({});
    await Invoice.deleteMany({});
    console.log('Cleared existing database records.');

    // Hash default password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);

    // 1. Seed Users for all 5 roles
    const users = await User.insertMany([
      { name: 'System Admin', email: 'admin@example.com', password: hashedPassword, role: 'Admin' },
      { name: 'Sarah Manager', email: 'manager@example.com', password: hashedPassword, role: 'Property Manager' },
      { name: 'Alex Agent', email: 'agent@example.com', password: hashedPassword, role: 'Agent' },
      { name: 'John Tenant', email: 'tenant@example.com', password: hashedPassword, role: 'Tenant' },
      { name: 'Elena Owner', email: 'owner@example.com', password: hashedPassword, role: 'Owner' },
    ]);

    const manager = users[1];
    const tenant = users[3];
    const owner = users[4];

    console.log('Users seeded.');

    // 2. Build 20 Units Array for Apartment Complex
    const apartmentUnits = [];

    // Floor 1: Standard Units (Rooms 101–110) @ ₱8,500/mo
    for (let i = 1; i <= 10; i++) {
      const roomNum = i < 10 ? `Room 10${i}` : `Room 110`;
      apartmentUnits.push({
        unitNumber: roomNum,
        monthlyRate: 8500,
        status: i === 1 ? 'Occupied' : 'Available', // Room 101 assigned to John Tenant
        tenant: i === 1 ? tenant._id : null,
      });
    }

    // Floor 2: Deluxe & Corner Units (Rooms 201–210) @ ₱11,000 – ₱14,000/mo
    for (let i = 1; i <= 10; i++) {
      const roomNum = i < 10 ? `Room 20${i}` : `Room 210`;
      const isCornerUnit = i === 1 || i === 10;
      const rate = isCornerUnit ? 14000 : 11000;

      apartmentUnits.push({
        unitNumber: roomNum,
        monthlyRate: rate,
        status: 'Available',
        tenant: null,
      });
    }

    // Build 8 Units Array for Condo Complex
    const condoUnits = [];
    for (let i = 1; i <= 8; i++) {
      condoUnits.push({
        unitNumber: `Suite ${300 + i}`,
        monthlyRate: 25000 + i * 1000,
        status: 'Available',
        tenant: null,
      });
    }

    // 3. Seed Properties (Apartments/Condos with units array; House with count = 1)
    const properties = await Property.insertMany([
      {
        title: 'Grand Horizon Apartment Complex',
        description: 'Modern 20-unit residential building with standard and deluxe corner suites.',
        address: '123 Bonifacio Global City, Taguig',
        propertyType: 'Apartment',
        owner: owner._id,
        manager: manager._id,
        units: apartmentUnits,
      },
      {
        title: 'Skyline Luxury Condo Towers',
        description: '8 high-end studio and corner condo suites.',
        address: '88 Roxas Boulevard, Pasay City',
        propertyType: 'Condo',
        owner: owner._id,
        manager: manager._id,
        units: condoUnits,
      },
      {
        title: 'Sunset Villa Residence',
        description: 'Standalone single-family house with private garden.',
        address: '45 Ayala Avenue, Makati City',
        propertyType: 'House',
        price: 85000,
        status: 'Available',
        owner: owner._id,
        manager: manager._id,
        units: [], // Single-unit house has empty array (counts as 1 unit)
      },
    ]);

    const grandHorizon = properties[0];
    const occupiedUnit = grandHorizon.units[0]; // Room 101

    console.log('Properties seeded (Multi-unit Apartments/Condos and 1-unit House).');

    // 4. Seed Lease Contract for John Tenant (Room 101)
    const contract = await Contract.create({
      property: grandHorizon._id,
      unitId: occupiedUnit._id,
      unitNumber: occupiedUnit.unitNumber,
      tenant: tenant._id,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      rentAmount: occupiedUnit.monthlyRate, // ₱8,500
      status: 'Active',
    });

    console.log(`Contract seeded for ${tenant.name} (${occupiedUnit.unitNumber} @ ₱${contract.rentAmount.toLocaleString()}/mo).`);

    // 5. Seed Initial Pending Invoice
    await Invoice.create({
      contract: contract._id,
      tenant: tenant._id,
      property: grandHorizon._id,
      amount: occupiedUnit.monthlyRate,
      lateFee: 0,
      totalDue: occupiedUnit.monthlyRate,
      dueDate: new Date('2026-10-10'),
      status: 'Pending',
    });

    console.log('Invoice seeded.');

    // 6. Seed Maintenance Request
    await MaintenanceRequest.create({
      property: grandHorizon._id,
      tenant: tenant._id,
      issueDescription: 'Master bathroom sink drain is leaking slowly in Room 101.',
      priority: 'Medium',
      status: 'Open',
    });

    console.log('Maintenance ticket seeded.');
    console.log('Database successfully re-seeded!');
    process.exit();
  } catch (error) {
    console.error(`Error during seeding: ${error.message}`);
    process.exit(1);
  }
};

seedData();