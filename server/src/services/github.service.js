const crypto = require('node:crypto');

const GitHubIntegration = require('../models/github-integration.model');
const GitHubOAuthState = require('../models/github-oauth-state.model');
const GitHubPendingLink = require('../models/github-pending-link.model');
const { loadGithubConfig } = require('../config/github');
const createHttpError = require('../utils/http-error');
const { mapLanguageBreakdown, aggregateLanguageBreakdowns } = require('../utils/language-intelligence');
const { mapContributor, mapContributorActivity } = require('../utils/contributor-intelligence');
const { createGithubAppService } = require('./github-app.service');
const { requestGithubApi } = require('./github-api.service');

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REPOSITORY_PART_PATTERN = /^[A-Za-z0-9_.-]+$/;
const COMMIT_SHA_PATTERN = /^[A-Fa-f\d]{7,64}$/;
const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const PULL_REQUEST_STATES = new Set(['open', 'closed', 'all']);
const MAX_PULL_REQUEST_BODY_CHARACTERS = 20000;
const MAX_PULL_REQUEST_PATCH_CHARACTERS = 12000;
const MAX_PULL_REQUEST_PAGE_PATCH_CHARACTERS = 240000;

const getId = (value) => (value && typeof value.toString === 'function' ? value.toString() : String(value));

const validateRepositoryCoordinates = (owner, repositoryName) => {
  if (
    typeof owner !== 'string'
    || typeof repositoryName !== 'string'
    || owner.length > 100
    || repositoryName.length > 100
    || !REPOSITORY_PART_PATTERN.test(owner)
    || !REPOSITORY_PART_PATTERN.test(repositoryName)
    || owner === '.'
    || owner === '..'
    || repositoryName === '.'
    || repositoryName === '..'
  ) {
    throw createHttpError(400, 'GITHUB_INVALID_REPOSITORY', 'A valid GitHub repository owner and name are required.');
  }
};

const validateCommitSha = (sha) => {
  if (typeof sha !== 'string' || !COMMIT_SHA_PATTERN.test(sha)) {
    throw createHttpError(400, 'GITHUB_INVALID_COMMIT', 'A valid commit SHA is required.');
  }
};

const validatePullRequestNumber = (number) => {
  if (!Number.isSafeInteger(number) || number < 1 || number > 2_147_483_647) {
    throw createHttpError(400, 'GITHUB_INVALID_PULL_REQUEST', 'A valid pull request number is required.');
  }
};

const safeGithubHtmlUrl = (value) => {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const mapPullRequest = (pullRequest, { includeBody = false } = {}) => {
  if (
    !pullRequest
    || !Number.isSafeInteger(pullRequest.number)
    || pullRequest.number < 1
    || typeof pullRequest.title !== 'string'
    || !['open', 'closed'].includes(pullRequest.state)
  ) {
    throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned an invalid pull request response.');
  }
  const merged = Boolean(pullRequest.merged_at || pullRequest.merged);
  const body = typeof pullRequest.body === 'string' ? pullRequest.body : '';
  const safeIntegerOrNull = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
  return {
    number: pullRequest.number,
    title: pullRequest.title.slice(0, 500),
    ...(includeBody ? {
      body: body.slice(0, MAX_PULL_REQUEST_BODY_CHARACTERS),
      bodyTruncated: body.length > MAX_PULL_REQUEST_BODY_CHARACTERS,
    } : {}),
    author: typeof pullRequest.user?.login === 'string' ? pullRequest.user.login.slice(0, 100) : null,
    state: pullRequest.state,
    merged,
    draft: Boolean(pullRequest.draft),
    createdAt: typeof pullRequest.created_at === 'string' ? pullRequest.created_at : null,
    updatedAt: typeof pullRequest.updated_at === 'string' ? pullRequest.updated_at : null,
    closedAt: typeof pullRequest.closed_at === 'string' ? pullRequest.closed_at : null,
    url: safeGithubHtmlUrl(pullRequest.html_url),
    baseBranch: typeof pullRequest.base?.ref === 'string' ? pullRequest.base.ref.slice(0, 255) : null,
    headBranch: typeof pullRequest.head?.ref === 'string' ? pullRequest.head.ref.slice(0, 255) : null,
    additions: safeIntegerOrNull(pullRequest.additions),
    deletions: safeIntegerOrNull(pullRequest.deletions),
    changedFiles: safeIntegerOrNull(pullRequest.changed_files),
  };
};

const mapPullRequestFile = (file, remainingPatchCharacters) => {
  if (!file || typeof file.filename !== 'string' || file.filename.length > 2000) {
    throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned an invalid changed-file response.');
  }
  const numeric = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const rawPatch = typeof file.patch === 'string' ? file.patch : null;
  const patchLimit = Math.max(0, Math.min(MAX_PULL_REQUEST_PATCH_CHARACTERS, remainingPatchCharacters));
  const patch = rawPatch === null ? null : rawPatch.slice(0, patchLimit);
  const patchTruncated = rawPatch !== null && patch.length < rawPatch.length;
  return {
    filename: file.filename,
    previousFilename: typeof file.previous_filename === 'string' ? file.previous_filename : null,
    status: ['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged'].includes(file.status)
      ? file.status
      : 'unknown',
    additions: numeric(file.additions),
    deletions: numeric(file.deletions),
    changes: numeric(file.changes),
    patch,
    patchAvailable: rawPatch !== null,
    patchTruncated,
    patchOmittedByLimit: rawPatch !== null && patchLimit === 0,
    url: safeGithubHtmlUrl(file.blob_url),
  };
};

const mapCommit = (commit) => {
  if (!commit || typeof commit !== 'object' || !COMMIT_SHA_PATTERN.test(commit.sha || '') || !commit.commit) {
    throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned an invalid commit response.');
  }
  const verifiedAuthor = Number.isSafeInteger(commit.author?.id)
    && commit.author.id > 0
    && typeof commit.author.login === 'string'
    && GITHUB_LOGIN_PATTERN.test(commit.author.login);
  return {
    sha: commit.sha,
    message: typeof commit.commit.message === 'string' ? commit.commit.message : null,
    author: commit.author?.login || commit.commit.author?.name || null,
    authorLogin: verifiedAuthor ? commit.author.login : null,
    authorVerified: verifiedAuthor,
    date: commit.commit.author?.date || commit.commit.committer?.date || null,
    url: typeof commit.html_url === 'string' ? commit.html_url : null,
  };
};

const mapCommitDetails = (commit) => {
  const stats = commit.stats;
  const validStats = Number.isSafeInteger(stats?.additions)
    && Number.isSafeInteger(stats?.deletions)
    && Number.isSafeInteger(stats?.total)
    && stats.additions >= 0
    && stats.deletions >= 0
    && stats.total >= 0;
  return {
    ...mapCommit(commit),
    stats: validStats
      ? { additions: stats.additions, deletions: stats.deletions, total: stats.total }
      : null,
  };
};

const mapCommitActivityWeek = (week) => {
  if (
    !Number.isSafeInteger(week?.week)
    || !Number.isSafeInteger(week?.total)
    || week.total < 0
    || !Array.isArray(week.days)
    || week.days.length !== 7
    || week.days.some((count) => !Number.isSafeInteger(count) || count < 0)
  ) {
    throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned invalid commit activity data.');
  }
  return { week: week.week, total: week.total, days: week.days };
};

const createGithubService = ({
  IntegrationModel = GitHubIntegration,
  OAuthStateModel = GitHubOAuthState,
  PendingLinkModel = GitHubPendingLink,
  configProvider = loadGithubConfig,
  appService,
  fetchImpl = globalThis.fetch,
  tokenService,
  now = () => new Date(),
  randomBytes = crypto.randomBytes,
} = {}) => {
  const githubApp = appService || createGithubAppService({ fetchImpl, tokenService, now: () => now().getTime() });
  const getConfig = () => configProvider();

  const startConnection = async (userId) => {
    const config = getConfig();
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    await OAuthStateModel.deleteMany({ userId });
    await OAuthStateModel.create({
      userId,
      stateHash: crypto.createHash('sha256').update(state).digest('hex'),
      codeVerifier,
      expiresAt: new Date(now().getTime() + OAUTH_STATE_TTL_MS),
    });

    return githubApp.createAuthorizationUrl({ config, state, codeChallenge });
  };

  const consumeOAuthState = async (state) => {
    if (typeof state !== 'string' || !STATE_PATTERN.test(state)) {
      throw createHttpError(400, 'GITHUB_INVALID_CALLBACK', 'GitHub authorization callback is invalid or expired.');
    }

    const stateHash = crypto.createHash('sha256').update(state).digest('hex');
    const stateRecord = await OAuthStateModel.findOneAndDelete({
      stateHash,
      expiresAt: { $gt: now() },
    });
    if (!stateRecord) {
      throw createHttpError(400, 'GITHUB_INVALID_CALLBACK', 'GitHub authorization callback is invalid or expired.');
    }
    return stateRecord;
  };

  const normalizeInstallations = (installations) => installations.flatMap((installation) => {
    const account = installation?.account;
    if (
      !Number.isSafeInteger(installation?.id)
      || !Number.isSafeInteger(account?.id)
      || typeof account.login !== 'string'
      || !['User', 'Organization'].includes(account.type)
    ) {
      return [];
    }

    return [{
      installationId: String(installation.id),
      accountId: String(account.id),
      accountLogin: account.login,
      accountType: account.type,
    }];
  });

  const completeConnection = async ({ code, state, error: authorizationError }) => {
    const stateRecord = await consumeOAuthState(state);

    if (authorizationError !== undefined) {
      if (typeof authorizationError !== 'string') {
        throw createHttpError(400, 'GITHUB_INVALID_CALLBACK', 'GitHub authorization callback is invalid.');
      }
      throw createHttpError(400, 'GITHUB_AUTHORIZATION_DENIED', 'GitHub account authorization was not completed.');
    }
    if (typeof code !== 'string' || code.length < 1 || code.length > 2048 || /\s/.test(code)) {
      throw createHttpError(400, 'GITHUB_INVALID_CALLBACK', 'GitHub authorization callback is invalid.');
    }

    const config = getConfig();
    let accessToken;
    let githubUser;
    let installations;
    try {
      accessToken = await githubApp.exchangeCode({
        config,
        code,
        codeVerifier: stateRecord.codeVerifier,
      });
      githubUser = await githubApp.getGitHubUser(accessToken);
      installations = await githubApp.listUserInstallations(accessToken);
    } finally {
      if (accessToken) {
        await githubApp.revokeUserAuthorization({ config, accessToken });
      }
    }

    if (
      !Number.isSafeInteger(githubUser?.id)
      || typeof githubUser.login !== 'string'
      || !/^[A-Za-z0-9-]+$/.test(githubUser.login)
    ) {
      throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned an invalid account response.');
    }

    const availableInstallations = normalizeInstallations(installations);
    if (availableInstallations.length === 0) {
      return {
        status: 'installation_required',
        githubLogin: githubUser.login,
        installationUrl: `https://github.com/apps/${encodeURIComponent(config.appSlug)}/installations/new`,
      };
    }

    const expiresAt = new Date(now().getTime() + OAUTH_STATE_TTL_MS);
    await PendingLinkModel.findOneAndUpdate(
      { userId: stateRecord.userId },
      {
        userId: stateRecord.userId,
        githubAccountId: String(githubUser.id),
        githubLogin: githubUser.login,
        installations: availableInstallations,
        expiresAt,
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );

    return {
      status: 'installation_selection_required',
      githubLogin: githubUser.login,
      expiresAt,
    };
  };

  const getConnectionStatus = async (userId) => {
    const connection = await IntegrationModel.findOne({ userId });
    if (!connection) {
      return { connected: false };
    }

    return {
      connected: true,
      githubLogin: connection.githubLogin,
      installation: {
        accountLogin: connection.installationAccountLogin,
        accountType: connection.installationAccountType,
      },
    };
  };

  const getPendingInstallations = async (userId) => {
    const pending = await PendingLinkModel.findOne({ userId, expiresAt: { $gt: now() } });
    if (!pending) {
      throw createHttpError(404, 'GITHUB_PENDING_LINK_NOT_FOUND', 'No pending GitHub installation selection was found.');
    }

    return {
      githubLogin: pending.githubLogin,
      installations: pending.installations.map((installation) => ({
        installationId: installation.installationId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
      })),
      expiresAt: pending.expiresAt,
    };
  };

  const selectInstallation = async (userId, installationId) => {
    if (typeof installationId !== 'string' || !/^\d{1,20}$/.test(installationId)) {
      throw createHttpError(400, 'GITHUB_INVALID_INSTALLATION', 'A valid GitHub installation ID is required.');
    }

    const currentTime = now();
    const pending = await PendingLinkModel.findOne({ userId, expiresAt: { $gt: currentTime } });
    if (!pending) {
      throw createHttpError(404, 'GITHUB_PENDING_LINK_NOT_FOUND', 'No pending GitHub installation selection was found.');
    }

    const installation = pending.installations.find((entry) => entry.installationId === installationId);
    if (!installation) {
      throw createHttpError(403, 'GITHUB_INSTALLATION_NOT_AUTHORIZED', 'That installation was not authorized for this account.');
    }

    const userIdString = getId(userId);
    const existingForUser = await IntegrationModel.findOne({ userId });
    if (existingForUser && existingForUser.githubAccountId !== pending.githubAccountId) {
      throw createHttpError(409, 'GITHUB_ACCOUNT_ALREADY_CONNECTED', 'Disconnect the current GitHub account before connecting another.');
    }

    const existingForGithubAccount = await IntegrationModel.findOne({ githubAccountId: pending.githubAccountId });
    if (existingForGithubAccount && getId(existingForGithubAccount.userId) !== userIdString) {
      throw createHttpError(409, 'GITHUB_ACCOUNT_ALREADY_LINKED', 'This GitHub account is already linked to another NEBULITH account.');
    }

    const values = {
      userId,
      githubAccountId: pending.githubAccountId,
      githubLogin: pending.githubLogin,
      installationId: installation.installationId,
      installationAccountId: installation.accountId,
      installationAccountLogin: installation.accountLogin,
      installationAccountType: installation.accountType,
    };

    let connection;
    try {
      if (existingForUser) {
        Object.assign(existingForUser, values);
        connection = await existingForUser.save();
      } else {
        connection = await IntegrationModel.create(values);
      }
    } catch (error) {
      if (error && error.code === 11000) {
        throw createHttpError(409, 'GITHUB_ACCOUNT_ALREADY_LINKED', 'This GitHub account is already linked to another NEBULITH account.');
      }
      throw error;
    }

    await PendingLinkModel.deleteOne({ _id: pending._id });
    await OAuthStateModel.deleteMany({ userId });

    return {
      connected: true,
      githubLogin: connection.githubLogin,
      installation: {
        accountLogin: connection.installationAccountLogin,
        accountType: connection.installationAccountType,
      },
    };
  };

  const disconnect = async (userId) => {
    await IntegrationModel.deleteOne({ userId });
    await PendingLinkModel.deleteOne({ userId });
    await OAuthStateModel.deleteMany({ userId });
    return { connected: false };
  };

  const getInstallationForUser = async (userId) => {
    const integration = await IntegrationModel.findOne({ userId });
    if (!integration) {
      throw createHttpError(404, 'GITHUB_NOT_CONNECTED', 'Connect a GitHub account before accessing repositories.');
    }
    return integration;
  };

  const getInstallationToken = async (installationId) => {
    const config = getConfig();
    try {
      return await githubApp.createInstallationAccessToken({ config, installationId });
    } catch (error) {
      if (error && ['GITHUB_RESOURCE_NOT_FOUND', 'GITHUB_AUTHORIZATION_EXPIRED'].includes(error.code)) {
        throw createHttpError(409, 'GITHUB_INSTALLATION_UNAVAILABLE', 'The GitHub App installation is unavailable. Reinstall or reconnect the GitHub App.');
      }
      throw error;
    }
  };

  const withInstallationToken = async (installationId, operation) => {
    const token = await getInstallationToken(installationId);
    try {
      return await operation(token);
    } finally {
      try {
        await githubApp.revokeInstallationAccessToken(token);
      } catch {
        // Tokens are short-lived even if best-effort revocation cannot reach GitHub.
      }
    }
  };

  const assertInstallationRepository = async (token, owner, repositoryName) => {
    const repository = await requestGithubApi({
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}`,
      token,
      fetchImpl,
    });
    if (
      !Number.isSafeInteger(repository?.id)
      || typeof repository.full_name !== 'string'
      || repository.full_name.toLowerCase() !== `${owner}/${repositoryName}`.toLowerCase()
    ) {
      throw createHttpError(404, 'GITHUB_RESOURCE_NOT_FOUND', 'The repository is unavailable to this GitHub App installation.');
    }
    return repository;
  };

  const listRepositories = async (userId, { page = 1, perPage = 30 } = {}) => {
    const integration = await getInstallationForUser(userId);
    return withInstallationToken(integration.installationId, async (token) => {
      const result = await requestGithubApi({
        path: `/installation/repositories?per_page=${perPage}&page=${page}`,
        token,
        fetchImpl,
      });

      const repositories = Array.isArray(result.repositories) ? result.repositories : [];
      return {
        repositories: repositories.map(mapRepository),
        pagination: {
          page,
          perPage,
          total: Number.isSafeInteger(result.total_count) ? result.total_count : repositories.length,
        },
      };
    });
  };

  const listPullRequests = async (userId, owner, repositoryName, { state = 'open', page = 1, perPage = 20 } = {}) => {
    validateRepositoryCoordinates(owner, repositoryName);
    if (!PULL_REQUEST_STATES.has(state)) {
      throw createHttpError(400, 'GITHUB_INVALID_PULL_REQUEST_STATE', 'Pull request state must be open, closed or all.');
    }
    const integration = await getInstallationForUser(userId);
    return withInstallationToken(integration.installationId, async (token) => {
      await assertInstallationRepository(token, owner, repositoryName);
      const result = await requestGithubApi({
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/pulls?state=${state}&per_page=${perPage}&page=${page}`,
        token,
        fetchImpl,
        returnResponse: true,
      });
      if (result.status !== 200 || !Array.isArray(result.data)) {
        throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned an invalid pull request list.');
      }
      return {
        pullRequests: result.data.map((pullRequest) => mapPullRequest(pullRequest)),
        pagination: { page, perPage, hasNext: /rel="next"/.test(result.headers.get('link') || '') },
      };
    });
  };

  const getPullRequest = async (userId, owner, repositoryName, pullNumber) => {
    validateRepositoryCoordinates(owner, repositoryName);
    validatePullRequestNumber(pullNumber);
    const integration = await getInstallationForUser(userId);
    return withInstallationToken(integration.installationId, async (token) => {
      await assertInstallationRepository(token, owner, repositoryName);
      const pullRequest = await requestGithubApi({
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/pulls/${pullNumber}`,
        token,
        fetchImpl,
      });
      return mapPullRequest(pullRequest, { includeBody: true });
    });
  };

  const listPullRequestFiles = async (userId, owner, repositoryName, pullNumber, { page = 1, perPage = 20 } = {}) => {
    validateRepositoryCoordinates(owner, repositoryName);
    validatePullRequestNumber(pullNumber);
    const integration = await getInstallationForUser(userId);
    return withInstallationToken(integration.installationId, async (token) => {
      await assertInstallationRepository(token, owner, repositoryName);
      const result = await requestGithubApi({
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/pulls/${pullNumber}/files?per_page=${perPage}&page=${page}`,
        token,
        fetchImpl,
        returnResponse: true,
        maxResponseBytes: 1_500_000,
      });
      if (result.status !== 200 || !Array.isArray(result.data)) {
        throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned an invalid changed-file list.');
      }
      let remainingPatchCharacters = MAX_PULL_REQUEST_PAGE_PATCH_CHARACTERS;
      const files = result.data.map((file) => {
        const mapped = mapPullRequestFile(file, remainingPatchCharacters);
        if (mapped.patch !== null) remainingPatchCharacters -= mapped.patch.length;
        return mapped;
      });
      return {
        files,
        pagination: { page, perPage, hasNext: /rel="next"/.test(result.headers.get('link') || '') },
      };
    });
  };

  const listCommits = async (userId, owner, repositoryName, { page = 1, perPage = 20 } = {}) => {
    validateRepositoryCoordinates(owner, repositoryName);
    const integration = await getInstallationForUser(userId);
    return withInstallationToken(integration.installationId, async (token) => {
      const result = await requestGithubApi({
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/commits?per_page=${perPage}&page=${page}`,
        token,
        fetchImpl,
        returnResponse: true,
      });
      if (!Array.isArray(result.data)) {
        throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned an invalid commit list.');
      }

      const linkHeader = result.headers.get('link') || '';
      return {
        commits: result.data.map(mapCommit),
        pagination: {
          page,
          perPage,
          hasNext: /rel="next"/.test(linkHeader),
        },
      };
    });
  };

  const getCommitDetails = async (userId, owner, repositoryName, sha) => {
    validateRepositoryCoordinates(owner, repositoryName);
    validateCommitSha(sha);
    const integration = await getInstallationForUser(userId);
    return withInstallationToken(integration.installationId, async (token) => {
      const commit = await requestGithubApi({
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/commits/${encodeURIComponent(sha)}`,
        token,
        fetchImpl,
      });
      if (!commit || typeof commit !== 'object' || typeof commit.sha !== 'string' || !commit.commit) {
        throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned invalid commit details.');
      }
      return mapCommitDetails(commit);
    });
  };

  const getCommitActivity = async (userId, owner, repositoryName) => {
    validateRepositoryCoordinates(owner, repositoryName);
    const integration = await getInstallationForUser(userId);
    return withInstallationToken(integration.installationId, async (token) => {
      const result = await requestGithubApi({
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/stats/commit_activity`,
        token,
        fetchImpl,
        returnResponse: true,
      });

      if (result.status === 202) {
        const retryAfter = Number(result.headers.get('retry-after'));
        return {
          status: 'computing',
          weeks: [],
          ...(Number.isSafeInteger(retryAfter) && retryAfter >= 0 ? { retryAfterSeconds: retryAfter } : {}),
        };
      }
      if (result.status === 204 || (result.status === 200 && Array.isArray(result.data) && result.data.length === 0)) {
        return { status: 'unavailable', weeks: [] };
      }
      if (result.status !== 200 || !Array.isArray(result.data)) {
        throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned invalid commit activity data.');
      }

      return { status: 'ready', weeks: result.data.map(mapCommitActivityWeek) };
    });
  };

  const listContributors = async (userId, owner, repositoryName, { page = 1, perPage = 30 } = {}) => {
    validateRepositoryCoordinates(owner, repositoryName);
    const integration = await getInstallationForUser(userId);
    return withInstallationToken(integration.installationId, async (token) => {
      const result = await requestGithubApi({
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/contributors?anon=1&per_page=${perPage}&page=${page}`,
        token,
        fetchImpl,
        returnResponse: true,
      });
      if (result.status === 204) {
        return { contributors: [], pagination: { page, perPage, hasNext: false } };
      }
      if (result.status !== 200 || !Array.isArray(result.data)) {
        throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned an invalid contributor list.');
      }

      return {
        contributors: result.data.map(mapContributor),
        pagination: {
          page,
          perPage,
          hasNext: /rel="next"/.test(result.headers.get('link') || ''),
        },
      };
    });
  };

  const getContributorActivity = async (userId, owner, repositoryName) => {
    validateRepositoryCoordinates(owner, repositoryName);
    const integration = await getInstallationForUser(userId);
    return withInstallationToken(integration.installationId, async (token) => {
      const result = await requestGithubApi({
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/stats/contributors`,
        token,
        fetchImpl,
        returnResponse: true,
      });
      if (result.status === 202) {
        const retryAfter = Number(result.headers.get('retry-after'));
        return {
          status: 'computing', weeks: [], contributors: [],
          ...(Number.isSafeInteger(retryAfter) && retryAfter >= 0 ? { retryAfterSeconds: retryAfter } : {}),
        };
      }
      if (result.status === 204 || (result.status === 200 && Array.isArray(result.data) && result.data.length === 0)) {
        return { status: 'unavailable', weeks: [], contributors: [] };
      }
      if (result.status !== 200 || !Array.isArray(result.data)) {
        throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned invalid contributor activity data.');
      }
      return mapContributorActivity(result.data);
    });
  };

  const getRepositoryLanguages = async (userId, owner, repositoryName) => {
    validateRepositoryCoordinates(owner, repositoryName);
    const integration = await getInstallationForUser(userId);
    return withInstallationToken(integration.installationId, async (token) => {
      const languageBytes = await requestGithubApi({
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/languages`,
        token,
        fetchImpl,
      });
      const breakdown = mapLanguageBreakdown(languageBytes);
      return {
        repository: {
          fullName: `${owner}/${repositoryName}`,
          totalBytes: breakdown.totalBytes,
          languages: breakdown.languages,
        },
      };
    });
  };

  const getLanguageIntelligence = async (userId) => {
    const integration = await getInstallationForUser(userId);
    return withInstallationToken(integration.installationId, async (token) => {
      const repositories = [];
      let page = 1;
      let hasNext = true;

      while (hasNext) {
        const result = await requestGithubApi({
          path: `/installation/repositories?per_page=100&page=${page}`,
          token,
          fetchImpl,
          returnResponse: true,
        });
        if (result.status !== 200 || !Array.isArray(result.data?.repositories)) {
          throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned an invalid installation repository list.');
        }

        for (const repository of result.data.repositories) {
          const fullName = repository?.full_name;
          const parts = typeof fullName === 'string' ? fullName.split('/') : [];
          const [owner, name, extra] = parts;
          if (
            !Number.isSafeInteger(repository?.id)
            || !owner
            || !name
            || extra !== undefined
            || typeof repository.owner?.login !== 'string'
            || repository.owner.login.toLowerCase() !== owner.toLowerCase()
          ) {
            throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned an invalid installation repository.');
          }
          validateRepositoryCoordinates(owner, name);
          repositories.push({
            id: repository.id,
            name,
            fullName,
            owner,
            url: typeof repository.html_url === 'string' ? repository.html_url : null,
          });
        }

        hasNext = /rel="next"/.test(result.headers.get('link') || '');
        if (hasNext && page >= 10000) {
          throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned an unsupported repository page count.');
        }
        page += 1;
      }

      const uniqueRepositories = [...new Map(repositories.map((repository) => [repository.id, repository])).values()];
      const languageResponses = new Array(uniqueRepositories.length);
      let requestError = null;
      let nextIndex = 0;
      const worker = async () => {
        while (!requestError && nextIndex < uniqueRepositories.length) {
          const index = nextIndex;
          nextIndex += 1;
          const repository = uniqueRepositories[index];
          try {
            languageResponses[index] = await requestGithubApi({
              path: `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/languages`,
              token,
              fetchImpl,
            });
          } catch (error) {
            requestError = error;
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(4, uniqueRepositories.length) }, worker));
      if (requestError) throw requestError;

      return aggregateLanguageBreakdowns(uniqueRepositories.map((repository, index) => ({
        ...repository,
        languageBytes: languageResponses[index],
      })));
    });
  };

  const getRepository = async (userId, owner, repositoryName) => {
    validateRepositoryCoordinates(owner, repositoryName);

    const integration = await getInstallationForUser(userId);
    return withInstallationToken(integration.installationId, async (token) => {
      const repository = await requestGithubApi({
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}`,
        token,
        fetchImpl,
      });
      return mapRepository(repository);
    });
  };

  return {
    startConnection,
    completeConnection,
    getConnectionStatus,
    getPendingInstallations,
    selectInstallation,
    disconnect,
    listRepositories,
    listPullRequests,
    getPullRequest,
    listPullRequestFiles,
    listCommits,
    getCommitDetails,
    getCommitActivity,
    listContributors,
    getContributorActivity,
    getRepositoryLanguages,
    getLanguageIntelligence,
    getRepository,
  };
};

const mapRepository = (repository) => ({
  id: repository.id,
  name: repository.name,
  fullName: repository.full_name,
  description: repository.description ?? null,
  visibility: repository.visibility || (repository.private ? 'private' : 'public'),
  primaryLanguage: repository.language ?? null,
  defaultBranch: repository.default_branch ?? null,
  stars: repository.stargazers_count ?? 0,
  forks: repository.forks_count ?? 0,
  createdAt: repository.created_at ?? null,
  updatedAt: repository.updated_at ?? null,
  pushedAt: repository.pushed_at ?? null,
  url: repository.html_url,
});

module.exports = { createGithubService, mapRepository, OAUTH_STATE_TTL_MS };
