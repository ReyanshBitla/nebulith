const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const { createGithubAppService } = require('../src/services/github-app.service');

const githubConfig = {
  appId: '123456',
  clientId: 'Iv1.client-id',
  clientSecret: 'client-secret-that-must-not-be-logged',
  appSlug: 'nebulith-app',
  callbackUrl: 'https://api.nebulith.example/api/github/callback',
};

test('GitHub App JWT creates a short-lived read-only installation token', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const fixedTime = Date.parse('2026-06-01T12:00:00.000Z');
  let requestUrl;
  let requestOptions;
  const appService = createGithubAppService({
    now: () => fixedTime,
    fetchImpl: async (url, options) => {
      requestUrl = new URL(url);
      requestOptions = options;
      return new Response(JSON.stringify({ token: 'ghs-short-lived-installation-token' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const token = await appService.createInstallationAccessToken({
    config: { ...githubConfig, privateKey },
    installationId: '98765',
  });
  const appJwt = requestOptions.headers.Authorization.slice('Bearer '.length);
  const payload = jwt.verify(appJwt, publicKey, {
    algorithms: ['RS256'],
    clockTimestamp: Math.floor(fixedTime / 1000),
  });

  assert.equal(token, 'ghs-short-lived-installation-token');
  assert.equal(requestUrl.pathname, '/app/installations/98765/access_tokens');
  assert.equal(payload.iss, githubConfig.appId);
  assert.ok(payload.exp - Math.floor(fixedTime / 1000) <= 10 * 60);
  assert.deepEqual(JSON.parse(requestOptions.body), {
    permissions: { contents: 'read', metadata: 'read', pull_requests: 'read' },
  });
});

test('GitHub user access tokens are exchanged with PKCE and revoked immediately', async () => {
  const requests = [];
  const appService = createGithubAppService({
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      if (url === 'https://github.com/login/oauth/access_token') {
        return new Response(JSON.stringify({
          access_token: 'ghu-temporary-access-token',
          refresh_token: 'ghr-temporary-refresh-token',
          expires_in: 28800,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(null, { status: 204 });
    },
  });

  const accessToken = await appService.exchangeCode({
    config: githubConfig,
    code: 'one-time-code',
    codeVerifier: 'random-pkce-verifier',
  });
  await appService.revokeUserAuthorization({ config: githubConfig, accessToken });

  const form = new URLSearchParams(requests[0].options.body);
  assert.equal(accessToken, 'ghu-temporary-access-token');
  assert.equal(form.get('code_verifier'), 'random-pkce-verifier');
  assert.equal(form.get('redirect_uri'), githubConfig.callbackUrl);
  assert.equal(form.get('client_secret'), githubConfig.clientSecret);
  assert.equal(requests[1].url.pathname, `/applications/${githubConfig.clientId}/grant`);
  assert.equal(requests[1].options.method, 'DELETE');
  assert.equal(JSON.parse(requests[1].options.body).access_token, accessToken);
});

test('temporary installation access tokens can be explicitly revoked', async () => {
  let request;
  const appService = createGithubAppService({
    fetchImpl: async (url, options) => {
      request = { url: new URL(url), options };
      return new Response(null, { status: 204 });
    },
  });

  await appService.revokeInstallationAccessToken('ghs-temporary-token');

  assert.equal(request.url.pathname, '/installation/token');
  assert.equal(request.options.method, 'DELETE');
  assert.equal(request.options.headers.Authorization, 'Bearer ghs-temporary-token');
});
