const mongoose = require('mongoose');

const githubOAuthStateSchema = new mongoose.Schema({
  stateHash: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  codeVerifier: { type: String, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });

module.exports = mongoose.models.GitHubOAuthState
  || mongoose.model('GitHubOAuthState', githubOAuthStateSchema);
