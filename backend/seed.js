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
    console.log('MongoDB Connected for Enhanced Seeding…');

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

    // 1. Seed Exact 5 Primary Users
    const users = await User.insertMany([
      { name: 'System Admin', email: 'admin@example.com', password: hashedPassword, role: 'Admin' },
      { name: 'Sarah Manager', email: 'manager@example.com', password: hashedPassword, role: 'Property Manager' },
      { name: 'Alex Agent', email: 'agent@example.com', password: hashedPassword, role: 'Agent' },
      { name: 'John Tenant', email: 'tenant@example.com', password: hashedPassword, role: 'Tenant' },
      { name: 'Elena Owner', email: 'owner@example.com', password: hashedPassword, role: 'Owner' },
    ]);

    const admin = users[0];
    const manager = users[1];
    const agent = users[2];
    const tenant = users[3];
    const owner = users[4];

    console.log('5 Standard User Accounts Seeded.');

    // 2. Build Multi-Unit Sub-document Collections

    // Complex 1: Grand Horizon Apartment (15 Sub-units)
    const horizonUnits = [];
    for (let i = 1; i <= 15; i++) {
      const isOccupied = i === 1 || i === 2; // Rooms 101 & 102 are Occupied by John Tenant
      const isMaintenance = i === 5;
      horizonUnits.push({
        unitNumber: `Room 10${i < 10 ? '0' + i : i}`,
        monthlyRate: 8500 + (i > 10 ? 2500 : 0),
        status: isOccupied ? 'Occupied' : isMaintenance ? 'Maintenance' : 'Available',
        tenant: isOccupied ? tenant._id : null,
      });
    }

    // Complex 2: Skyline Luxury Towers (10 Sub-units)
    const skylineUnits = [];
    for (let i = 1; i <= 10; i++) {
      const isOccupied = i === 1; // Suite 301 Occupied by John Tenant
      skylineUnits.push({
        unitNumber: `Suite ${300 + i}`,
        monthlyRate: 26000 + i * 1500,
        status: isOccupied ? 'Occupied' : 'Available',
        tenant: isOccupied ? tenant._id : null,
      });
    }

    // Complex 3: Metro Central Commercial Hub (6 Sub-units)
    const commercialUnits = [];
    for (let i = 1; i <= 6; i++) {
      commercialUnits.push({
        unitNumber: `Space Commercial ${i}`,
        monthlyRate: 45000 + i * 5000,
        status: 'Available',
        tenant: null,
      });
    }

    // 3. Seed Expanded Properties Directory (5 Distinct Estates)
    const properties = await Property.insertMany([
      {
        title: 'Grand Horizon Apartment Complex',
        description: 'Modern 15-unit residential complex located in BGC.',
        address: '123 Bonifacio Global City, Taguig',
        propertyType: 'Apartment',
        owner: owner._id,
        manager: manager._id,
        units: horizonUnits,
      },
      {
        title: 'Skyline Luxury Condo Towers',
        description: '10 high-rise luxury studio and corner suites with bay views.',
        address: '88 Roxas Boulevard, Pasay City',
        propertyType: 'Condo',
        owner: owner._id,
        manager: manager._id,
        units: skylineUnits,
      },
      {
        title: 'Sunset Villa Residence',
        description: 'Exclusive 4-bedroom single-family house with private pool.',
        address: '45 Ayala Avenue, Makati City',
        propertyType: 'House',
        price: 85000,
        status: 'Available',
        owner: owner._id,
        manager: manager._id,
        units: [],
      },
      {
        title: 'Metro Central Commercial Hub',
        description: '6 prime retail and office spaces along Ortigas Business District.',
        address: '55 Ortigas Center, Pasig City',
        propertyType: 'Commercial',
        price: 50000,
        status: 'Available',
        owner: owner._id,
        manager: manager._id,
        units: commercialUnits,
      },
      {
        title: 'Greenwoods Sub-Unit Townhouse',
        description: 'Standalone two-story residential townhome.',
        address: '12 Greenwoods Executive Village, Pasig City',
        propertyType: 'House',
        price: 42000,
        status: 'Available',
        owner: owner._id,
        manager: manager._id,
        units: [],
      },
    ]);

    console.log('5 Properties Seeded (Apartments, Condos, Houses, and Commercial Spaces).');

    const grandHorizon = properties[0];
    const skyline = properties[1];

    const horizonRoom101 = grandHorizon.units[0];
    const horizonRoom102 = grandHorizon.units[1];
    const skylineSuite301 = skyline.units[0];

    // 4. Seed Multiple Active & Historic Lease Contracts
    const contracts = await Contract.insertMany([
      {
        property: grandHorizon._id,
        unitId: horizonRoom101._id,
        unitNumber: horizonRoom101.unitNumber,
        tenant: tenant._id,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        rentAmount: horizonRoom101.monthlyRate, // ₱8,500
        status: 'Active',
      },
      {
        property: grandHorizon._id,
        unitId: horizonRoom102._id,
        unitNumber: horizonRoom102.unitNumber,
        tenant: tenant._id,
        startDate: new Date('2026-02-01'),
        endDate: new Date('2027-01-31'),
        rentAmount: horizonRoom102.monthlyRate, // ₱8,500
        status: 'Active',
      },
      {
        property: skyline._id,
        unitId: skylineSuite301._id,
        unitNumber: skylineSuite301.unitNumber,
        tenant: tenant._id,
        startDate: new Date('2026-03-01'),
        endDate: new Date('2027-02-28'),
        rentAmount: skylineSuite301.monthlyRate, // ₱27,500
        status: 'Active',
      },
    ]);

    console.log('3 Active Contracts Seeded for John Tenant.');

    // 5. Seed Invoices Across Different Payment Lifecycle States
    await Invoice.insertMany([
      {
        contract: contracts[0]._id,
        tenant: tenant._id,
        property: grandHorizon._id,
        amount: 8500,
        lateFee: 0,
        totalDue: 8500,
        dueDate: new Date('2026-09-10'),
        status: 'Paid',
      },
      {
        contract: contracts[0]._id,
        tenant: tenant._id,
        property: grandHorizon._id,
        amount: 8500,
        lateFee: 0,
        totalDue: 8500,
        dueDate: new Date('2026-10-10'),
        status: 'Pending',
      },
      {
        contract: contracts[1]._id,
        tenant: tenant._id,
        property: grandHorizon._id,
        amount: 8500,
        lateFee: 500,
        totalDue: 9000,
        dueDate: new Date('2026-08-10'),
        status: 'Overdue',
      },
      {
        contract: contracts[2]._id,
        tenant: tenant._id,
        property: skyline._id,
        amount: 27500,
        lateFee: 0,
        totalDue: 27500,
        dueDate: new Date('2026-10-01'),
        status: 'Pending',
      },
    ]);

    console.log('4 Financial Invoices Seeded (Paid, Pending, Overdue).');

    // 6. Seed Maintenance Requests Across Multiple Priorities & Statuses
    await MaintenanceRequest.insertMany([
      {
        property: grandHorizon._id,
        tenant: tenant._id,
        issueDescription: 'Master bathroom sink drain is leaking slowly in Room 101.',
        priority: 'Medium',
        status: 'In Progress',
      },
      {
        property: skyline._id,
        tenant: tenant._id,
        issueDescription: 'Air conditioning unit unit filter requires deep cleaning in Suite 301.',
        priority: 'Low',
        status: 'Open',
      },
      {
        property: grandHorizon._id,
        tenant: tenant._id,
        issueDescription: 'Circuit breaker tripped in Room 102 kitchen area.',
        priority: 'High',
        status: 'Resolved',
      },
    ]);

    console.log('3 Maintenance Tickets Seeded.');
    console.log('Database successfully re-seeded with enhanced datasets!');
    process.exit();
  } catch (error) {
    console.error(`Error during seeding: ${error.message}`);
    process.exit(1);
  }
};

seedData();