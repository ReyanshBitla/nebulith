const { getSafeUserProfile } = require('../services/auth.service');

const createAuthController = (authService) => ({
  register: async (req, res) => {
    const result = await authService.register(req.body || {});
    return res.status(201).json({ success: true, data: result });
  },

  login: async (req, res) => {
    const result = await authService.login(req.body || {});
    return res.status(200).json({ success: true, data: result });
  },

  me: (req, res) => res.status(200).json({
    success: true,
    data: { user: getSafeUserProfile(req.user) },
  }),
});

module.exports = createAuthController;
