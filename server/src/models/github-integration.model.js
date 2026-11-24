const mongoose = require('mongoose');

const githubIntegrationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  githubAccountId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  githubLogin: { type: String, required: true, trim: true },
  installationId: { type: String, required: true },
  installationAccountId: { type: String, required: true },
  installationAccountLogin: { type: String, required: true, trim: true },
  installationAccountType: { type: String, required: true, enum: ['User', 'Organization'] },
}, { timestamps: true });

githubIntegrationSchema.set('toJSON', {
  transform(_document, value) {
    delete value.__v;
    return value;
  },
});

module.exports = mongoose.models.GitHubIntegration
  || mongoose.model('GitHubIntegration', githubIntegrationSchema);
