const assert = require('node:assert/strict');
const test = require('node:test');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/server');
const { createReviewService } = require('../src/services/review.service');
const { createReviewWorker, isRetryable, safeFailureCode } = require('../src/services/review-worker');
const CodeReview = require('../src/models/code-review.model');

const USER = '000000000000000000000001';
const OTHER = '000000000000000000000002';
const SECRET = 'review-tests-use-a-secret-of-at-least-thirty-two-bytes';
const PR = { number: 5, title: 'A change', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40) };

const matches = (record, filter) => Object.entries(filter).every(([key, expected]) => {
  if (expected && typeof expected === 'object' && '$gte' in expected) return record[key] >= expected.$gte;
  if (expected && typeof expected === 'object' && '$in' in expected) return expected.$in.includes(record[key]);
  if (expected && typeof expected === 'object' && '$lte' in expected) return record[key] <= expected.$lte;
  if (expected && typeof expected === 'object' && '$ne' in expected) return record[key] !== expected.$ne;
  return String(record[key]) === String(expected);
});

const createModel = (seed = []) => {
  const records = seed;
  records.forEach((record) => { if (record.cancelRequestedAt === undefined) record.cancelRequestedAt = null; });
  let sequence = 1;
  const query = (items, single = false) => ({
    sort: () => query(items.sort((a, b) => (b.generation || 0) - (a.generation || 0)), single),
    skip: (offset) => query(items.slice(offset), false), limit: (count) => query(items.slice(0, count), false),
    select: () => query(items, false),
    then: (resolve, reject) => Promise.resolve(single ? (items[0] || null) : items).then(resolve, reject),
  });
  return Object.assign(async () => {}, {
    records,
    findOne(filter) { return query(records.filter((record) => matches(record, filter)), true); },
    find(filter) { return query(records.filter((record) => matches(record, filter))); },
    async countDocuments(filter) { return records.filter((record) => matches(record, filter)).length; },
    async create(values) {
      if (records.some((record) => record.activeKey && record.activeKey === values.activeKey)) {
        const error = new Error('duplicate'); error.code = 11000; throw error;
      }
      const record = { cancelRequestedAt: null, ...values, _id: String(sequence++).padStart(24, '0'), createdAt: new Date('2026-01-01T00:00:00Z'), save: async () => record };
      records.push(record); return record;
    },
    async findOneAndUpdate(filter, update) {
      const record = records.find((item) => matches(item, filter));
      if (!record) return null;
      Object.assign(record, update.$set || {});
      for (const key of Object.keys(update.$unset || {})) delete record[key];
      if (update.$inc) for (const [key, value] of Object.entries(update.$inc)) record[key] = (record[key] || 0) + value;
      return record;
    },
  });
};

const github = {
  async getPullRequestForReview(_user, owner, repo) {
    return { repositoryId: '72', repositoryFullName: `${owner}/${repo}`, pullRequest: { ...PR } };
  },
};

test('review requests use authoritative GitHub revision and repeated requests reuse the active job', async () => {
  const Model = createModel();
  const service = createReviewService({ ReviewModel: Model, githubService: github });
  const first = await service.requestReview(USER, { owner: 'acme', repository: 'project', pullNumber: 5 });
  const second = await service.requestReview(USER, { owner: 'acme', repository: 'project', pullNumber: 5 });
  assert.equal(first.review.headSha, PR.headSha);
  assert.equal(first.review.status, 'queued');
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(Model.records.length, 1);
});

test('concurrent review submissions reserve only one active job for the same revision', async () => {
  const Model = createModel();
  const service = createReviewService({ ReviewModel: Model, githubService: github });
  const results = await Promise.all([
    service.requestReview(USER, { owner: 'acme', repository: 'project', pullNumber: 5 }),
    service.requestReview(USER, { owner: 'acme', repository: 'project', pullNumber: 5 }),
  ]);
  assert.equal(Model.records.length, 1);
  assert.equal(results.filter((result) => !result.reused).length, 1);
});

test('different authenticated users receive separate review records and cannot read another user record', async () => {
  const Model = createModel();
  const service = createReviewService({ ReviewModel: Model, githubService: github });
  const { review } = await service.requestReview(USER, { owner: 'acme', repository: 'project', pullNumber: 5 });
  await assert.rejects(service.getOwned(OTHER, review._id), (error) => error.statusCode === 404);
});

test('queued reviews can be cancelled and running reviews receive a cooperative cancellation request', async () => {
  const queued = { _id: '000000000000000000000010', ownerUserId: USER, status: 'queued', activeKey: 'q' };
  const running = { _id: '000000000000000000000011', ownerUserId: USER, status: 'running', activeKey: 'r' };
  const Model = createModel([queued, running]);
  const service = createReviewService({ ReviewModel: Model, githubService: github });
  const stopped = await service.cancel(USER, queued._id);
  const requested = await service.cancel(USER, running._id);
  assert.equal(stopped.review.status, 'cancelled');
  assert.equal(stopped.cancelRequested, false);
  assert.equal(requested.review.status, 'running');
  assert.equal(requested.cancelRequested, true);
  assert.ok(running.cancelRequestedAt);
});

test('an explicit rerun creates a new generation after a terminal record', async () => {
  const Model = createModel();
  const service = createReviewService({ ReviewModel: Model, githubService: github, now: () => new Date('2026-01-02T00:00:00Z') });
  const first = await service.requestReview(USER, { owner: 'acme', repository: 'project', pullNumber: 5 });
  first.review.status = 'completed'; first.review.activeKey = undefined;
  const rerun = await service.requestReview(USER, { owner: 'acme', repository: 'project', pullNumber: 5, rerun: true });
  assert.equal(rerun.reused, false);
  assert.equal(rerun.review.generation, 2);
});

test('request validation rejects invalid PRs and unsupported rerun types', async () => {
  const service = createReviewService({ ReviewModel: createModel(), githubService: github });
  await assert.rejects(service.requestReview(USER, { owner: 'acme', repository: 'repo', pullNumber: 0 }), (error) => error.statusCode === 400);
  await assert.rejects(service.requestReview(USER, { owner: 'acme', repository: 'repo', pullNumber: 5, rerun: 'yes' }), (error) => error.statusCode === 400);
});

test('review listing validates bounded pagination and status filters', async () => {
  const service = createReviewService({ ReviewModel: createModel(), githubService: github });
  await assert.rejects(service.listReviews(USER, { page: 0 }), (error) => error.statusCode === 400);
  await assert.rejects(service.listReviews(USER, { perPage: 1000 }), (error) => error.statusCode === 400);
  await assert.rejects(service.listReviews(USER, { status: 'analyzing' }), (error) => error.statusCode === 400);
});

test('review schema validates lifecycle status and declares active reservation and worker indexes', async () => {
  const valid = new CodeReview({
    ownerUserId: USER, githubRepositoryId: '72', repositoryFullName: 'acme/project', pullNumber: 5,
    pullRequestTitle: 'A change', baseSha: PR.baseSha, headSha: PR.headSha,
    reviewProfileVersion: 'v5.2-placeholder', requestFingerprint: 'fingerprint', status: 'queued',
  });
  await valid.validate();
  const publicRecord = valid.toJSON();
  assert.equal('ownerUserId' in publicRecord, false);
  assert.equal('requestFingerprint' in publicRecord, false);
  assert.equal('lockedAt' in publicRecord, false);
  const invalid = new CodeReview({ status: 'analyzing' });
  await assert.rejects(invalid.validate(), (error) => Boolean(error.errors.status));
  const indexes = CodeReview.schema.indexes();
  assert.ok(indexes.some(([spec, options]) => spec.activeKey === 1 && options.unique && options.sparse));
  assert.ok(indexes.some(([spec, options]) => spec.requestFingerprint === 1 && options.unique));
  assert.ok(indexes.some(([spec]) => spec.status === 1 && spec.nextAttemptAt === 1));
});

test('worker atomically claims one due queued job and increments the bounded attempt counter', async () => {
  const job = { _id: 'r1', status: 'queued', nextAttemptAt: new Date('2026-01-01T00:00:00Z'), attemptCount: 0 };
  const Model = createModel([job]);
  const worker = createReviewWorker({ ReviewModel: Model, githubService: github, now: () => new Date('2026-01-01T00:00:01Z') });
  const claimed = await worker.claim();
  assert.equal(claimed.status, 'running');
  assert.equal(claimed.attemptCount, 1);
  assert.equal(claimed.lockedBy.startsWith(`${process.pid}-`), true);
  assert.equal(await worker.claim(), null);
});

test('worker retries only transient failures and maps errors to safe codes', () => {
  assert.equal(isRetryable({ statusCode: 503 }), true);
  assert.equal(isRetryable({ statusCode: 404 }), false);
  assert.equal(safeFailureCode({ statusCode: 404, message: 'private repository URL' }), 'GITHUB_RESOURCE_UNAVAILABLE');
  assert.equal(safeFailureCode({ statusCode: 503, message: 'sensitive upstream body' }), 'TEMPORARY_UPSTREAM_FAILURE');
});

test('expired worker leases are recovered with backoff or permanently failed after the attempt bound', async () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const retryJob = { _id: 'retry', status: 'running', leaseExpiresAt: new Date(now.getTime() - 1), attemptCount: 1, maxAttempts: 3 };
  const exhausted = { _id: 'dead', status: 'running', leaseExpiresAt: new Date(now.getTime() - 1), attemptCount: 3, maxAttempts: 3 };
  const Model = createModel([retryJob, exhausted]);
  const worker = createReviewWorker({ ReviewModel: Model, githubService: github, now: () => now });
  await worker.recoverExpired();
  assert.equal(retryJob.status, 'queued');
  assert.ok(retryJob.nextAttemptAt > now);
  assert.equal(exhausted.status, 'failed');
  assert.equal(exhausted.failureCode, 'WORKER_LEASE_EXPIRED');
});

test('worker marks a revision stale and avoids processing an outdated head SHA', async () => {
  const job = { _id: 'stale', ownerUserId: USER, githubRepositoryId: '72', repositoryFullName: 'acme/project', pullNumber: 5, headSha: 'c'.repeat(40), status: 'queued', nextAttemptAt: new Date(0), attemptCount: 0, maxAttempts: 3 };
  const Model = createModel([job]);
  let placeholderCalls = 0;
  const worker = createReviewWorker({
    ReviewModel: Model,
    githubService: github,
    workerId: 'worker',
    processPlaceholder: async () => { placeholderCalls += 1; },
  });
  await worker.processOne();
  assert.equal(job.status, 'stale');
  assert.equal(placeholderCalls, 0);
});

test('worker completes infrastructure processing without fabricating AI findings', async () => {
  const job = { _id: 'complete', ownerUserId: USER, githubRepositoryId: '72', repositoryFullName: 'acme/project', pullNumber: 5, headSha: PR.headSha, status: 'queued', nextAttemptAt: new Date(0), attemptCount: 0, maxAttempts: 3, findings: [] };
  const Model = createModel([job]);
  const worker = createReviewWorker({ ReviewModel: Model, githubService: github, workerId: 'worker', processPlaceholder: async () => {} });
  await worker.processOne();
  assert.equal(job.status, 'completed');
  assert.equal(job.summary, null);
  assert.equal(job.risk, null);
  assert.deepEqual(job.findings, []);
  assert.match(job.resultNotice, /No AI analysis was performed/);
});

test('worker rechecks the GitHub head after placeholder processing and marks changed revisions stale', async () => {
  const job = { _id: 'changed', ownerUserId: USER, githubRepositoryId: '72', repositoryFullName: 'acme/project', pullNumber: 5, headSha: PR.headSha, status: 'queued', nextAttemptAt: new Date(0), attemptCount: 0, maxAttempts: 3, findings: [] };
  const Model = createModel([job]);
  let fetchCount = 0;
  const changingGithub = { async getPullRequestForReview() {
    fetchCount += 1;
    return { repositoryId: '72', repositoryFullName: 'acme/project', pullRequest: { ...PR, headSha: fetchCount === 1 ? PR.headSha : 'c'.repeat(40) } };
  } };
  const worker = createReviewWorker({ ReviewModel: Model, githubService: changingGithub, workerId: 'worker', processPlaceholder: async () => {} });
  await worker.processOne();
  assert.equal(fetchCount, 2);
  assert.equal(job.status, 'stale');
  assert.deepEqual(job.findings, []);
});

test('review API requires JWT authentication and hides records that are not owned by the requester', async () => {
  const reviewId = '000000000000000000000055';
  const calls = [];
  const reviewService = {
    async getOwned(userId, id) {
      calls.push([String(userId), id]);
      if (String(userId) !== USER) { const error = new Error('Review not found.'); error.statusCode = 404; error.code = 'REVIEW_NOT_FOUND'; throw error; }
      return { _id: id, status: 'queued', headSha: PR.headSha };
    },
    async listReviews(userId, filters) { return { reviews: [{ userId }], pagination: { page: 1, perPage: 20, total: 1, hasNext: false }, filters }; },
    async requestReview() { throw new Error('unused'); }, async retry() { throw new Error('unused'); }, async cancel() { throw new Error('unused'); },
  };
  const app = createApp({ nodeEnv: 'test', frontendUrl: null, jwtSecret: SECRET, jwtExpiresIn: '1h' }, {
    UserModel: { findById: async (id) => ({ _id: id }) }, reviewService,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/reviews`;
  const token = jwt.sign({}, SECRET, { algorithm: 'HS256', subject: USER, expiresIn: '1h' });
  const otherToken = jwt.sign({}, SECRET, { algorithm: 'HS256', subject: OTHER, expiresIn: '1h' });
  try {
    assert.equal((await fetch(`${base}/${reviewId}`)).status, 401);
    const ownerResponse = await fetch(`${base}/${reviewId}`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(ownerResponse.status, 200);
    const ownerBody = await ownerResponse.json();
    assert.equal(ownerBody.data.review.status, 'queued');
    const otherResponse = await fetch(`${base}/${reviewId}`, { headers: { authorization: `Bearer ${otherToken}` } });
    assert.equal(otherResponse.status, 404);
    assert.equal(calls.length, 2);
    assert.doesNotMatch(await otherResponse.text(), /stack|internal|token/i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
