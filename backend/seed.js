const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

// Load env variables
dotenv.config();

// Load Models
const User = require('./models/User');
const Property = require('./models/Property');
const Contract = require('./models/Contract');
const MaintenanceRequest = require('./models/MaintenanceRequest');

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected for Seeding...');

    // Clear existing data
    await User.deleteMany({});
    await Property.deleteMany({});
    await Contract.deleteMany({});
    await MaintenanceRequest.deleteMany({});
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

    const admin = users[0];
    const manager = users[1];
    const tenant = users[3];
    const owner = users[4];

    console.log('Users seeded.');

    // 2. Seed Properties
    const properties = await Property.insertMany([
      {
        title: 'Grand Horizon Condo Unit 402',
        description: 'Beautiful condo unit with 3 bedrooms and 2 bathrooms. Fully furnished and well-maintained.',
        address: '123 Bonifacio Global City, Taguig',
        propertyType: 'Condo',
        price: 35000,
        status: 'Available',
        owner: owner._id,
        manager: manager._id,
      },
      {
        title: 'Sunset Villa Residence',
        description: 'Beautiful house with 3 bedrooms and 2 bathrooms. Fully furnished and well-maintained.',
        address: '45 Ayala Avenue, Makati City',
        propertyType: 'House',
        price: 85000,
        status: 'Available',
        owner: owner._id,
        manager: manager._id,
      },
    ]);

    console.log('Properties seeded.');

    // 3. Seed Lease Contract
    const contract = await Contract.create({
      property: properties[0]._id,
      tenant: tenant._id,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      rentAmount: 35000,
      status: 'Active',
    });

    console.log('Contract seeded.');

    // 4. Seed Maintenance Request
    await MaintenanceRequest.create({
      property: properties[0]._id,
      tenant: tenant._id,
      issueDescription: 'Master bathroom sink drain is leaking slowly.',
      status: 'Open',
    });

    console.log('Maintenance ticket seeded.');
    console.log('Database successfully seeded!');
    process.exit();
  } catch (error) {
    console.error(`Error during seeding: ${error.message}`);
    process.exit(1);
  }
};

seedData();