const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const test = require('node:test');

const { loadGithubConfig, REQUIRED_GITHUB_VARIABLES } = require('../src/config/github');

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const validGithubEnvironment = {
  NODE_ENV: 'test',
  GITHUB_APP_ID: '123456',
  GITHUB_CLIENT_ID: 'Iv1.test-client-id',
  GITHUB_CLIENT_SECRET: 'test-client-secret',
  GITHUB_PRIVATE_KEY: privateKey,
  GITHUB_APP_SLUG: 'nebulith-app',
  GITHUB_CALLBACK_URL: 'https://api.nebulith.example/api/github/callback',
};

test('valid GitHub App configuration is accepted and escaped PEM newlines are normalized', () => {
  const escapedPem = privateKey.replace(/\n/g, '\\n');
  const config = loadGithubConfig({ ...validGithubEnvironment, GITHUB_PRIVATE_KEY: escapedPem });

  assert.equal(config.appId, '123456');
  assert.equal(config.clientId, 'Iv1.test-client-id');
  assert.equal(config.appSlug, 'nebulith-app');
  assert.equal(config.callbackUrl, validGithubEnvironment.GITHUB_CALLBACK_URL);
  assert.equal(config.privateKey.includes('\n'), true);
});

test('GitHub configuration is optional unless loaded for integration use', () => {
  assert.deepEqual(REQUIRED_GITHUB_VARIABLES, [
    'GITHUB_APP_ID',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'GITHUB_PRIVATE_KEY',
    'GITHUB_APP_SLUG',
    'GITHUB_CALLBACK_URL',
  ]);
  assert.throws(() => loadGithubConfig({}), /GitHub integration is not configured/);
});

test('invalid GitHub settings are rejected without echoing their values', () => {
  assert.throws(() => loadGithubConfig({ ...validGithubEnvironment, GITHUB_APP_ID: 'do-not-echo' }), (error) => {
    assert.match(error.message, /Invalid GITHUB_APP_ID/);
    assert.doesNotMatch(error.message, /do-not-echo/);
    return true;
  });

  assert.throws(() => loadGithubConfig({ ...validGithubEnvironment, GITHUB_PRIVATE_KEY: 'private-secret-value' }), (error) => {
    assert.match(error.message, /Invalid GITHUB_PRIVATE_KEY/);
    assert.doesNotMatch(error.message, /private-secret-value/);
    return true;
  });

  assert.throws(() => loadGithubConfig({ ...validGithubEnvironment, GITHUB_APP_SLUG: 'https://evil.example' }), /Invalid GITHUB_APP_SLUG/);
});

test('GitHub callback URL must be fixed HTTPS outside local development', () => {
  assert.throws(
    () => loadGithubConfig({ ...validGithubEnvironment, GITHUB_CALLBACK_URL: 'http://api.nebulith.example/callback' }),
    /Invalid GITHUB_CALLBACK_URL/,
  );
  assert.throws(
    () => loadGithubConfig({ ...validGithubEnvironment, GITHUB_CALLBACK_URL: 'https://api.nebulith.example/callback?next=https://evil.example' }),
    /Invalid GITHUB_CALLBACK_URL/,
  );
  assert.equal(loadGithubConfig({
    ...validGithubEnvironment,
    NODE_ENV: 'development',
    GITHUB_CALLBACK_URL: 'http://localhost:5000/api/github/callback',
  }).callbackUrl, 'http://localhost:5000/api/github/callback');
});
