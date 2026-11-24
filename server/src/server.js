
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/db');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to NEBULITH API!',
    status: 'Server is running'
  });
});

// Start server after connecting to MongoDB
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`NEBULITH server running on port ${PORT}`);
  });
};

startServer();
