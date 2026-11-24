const assert = require('node:assert/strict');
const test = require('node:test');

const User = require('../src/models/user.model');

test('User schema normalizes and uniquely indexes email', () => {
  const emailPath = User.schema.path('email');
  const user = new User({
    name: '  Example User  ',
    email: '  USER@Example.COM  ',
    passwordHash: 'hash-value-that-is-never-a-plaintext-password',
  });

  assert.equal(emailPath.options.unique, true);
  assert.equal(emailPath.options.index, true);
  assert.equal(emailPath.options.lowercase, true);
  assert.equal(emailPath.options.trim, true);
  assert.equal(user.email, 'user@example.com');
  assert.equal(user.name, 'Example User');
});

test('User schema requires and excludes passwordHash from normal results and JSON', () => {
  const passwordHashPath = User.schema.path('passwordHash');
  const hash = 'hash-value-that-is-never-a-plaintext-password';
  const user = new User({
    name: 'Example User',
    email: 'user@example.com',
    passwordHash: hash,
  });

  assert.equal(passwordHashPath.isRequired, true);
  assert.equal(passwordHashPath.options.select, false);
  assert.equal(User.schema.options.timestamps, true);
  assert.equal(Object.hasOwn(user.toJSON(), 'passwordHash'), false);
  assert.doesNotMatch(JSON.stringify(user), new RegExp(hash));
});
