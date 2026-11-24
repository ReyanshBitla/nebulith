const mongoose = require('mongoose');

const DATABASE_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

const getHealth = (req, res) => {
  const databaseStatus = DATABASE_STATES[mongoose.connection.readyState] || 'unknown';
  const isDatabaseConnected = databaseStatus === 'connected';

  return res.status(isDatabaseConnected ? 200 : 503).json({
    success: isDatabaseConnected,
    application: 'NEBULITH',
    api: { status: isDatabaseConnected ? 'healthy' : 'degraded' },
    database: { status: databaseStatus },
    timestamp: new Date().toISOString(),
  });
};

module.exports = { getHealth };
