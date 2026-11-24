const mongoose = require('mongoose');

const installationSchema = new mongoose.Schema({
  installationId: { type: String, required: true },
  accountId: { type: String, required: true },
  accountLogin: { type: String, required: true, trim: true },
  accountType: { type: String, required: true, enum: ['User', 'Organization'] },
}, { _id: false });

const githubPendingLinkSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  githubAccountId: { type: String, required: true },
  githubLogin: { type: String, required: true, trim: true },
  installations: { type: [installationSchema], required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });

module.exports = mongoose.models.GitHubPendingLink
  || mongoose.model('GitHubPendingLink', githubPendingLinkSchema);
