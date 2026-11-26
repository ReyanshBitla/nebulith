const crypto = require('node:crypto');
const CodeReview = require('../models/code-review.model');
const createHttpError = require('../utils/http-error');

const PROFILE_VERSION = 'v5.2-placeholder';
const MAX_ATTEMPTS = 3;
const MAX_PAGE_SIZE = 50;
const MAX_USER_ACTIVE = 5;
const idOf = (value) => String(value?._id ?? value);
const isDuplicate = (error) => error?.code === 11000;
const fingerprint = (values) => crypto.createHash('sha256').update(values.join(':')).digest('hex');
const serialize = (doc) => doc?.toJSON ? doc.toJSON() : doc;

const createReviewService = ({ ReviewModel = CodeReview, githubService, now = () => new Date(), maxAttempts = MAX_ATTEMPTS }) => {
  const requestReview = async (userId, { owner, repository, pullNumber, rerun = false }) => {
    if (!Number.isSafeInteger(pullNumber) || pullNumber < 1 || pullNumber > 2147483647
      || typeof owner !== 'string' || typeof repository !== 'string'
      || owner.length > 100 || repository.length > 100
      || !/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?$/.test(owner)
      || !/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?$/.test(repository)
      || typeof rerun !== 'boolean') {
      throw createHttpError(400, 'INVALID_REVIEW_REQUEST', 'Provide a valid repository, pull request number and rerun flag.');
    }
    const prInfo = await githubService.getPullRequestForReview(userId, owner, repository, pullNumber);
    const { pullRequest: pr } = prInfo;
    const rev = fingerprint([idOf(userId), prInfo.repositoryId, pullNumber, pr.headSha, PROFILE_VERSION]);
    const activeKey = rev;
    const existingActive = await ReviewModel.findOne({ ownerUserId: userId, activeKey });
    if (existingActive) return { review: serialize(existingActive), reused: true };
    const latest = await ReviewModel.findOne({ ownerUserId: userId, requestFingerprint: rev }).sort({ generation: -1 });
    if (latest && (!rerun || ['queued', 'running'].includes(latest.status))) return { review: serialize(latest), reused: true };
    if (latest && !['completed', 'failed', 'stale', 'cancelled'].includes(latest.status)) {
      throw createHttpError(409, 'REVIEW_RERUN_NOT_ALLOWED', 'This review cannot be rerun in its current state.');
    }
    if (latest && rerun && now().getTime() - new Date(latest.createdAt).getTime() < 30000) {
      throw createHttpError(429, 'REVIEW_RERUN_COOLDOWN', 'Wait briefly before requesting another run for this pull request.');
    }
    const recentRequests = await ReviewModel.countDocuments({ ownerUserId: userId, createdAt: { $gte: new Date(now().getTime() - 60000) } });
    if (recentRequests >= 10) throw createHttpError(429, 'REVIEW_REQUEST_RATE_LIMIT', 'Too many review requests. Wait a minute and try again.');
    const activeCount = await ReviewModel.countDocuments({ ownerUserId: userId, status: { $in: ['queued', 'running'] } });
    if (activeCount >= MAX_USER_ACTIVE) throw createHttpError(429, 'REVIEW_QUEUE_LIMIT', 'Too many reviews are already queued. Wait for one to finish.');
    const generation = latest ? latest.generation + 1 : 1;
    try {
      const review = await ReviewModel.create({
        ownerUserId: userId, githubRepositoryId: prInfo.repositoryId,
        repositoryFullName: prInfo.repositoryFullName, pullNumber, pullRequestTitle: pr.title,
        baseSha: pr.baseSha, headSha: pr.headSha, reviewProfileVersion: PROFILE_VERSION,
        requestFingerprint: rev, generation, activeKey, maxAttempts: MAX_ATTEMPTS,
        nextAttemptAt: now(), status: 'queued', findings: [], summary: null, risk: null, maxAttempts,
      });
      return { review: serialize(review), reused: false };
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      const reserved = await ReviewModel.findOne({ ownerUserId: userId, activeKey });
      if (reserved) return { review: serialize(reserved), reused: true };
      const sameGeneration = await ReviewModel.findOne({ ownerUserId: userId, requestFingerprint: rev, generation });
      if (sameGeneration) return { review: serialize(sameGeneration), reused: true };
      throw createHttpError(409, 'REVIEW_RESERVATION_CONFLICT', 'A review request is already being created. Please retry.');
    }
  };

  const listReviews = async (userId, { page = 1, perPage = 20, status, repositoryId, pullNumber } = {}) => {
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > MAX_PAGE_SIZE) {
      throw createHttpError(400, 'INVALID_PAGINATION', 'Review pagination is invalid.');
    }
    const filter = { ownerUserId: userId };
    if (status !== undefined) {
      if (!['queued', 'running', 'completed', 'failed', 'stale', 'cancelled'].includes(status)) throw createHttpError(400, 'INVALID_REVIEW_STATUS', 'Review status is invalid.');
      filter.status = status;
    }
    if (repositoryId !== undefined) {
      if (!/^\d{1,30}$/.test(repositoryId)) throw createHttpError(400, 'INVALID_REPOSITORY_FILTER', 'Repository filter is invalid.');
      filter.githubRepositoryId = repositoryId;
    }
    if (pullNumber !== undefined) {
      const parsed = Number(pullNumber);
      if (!Number.isSafeInteger(parsed) || parsed < 1) throw createHttpError(400, 'INVALID_PULL_NUMBER', 'Pull request filter is invalid.');
      filter.pullNumber = parsed;
    }
    const [reviews, total] = await Promise.all([
      ReviewModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * perPage).limit(perPage),
      ReviewModel.countDocuments(filter),
    ]);
    return { reviews: reviews.map(serialize), pagination: { page, perPage, total, hasNext: page * perPage < total } };
  };

  const getOwned = async (userId, reviewId) => {
    if (!/^[a-f\d]{24}$/i.test(reviewId)) throw createHttpError(404, 'REVIEW_NOT_FOUND', 'Review not found.');
    const review = await ReviewModel.findOne({ _id: reviewId, ownerUserId: userId });
    if (!review) throw createHttpError(404, 'REVIEW_NOT_FOUND', 'Review not found.');
    return review;
  };

  const retry = async (userId, reviewId) => {
    const review = await getOwned(userId, reviewId);
    if (!['failed', 'stale'].includes(review.status) || review.attemptCount >= review.maxAttempts) {
      throw createHttpError(409, 'REVIEW_RETRY_NOT_ALLOWED', 'This review is not eligible for retry.');
    }
    const prInfo = await githubService.getPullRequestForReview(userId, ...review.repositoryFullName.split('/'), review.pullNumber);
    if (prInfo.repositoryId !== review.githubRepositoryId || prInfo.pullRequest.headSha !== review.headSha) {
      await ReviewModel.findOneAndUpdate({ _id: review._id, ownerUserId: userId, status: review.status }, {
        $set: { status: 'stale', completedAt: now() }, $unset: { activeKey: 1 },
      });
      throw createHttpError(409, 'REVIEW_REVISION_CHANGED', 'The pull request changed. Request a review for its current revision.');
    }
    const existing = await ReviewModel.findOne({ ownerUserId: userId, activeKey: review.requestFingerprint });
    if (existing) return { review: serialize(existing), reused: true };
    try {
      const updated = await ReviewModel.findOneAndUpdate({ _id: review._id, ownerUserId: userId, status: review.status }, {
        $set: { status: 'queued', failureCode: null, nextAttemptAt: now(), activeKey: review.requestFingerprint,
          lockedAt: null, lockedBy: null, leaseExpiresAt: null, completedAt: null, cancelRequestedAt: null },
      }, { new: true });
      if (updated) return { review: serialize(updated), reused: false };
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      const active = await ReviewModel.findOne({ ownerUserId: userId, activeKey: review.requestFingerprint });
      if (active) return { review: serialize(active), reused: true };
      throw createHttpError(409, 'REVIEW_RETRY_CONFLICT', 'A review state changed while retrying. Refresh and try again.');
    }
    const current = await getOwned(userId, reviewId);
    if (['queued', 'running'].includes(current.status)) return { review: serialize(current), reused: true };
    throw createHttpError(409, 'REVIEW_RETRY_CONFLICT', 'A review state changed while retrying. Refresh and try again.');
  };

  const cancel = async (userId, reviewId) => {
    const review = await getOwned(userId, reviewId);
    if (review.status === 'queued') {
      const updated = await ReviewModel.findOneAndUpdate(
        { _id: review._id, ownerUserId: userId, status: 'queued' },
        { $set: { status: 'cancelled', completedAt: now() }, $unset: { activeKey: 1 } }, { new: true },
      );
      if (updated) return { review: serialize(updated), cancelRequested: false };
      return cancel(userId, reviewId);
    }
    if (review.status === 'running') {
      const updated = await ReviewModel.findOneAndUpdate({ _id: review._id, ownerUserId: userId, status: 'running' }, {
        $set: { cancelRequestedAt: now() },
      }, { new: true });
      if (updated) return { review: serialize(updated), cancelRequested: true };
      const current = await getOwned(userId, reviewId);
      if (current.status === 'queued') return cancel(userId, reviewId);
      throw createHttpError(409, 'REVIEW_CANCELLATION_NOT_ALLOWED', 'This review can no longer be cancelled.');
    }
    throw createHttpError(409, 'REVIEW_CANCELLATION_NOT_ALLOWED', 'This review can no longer be cancelled.');
  };
  return { requestReview, listReviews, getOwned, retry, cancel };
};

module.exports = { createReviewService, PROFILE_VERSION, MAX_ATTEMPTS, MAX_PAGE_SIZE };
