const assert = require('node:assert/strict');
const { createHash, generateKeyPairSync } = require('node:crypto');
const { once } = require('node:events');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const { createApp } = require('../src/server');
const { createGithubService } = require('../src/services/github.service');
const { createGithubAppService } = require('../src/services/github-app.service');
const { requestGithubApi } = require('../src/services/github-api.service');
const { mapLanguageBreakdown, aggregateLanguageBreakdowns } = require('../src/utils/language-intelligence');
const { mapContributor, mapContributorActivity } = require('../src/utils/contributor-intelligence');

const USER_ID = '000000000000000000000001';
const NEBULITH_JWT_SECRET = 'github-tests-use-this-secret-with-at-least-32-bytes';
const OAUTH_ACCESS_TOKEN = 'ghu-test-user-access-token';
const INSTALLATION_TOKEN = 'ghs-test-installation-access-token';
const installation = {
  id: 42,
  account: { id: 84, login: 'nebulith-org', type: 'Organization' },
};
const githubConfig = {
  appId: '12345',
  clientId: 'Iv1.mock-client-id',
  clientSecret: 'mock-client-secret',
  privateKey: 'mock-private-key',
  appSlug: 'nebulith-app',
  callbackUrl: 'https://api.nebulith.example/api/github/callback',
};

const idString = (value) => (value && typeof value.toString === 'function' ? value.toString() : String(value));

const createStateModel = () => {
  const records = [];
  let nextId = 1;

  return {
    records,
    async create(values) {
      const record = { ...values, _id: String(nextId++) };
      records.push(record);
      return record;
    },
    async findOneAndDelete(filter) {
      const index = records.findIndex((record) => (
        record.stateHash === filter.stateHash
        && idString(record.userId) === idString(filter.userId || record.userId)
        && record.expiresAt > filter.expiresAt.$gt
      ));
      return index < 0 ? null : records.splice(index, 1)[0];
    },
    async deleteMany(filter) {
      const originalLength = records.length;
      for (let index = records.length - 1; index >= 0; index -= 1) {
        if (filter.userId === undefined || idString(records[index].userId) === idString(filter.userId)) {
          records.splice(index, 1);
        }
      }
      return { deletedCount: originalLength - records.length };
    },
  };
};

const createPendingModel = () => {
  const records = [];
  let nextId = 1;
  return {
    records,
    async findOneAndUpdate(filter, values) {
      let record = records.find((entry) => idString(entry.userId) === idString(filter.userId));
      if (record) Object.assign(record, values);
      else {
        record = { ...values, _id: String(nextId++) };
        records.push(record);
      }
      return record;
    },
    async findOne(filter) {
      return records.find((entry) => (
        idString(entry.userId) === idString(filter.userId)
        && entry.expiresAt > filter.expiresAt.$gt
      )) || null;
    },
    async deleteOne(filter) {
      const index = records.findIndex((entry) => (
        (filter._id !== undefined && entry._id === filter._id)
        || (filter.userId !== undefined && idString(entry.userId) === idString(filter.userId))
      ));
      if (index >= 0) records.splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    },
  };
};

const createIntegrationModel = (initial = []) => {
  const records = [...initial];
  let nextId = 1;
  return {
    records,
    async findOne(filter) {
      return records.find((entry) => Object.entries(filter).every(([key, value]) => (
        idString(entry[key]) === idString(value)
      ))) || null;
    },
    async create(values) {
      if (records.some((entry) => (
        idString(entry.userId) === idString(values.userId)
        || entry.githubAccountId === values.githubAccountId
      ))) {
        const error = new Error('Duplicate key.');
        error.code = 11000;
        throw error;
      }
      const record = { ...values, _id: String(nextId++) };
      record.save = async () => record;
      records.push(record);
      return record;
    },
    async deleteOne(filter) {
      const index = records.findIndex((entry) => Object.entries(filter).every(([key, value]) => (
        idString(entry[key]) === idString(value)
      )));
      if (index >= 0) records.splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    },
  };
};

const createAppServiceMock = (overrides = {}) => {
  const revokedUserTokens = [];
  const revokedInstallationTokens = [];
  return {
    revokedUserTokens,
    revokedInstallationTokens,
    createAuthorizationUrl({ config, state, codeChallenge }) {
      const url = new URL('https://github.com/login/oauth/authorize');
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.callbackUrl);
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('scope', 'offline_access');
      return url.toString();
    },
    async exchangeCode() { return OAUTH_ACCESS_TOKEN; },
    async getGitHubUser() { return { id: 1001, login: 'octocat' }; },
    async listUserInstallations() { return [installation]; },
    async revokeUserAuthorization({ accessToken }) { revokedUserTokens.push(accessToken); },
    async createInstallationAccessToken() { return INSTALLATION_TOKEN; },
    async revokeInstallationAccessToken(token) { revokedInstallationTokens.push(token); },
    ...overrides,
  };
};

const createFixture = (options = {}) => {
  const OAuthStateModel = options.OAuthStateModel || createStateModel();
  const PendingLinkModel = options.PendingLinkModel || createPendingModel();
  const IntegrationModel = options.IntegrationModel || createIntegrationModel();
  let currentTime = options.currentTime || new Date('2026-01-01T00:00:00.000Z');
  const appService = options.appService || createAppServiceMock();
  const service = createGithubService({
    OAuthStateModel,
    PendingLinkModel,
    IntegrationModel,
    configProvider: options.configProvider || (() => githubConfig),
    appService,
    fetchImpl: options.fetchImpl || (async () => new Response('{}', { status: 200 })),
    now: () => new Date(currentTime),
    randomBytes: options.randomBytes,
  });

  return {
    service,
    OAuthStateModel,
    PendingLinkModel,
    IntegrationModel,
    appService,
    setTime(value) { currentTime = new Date(value); },
  };
};

const makeConnectedFixture = (options = {}) => createFixture({
  IntegrationModel: createIntegrationModel([{
    _id: 'connection-1',
    userId: USER_ID,
    githubAccountId: '1001',
    githubLogin: 'octocat',
    installationId: '42',
    installationAccountId: '84',
    installationAccountLogin: 'nebulith-org',
    installationAccountType: 'Organization',
  }]),
  ...options,
});

const createRepo = (overrides = {}) => ({
  id: 7,
  name: 'neb-public',
  full_name: 'nebulith/neb-public',
  description: 'Public repository',
  private: false,
  visibility: 'public',
  language: 'JavaScript',
  default_branch: 'main',
  stargazers_count: 12,
  forks_count: 3,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-02-01T00:00:00Z',
  pushed_at: '2025-03-01T00:00:00Z',
  html_url: 'https://github.com/nebulith/neb-public',
  ...overrides,
});

const startOAuth = async (fixture, userId = USER_ID) => {
  const authorizationUrl = new URL(await fixture.service.startConnection(userId));
  return { authorizationUrl, state: authorizationUrl.searchParams.get('state') };
};

test('link initiation stores only a hash of one-time state and uses PKCE with a fixed callback', async () => {
  const fixture = createFixture();
  const { authorizationUrl, state } = await startOAuth(fixture);
  const savedState = fixture.OAuthStateModel.records[0];
  const verifierHash = createHash('sha256').update(savedState.codeVerifier).digest('base64url');

  assert.equal(authorizationUrl.origin, 'https://github.com');
  assert.equal(authorizationUrl.pathname, '/login/oauth/authorize');
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), githubConfig.callbackUrl);
  assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorizationUrl.searchParams.get('code_challenge'), verifierHash);
  assert.equal(authorizationUrl.searchParams.get('scope'), 'offline_access');
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(savedState.stateHash, createHash('sha256').update(state).digest('hex'));
  assert.equal(savedState.stateHash.includes(state), false);
  assert.equal(savedState.expiresAt.toISOString(), '2026-01-01T00:10:00.000Z');
});

test('authorization state is consumed once and cannot be replayed', async () => {
  const fixture = createFixture();
  const { state } = await startOAuth(fixture);

  const result = await fixture.service.completeConnection({ code: 'one-time-code', state });
  assert.equal(result.status, 'installation_selection_required');
  assert.equal(fixture.OAuthStateModel.records.length, 0);
  await assert.rejects(
    fixture.service.completeConnection({ code: 'one-time-code', state }),
    { statusCode: 400, code: 'GITHUB_INVALID_CALLBACK' },
  );
});

test('expired OAuth state is rejected', async () => {
  const fixture = createFixture();
  const { state } = await startOAuth(fixture);
  fixture.setTime('2026-01-01T00:10:01.000Z');

  await assert.rejects(
    fixture.service.completeConnection({ code: 'one-time-code', state }),
    { statusCode: 400, code: 'GITHUB_INVALID_CALLBACK' },
  );
});

test('callback parameters are validated and authorization denial consumes state safely', async () => {
  const fixture = createFixture();
  await assert.rejects(
    fixture.service.completeConnection({ code: 'code-without-state' }),
    { statusCode: 400, code: 'GITHUB_INVALID_CALLBACK' },
  );

  const { state } = await startOAuth(fixture);
  await assert.rejects(
    fixture.service.completeConnection({ state, code: 'contains spaces' }),
    { statusCode: 400, code: 'GITHUB_INVALID_CALLBACK' },
  );
  const deniedFlow = await startOAuth(fixture);
  await assert.rejects(
    fixture.service.completeConnection({ state: deniedFlow.state, error: 'access_denied', error_description: 'private detail' }),
    { statusCode: 400, code: 'GITHUB_AUTHORIZATION_DENIED' },
  );
  assert.equal(fixture.OAuthStateModel.records.length, 0);
});

test('callback links the GitHub identity to the initiating NEBULITH user without persisting tokens', async () => {
  const fixture = createFixture();
  const { state } = await startOAuth(fixture);
  const result = await fixture.service.completeConnection({ code: 'one-time-code', state });

  assert.equal(result.githubLogin, 'octocat');
  assert.equal(fixture.PendingLinkModel.records[0].userId, USER_ID);
  assert.equal(fixture.PendingLinkModel.records[0].githubAccountId, '1001');
  assert.equal(fixture.PendingLinkModel.records[0].installations[0].installationId, '42');
  assert.deepEqual(fixture.appService.revokedUserTokens, [OAUTH_ACCESS_TOKEN]);
  assert.doesNotMatch(JSON.stringify(fixture.PendingLinkModel.records), /ghu-|accessToken|refreshToken/);
  assert.doesNotMatch(JSON.stringify(result), /ghu-|accessToken|refreshToken/);
});

test('users without an app installation receive a fixed GitHub installation URL', async () => {
  const appService = createAppServiceMock({ async listUserInstallations() { return []; } });
  const fixture = createFixture({ appService });
  const { state } = await startOAuth(fixture);

  const result = await fixture.service.completeConnection({ code: 'one-time-code', state });

  assert.deepEqual(result, {
    status: 'installation_required',
    githubLogin: 'octocat',
    installationUrl: 'https://github.com/apps/nebulith-app/installations/new',
  });
  assert.deepEqual(appService.revokedUserTokens, [OAUTH_ACCESS_TOKEN]);
  assert.equal(fixture.PendingLinkModel.records.length, 0);
});

test('authenticated user can select an installation and complete the account link', async () => {
  const fixture = createFixture();
  const { state } = await startOAuth(fixture);
  await fixture.service.completeConnection({ code: 'one-time-code', state });

  const pending = await fixture.service.getPendingInstallations(USER_ID);
  assert.deepEqual(pending.installations, [{
    installationId: '42',
    accountLogin: 'nebulith-org',
    accountType: 'Organization',
  }]);

  const result = await fixture.service.selectInstallation(USER_ID, '42');
  assert.deepEqual(result, {
    connected: true,
    githubLogin: 'octocat',
    installation: { accountLogin: 'nebulith-org', accountType: 'Organization' },
  });
  assert.equal(fixture.IntegrationModel.records[0].userId, USER_ID);
  assert.equal(fixture.IntegrationModel.records[0].installationId, '42');
  assert.equal(fixture.PendingLinkModel.records.length, 0);
});

test('installation selection rejects ids absent from the callback-authorized installation list', async () => {
  const fixture = createFixture();
  const { state } = await startOAuth(fixture);
  await fixture.service.completeConnection({ code: 'one-time-code', state });

  await assert.rejects(
    fixture.service.selectInstallation(USER_ID, '999'),
    { statusCode: 403, code: 'GITHUB_INSTALLATION_NOT_AUTHORIZED' },
  );
});

test('one GitHub account cannot be linked to multiple NEBULITH accounts', async () => {
  const existing = {
    userId: 'other-user',
    githubAccountId: '1001',
    githubLogin: 'octocat',
    installationId: '3',
    installationAccountId: '4',
    installationAccountLogin: 'other-org',
    installationAccountType: 'Organization',
  };
  const fixture = createFixture({ IntegrationModel: createIntegrationModel([existing]) });
  const { state } = await startOAuth(fixture);
  await fixture.service.completeConnection({ code: 'one-time-code', state });

  await assert.rejects(
    fixture.service.selectInstallation(USER_ID, '42'),
    { statusCode: 409, code: 'GITHUB_ACCOUNT_ALREADY_LINKED' },
  );
  assert.equal(fixture.IntegrationModel.records.length, 1);
});

test('GitHub connection status is safe and disconnect removes the integration and pending flows', async () => {
  const fixture = makeConnectedFixture();
  await fixture.OAuthStateModel.create({
    userId: USER_ID,
    stateHash: 'hash-only-value',
    codeVerifier: 'temporary-verifier',
    expiresAt: new Date('2026-01-01T00:10:00.000Z'),
  });
  await fixture.PendingLinkModel.findOneAndUpdate({ userId: USER_ID }, {
    userId: USER_ID,
    githubAccountId: '1001',
    githubLogin: 'octocat',
    installations: [installation],
    expiresAt: new Date('2026-01-01T00:10:00.000Z'),
  });

  assert.deepEqual(await fixture.service.getConnectionStatus(USER_ID), {
    connected: true,
    githubLogin: 'octocat',
    installation: { accountLogin: 'nebulith-org', accountType: 'Organization' },
  });
  assert.deepEqual(await fixture.service.disconnect(USER_ID), { connected: false });
  assert.equal(fixture.IntegrationModel.records.length, 0);
  assert.equal(fixture.PendingLinkModel.records.length, 0);
  assert.equal(fixture.OAuthStateModel.records.length, 0);
  assert.deepEqual(await fixture.service.getConnectionStatus(USER_ID), { connected: false });
});

test('missing GitHub connection prevents repository access', async () => {
  const fixture = createFixture();

  await assert.rejects(
    fixture.service.listRepositories(USER_ID),
    { statusCode: 404, code: 'GITHUB_NOT_CONNECTED' },
  );
});

test('repository listing uses installation authorization and returns paginated public and private metadata', async () => {
  let requestedUrl;
  let authorizationHeader;
  const fixture = makeConnectedFixture({
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      authorizationHeader = options.headers.Authorization;
      return new Response(JSON.stringify({
        total_count: 23,
        repositories: [
          createRepo(),
          createRepo({
            id: 8,
            name: 'neb-private',
            full_name: 'nebulith/neb-private',
            description: null,
            private: true,
            visibility: 'private',
            language: null,
            stargazers_count: 0,
            forks_count: 0,
          }),
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const result = await fixture.service.listRepositories(USER_ID, { page: 3, perPage: 2 });

  assert.equal(requestedUrl.pathname, '/installation/repositories');
  assert.equal(requestedUrl.searchParams.get('page'), '3');
  assert.equal(requestedUrl.searchParams.get('per_page'), '2');
  assert.equal(authorizationHeader, `Bearer ${INSTALLATION_TOKEN}`);
  assert.deepEqual(result.pagination, { page: 3, perPage: 2, total: 23 });
  assert.equal(result.repositories[0].visibility, 'public');
  assert.equal(result.repositories[0].primaryLanguage, 'JavaScript');
  assert.equal(result.repositories[0].stars, 12);
  assert.equal(result.repositories[0].forks, 3);
  assert.equal(result.repositories[0].pushedAt, '2025-03-01T00:00:00Z');
  assert.equal(result.repositories[1].visibility, 'private');
  assert.equal(result.repositories[1].primaryLanguage, null);
  assert.equal(fixture.appService.revokedInstallationTokens.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /ghs-test-installation-access-token/);
});

test('repository metadata is retrieved through the linked installation token', async () => {
  let requestedPath;
  const fixture = makeConnectedFixture({
    fetchImpl: async (url) => {
      requestedPath = new URL(url).pathname;
      return new Response(JSON.stringify(createRepo()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const repository = await fixture.service.getRepository(USER_ID, 'nebulith', 'neb-public');

  assert.equal(requestedPath, '/repos/nebulith/neb-public');
  assert.equal(repository.fullName, 'nebulith/neb-public');
  assert.equal(repository.defaultBranch, 'main');
  assert.equal(fixture.appService.revokedInstallationTokens.length, 1);
});

test('commit history uses the linked installation token and GitHub pagination headers', async () => {
  let requestedUrl;
  let authorizationHeader;
  const fixture = makeConnectedFixture({
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      authorizationHeader = options.headers.Authorization;
      return new Response(JSON.stringify([{
        sha: 'a'.repeat(40),
        commit: {
          message: 'Add commit intelligence',
          author: { name: 'Reyansh Bitla', date: '2026-02-01T12:00:00Z' },
        },
        author: { id: 101, login: 'ReyanshBitla' },
        html_url: 'https://github.com/nebulith/neb-public/commit/aaaaaaaa',
      }]), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          link: '<https://api.github.com/repos/nebulith/neb-public/commits?page=4&per_page=5>; rel="next"',
        },
      });
    },
  });

  const result = await fixture.service.listCommits(USER_ID, 'nebulith', 'neb-public', { page: 3, perPage: 5 });

  assert.equal(requestedUrl.pathname, '/repos/nebulith/neb-public/commits');
  assert.equal(requestedUrl.searchParams.get('page'), '3');
  assert.equal(requestedUrl.searchParams.get('per_page'), '5');
  assert.equal(authorizationHeader, `Bearer ${INSTALLATION_TOKEN}`);
  assert.deepEqual(result.pagination, { page: 3, perPage: 5, hasNext: true });
  assert.deepEqual(result.commits[0], {
    sha: 'a'.repeat(40),
    message: 'Add commit intelligence',
    author: 'ReyanshBitla',
    authorLogin: 'ReyanshBitla',
    authorVerified: true,
    date: '2026-02-01T12:00:00Z',
    url: 'https://github.com/nebulith/neb-public/commit/aaaaaaaa',
  });
  assert.deepEqual(fixture.appService.revokedInstallationTokens, [INSTALLATION_TOKEN]);
});

test('invalid repository coordinates and commit SHAs are rejected before GitHub calls', async () => {
  let fetchCount = 0;
  const fixture = makeConnectedFixture({ fetchImpl: async () => { fetchCount += 1; return new Response('[]'); } });

  await assert.rejects(fixture.service.listCommits(USER_ID, '../owner', 'repo'), {
    statusCode: 400, code: 'GITHUB_INVALID_REPOSITORY',
  });
  await assert.rejects(fixture.service.getCommitDetails(USER_ID, 'owner', 'repo', 'not-a-sha'), {
    statusCode: 400, code: 'GITHUB_INVALID_COMMIT',
  });
  assert.equal(fetchCount, 0);
  assert.equal(fixture.appService.revokedInstallationTokens.length, 0);
});

test('empty commit history is returned as an empty list without invented pagination totals', async () => {
  const fixture = makeConnectedFixture({
    fetchImpl: async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }),
  });

  assert.deepEqual(await fixture.service.listCommits(USER_ID, 'nebulith', 'empty-repo'), {
    commits: [],
    pagination: { page: 1, perPage: 20, hasNext: false },
  });
});

test('commit author names without a verified GitHub account are never marked as contributor identities', async () => {
  const fixture = makeConnectedFixture({
    fetchImpl: async () => new Response(JSON.stringify([{
      sha: 'e'.repeat(40),
      commit: { message: 'Anonymous commit', author: { name: 'Local Developer', date: '2026-02-02T10:00:00Z' } },
      author: null,
      html_url: 'https://github.com/acme/project/commit/eeeeeeee',
    }]), { status: 200, headers: { 'content-type': 'application/json' } }),
  });

  const result = await fixture.service.listCommits(USER_ID, 'acme', 'project');

  assert.equal(result.commits[0].author, 'Local Developer');
  assert.equal(result.commits[0].authorLogin, null);
  assert.equal(result.commits[0].authorVerified, false);
});

test('commit history and details cannot access repositories outside the selected installation', async () => {
  const fixture = makeConnectedFixture({
    fetchImpl: async () => new Response(JSON.stringify({ message: 'private upstream message' }), { status: 404 }),
  });

  await assert.rejects(fixture.service.listCommits(USER_ID, 'another-owner', 'private-repo'), {
    statusCode: 404, code: 'GITHUB_RESOURCE_NOT_FOUND',
  });
  await assert.rejects(fixture.service.getCommitDetails(USER_ID, 'another-owner', 'private-repo', 'd'.repeat(40)), {
    statusCode: 404, code: 'GITHUB_RESOURCE_NOT_FOUND',
  });
  assert.equal(fixture.appService.revokedInstallationTokens.length, 2);
});

test('commit details return only safe summary fields and available diff statistics', async () => {
  let requestedPath;
  const fixture = makeConnectedFixture({
    fetchImpl: async (url) => {
      requestedPath = new URL(url).pathname;
      return new Response(JSON.stringify({
        sha: 'b'.repeat(40),
        commit: { message: 'Improve dashboard', author: { name: 'A. Developer', date: '2026-02-02T08:30:00Z' } },
        author: { id: 102, login: 'developer' },
        html_url: 'https://github.com/nebulith/neb-public/commit/bbbbbbbb',
        stats: { additions: 21, deletions: 4, total: 25 },
        files: [{ filename: 'src/private.js', patch: 'must not be retained' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const result = await fixture.service.getCommitDetails(USER_ID, 'nebulith', 'neb-public', 'b'.repeat(40));

  assert.equal(requestedPath, `/repos/nebulith/neb-public/commits/${'b'.repeat(40)}`);
  assert.deepEqual(result, {
    sha: 'b'.repeat(40),
    message: 'Improve dashboard',
    author: 'developer',
    authorLogin: 'developer',
    authorVerified: true,
    date: '2026-02-02T08:30:00Z',
    url: 'https://github.com/nebulith/neb-public/commit/bbbbbbbb',
    stats: { additions: 21, deletions: 4, total: 25 },
  });
  assert.doesNotMatch(JSON.stringify(result), /private\.js|patch/);
});

test('commit activity distinguishes ready zero activity from unavailable and computing statistics', async () => {
  const responses = [
    new Response(JSON.stringify([{ week: 1_770_000_000, total: 0, days: [0, 0, 0, 0, 0, 0, 0] }]), {
      status: 200, headers: { 'content-type': 'application/json' },
    }),
    new Response(null, { status: 204 }),
    new Response(null, { status: 202, headers: { 'retry-after': '30' } }),
    new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }),
  ];
  const fixture = makeConnectedFixture({ fetchImpl: async () => responses.shift() });

  assert.deepEqual(await fixture.service.getCommitActivity(USER_ID, 'nebulith', 'neb-public'), {
    status: 'ready',
    weeks: [{ week: 1_770_000_000, total: 0, days: [0, 0, 0, 0, 0, 0, 0] }],
  });
  assert.deepEqual(await fixture.service.getCommitActivity(USER_ID, 'nebulith', 'neb-public'), {
    status: 'unavailable', weeks: [],
  });
  assert.deepEqual(await fixture.service.getCommitActivity(USER_ID, 'nebulith', 'neb-public'), {
    status: 'computing', weeks: [], retryAfterSeconds: 30,
  });
  assert.deepEqual(await fixture.service.getCommitActivity(USER_ID, 'nebulith', 'neb-public'), {
    status: 'unavailable', weeks: [],
  });
  assert.equal(fixture.appService.revokedInstallationTokens.length, 4);
});

test('commit API rate limits are mapped safely and preserve Retry-After', async () => {
  const fixture = makeConnectedFixture({
    fetchImpl: async () => new Response(JSON.stringify({ message: 'secret upstream response' }), {
      status: 403,
      headers: { 'x-ratelimit-remaining': '0', 'retry-after': '45' },
    }),
  });

  await assert.rejects(fixture.service.listCommits(USER_ID, 'nebulith', 'neb-public'), (error) => {
    assert.equal(error.statusCode, 429);
    assert.equal(error.retryAfter, 45);
    assert.doesNotMatch(error.message, /secret upstream/);
    return true;
  });
  assert.deepEqual(fixture.appService.revokedInstallationTokens, [INSTALLATION_TOKEN]);
});

test('repository language breakdown calculates bytes and percentages and handles empty responses', () => {
  assert.deepEqual(mapLanguageBreakdown({ JavaScript: 75, CSS: 25 }), {
    totalBytes: 100,
    languages: [
      { name: 'JavaScript', bytes: 75, percentage: 75 },
      { name: 'CSS', bytes: 25, percentage: 25 },
    ],
  });
  assert.deepEqual(mapLanguageBreakdown({}), { totalBytes: 0, languages: [] });
  assert.throws(() => mapLanguageBreakdown({ JavaScript: -1 }), { code: 'GITHUB_INVALID_RESPONSE' });
});

test('language aggregation sums raw bytes before percentages and counts each repository once', () => {
  const result = aggregateLanguageBreakdowns([
    { id: 1, name: 'one', fullName: 'owner/one', languageBytes: { JavaScript: 900, Rust: 100 } },
    { id: 2, name: 'two', fullName: 'owner/two', languageBytes: { JavaScript: 100, Python: 800 } },
    { id: 1, name: 'one duplicate', fullName: 'owner/one', languageBytes: { JavaScript: 900, Rust: 100 } },
  ]);

  assert.equal(result.repositories.length, 2);
  assert.equal(result.aggregate.totalBytes, 1900);
  assert.deepEqual(result.aggregate.languages, [
    { name: 'JavaScript', bytes: 1000, repositoryCount: 2, percentage: (1000 / 1900) * 100 },
    { name: 'Python', bytes: 800, repositoryCount: 1, percentage: (800 / 1900) * 100 },
    { name: 'Rust', bytes: 100, repositoryCount: 1, percentage: (100 / 1900) * 100 },
  ]);
  assert.equal(result.repositories[0].languages[0].percentage, 90);
  assert.match(result.attribution, /approximation/);
});

test('language intelligence uses the connected installation, paginates repositories, and returns empty data safely', async () => {
  const requests = [];
  const fixture = makeConnectedFixture({
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      requests.push({ path: parsed.pathname, search: parsed.searchParams, authorization: options.headers.Authorization });
      if (parsed.pathname === '/installation/repositories') {
        const page = parsed.searchParams.get('page');
        const repositories = page === '1'
          ? [{ id: 11, name: 'one', full_name: 'nebulith/one', owner: { login: 'nebulith' }, html_url: 'https://github.com/nebulith/one' }]
          : [
            { id: 12, name: 'two', full_name: 'nebulith/two', owner: { login: 'nebulith' }, html_url: 'https://github.com/nebulith/two' },
            { id: 11, name: 'one', full_name: 'nebulith/one', owner: { login: 'nebulith' }, html_url: 'https://github.com/nebulith/one' },
          ];
        return new Response(JSON.stringify({ repositories }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            ...(page === '1' ? { link: '<https://api.github.com/installation/repositories?per_page=100&page=2>; rel="next"' } : {}),
          },
        });
      }
      const languageBytes = parsed.pathname.endsWith('/one/languages') ? { JavaScript: 300, CSS: 100 } : {};
      return new Response(JSON.stringify(languageBytes), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const result = await fixture.service.getLanguageIntelligence(USER_ID);

  assert.equal(requests.filter((request) => request.path === '/installation/repositories').length, 2);
  assert.equal(requests.filter((request) => request.path.endsWith('/languages')).length, 2);
  assert.ok(requests.every((request) => request.authorization === `Bearer ${INSTALLATION_TOKEN}`));
  assert.equal(result.repositories.length, 2);
  assert.equal(result.repositories[1].totalBytes, 0);
  assert.deepEqual(result.aggregate, {
    totalBytes: 400,
    languages: [
      { name: 'JavaScript', bytes: 300, repositoryCount: 1, percentage: 75 },
      { name: 'CSS', bytes: 100, repositoryCount: 1, percentage: 25 },
    ],
  });
  assert.deepEqual(fixture.appService.revokedInstallationTokens, [INSTALLATION_TOKEN]);
  assert.doesNotMatch(JSON.stringify(result), /ghs-test-installation-access-token/);
});

test('repository languages validate coordinates and map GitHub API failures safely', async () => {
  let fetchCount = 0;
  const fixture = makeConnectedFixture({
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ message: 'private upstream text' }), {
        status: 403,
        headers: { 'retry-after': '22' },
      });
    },
  });

  await assert.rejects(fixture.service.getRepositoryLanguages(USER_ID, '../owner', 'repo'), {
    statusCode: 400, code: 'GITHUB_INVALID_REPOSITORY',
  });
  await assert.rejects(fixture.service.getRepositoryLanguages(USER_ID, 'owner', 'repo'), {
    statusCode: 429, code: 'GITHUB_RATE_LIMITED', retryAfter: 22,
  });
  assert.equal(fetchCount, 1);
  assert.deepEqual(fixture.appService.revokedInstallationTokens, [INSTALLATION_TOKEN]);
});

test('contributor mapping distinguishes verified GitHub accounts from anonymous authors', () => {
  assert.deepEqual(mapContributor({
    id: 123,
    login: 'dev-account',
    avatar_url: 'https://avatars.githubusercontent.com/u/123',
    contributions: 18,
  }), {
    id: 123,
    login: 'dev-account',
    avatarUrl: 'https://avatars.githubusercontent.com/u/123',
    profileUrl: 'https://github.com/dev-account',
    verified: true,
    contributions: 18,
  });

  const anonymous = mapContributor({ name: 'Commit Author', email: 'private@example.test', contributions: 4 });
  assert.deepEqual(anonymous, {
    id: null, login: null, avatarUrl: null, profileUrl: null, verified: false, contributions: 4,
  });
  assert.doesNotMatch(JSON.stringify(anonymous), /Commit Author|private@example\.test/);
  assert.equal(mapContributor({ id: 2, login: 'fake-login', avatar_url: 'https://evil.example/avatar.png', contributions: 1 }).avatarUrl, null);
});

test('contributor activity aggregates weekly commits and omits anonymous identity claims', () => {
  const result = mapContributorActivity([
    { author: { id: 10, login: 'first' }, total: 3, weeks: [{ w: 100, c: 2 }, { w: 200, c: 1 }] },
    { author: { id: 11, login: 'second' }, total: 2, weeks: [{ w: 100, c: 1 }, { w: 300, c: 1 }] },
    { author: null, total: 1, weeks: [{ w: 200, c: 1 }] },
  ]);

  assert.deepEqual(result, {
    status: 'ready',
    weeks: [{ week: 100, commits: 3 }, { week: 200, commits: 2 }, { week: 300, commits: 1 }],
    contributors: [
      { id: 10, login: 'first', weeks: [{ week: 100, commits: 2 }, { week: 200, commits: 1 }] },
      { id: 11, login: 'second', weeks: [{ week: 100, commits: 1 }, { week: 300, commits: 1 }] },
    ],
  });
  assert.throws(() => mapContributorActivity([{ total: 1, weeks: [{ w: 100, c: -1 }] }]), { code: 'GITHUB_INVALID_RESPONSE' });
});

test('contributor listing paginates verified and anonymous results through the installation token', async () => {
  let requestedUrl;
  let authorizationHeader;
  const fixture = makeConnectedFixture({
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      authorizationHeader = options.headers.Authorization;
      return new Response(JSON.stringify([
        { id: 70, login: 'contributor', avatar_url: 'https://avatars.githubusercontent.com/u/70', contributions: 12 },
        { name: 'Private Author Name', email: 'author@example.test', contributions: 3 },
      ]), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          link: '<https://api.github.com/repos/acme/project/contributors?page=2&per_page=2&anon=1>; rel="next"',
        },
      });
    },
  });

  const result = await fixture.service.listContributors(USER_ID, 'acme', 'project', { page: 1, perPage: 2 });

  assert.equal(requestedUrl.pathname, '/repos/acme/project/contributors');
  assert.equal(requestedUrl.searchParams.get('anon'), '1');
  assert.equal(requestedUrl.searchParams.get('page'), '1');
  assert.equal(requestedUrl.searchParams.get('per_page'), '2');
  assert.equal(authorizationHeader, `Bearer ${INSTALLATION_TOKEN}`);
  assert.deepEqual(result.pagination, { page: 1, perPage: 2, hasNext: true });
  assert.equal(result.contributors[0].verified, true);
  assert.equal(result.contributors[1].verified, false);
  assert.doesNotMatch(JSON.stringify(result), /Private Author Name|author@example\.test|ghs-test-installation-access-token/);
  assert.deepEqual(fixture.appService.revokedInstallationTokens, [INSTALLATION_TOKEN]);
});

test('empty repositories return an empty contributor list and invalid coordinates are rejected locally', async () => {
  let fetchCount = 0;
  const fixture = makeConnectedFixture({
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(null, { status: 204 });
    },
  });

  await assert.rejects(fixture.service.listContributors(USER_ID, '../owner', 'repo'), {
    statusCode: 400, code: 'GITHUB_INVALID_REPOSITORY',
  });
  assert.equal(fetchCount, 0);
  assert.deepEqual(await fixture.service.listContributors(USER_ID, 'acme', 'empty-repo'), {
    contributors: [],
    pagination: { page: 1, perPage: 30, hasNext: false },
  });
  assert.equal(fixture.appService.revokedInstallationTokens.length, 1);
});

test('contributor activity distinguishes ready, computing, unavailable and rate-limited responses', async () => {
  const responses = [
    new Response(null, { status: 202, headers: { 'retry-after': '18' } }),
    new Response(null, { status: 204 }),
    new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }),
    new Response(JSON.stringify([{ author: { id: 5, login: 'dev' }, total: 1, weeks: [{ w: 300, c: 1 }] }]), {
      status: 200, headers: { 'content-type': 'application/json' },
    }),
    new Response(JSON.stringify({ message: 'private error body' }), { status: 403, headers: { 'retry-after': '25' } }),
  ];
  const fixture = makeConnectedFixture({ fetchImpl: async () => responses.shift() });

  assert.deepEqual(await fixture.service.getContributorActivity(USER_ID, 'acme', 'project'), {
    status: 'computing', weeks: [], contributors: [], retryAfterSeconds: 18,
  });
  assert.deepEqual(await fixture.service.getContributorActivity(USER_ID, 'acme', 'project'), {
    status: 'unavailable', weeks: [], contributors: [],
  });
  assert.deepEqual(await fixture.service.getContributorActivity(USER_ID, 'acme', 'project'), {
    status: 'unavailable', weeks: [], contributors: [],
  });
  assert.deepEqual(await fixture.service.getContributorActivity(USER_ID, 'acme', 'project'), {
    status: 'ready', weeks: [{ week: 300, commits: 1 }], contributors: [{ id: 5, login: 'dev', weeks: [{ week: 300, commits: 1 }] }],
  });
  await assert.rejects(fixture.service.getContributorActivity(USER_ID, 'acme', 'project'), {
    statusCode: 429, code: 'GITHUB_RATE_LIMITED', retryAfter: 25,
  });
  assert.equal(fixture.appService.revokedInstallationTokens.length, 5);
});

test('repositories outside the installation are treated as unavailable', async () => {
  const fixture = makeConnectedFixture({
    fetchImpl: async () => new Response(JSON.stringify({ message: 'private details' }), { status: 404 }),
  });

  await assert.rejects(
    fixture.service.getRepository(USER_ID, 'other-owner', 'private-repo'),
    { statusCode: 404, code: 'GITHUB_RESOURCE_NOT_FOUND' },
  );
  assert.equal(fixture.appService.revokedInstallationTokens.length, 1);
});

test('revoked or removed GitHub installations require reconnecting', async () => {
  const fixture = makeConnectedFixture({
    appService: createAppServiceMock({
      async createInstallationAccessToken() {
        const error = new Error('Do not expose upstream details.');
        error.statusCode = 404;
        error.code = 'GITHUB_RESOURCE_NOT_FOUND';
        throw error;
      },
    }),
  });

  await assert.rejects(
    fixture.service.listRepositories(USER_ID),
    { statusCode: 409, code: 'GITHUB_INSTALLATION_UNAVAILABLE' },
  );
});

test('GitHub API errors and rate limits are mapped without exposing upstream bodies or tokens', async () => {
  const secretResponseText = 'upstream error contains ghs-do-not-expose-this-token';
  const unauthorizedResponse = new Response(JSON.stringify({ message: secretResponseText }), { status: 401 });
  await assert.rejects(requestGithubApi({
    path: '/user',
    token: 'ghs-request-token',
    fetchImpl: async () => unauthorizedResponse,
  }), (error) => {
    assert.equal(error.statusCode, 401);
    assert.doesNotMatch(error.message, /ghs-|do-not-expose/);
    return true;
  });

  const resetAt = Math.floor(Date.now() / 1000) + 60;
  const limitedResponse = new Response(JSON.stringify({ message: secretResponseText }), {
    status: 403,
    headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetAt) },
  });
  await assert.rejects(requestGithubApi({
    path: '/installation/repositories',
    token: 'ghs-request-token',
    fetchImpl: async () => limitedResponse,
  }), (error) => {
    assert.equal(error.statusCode, 429);
    assert.ok(error.retryAfter >= 0 && error.retryAfter <= 60);
    assert.doesNotMatch(error.message, /ghs-|do-not-expose/);
    return true;
  });
});

test('GitHub API request construction cannot be redirected to another origin', async () => {
  await assert.rejects(requestGithubApi({
    path: 'https://evil.example/steal',
    token: 'token',
    fetchImpl: async () => new Response('{}'),
  }), { statusCode: 500, code: 'GITHUB_REQUEST_CONFIGURATION_ERROR' });
});

test('GitHub route requires NEBULITH authentication before starting account linking', async () => {
  const app = createApp({
    nodeEnv: 'test',
    frontendUrl: null,
    jwtSecret: NEBULITH_JWT_SECRET,
    jwtExpiresIn: '1h',
  }, { UserModel: { findById: async () => null } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/github/connect`);
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('authenticated link initiation returns a safe GitHub URL and persists user-bound state', async () => {
  const OAuthStateModel = createStateModel();
  const UserModel = { findById: async (id) => ({ _id: id }) };
  const accessToken = jwt.sign({}, NEBULITH_JWT_SECRET, {
    algorithm: 'HS256', subject: USER_ID, expiresIn: '1h',
  });
  const app = createApp({
    nodeEnv: 'test',
    frontendUrl: null,
    jwtSecret: NEBULITH_JWT_SECRET,
    jwtExpiresIn: '1h',
  }, {
    UserModel,
    OAuthStateModel,
    configProvider: () => githubConfig,
    appService: createAppServiceMock(),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/github/connect`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = await response.json();
    const authorizationUrl = new URL(body.data.authorizationUrl);

    assert.equal(response.status, 200);
    assert.equal(authorizationUrl.origin, 'https://github.com');
    assert.equal(authorizationUrl.searchParams.has('client_secret'), false);
    assert.equal(OAuthStateModel.records.length, 1);
    assert.equal(OAuthStateModel.records[0].userId, USER_ID);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('authenticated repository endpoint applies client pagination and never returns tokens', async () => {
  const integrationModel = createIntegrationModel([{
    _id: 'connection-1',
    userId: USER_ID,
    githubAccountId: '1001',
    githubLogin: 'octocat',
    installationId: '42',
    installationAccountId: '84',
    installationAccountLogin: 'nebulith-org',
    installationAccountType: 'Organization',
  }]);
  const UserModel = { findById: async (id) => ({ _id: id }) };
  const tokenService = jwt;
  const accessToken = tokenService.sign({}, NEBULITH_JWT_SECRET, {
    algorithm: 'HS256', subject: USER_ID, expiresIn: '1h',
  });
  let apiUrl;
  const appService = createAppServiceMock();
  const app = createApp({
    nodeEnv: 'test',
    frontendUrl: null,
    jwtSecret: NEBULITH_JWT_SECRET,
    jwtExpiresIn: '1h',
  }, {
    UserModel,
    IntegrationModel: integrationModel,
    configProvider: () => githubConfig,
    appService,
    fetchImpl: async (url) => {
      apiUrl = new URL(url);
      return new Response(JSON.stringify({ total_count: 1, repositories: [createRepo()] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/github/repositories?page=2&per_page=5`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const text = await response.text();
    const body = JSON.parse(text);

    assert.equal(response.status, 200);
    assert.equal(apiUrl.searchParams.get('page'), '2');
    assert.equal(apiUrl.searchParams.get('per_page'), '5');
    assert.equal(body.data.pagination.page, 2);
    assert.equal(body.data.repositories[0].fullName, 'nebulith/neb-public');
    assert.doesNotMatch(text, /ghs-test-installation-access-token/);
    assert.deepEqual(appService.revokedInstallationTokens, [INSTALLATION_TOKEN]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('commit intelligence routes require NEBULITH auth and return paginated commits, details, and activity', async () => {
  const integrationModel = createIntegrationModel([{
    userId: USER_ID,
    githubAccountId: '1001',
    installationId: '42',
    installationAccountId: '84',
    installationAccountLogin: 'nebulith-org',
    installationAccountType: 'Organization',
  }]);
  const accessToken = jwt.sign({}, NEBULITH_JWT_SECRET, {
    algorithm: 'HS256', subject: USER_ID, expiresIn: '1h',
  });
  const appService = createAppServiceMock();
  const app = createApp({
    nodeEnv: 'test', frontendUrl: null, jwtSecret: NEBULITH_JWT_SECRET, jwtExpiresIn: '1h',
  }, {
    UserModel: { findById: async (id) => ({ _id: id }) },
    IntegrationModel: integrationModel,
    configProvider: () => githubConfig,
    appService,
    fetchImpl: async (url) => {
      const { pathname } = new URL(url);
      if (pathname.endsWith('/stats/commit_activity')) {
        return new Response(JSON.stringify([{ week: 1_770_000_000, total: 2, days: [0, 0, 1, 0, 0, 1, 0] }]), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (pathname.endsWith(`/${'c'.repeat(40)}`)) {
        return new Response(JSON.stringify({
          sha: 'c'.repeat(40), commit: { message: 'Commit details', author: { name: 'Developer', date: '2026-02-03T12:00:00Z' } },
          html_url: 'https://github.com/nebulith/neb-public/commit/cccccccc', stats: { additions: 2, deletions: 1, total: 3 },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify([{
        sha: 'c'.repeat(40), commit: { message: 'Commit details', author: { name: 'Developer', date: '2026-02-03T12:00:00Z' } },
        html_url: 'https://github.com/nebulith/neb-public/commit/cccccccc',
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/github/repositories/nebulith/neb-public`;

  try {
    for (const path of ['/commits', `/commits/${'c'.repeat(40)}`, '/commit-activity']) {
      const unauthenticated = await fetch(`${baseUrl}${path}`);
      assert.equal(unauthenticated.status, 401);
    }

    const commitsResponse = await fetch(`${baseUrl}/commits?page=2&per_page=5`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const commitsBody = await commitsResponse.json();
    assert.equal(commitsResponse.status, 200);
    assert.deepEqual(commitsBody.data.pagination, { page: 2, perPage: 5, hasNext: false });
    assert.equal(commitsBody.data.commits[0].sha, 'c'.repeat(40));

    const detailsResponse = await fetch(`${baseUrl}/commits/${'c'.repeat(40)}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const detailsBody = await detailsResponse.json();
    assert.equal(detailsResponse.status, 200);
    assert.deepEqual(detailsBody.data.commit.stats, { additions: 2, deletions: 1, total: 3 });

    const activityResponse = await fetch(`${baseUrl}/commit-activity`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const activityBody = await activityResponse.json();
    assert.equal(activityResponse.status, 200);
    assert.equal(activityBody.data.status, 'ready');
    assert.equal(activityBody.data.weeks[0].total, 2);

    const invalidPagination = await fetch(`${baseUrl}/commits?per_page=101`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(invalidPagination.status, 400);
    assert.deepEqual(appService.revokedInstallationTokens, [
      INSTALLATION_TOKEN, INSTALLATION_TOKEN, INSTALLATION_TOKEN,
    ]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('language endpoints require NEBULITH auth and expose aggregate and repository breakdowns', async () => {
  const integrationModel = createIntegrationModel([{
    userId: USER_ID,
    githubAccountId: '1001',
    installationId: '42',
    installationAccountId: '84',
    installationAccountLogin: 'nebulith-org',
    installationAccountType: 'Organization',
  }]);
  const accessToken = jwt.sign({}, NEBULITH_JWT_SECRET, {
    algorithm: 'HS256', subject: USER_ID, expiresIn: '1h',
  });
  const appService = createAppServiceMock();
  const app = createApp({
    nodeEnv: 'test', frontendUrl: null, jwtSecret: NEBULITH_JWT_SECRET, jwtExpiresIn: '1h',
  }, {
    UserModel: { findById: async (id) => ({ _id: id }) },
    IntegrationModel: integrationModel,
    configProvider: () => githubConfig,
    appService,
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/installation/repositories') {
        return new Response(JSON.stringify({ repositories: [{
          id: 51, name: 'neb-public', full_name: 'nebulith/neb-public',
          owner: { login: 'nebulith' }, html_url: 'https://github.com/nebulith/neb-public',
        }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ TypeScript: 240, CSS: 60 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/github`;

  try {
    assert.equal((await fetch(`${baseUrl}/languages`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/repositories/nebulith/neb-public/languages`)).status, 401);

    const aggregateResponse = await fetch(`${baseUrl}/languages`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const aggregateBody = await aggregateResponse.json();
    assert.equal(aggregateResponse.status, 200);
    assert.equal(aggregateBody.data.aggregate.totalBytes, 300);
    assert.equal(aggregateBody.data.repositories[0].languages[0].percentage, 80);

    const repositoryResponse = await fetch(`${baseUrl}/repositories/nebulith/neb-public/languages`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const repositoryBody = await repositoryResponse.json();
    assert.equal(repositoryResponse.status, 200);
    assert.deepEqual(repositoryBody.data.repository.languages, [
      { name: 'TypeScript', bytes: 240, percentage: 80 },
      { name: 'CSS', bytes: 60, percentage: 20 },
    ]);
    assert.deepEqual(appService.revokedInstallationTokens, [INSTALLATION_TOKEN, INSTALLATION_TOKEN]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('contributor endpoints enforce authentication, validate pagination, and return safe stats states', async () => {
  const integrationModel = createIntegrationModel([{
    userId: USER_ID,
    githubAccountId: '1001',
    installationId: '42',
    installationAccountId: '84',
    installationAccountLogin: 'nebulith-org',
    installationAccountType: 'Organization',
  }]);
  const accessToken = jwt.sign({}, NEBULITH_JWT_SECRET, {
    algorithm: 'HS256', subject: USER_ID, expiresIn: '1h',
  });
  let contributorUrl;
  const appService = createAppServiceMock();
  const app = createApp({
    nodeEnv: 'test', frontendUrl: null, jwtSecret: NEBULITH_JWT_SECRET, jwtExpiresIn: '1h',
  }, {
    UserModel: { findById: async (id) => ({ _id: id }) },
    IntegrationModel: integrationModel,
    configProvider: () => githubConfig,
    appService,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/repos/acme/project/contributors') {
        contributorUrl = parsed;
        return new Response(JSON.stringify([{ id: 9, login: 'verified-user', contributions: 8 }]), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(null, { status: 202, headers: { 'retry-after': '15' } });
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/github/repositories/acme/project`;

  try {
    assert.equal((await fetch(`${baseUrl}/contributors`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/contributor-activity`)).status, 401);

    const invalidPagination = await fetch(`${baseUrl}/contributors?page=0`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(invalidPagination.status, 400);

    const contributorsResponse = await fetch(`${baseUrl}/contributors?page=2&per_page=5`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const contributorsBody = await contributorsResponse.json();
    assert.equal(contributorsResponse.status, 200);
    assert.equal(contributorUrl.searchParams.get('page'), '2');
    assert.equal(contributorUrl.searchParams.get('per_page'), '5');
    assert.equal(contributorUrl.searchParams.get('anon'), '1');
    assert.equal(contributorsBody.data.contributors[0].login, 'verified-user');

    const activityResponse = await fetch(`${baseUrl}/contributor-activity`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const activityBody = await activityResponse.json();
    assert.equal(activityResponse.status, 200);
    assert.deepEqual(activityBody.data, { status: 'computing', weeks: [], contributors: [], retryAfterSeconds: 15 });
    assert.deepEqual(appService.revokedInstallationTokens, [INSTALLATION_TOKEN, INSTALLATION_TOKEN]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('GitHub App JWT uses RS256 with an issuer and short validity', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const appService = createGithubAppService({ now: () => Date.parse('2026-01-01T00:00:00Z') });
  const token = appService.createAppJwt({ ...githubConfig, privateKey });
  const verified = jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    clockTimestamp: Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000),
  });

  assert.equal(verified.iss, githubConfig.appId);
  assert.equal(verified.exp - verified.iat, 9 * 60);
});

test('installation tokens request only existing read permissions needed by repository intelligence', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let requestBody;
  let requestUrl;
  let requestJwt;
  const appService = createGithubAppService({
    now: () => Date.parse('2026-01-01T00:00:00Z'),
    fetchImpl: async (url, options) => {
      requestUrl = new URL(url);
      requestBody = JSON.parse(options.body);
      requestJwt = options.headers.Authorization.slice('Bearer '.length);
      return new Response(JSON.stringify({ token: INSTALLATION_TOKEN }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const token = await appService.createInstallationAccessToken({
    config: { ...githubConfig, privateKey },
    installationId: '42',
  });
  const claims = jwt.verify(requestJwt, publicKey, {
    algorithms: ['RS256'],
    clockTimestamp: Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000),
  });

  assert.equal(token, INSTALLATION_TOKEN);
  assert.equal(requestUrl.pathname, '/app/installations/42/access_tokens');
  assert.deepEqual(requestBody, { permissions: { contents: 'read', metadata: 'read', pull_requests: 'read' } });
  assert.equal(claims.iss, githubConfig.appId);
});

test('pull request endpoints require authentication, validate filters and pagination, and return safe paginated data', async () => {
  const integrationModel = createIntegrationModel([{
    userId: USER_ID,
    githubAccountId: '1001',
    installationId: '42',
    installationAccountId: '84',
    installationAccountLogin: 'nebulith-org',
    installationAccountType: 'Organization',
  }]);
  const accessToken = jwt.sign({}, NEBULITH_JWT_SECRET, {
    algorithm: 'HS256', subject: USER_ID, expiresIn: '1h',
  });
  const appService = createAppServiceMock();
  const requests = [];
  const app = createApp({
    nodeEnv: 'test', frontendUrl: null, jwtSecret: NEBULITH_JWT_SECRET, jwtExpiresIn: '1h',
  }, {
    UserModel: { findById: async (id) => ({ _id: id }) },
    IntegrationModel: integrationModel,
    configProvider: () => githubConfig,
    appService,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      requests.push(parsed);
      if (parsed.pathname === '/repos/nebulith/neb-public') {
        return new Response(JSON.stringify({ id: 7, full_name: 'nebulith/neb-public' }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (parsed.pathname.endsWith('/pulls/7/files')) {
        return new Response(JSON.stringify([
          { filename: 'src/new.js', status: 'added', additions: 2, deletions: 0, changes: 2, patch: '@@ -0,0 +1,2 @@\n+one\n+two', blob_url: 'https://github.com/nebulith/neb-public/blob/head/src/new.js' },
          { filename: 'assets/icon.bin', status: 'modified', additions: 0, deletions: 0, changes: 0 },
          { filename: 'src/current.js', previous_filename: 'src/old.js', status: 'renamed', additions: 1, deletions: 1, changes: 2, patch: 'x'.repeat(13000) },
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json', link: '<https://api.github.com/repos/nebulith/neb-public/pulls/7/files?page=2>; rel="next"' },
        });
      }
      if (parsed.pathname.endsWith('/pulls/7')) {
        return new Response(JSON.stringify({
          number: 7, title: 'Improve session handling', body: 'Plain text PR description', state: 'closed', merged_at: '2026-04-03T10:00:00Z',
          user: { login: 'review-author' }, html_url: 'https://github.com/nebulith/neb-public/pull/7',
          created_at: '2026-04-01T10:00:00Z', updated_at: '2026-04-03T10:00:00Z', closed_at: '2026-04-03T10:00:00Z',
          base: { ref: 'main' }, head: { ref: 'feature/session' }, additions: 3, deletions: 1, changed_files: 3,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (parsed.pathname.endsWith('/pulls')) {
        return new Response(JSON.stringify([{
          number: 7, title: 'Improve session handling', state: 'closed', merged_at: '2026-04-03T10:00:00Z',
          user: { login: 'review-author' }, html_url: 'https://github.com/nebulith/neb-public/pull/7', updated_at: '2026-04-03T10:00:00Z',
          base: { ref: 'main' }, head: { ref: 'feature/session' },
        }]), {
          status: 200,
          headers: { 'content-type': 'application/json', link: '<https://api.github.com/repos/nebulith/neb-public/pulls?page=3>; rel="next"' },
        });
      }
      return new Response(JSON.stringify({ message: 'unexpected request' }), { status: 500, headers: { 'content-type': 'application/json' } });
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/github/repositories/nebulith/neb-public`;

  try {
    for (const path of ['/pulls', '/pulls/7', '/pulls/7/files']) {
      assert.equal((await fetch(`${baseUrl}${path}`)).status, 401);
    }

    const headers = { authorization: `Bearer ${accessToken}` };
    const invalidState = await fetch(`${baseUrl}/pulls?state=merged`, { headers });
    assert.equal(invalidState.status, 400);
    const invalidFilePageSize = await fetch(`${baseUrl}/pulls/7/files?per_page=51`, { headers });
    assert.equal(invalidFilePageSize.status, 400);
    const invalidPullNumber = await fetch(`${baseUrl}/pulls/0`, { headers });
    assert.equal(invalidPullNumber.status, 400);

    const listResponse = await fetch(`${baseUrl}/pulls?state=closed&page=2&per_page=5`, { headers });
    const listBody = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.deepEqual(listBody.data.pagination, { page: 2, perPage: 5, hasNext: true });
    assert.equal(listBody.data.pullRequests[0].merged, true);
    assert.equal(listBody.data.pullRequests[0].author, 'review-author');
    assert.equal(requests.find((url) => url.pathname.endsWith('/pulls')).searchParams.get('state'), 'closed');
    assert.equal(requests.find((url) => url.pathname.endsWith('/pulls')).searchParams.get('page'), '2');

    const detailResponse = await fetch(`${baseUrl}/pulls/7`, { headers });
    const detailBody = await detailResponse.json();
    assert.equal(detailResponse.status, 200);
    assert.equal(detailBody.data.pullRequest.body, 'Plain text PR description');
    assert.equal(detailBody.data.pullRequest.merged, true);
    assert.equal(detailBody.data.pullRequest.headBranch, 'feature/session');
    assert.equal('headSha' in detailBody.data.pullRequest, false);

    const filesResponse = await fetch(`${baseUrl}/pulls/7/files?page=1&per_page=3`, { headers });
    const filesBody = await filesResponse.json();
    assert.equal(filesResponse.status, 200);
    assert.deepEqual(filesBody.data.pagination, { page: 1, perPage: 3, hasNext: true });
    assert.equal(filesBody.data.files[0].patchAvailable, true);
    assert.equal(filesBody.data.files[1].patchAvailable, false);
    assert.equal(filesBody.data.files[2].previousFilename, 'src/old.js');
    assert.equal(filesBody.data.files[2].patch.length, 12000);
    assert.equal(filesBody.data.files[2].patchTruncated, true);
    assert.doesNotMatch(JSON.stringify({ listBody, detailBody, filesBody }), /ghs-test-installation-access-token|mock-private-key|client-secret/);
    assert.equal(appService.revokedInstallationTokens.length, 3);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('pull request routes do not access a repository unavailable to the connected installation', async () => {
  const integrationModel = createIntegrationModel([{
    userId: USER_ID, githubAccountId: '1001', installationId: '42', installationAccountId: '84',
    installationAccountLogin: 'nebulith-org', installationAccountType: 'Organization',
  }]);
  const accessToken = jwt.sign({}, NEBULITH_JWT_SECRET, { algorithm: 'HS256', subject: USER_ID, expiresIn: '1h' });
  let pullRequestCalls = 0;
  const app = createApp({ nodeEnv: 'test', frontendUrl: null, jwtSecret: NEBULITH_JWT_SECRET, jwtExpiresIn: '1h' }, {
    UserModel: { findById: async (id) => ({ _id: id }) },
    IntegrationModel: integrationModel,
    configProvider: () => githubConfig,
    appService: createAppServiceMock(),
    fetchImpl: async (url) => {
      if (new URL(url).pathname === '/repos/other-org/private-repo') {
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers: { 'content-type': 'application/json' } });
      }
      pullRequestCalls += 1;
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/github/repositories/other-org/private-repo/pulls`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(response.status, 404);
    assert.equal(pullRequestCalls, 0);
    assert.doesNotMatch(await response.text(), /installation-access-token|Not Found/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('pull request GitHub rate limits return a safe retry response', async () => {
  const integrationModel = createIntegrationModel([{
    userId: USER_ID, githubAccountId: '1001', installationId: '42', installationAccountId: '84',
    installationAccountLogin: 'nebulith-org', installationAccountType: 'Organization',
  }]);
  const accessToken = jwt.sign({}, NEBULITH_JWT_SECRET, { algorithm: 'HS256', subject: USER_ID, expiresIn: '1h' });
  const app = createApp({ nodeEnv: 'test', frontendUrl: null, jwtSecret: NEBULITH_JWT_SECRET, jwtExpiresIn: '1h' }, {
    UserModel: { findById: async (id) => ({ _id: id }) },
    IntegrationModel: integrationModel,
    configProvider: () => githubConfig,
    appService: createAppServiceMock(),
    fetchImpl: async (url) => new URL(url).pathname === '/repos/nebulith/neb-public'
      ? new Response(JSON.stringify({ id: 7, full_name: 'nebulith/neb-public' }), { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify({ message: 'private upstream details' }), {
        status: 403, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '0', 'retry-after': '17' },
      }),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/github/repositories/nebulith/neb-public/pulls`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = await response.json();
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '17');
    assert.equal(body.error.code, 'GITHUB_RATE_LIMITED');
    assert.doesNotMatch(JSON.stringify(body), /private upstream details|installation-access-token/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('GitHub API response limits stop oversized file payloads before parsing the full body', async () => {
  const responseBody = JSON.stringify({ patch: 'x'.repeat(4096) });
  await assert.rejects(
    requestGithubApi({
      path: '/repos/acme/project/pulls/1/files',
      token: INSTALLATION_TOKEN,
      maxResponseBytes: 128,
      fetchImpl: async () => new Response(responseBody, { status: 200, headers: { 'content-type': 'application/json' } }),
    }),
    (error) => error.code === 'GITHUB_RESPONSE_TOO_LARGE' && error.statusCode === 502,
  );
});
