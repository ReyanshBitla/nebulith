const { createPrivateKey } = require('node:crypto');

const REQUIRED_GITHUB_VARIABLES = [
  'GITHUB_APP_ID',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_PRIVATE_KEY',
  'GITHUB_APP_SLUG',
  'GITHUB_CALLBACK_URL',
];

const loadGithubConfig = (source = process.env) => {
  const missing = REQUIRED_GITHUB_VARIABLES.filter((key) => (
    typeof source[key] !== 'string' || source[key].trim() === ''
  ));
  if (missing.length > 0) {
    throw new Error(`GitHub integration is not configured. Set: ${missing.join(', ')}.`);
  }

  const appId = source.GITHUB_APP_ID.trim();
  if (!/^\d+$/.test(appId)) {
    throw new Error('Invalid GITHUB_APP_ID.');
  }

  const appSlug = source.GITHUB_APP_SLUG.trim();
  if (!/^[A-Za-z0-9-]+$/.test(appSlug)) {
    throw new Error('Invalid GITHUB_APP_SLUG.');
  }

  const privateKey = source.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n').trim();
  let parsedPrivateKey;
  try {
    parsedPrivateKey = createPrivateKey(privateKey);
  } catch {
    throw new Error('Invalid GITHUB_PRIVATE_KEY. Provide a valid GitHub App PEM private key.');
  }
  if (parsedPrivateKey.asymmetricKeyType !== 'rsa' || parsedPrivateKey.asymmetricKeyDetails?.modulusLength < 2048) {
    throw new Error('Invalid GITHUB_PRIVATE_KEY. Provide an RSA key of at least 2048 bits.');
  }

  let callbackUrl;
  try {
    callbackUrl = new URL(source.GITHUB_CALLBACK_URL);
  } catch {
    throw new Error('Invalid GITHUB_CALLBACK_URL. Provide an absolute callback URL.');
  }

  const isDevelopmentLocalhost = source.NODE_ENV === 'development'
    && callbackUrl.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(callbackUrl.hostname);
  if (
    (callbackUrl.protocol !== 'https:' && !isDevelopmentLocalhost)
    || callbackUrl.username
    || callbackUrl.password
    || callbackUrl.search
    || callbackUrl.hash
  ) {
    throw new Error('Invalid GITHUB_CALLBACK_URL. Use HTTPS, or HTTP localhost in development, without credentials, query, or fragment.');
  }

  return {
    appId,
    clientId: source.GITHUB_CLIENT_ID.trim(),
    clientSecret: source.GITHUB_CLIENT_SECRET,
    privateKey,
    appSlug,
    callbackUrl: callbackUrl.toString(),
  };
};

module.exports = { loadGithubConfig, REQUIRED_GITHUB_VARIABLES };
