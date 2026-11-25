const express = require('express');

const createGithubController = require('../controllers/github.controller').createGithubController;
const createAuthenticate = require('../middleware/authenticate');
const { createGithubService } = require('../services/github.service');

const createGithubRouter = (dependencies = {}) => {
  const router = express.Router();
  const githubService = createGithubService(dependencies);
  const controller = createGithubController(githubService);
  const authenticate = createAuthenticate(dependencies);

  router.get('/connect', authenticate, controller.startConnection);
  router.get('/callback', controller.callback);
  router.get('/status', authenticate, controller.status);
  router.get('/installations/pending', authenticate, controller.pendingInstallations);
  router.post('/installations/:installationId/select', authenticate, controller.selectInstallation);
  router.get('/repositories', authenticate, controller.listRepositories);
  router.get('/repositories/:owner/:repo/commits', authenticate, controller.listCommits);
  router.get('/repositories/:owner/:repo/commits/:sha', authenticate, controller.commitDetails);
  router.get('/repositories/:owner/:repo/commit-activity', authenticate, controller.commitActivity);
  router.get('/repositories/:owner/:repo', authenticate, controller.repositoryDetails);
  router.delete('/connection', authenticate, controller.disconnect);

  return router;
};

module.exports = createGithubRouter;
