const express = require('express');

const createAuthController = require('../controllers/auth.controller');
const createAuthenticate = require('../middleware/authenticate');
const { createAuthService } = require('../services/auth.service');

const createAuthRouter = (dependencies) => {
  const router = express.Router();
  const authService = createAuthService(dependencies);
  const controller = createAuthController(authService);
  const authenticate = createAuthenticate(dependencies);

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.get('/me', authenticate, controller.me);

  return router;
};

module.exports = createAuthRouter;
