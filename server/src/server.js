const express = require('express');
const cors = require('cors');

const connectDB = require('./config/db');
const { loadEnvConfig } = require('./config/env');
const errorHandler = require('./middleware/error-handler');
const notFound = require('./middleware/not-found');
const createAuthRouter = require('./routes/auth.routes');
const createGithubRouter = require('./routes/github.routes');
const healthRoutes = require('./routes/health.routes');

const createApp = (config = loadEnvConfig(), authDependencies = {}) => {
  const app = express();
  app.locals.nodeEnv = config.nodeEnv;
  const allowedOrigins = new Set();

  if (config.frontendUrl) {
    allowedOrigins.add(config.frontendUrl.replace(/\/$/, ''));
  }

  if (config.nodeEnv === 'development') {
    allowedOrigins.add('http://localhost:5173');
    allowedOrigins.add('http://127.0.0.1:5173');
  }

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      const error = new Error('Origin is not allowed by CORS.');
      error.status = 403;
      return callback(error);
    },
  }));
  app.use(express.json());

  app.get('/', (req, res) => {
    res.json({
      success: true,
      application: 'NEBULITH',
      message: 'Welcome to NEBULITH API!',
      status: 'running',
    });
  });

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', createAuthRouter({
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
    ...authDependencies,
  }));
  app.use('/api/github', createGithubRouter({
    jwtSecret: config.jwtSecret,
    ...authDependencies,
  }));
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

const startServer = async () => {
  const config = loadEnvConfig();
  await connectDB(config.mongodbUri);

  const app = createApp(config);
  return app.listen(config.port, () => {
    console.log(`NEBULITH server listening on port ${config.port}.`);
  });
};

if (require.main === module) {
  startServer().catch((error) => {
    // Configuration and connection errors are deliberately sanitized before logging.
    console.error(`NEBULITH startup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createApp, startServer };
