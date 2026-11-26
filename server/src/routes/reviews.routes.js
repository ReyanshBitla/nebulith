const express = require('express');
const createReviewController = require('../controllers/review.controller');
const createAuthenticate = require('../middleware/authenticate');
const { createGithubService } = require('../services/github.service');
const { createReviewService } = require('../services/review.service');

const createReviewsRouter = (dependencies = {}) => {
  const router = express.Router();
  const githubService = dependencies.githubService || createGithubService(dependencies);
  const reviewService = dependencies.reviewService || createReviewService({
    ReviewModel: dependencies.ReviewModel,
    githubService,
    now: dependencies.now,
    maxAttempts: dependencies.reviewMaxAttempts,
  });
  const controller = createReviewController(reviewService);
  const authenticate = createAuthenticate(dependencies);
  router.post('/', authenticate, controller.create);
  router.get('/', authenticate, controller.list);
  router.get('/:reviewId', authenticate, controller.get);
  router.post('/:reviewId/retry', authenticate, controller.retry);
  router.post('/:reviewId/cancel', authenticate, controller.cancel);
  return router;
};

module.exports = createReviewsRouter;
