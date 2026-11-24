const mongoose = require('mongoose');

const connectDB = async (uri) => {
  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected successfully.');
  } catch {
    // Never log the original driver error: it can contain host or credential details.
    console.error('MongoDB connection failed. Check database availability and configuration.');
    throw new Error('MongoDB connection failed.');
  }
};

module.exports = connectDB;
