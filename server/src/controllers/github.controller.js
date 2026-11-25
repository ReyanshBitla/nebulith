const createHttpError = require('../utils/http-error');

const getUserId = (req) => req.user._id;

const parsePagination = (query, defaultPerPage = 30, maxPerPage = 100) => {
  const readValue = (value, fallback, max, name) => {
    if (value === undefined) {
      return fallback;
    }
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
      throw createHttpError(400, 'INVALID_PAGINATION', `${name} must be a positive integer.`);
    }

    const number = Number(value);
    if (!Number.isSafeInteger(number) || number > max) {
      throw createHttpError(400, 'INVALID_PAGINATION', `${name} is outside the supported range.`);
    }
    return number;
  };

  return {
    page: readValue(query.page, 1, 10000, 'page'),
    perPage: readValue(query.per_page, defaultPerPage, maxPerPage, 'per_page'),
  };
};

const parsePullRequestState = (query) => {
  const state = query.state === undefined ? 'open' : query.state;
  if (typeof state !== 'string' || !['open', 'closed', 'all'].includes(state)) {
    throw createHttpError(400, 'GITHUB_INVALID_PULL_REQUEST_STATE', 'Pull request state must be open, closed or all.');
  }
  return state;
};

const parsePullRequestNumber = (value) => {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) {
    throw createHttpError(400, 'GITHUB_INVALID_PULL_REQUEST', 'A valid pull request number is required.');
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > 2_147_483_647) {
    throw createHttpError(400, 'GITHUB_INVALID_PULL_REQUEST', 'A valid pull request number is required.');
  }
  return number;
};

const createGithubController = (githubService) => ({
  startConnection: async (req, res) => {
    const authorizationUrl = await githubService.startConnection(getUserId(req));
    return res.status(200).json({ success: true, data: { authorizationUrl } });
  },

  callback: async (req, res) => {
    const result = await githubService.completeConnection(req.query);
    return res.status(200).json({ success: true, data: result });
  },

  status: async (req, res) => res.status(200).json({
    success: true,
    data: await githubService.getConnectionStatus(getUserId(req)),
  }),

  pendingInstallations: async (req, res) => res.status(200).json({
    success: true,
    data: await githubService.getPendingInstallations(getUserId(req)),
  }),

  selectInstallation: async (req, res) => res.status(200).json({
    success: true,
    data: await githubService.selectInstallation(getUserId(req), req.params.installationId),
  }),

  disconnect: async (req, res) => res.status(200).json({
    success: true,
    data: await githubService.disconnect(getUserId(req)),
  }),

  listRepositories: async (req, res) => res.status(200).json({
    success: true,
    data: await githubService.listRepositories(getUserId(req), parsePagination(req.query)),
  }),

  listCommits: async (req, res) => res.status(200).json({
    success: true,
    data: await githubService.listCommits(
      getUserId(req),
      req.params.owner,
      req.params.repo,
      parsePagination(req.query, 20),
    ),
  }),

  listPullRequests: async (req, res) => res.status(200).json({
    success: true,
    data: await githubService.listPullRequests(
      getUserId(req),
      req.params.owner,
      req.params.repo,
      { ...parsePagination(req.query, 20, 100), state: parsePullRequestState(req.query) },
    ),
  }),

  pullRequestDetails: async (req, res) => res.status(200).json({
    success: true,
    data: { pullRequest: await githubService.getPullRequest(
      getUserId(req), req.params.owner, req.params.repo, parsePullRequestNumber(req.params.number),
    ) },
  }),

  pullRequestFiles: async (req, res) => res.status(200).json({
    success: true,
    data: await githubService.listPullRequestFiles(
      getUserId(req),
      req.params.owner,
      req.params.repo,
      parsePullRequestNumber(req.params.number),
      parsePagination(req.query, 20, 50),
    ),
  }),

  commitDetails: async (req, res) => res.status(200).json({
    success: true,
    data: {
      commit: await githubService.getCommitDetails(
        getUserId(req), req.params.owner, req.params.repo, req.params.sha,
      ),
    },
  }),

  commitActivity: async (req, res) => res.status(200).json({
    success: true,
    data: await githubService.getCommitActivity(getUserId(req), req.params.owner, req.params.repo),
  }),

  contributors: async (req, res) => res.status(200).json({
    success: true,
    data: await githubService.listContributors(
      getUserId(req), req.params.owner, req.params.repo, parsePagination(req.query),
    ),
  }),

  contributorActivity: async (req, res) => res.status(200).json({
    success: true,
    data: await githubService.getContributorActivity(getUserId(req), req.params.owner, req.params.repo),
  }),

  repositoryLanguages: async (req, res) => res.status(200).json({
    success: true,
    data: await githubService.getRepositoryLanguages(getUserId(req), req.params.owner, req.params.repo),
  }),

  languageIntelligence: async (req, res) => res.status(200).json({
    success: true,
    data: await githubService.getLanguageIntelligence(getUserId(req)),
  }),

  repositoryDetails: async (req, res) => res.status(200).json({
    success: true,
    data: { repository: await githubService.getRepository(getUserId(req), req.params.owner, req.params.repo) },
  }),
});

module.exports = { createGithubController, parsePagination, parsePullRequestNumber, parsePullRequestState };
