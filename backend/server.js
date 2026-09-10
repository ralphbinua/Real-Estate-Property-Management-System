const express = require('express');
const cors = require('cors');
require('dotenv').config();
const connectDB = require('./config/db');

connectDB();
const app = express();
app.use(cors());
app.use(express.json());

// Add these API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/properties', require('./routes/propertyRoutes'));
app.use('/api/maintenance', require('./routes/maintenanceRoutes'));
app.use('/api/contracts', require('./routes/contractRoutes'));
app.use('/api/owner', require('./routes/ownerRoutes'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));