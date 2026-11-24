const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const express = require('express');
const mongoose = require('mongoose');

const { createApp } = require('../src/server');
const errorHandler = require('../src/middleware/error-handler');

const startServer = async (app) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
};

const withServer = async (app, run) => {
  const server = await startServer(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
};

const makeApp = (nodeEnv = 'test', frontendUrl = null) => createApp({
  nodeEnv,
  frontendUrl,
  jwtSecret: 'test-secret-with-more-than-32-characters',
  jwtExpiresIn: '1h',
});

test('GET /api/health returns the structured healthy response without secrets', async () => {
  const originalReadyState = mongoose.connection.readyState;
  mongoose.connection.readyState = 1;

  try {
    await withServer(makeApp(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/health`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(Object.keys(body).sort(), ['api', 'application', 'database', 'success', 'timestamp']);
      assert.equal(body.success, true);
      assert.equal(body.application, 'NEBULITH');
      assert.deepEqual(body.api, { status: 'healthy' });
      assert.deepEqual(body.database, { status: 'connected' });
      assert.ok(Number.isFinite(Date.parse(body.timestamp)));
      assert.doesNotMatch(JSON.stringify(body), /mongodb(?:\+srv)?:\/\/|password|credential|secret/i);
    });
  } finally {
    mongoose.connection.readyState = originalReadyState;
  }
});

test('GET /api/health reports a disconnected database with HTTP 503', async () => {
  const originalReadyState = mongoose.connection.readyState;
  mongoose.connection.readyState = 0;

  try {
    await withServer(makeApp(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/health`);
      const body = await response.json();

      assert.equal(response.status, 503);
      assert.equal(body.success, false);
      assert.deepEqual(body.api, { status: 'degraded' });
      assert.deepEqual(body.database, { status: 'disconnected' });
    });
  } finally {
    mongoose.connection.readyState = originalReadyState;
  }
});

test('GET / returns the welcome response', async () => {
  await withServer(makeApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      application: 'NEBULITH',
      message: 'Welcome to NEBULITH API!',
      status: 'running',
    });
  });
});

test('unknown routes return a consistent 404 response without echoing query values', async () => {
  await withServer(makeApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/unknown?token=do-not-echo`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { message: 'Route not found.', code: 'NOT_FOUND' },
    });
  });
});

test('central error handling preserves appropriate client status codes', async () => {
  const app = express();
  app.locals.nodeEnv = 'test';
  app.get('/invalid', (req, res, next) => {
    const error = new Error('Invalid input.');
    error.statusCode = 422;
    error.code = 'INVALID_INPUT';
    next(error);
  });
  app.use(errorHandler);

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/invalid`);

    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { message: 'Invalid input.', code: 'INVALID_INPUT' },
    });
  });
});

test('Express 5 forwards async errors and production responses hide internals', async () => {
  const app = express();
  app.locals.nodeEnv = 'production';
  app.get('/async-failure', async () => {
    const error = new Error('internal database credential detail');
    error.statusCode = 503;
    throw error;
  });
  app.use(errorHandler);

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/async-failure`);
    const text = await response.text();
    const body = JSON.parse(text);

    assert.equal(response.status, 503);
    assert.deepEqual(body, {
      success: false,
      error: { message: 'An unexpected error occurred.', code: 'REQUEST_ERROR' },
    });
    assert.doesNotMatch(text, /internal database credential detail|stack|Error:/i);
  });
});

test('development CORS accepts the default localhost origin', async () => {
  await withServer(makeApp('development'), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`, {
      headers: { Origin: 'http://localhost:5173' },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  });
});

test('development CORS accepts the default loopback origin', async () => {
  await withServer(makeApp('development'), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`, {
      headers: { Origin: 'http://127.0.0.1:5173' },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
  });
});

test('CORS accepts the configured frontend origin in production', async () => {
  const frontendUrl = 'https://frontend.nebulith.example';

  await withServer(makeApp('production', frontendUrl), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`, {
      headers: { Origin: frontendUrl },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), frontendUrl);
  });
});

test('CORS rejects an untrusted production origin', async () => {
  await withServer(makeApp('production', 'https://frontend.nebulith.example'), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`, {
      headers: { Origin: 'https://untrusted.example' },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { message: 'Access denied.', code: 'REQUEST_ERROR' },
    });
  });
});

test('requests without an Origin header are not blocked by CORS', async () => {
  await withServer(makeApp('production', 'https://frontend.nebulith.example'), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);

    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });
});
