const crypto = require('node:crypto');
const CodeReview = require('../models/code-review.model');

const isRetryable = (error) => error?.statusCode === 429 || error?.statusCode >= 500
  || error?.code === 'GITHUB_RATE_LIMITED' || error?.code === 'GITHUB_UPSTREAM_ERROR'
  || error?.name === 'FetchError' || error?.name === 'TypeError';
const safeFailureCode = (error) => {
  if (error?.code === 'GITHUB_NOT_CONNECTED') return 'GITHUB_NOT_CONNECTED';
  if (error?.code === 'GITHUB_RATE_LIMITED') return 'GITHUB_RATE_LIMITED';
  if (error?.statusCode === 404 || error?.status === 404) return 'GITHUB_RESOURCE_UNAVAILABLE';
  return isRetryable(error) ? 'TEMPORARY_UPSTREAM_FAILURE' : 'REVIEW_PROCESSING_FAILED';
};

const createReviewWorker = ({
  ReviewModel = CodeReview,
  githubService,
  pollIntervalMs = 1000,
  concurrency = 2,
  leaseMs = 60000,
  maxAttempts = 3,
  now = () => new Date(),
  processPlaceholder = () => new Promise((resolve) => setTimeout(resolve, 500)),
  workerId = `${process.pid}-${crypto.randomUUID()}`,
} = {}) => {
  let stopping = false;
  let loops = [];
  const wakeWaiters = new Set();
  const pause = (ms) => new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); wakeWaiters.delete(finish); resolve(); };
    const timer = setTimeout(finish, ms);
    wakeWaiters.add(finish);
  });
  const recoverExpired = async () => {
    const expired = await ReviewModel.find({ status: 'running', leaseExpiresAt: { $lte: now() } }).select('+lockedBy').limit(50);
    for (const job of expired) {
      if (job.attemptCount >= Math.min(job.maxAttempts, maxAttempts)) {
        await ReviewModel.findOneAndUpdate({ _id: job._id, status: 'running', leaseExpiresAt: { $lte: now() } }, {
          $set: { status: 'failed', failureCode: 'WORKER_LEASE_EXPIRED', completedAt: now() },
          $unset: { activeKey: 1, lockedAt: 1, lockedBy: 1, leaseExpiresAt: 1 },
        });
      } else {
        await ReviewModel.findOneAndUpdate({ _id: job._id, status: 'running', leaseExpiresAt: { $lte: now() } }, {
          $set: { status: 'queued', failureCode: 'WORKER_LEASE_EXPIRED', nextAttemptAt: new Date(now().getTime() + Math.min(30000, 1000 * (2 ** Math.max(0, job.attemptCount - 1)))) },
          $unset: { lockedAt: 1, lockedBy: 1, leaseExpiresAt: 1 },
        });
      }
    }
  };
  const claim = () => ReviewModel.findOneAndUpdate(
    { status: 'queued', nextAttemptAt: { $lte: now() } },
    { $set: { status: 'running', lockedAt: now(), lockedBy: workerId, leaseExpiresAt: new Date(now().getTime() + leaseMs), startedAt: now(), failureCode: null }, $inc: { attemptCount: 1 } },
    { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } },
  );
  const markStale = (job) => ReviewModel.findOneAndUpdate(
    { _id: job._id, status: 'running', lockedBy: workerId },
    { $set: { status: 'stale', completedAt: now() }, $unset: { activeKey: 1, lockedAt: 1, lockedBy: 1, leaseExpiresAt: 1 } },
    { new: true },
  );
  const finishCancelled = (job) => ReviewModel.findOneAndUpdate(
    { _id: job._id, status: 'running', lockedBy: workerId, cancelRequestedAt: { $ne: null } },
    { $set: { status: 'cancelled', completedAt: now() }, $unset: { activeKey: 1, lockedAt: 1, lockedBy: 1, leaseExpiresAt: 1 } },
    { new: true },
  );
  const process = async (job) => {
    const heartbeat = setInterval(() => {
      ReviewModel.findOneAndUpdate(
        { _id: job._id, status: 'running', lockedBy: workerId },
        { $set: { leaseExpiresAt: new Date(now().getTime() + leaseMs) } },
      ).catch(() => {});
    }, Math.max(1000, Math.floor(leaseMs / 3)));
    heartbeat.unref?.();
    try {
    const [, repository] = job.repositoryFullName.split('/');
    const [owner] = job.repositoryFullName.split('/');
    const current = await githubService.getPullRequestForReview(job.ownerUserId, owner, repository, job.pullNumber);
    if (current.repositoryId !== job.githubRepositoryId || current.pullRequest.headSha !== job.headSha) {
      await markStale(job); return;
    }
    if (await finishCancelled(job)) return;
    await processPlaceholder({ reviewId: String(job._id) });
    if (await finishCancelled(job)) return;
    const latest = await githubService.getPullRequestForReview(job.ownerUserId, owner, repository, job.pullNumber);
    if (latest.repositoryId !== job.githubRepositoryId || latest.pullRequest.headSha !== job.headSha) {
      await markStale(job); return;
    }
    await ReviewModel.findOneAndUpdate({ _id: job._id, status: 'running', lockedBy: workerId }, {
      $set: { status: 'completed', summary: null, risk: null, findings: [], resultNotice: 'Infrastructure processing completed. No AI analysis was performed.', completedAt: now() },
      $unset: { activeKey: 1, lockedAt: 1, lockedBy: 1, leaseExpiresAt: 1 },
    });
    } finally {
      clearInterval(heartbeat);
    }
  };
  const fail = async (job, error) => {
    const retryable = isRetryable(error) && job.attemptCount < Math.min(job.maxAttempts, maxAttempts);
    if (retryable) {
      const delay = Math.min(300000, 1000 * (2 ** Math.max(0, job.attemptCount - 1)));
      await ReviewModel.findOneAndUpdate({ _id: job._id, status: 'running', lockedBy: workerId }, {
        $set: { status: 'queued', failureCode: safeFailureCode(error), nextAttemptAt: new Date(now().getTime() + delay) },
        $unset: { lockedAt: 1, lockedBy: 1, leaseExpiresAt: 1 },
      });
      return;
    }
    await ReviewModel.findOneAndUpdate({ _id: job._id, status: 'running', lockedBy: workerId }, {
      $set: { status: 'failed', failureCode: safeFailureCode(error), completedAt: now() },
      $unset: { activeKey: 1, lockedAt: 1, lockedBy: 1, leaseExpiresAt: 1 },
    });
  };
  const loop = async () => {
    while (!stopping) {
      try {
        await recoverExpired();
        const job = await claim();
        if (job) {
          try { await process(job); } catch (error) { await fail(job, error); }
        } else await pause(pollIntervalMs);
      } catch {
        // Keep the worker alive after transient database failures; never log job contents or credentials.
        await pause(pollIntervalMs);
      }
    }
  };
  return {
    start() {
      if (loops.length) return;
      stopping = false;
      loops = Array.from({ length: Math.max(1, Math.min(8, concurrency)) }, () => loop());
    },
    async stop() { stopping = true; Array.from(wakeWaiters).forEach((wake) => wake()); await Promise.all(loops); loops = []; },
    recoverExpired,
    claim,
    processOne: async () => {
      const job = await claim();
      if (!job) return null;
      try { await process(job); } catch (error) { await fail(job, error); }
      return job;
    },
  };
};

module.exports = { createReviewWorker, isRetryable, safeFailureCode };
