const jwt = require('jsonwebtoken');

const User = require('../models/user.model');
const createHttpError = require('../utils/http-error');

const unauthorized = () => createHttpError(401, 'UNAUTHORIZED', 'Authentication is required.');

const createAuthenticate = ({ UserModel = User, tokenService = jwt, jwtSecret }) => async (req, res, next) => {
  const authorization = req.get('authorization');
  const match = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+([^\s]+)$/i)
    : null;

  if (!match) {
    return next(unauthorized());
  }

  let payload;
  try {
    payload = tokenService.verify(match[1], jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return next(unauthorized());
  }

  if (!payload || typeof payload !== 'object' || typeof payload.sub !== 'string' || !/^[a-f\d]{24}$/i.test(payload.sub)) {
    return next(unauthorized());
  }

  let user;
  try {
    user = await UserModel.findById(payload.sub);
  } catch (error) {
    return next(error);
  }

  if (!user) {
    return next(unauthorized());
  }

  req.user = user;
  return next();
};

module.exports = createAuthenticate;
