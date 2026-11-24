const assert = require('node:assert/strict');
const test = require('node:test');

const { loadEnvConfig } = require('../src/config/env');

const validEnvironment = {
  PORT: '5000',
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/nebulith_test',
  FRONTEND_URL: 'https://frontend.nebulith.example',
};

test('valid environment configuration is accepted', () => {
  assert.deepEqual(loadEnvConfig(validEnvironment), {
    port: 5000,
    nodeEnv: 'test',
    mongodbUri: validEnvironment.MONGODB_URI,
    frontendUrl: validEnvironment.FRONTEND_URL,
  });
});

test('invalid ports are rejected', () => {
  for (const port of ['', '0', '65536', '-1', 'abc', '5000.5']) {
    assert.throws(
      () => loadEnvConfig({ ...validEnvironment, PORT: port }),
      /Invalid PORT/,
    );
  }
});

test('unsupported NODE_ENV values are rejected without echoing them', () => {
  const unsupportedValue = 'do-not-echo-this-value';

  assert.throws(
    () => loadEnvConfig({ ...validEnvironment, NODE_ENV: unsupportedValue }),
    (error) => {
      assert.match(error.message, /Invalid NODE_ENV/);
      assert.doesNotMatch(error.message, new RegExp(unsupportedValue));
      return true;
    },
  );
});

test('missing MONGODB_URI is rejected', () => {
  const { MONGODB_URI, ...missingDatabaseUri } = validEnvironment;
  void MONGODB_URI;

  assert.throws(() => loadEnvConfig(missingDatabaseUri), /Missing required environment variable: MONGODB_URI/);
});

test('malformed MONGODB_URI is rejected without exposing its contents', () => {
  const malformedUri = 'https://username:do-not-echo-this-secret@example.invalid/database';

  assert.throws(
    () => loadEnvConfig({ ...validEnvironment, MONGODB_URI: malformedUri }),
    (error) => {
      assert.match(error.message, /Invalid MONGODB_URI/);
      assert.doesNotMatch(error.message, /username|do-not-echo-this-secret|example\.invalid/);
      return true;
    },
  );
});

test('invalid FRONTEND_URL values are rejected without echoing them', () => {
  for (const frontendUrl of ['not-a-url', 'javascript:alert(1)', 'https://frontend.example/path']) {
    assert.throws(
      () => loadEnvConfig({ ...validEnvironment, FRONTEND_URL: frontendUrl }),
      (error) => {
        assert.match(error.message, /Invalid FRONTEND_URL/);
        assert.doesNotMatch(error.message, /alert|frontend\.example\/path/);
        return true;
      },
    );
  }
});
