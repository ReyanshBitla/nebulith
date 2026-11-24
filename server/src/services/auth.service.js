const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/user.model');
const createHttpError = require('../utils/http-error');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_WORK_FACTOR = 12;

const getSafeUserProfile = (user) => ({
  id: user._id ? user._id.toString() : user.id,
  name: user.name,
  email: user.email,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const normalizeEmail = (value) => {
  if (typeof value !== 'string') {
    throw createHttpError(400, 'VALIDATION_ERROR', 'A valid email address is required.');
  }

  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'A valid email address is required.');
  }

  return email;
};

const validatePassword = (password) => {
  if (typeof password !== 'string') {
    throw createHttpError(400, 'VALIDATION_ERROR', 'A password is required.');
  }
  if ([...password].length < 8) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'Password must be at least 8 characters long.');
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'Password must not exceed 72 UTF-8 bytes.');
  }
};

const createAuthService = ({
  UserModel = User,
  passwordHasher = bcrypt,
  tokenService = jwt,
  jwtSecret,
  jwtExpiresIn = '1h',
}) => {
  const issueToken = (user) => tokenService.sign({}, jwtSecret, {
    algorithm: 'HS256',
    subject: user._id ? user._id.toString() : user.id,
    expiresIn: jwtExpiresIn,
  });

  const register = async (input = {}) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'A valid request body is required.');
    }

    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 100) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Name is required and must not exceed 100 characters.');
    }

    const email = normalizeEmail(input.email);
    validatePassword(input.password);
    const passwordHash = await passwordHasher.hash(input.password, BCRYPT_WORK_FACTOR);

    let user;
    try {
      user = await UserModel.create({ name, email, passwordHash });
    } catch (error) {
      if (error && error.code === 11000) {
        throw createHttpError(409, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists.');
      }
      throw error;
    }

    return { user: getSafeUserProfile(user), token: issueToken(user) };
  };

  const login = async (input = {}) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'A valid request body is required.');
    }

    const email = normalizeEmail(input.email);
    if (typeof input.password !== 'string' || input.password.length === 0) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'A password is required.');
    }
    if (Buffer.byteLength(input.password, 'utf8') > 72) {
      throw createHttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const user = await UserModel.findOne({ email }).select('+passwordHash');
    const passwordMatches = user
      ? await passwordHasher.compare(input.password, user.passwordHash)
      : false;

    if (!user || !passwordMatches) {
      throw createHttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    return { user: getSafeUserProfile(user), token: issueToken(user) };
  };

  return { register, login };
};

module.exports = { createAuthService, getSafeUserProfile };
