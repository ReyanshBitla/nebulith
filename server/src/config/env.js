const dotenv = require('dotenv');

const VALID_NODE_ENVS = new Set(['development', 'test', 'production']);

const loadEnvConfig = (source = process.env) => {
  if (source === process.env) {
    dotenv.config();
  }

  const rawPort = source.PORT === undefined ? '5000' : source.PORT;
  const port = Number(rawPort);

  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid PORT. Set PORT to a number between 1 and 65535.');
  }

  const nodeEnv = source.NODE_ENV === undefined ? 'development' : source.NODE_ENV;
  if (!VALID_NODE_ENVS.has(nodeEnv)) {
    throw new Error('Invalid NODE_ENV. Use development, test, or production.');
  }

  const mongodbUri = source.MONGODB_URI;
  if (typeof mongodbUri !== 'string' || mongodbUri.trim() === '') {
    throw new Error('Missing required environment variable: MONGODB_URI.');
  }
  if (!/^mongodb(?:\+srv)?:\/\//i.test(mongodbUri)) {
    throw new Error('Invalid MONGODB_URI. Expected a MongoDB connection URI.');
  }

  const frontendUrl = source.FRONTEND_URL;
  if (frontendUrl) {
    let parsedUrl;
    try {
      parsedUrl = new URL(frontendUrl);
    } catch {
      throw new Error('Invalid FRONTEND_URL. Set it to a valid HTTP or HTTPS origin.');
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.origin !== frontendUrl.replace(/\/$/, '')) {
      throw new Error('Invalid FRONTEND_URL. Set it to a valid HTTP or HTTPS origin without a path.');
    }
  }

  return { port, nodeEnv, mongodbUri, frontendUrl };
};

module.exports = { loadEnvConfig };
