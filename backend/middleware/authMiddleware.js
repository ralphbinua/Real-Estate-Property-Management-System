const jwt = require('jsonwebtoken');
const User = require('../models/User');

// 1. Verify token and log the user in
const protect = async (req, res, next) => {
  let token;

  // Check if the token is in the headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Extract token from "Bearer <token>"
      token = req.headers.authorization.split(' ')[1];

      // Verify the token using your secret key
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Find the user in DB and attach them to the request object (excluding the password)
      req.user = await User.findById(decoded.id).select('-password');
      next();
    } catch (error) {
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token provided' });
  }
};

// 2. Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    // Check if the logged-in user's role is included in the allowed roles array
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `User role '${req.user.role}' is not authorized to access this route` 
      });
    }
    next();
  };
};

module.exports = { protect, authorize };