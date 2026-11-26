const mongoose = require('mongoose');

const codeReviewSchema = new mongoose.Schema({
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  githubRepositoryId: { type: String, required: true },
  repositoryFullName: { type: String, required: true, maxlength: 201 },
  pullNumber: { type: Number, required: true, min: 1, max: 2147483647 },
  pullRequestTitle: { type: String, required: true, maxlength: 500 },
  baseSha: { type: String, required: true, match: /^[a-f\d]{7,64}$/i },
  headSha: { type: String, required: true, match: /^[a-f\d]{7,64}$/i },
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed', 'stale', 'cancelled'], default: 'queued', required: true },
  provider: { type: String, default: null },
  model: { type: String, default: null },
  promptVersion: { type: String, default: null },
  reviewProfileVersion: { type: String, required: true, default: 'v5.2-placeholder' },
  requestFingerprint: { type: String, required: true },
  activeKey: { type: String, default: undefined },
  generation: { type: Number, required: true, min: 1, default: 1 },
  summary: { type: String, default: null },
  risk: { type: String, default: null },
  findings: { type: [mongoose.Schema.Types.Mixed], default: [] },
  resultNotice: { type: String, default: null },
  failureCode: { type: String, default: null },
  attemptCount: { type: Number, min: 0, default: 0 },
  maxAttempts: { type: Number, min: 1, max: 5, default: 3 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lockedAt: { type: Date, default: null },
  lockedBy: { type: String, default: null, select: false },
  leaseExpiresAt: { type: Date, default: null, index: true },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  cancelRequestedAt: { type: Date, default: null },
}, { timestamps: true });

codeReviewSchema.index({ requestFingerprint: 1, generation: 1 }, { unique: true });
codeReviewSchema.index({ activeKey: 1 }, { unique: true, sparse: true });
codeReviewSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
codeReviewSchema.index({ ownerUserId: 1, createdAt: -1 });
codeReviewSchema.index({ ownerUserId: 1, githubRepositoryId: 1, pullNumber: 1, createdAt: -1 });
codeReviewSchema.set('toJSON', { transform(_document, value) {
  delete value.__v; delete value.ownerUserId; delete value.lockedBy; delete value.activeKey; delete value.requestFingerprint;
  delete value.lockedAt; delete value.leaseExpiresAt; delete value.generation;
  return value;
} });

module.exports = mongoose.models.CodeReview || mongoose.model('CodeReview', codeReviewSchema);
