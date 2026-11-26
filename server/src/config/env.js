const dotenv = require('dotenv');

const VALID_NODE_ENVS = new Set(['development', 'test', 'production']);
const JWT_EXPIRATION_PATTERN = /^([1-9]\d*)(s|m|h|d|w|y)$/;
const JWT_EXPIRATION_SECONDS = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
  w: 7 * 24 * 60 * 60,
  y: 365 * 24 * 60 * 60,
};
const MAX_JWT_EXPIRATION_SECONDS = 365 * 24 * 60 * 60;

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

  const jwtSecret = source.JWT_SECRET;
  if (typeof jwtSecret !== 'string' || jwtSecret.length === 0) {
    throw new Error('Missing required environment variable: JWT_SECRET.');
  }
  if (
    jwtSecret.trim().length === 0
    || Buffer.byteLength(jwtSecret, 'utf8') < 32
    || new Set(jwtSecret).size < 12
  ) {
    throw new Error('JWT_SECRET must contain at least 32 UTF-8 bytes.');
  }

  const jwtExpiresIn = source.JWT_EXPIRES_IN === undefined ? '1h' : source.JWT_EXPIRES_IN;
  const expirationMatch = typeof jwtExpiresIn === 'string'
    ? JWT_EXPIRATION_PATTERN.exec(jwtExpiresIn)
    : null;
  const expirationSeconds = expirationMatch
    ? Number(expirationMatch[1]) * JWT_EXPIRATION_SECONDS[expirationMatch[2]]
    : NaN;
  if (!Number.isSafeInteger(expirationSeconds) || expirationSeconds > MAX_JWT_EXPIRATION_SECONDS) {
    throw new Error('Invalid JWT_EXPIRES_IN. Use a positive duration up to 365 days, such as 15m, 1h, or 7d.');
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

  const boundedInteger = (key, fallback, min, max) => {
    const value = source[key] === undefined ? fallback : Number(source[key]);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`Invalid ${key}. Set it to a number between ${min} and ${max}.`);
    }
    return value;
  };
  const reviewWorkerPollIntervalMs = boundedInteger('REVIEW_WORKER_POLL_INTERVAL_MS', 1000, 250, 60000);
  const reviewWorkerConcurrency = boundedInteger('REVIEW_WORKER_CONCURRENCY', 2, 1, 8);
  const reviewWorkerLeaseMs = boundedInteger('REVIEW_WORKER_LEASE_MS', 60000, 5000, 3600000);
  const reviewMaxAttempts = boundedInteger('REVIEW_MAX_ATTEMPTS', 3, 1, 5);

  return { port, nodeEnv, mongodbUri, frontendUrl, jwtSecret, jwtExpiresIn,
    reviewWorkerPollIntervalMs, reviewWorkerConcurrency, reviewWorkerLeaseMs, reviewMaxAttempts };
};

module.exports = { loadEnvConfig };
