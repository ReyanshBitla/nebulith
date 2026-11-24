const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { createApp } = require('../src/server');

const TEST_JWT_SECRET = 'auth-tests-use-this-secret-with-more-than-32-bytes';
const TEST_PASSWORD = 'correct-horse-battery-staple';

const createUserModel = () => {
  const users = [];
  let nextId = 1;

  const makeQuery = (result) => ({
    select() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  });

  return {
    users,
    async create(values) {
      if (users.some((user) => user.email === values.email)) {
        const error = new Error('Duplicate key.');
        error.code = 11000;
        throw error;
      }

      const id = String(nextId).padStart(24, '0');
      nextId += 1;
      const now = new Date();
      const user = {
        _id: id,
        name: values.name,
        email: values.email,
        passwordHash: values.passwordHash,
        createdAt: now,
        updatedAt: now,
      };
      users.push(user);
      return user;
    },
    findOne(filter) {
      return makeQuery(users.find((user) => user.email === filter.email) || null);
    },
    async findById(id) {
      return users.find((user) => user._id === id) || null;
    },
  };
};

const makeApp = (UserModel) => createApp({
  nodeEnv: 'test',
  frontendUrl: null,
  jwtSecret: TEST_JWT_SECRET,
  jwtExpiresIn: '1h',
}, { UserModel });

const withServer = async (app, run) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
};

const postJson = (baseUrl, path, body) => fetch(`${baseUrl}${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('registration normalizes email, hashes the password, and returns a safe profile and JWT', async () => {
  const UserModel = createUserModel();

  await withServer(makeApp(UserModel), async (baseUrl) => {
    const response = await postJson(baseUrl, '/api/auth/register', {
      name: '  Nebulith User  ',
      email: '  USER@Example.COM  ',
      password: TEST_PASSWORD,
    });
    const text = await response.text();
    const body = JSON.parse(text);
    const storedUser = UserModel.users[0];
    const tokenPayload = jwt.decode(body.data.token);

    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.user.name, 'Nebulith User');
    assert.equal(body.data.user.email, 'user@example.com');
    assert.equal(body.data.user.id, storedUser._id);
    assert.equal(storedUser.passwordHash === TEST_PASSWORD, false);
    assert.equal(await bcrypt.compare(TEST_PASSWORD, storedUser.passwordHash), true);
    assert.equal(tokenPayload.sub, storedUser._id);
    assert.equal(jwt.decode(body.data.token, { complete: true }).header.alg, 'HS256');
    assert.equal(Object.hasOwn(body.data.user, 'passwordHash'), false);
    assert.doesNotMatch(text, new RegExp(TEST_PASSWORD));
    assert.doesNotMatch(text, /passwordHash/);
  });
});

test('registration rejects missing fields and malformed request bodies', async () => {
  await withServer(makeApp(createUserModel()), async (baseUrl) => {
    for (const body of [
      {},
      { email: 'user@example.com', password: TEST_PASSWORD },
      { name: 'User', password: TEST_PASSWORD },
      { name: 'User', email: 'user@example.com' },
      null,
      [],
    ]) {
      const response = await postJson(baseUrl, '/api/auth/register', body);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).success, false);
    }
  });
});

test('registration rejects invalid emails, short passwords, and passwords over 72 UTF-8 bytes', async () => {
  await withServer(makeApp(createUserModel()), async (baseUrl) => {
    const invalidRequests = [
      { name: 'User', email: 'not-an-email', password: TEST_PASSWORD },
      { name: 'User', email: 'user@example.com', password: 'short' },
      { name: 'User', email: 'user@example.com', password: '\u00e9'.repeat(37) },
    ];

    for (const body of invalidRequests) {
      const response = await postJson(baseUrl, '/api/auth/register', body);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).success, false);
    }
  });
});

test('registration rejects duplicate normalized emails with HTTP 409', async () => {
  await withServer(makeApp(createUserModel()), async (baseUrl) => {
    const original = await postJson(baseUrl, '/api/auth/register', {
      name: 'User', email: 'user@example.com', password: TEST_PASSWORD,
    });
    const duplicate = await postJson(baseUrl, '/api/auth/register', {
      name: 'Other User', email: ' USER@example.com ', password: TEST_PASSWORD,
    });

    assert.equal(original.status, 201);
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).error.code, 'EMAIL_ALREADY_EXISTS');
  });
});

test('login succeeds with normalized email and returns no password hash', async () => {
  const UserModel = createUserModel();

  await withServer(makeApp(UserModel), async (baseUrl) => {
    await postJson(baseUrl, '/api/auth/register', {
      name: 'User', email: 'user@example.com', password: TEST_PASSWORD,
    });

    const response = await postJson(baseUrl, '/api/auth/login', {
      email: ' USER@EXAMPLE.COM ', password: TEST_PASSWORD,
    });
    const text = await response.text();
    const body = JSON.parse(text);

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.user.email, 'user@example.com');
    assert.equal(typeof body.data.token, 'string');
    assert.doesNotMatch(text, /passwordHash|correct-horse-battery-staple/);
  });
});

test('login uses the same generic response for an incorrect password and unknown email', async () => {
  const UserModel = createUserModel();

  await withServer(makeApp(UserModel), async (baseUrl) => {
    await postJson(baseUrl, '/api/auth/register', {
      name: 'User', email: 'user@example.com', password: TEST_PASSWORD,
    });

    const incorrectPassword = await postJson(baseUrl, '/api/auth/login', {
      email: 'user@example.com', password: 'incorrect-password',
    });
    const unknownEmail = await postJson(baseUrl, '/api/auth/login', {
      email: 'unknown@example.com', password: TEST_PASSWORD,
    });
    const incorrectBody = await incorrectPassword.json();
    const unknownBody = await unknownEmail.json();

    assert.equal(incorrectPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.deepEqual(incorrectBody, unknownBody);
    assert.equal(incorrectBody.error.message, 'Invalid email or password.');
  });
});

test('login rejects missing credentials with HTTP 400', async () => {
  await withServer(makeApp(createUserModel()), async (baseUrl) => {
    for (const body of [{}, { email: 'user@example.com' }, { password: TEST_PASSWORD }]) {
      const response = await postJson(baseUrl, '/api/auth/login', body);
      assert.equal(response.status, 400);
    }
  });
});

test('GET /api/auth/me rejects missing and malformed bearer authorization', async () => {
  await withServer(makeApp(createUserModel()), async (baseUrl) => {
    for (const authorization of [undefined, 'Basic token', 'Bearer token extra']) {
      const headers = authorization ? { authorization } : {};
      const response = await fetch(`${baseUrl}/api/auth/me`, { headers });
      assert.equal(response.status, 401);
    }
  });
});

test('GET /api/auth/me rejects invalid and expired JWTs', async () => {
  const UserModel = createUserModel();
  const invalidToken = 'not-a-jwt';
  const expiredToken = jwt.sign({}, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    subject: '000000000000000000000001',
    expiresIn: -1,
  });
  const wrongAlgorithmToken = jwt.sign({}, TEST_JWT_SECRET, {
    algorithm: 'HS384',
    subject: '000000000000000000000001',
    expiresIn: '1h',
  });
  const invalidSubjectToken = jwt.sign({}, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    subject: 'not-a-user-id',
    expiresIn: '1h',
  });

  await withServer(makeApp(UserModel), async (baseUrl) => {
    for (const token of [invalidToken, expiredToken, wrongAlgorithmToken, invalidSubjectToken]) {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 401);
    }
  });
});

test('GET /api/auth/me rejects a valid token whose user no longer exists', async () => {
  const token = jwt.sign({}, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    subject: '000000000000000000000001',
    expiresIn: '1h',
  });

  await withServer(makeApp(createUserModel()), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 401);
  });
});

test('GET /api/auth/me returns the authenticated safe profile', async () => {
  const UserModel = createUserModel();

  await withServer(makeApp(UserModel), async (baseUrl) => {
    const registration = await postJson(baseUrl, '/api/auth/register', {
      name: 'User', email: 'user@example.com', password: TEST_PASSWORD,
    });
    const { data } = await registration.json();
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${data.token}` },
    });
    const text = await response.text();
    const body = JSON.parse(text);

    assert.equal(response.status, 200);
    assert.deepEqual(body.data.user, data.user);
    assert.equal(Object.hasOwn(body.data.user, 'passwordHash'), false);
    assert.doesNotMatch(text, /passwordHash|correct-horse-battery-staple/);
  });
});
