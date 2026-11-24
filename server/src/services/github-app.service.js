const jwt = require('jsonwebtoken');

const createHttpError = require('../utils/http-error');
const { API_BASE_URL, requestGithubApi } = require('./github-api.service');

const AUTHORIZATION_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_AUTHORIZATION_REVOCATION_PATH = '/applications';

const createGithubAppService = ({ fetchImpl = globalThis.fetch, tokenService = jwt, now = () => Date.now() } = {}) => {
  const createAuthorizationUrl = ({ config, state, codeChallenge }) => {
    const url = new URL(AUTHORIZATION_URL);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.callbackUrl);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('scope', 'offline_access');
    url.searchParams.set('allow_signup', 'false');
    return url.toString();
  };

  const exchangeCode = async ({ config, code, codeVerifier }) => {
    let response;
    try {
      response = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.callbackUrl,
          code_verifier: codeVerifier,
        }),
      });
    } catch {
      throw createHttpError(502, 'GITHUB_UNAVAILABLE', 'Could not complete GitHub authorization.');
    }

    if (!response.ok) {
      throw createHttpError(502, 'GITHUB_AUTHORIZATION_FAILED', 'GitHub authorization could not be completed.');
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned an invalid authorization response.');
    }

    if (typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
      throw createHttpError(400, 'GITHUB_AUTHORIZATION_FAILED', 'GitHub authorization was not completed.');
    }
    return payload.access_token;
  };

  const revokeUserAuthorization = async ({ config, accessToken }) => {
    let response;
    try {
      response = await fetchImpl(`${API_BASE_URL}${USER_AUTHORIZATION_REVOCATION_PATH}/${encodeURIComponent(config.clientId)}/grant`, {
        method: 'DELETE',
        redirect: 'error',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
          'X-GitHub-Api-Version': '2026-03-10',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: accessToken }),
      });
    } catch {
      throw createHttpError(502, 'GITHUB_TOKEN_REVOCATION_FAILED', 'Could not safely complete GitHub authorization. Try connecting again.');
    }

    if (response.status !== 204 && !response.ok) {
      throw createHttpError(502, 'GITHUB_TOKEN_REVOCATION_FAILED', 'Could not safely complete GitHub authorization. Try connecting again.');
    }
  };

  const getGitHubUser = (accessToken) => requestGithubApi({
    path: '/user', token: accessToken, fetchImpl,
  });

  const listUserInstallations = async (accessToken) => {
    const installations = [];
    let page = 1;

    while (page <= 100) {
      const result = await requestGithubApi({
        path: `/user/installations?per_page=100&page=${page}`,
        token: accessToken,
        fetchImpl,
      });
      const currentPage = Array.isArray(result.installations) ? result.installations : [];
      installations.push(...currentPage);
      if (currentPage.length < 100) {
        return installations;
      }
      page += 1;
    }

    throw createHttpError(502, 'GITHUB_RESPONSE_TOO_LARGE', 'GitHub returned too many installations to process.');
  };

  const createAppJwt = (config) => {
    const issuedAt = Math.floor(now() / 1000) - 60;
    return tokenService.sign({ iat: issuedAt }, config.privateKey, {
      algorithm: 'RS256',
      issuer: config.appId,
      expiresIn: 9 * 60,
    });
  };

  const createInstallationAccessToken = async ({ config, installationId }) => {
    let appJwt;
    try {
      appJwt = createAppJwt(config);
    } catch {
      throw createHttpError(500, 'GITHUB_APP_AUTHENTICATION_FAILED', 'GitHub App authentication is not configured correctly.');
    }

    const result = await requestGithubApi({
      path: `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      token: appJwt,
      method: 'POST',
      body: {
        permissions: {
          contents: 'read',
          metadata: 'read',
          pull_requests: 'read',
        },
      },
      fetchImpl,
    });

    if (typeof result.token !== 'string' || result.token.length === 0) {
      throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub did not return an installation token.');
    }
    return result.token;
  };

  const revokeInstallationAccessToken = async (accessToken) => {
    let response;
    try {
      response = await fetchImpl(`${API_BASE_URL}/installation/token`, {
        method: 'DELETE',
        redirect: 'error',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2026-03-10',
        },
      });
    } catch {
      throw createHttpError(502, 'GITHUB_TOKEN_REVOCATION_FAILED', 'Could not revoke the temporary GitHub installation token.');
    }

    if (response.status !== 204 && !response.ok) {
      throw createHttpError(502, 'GITHUB_TOKEN_REVOCATION_FAILED', 'Could not revoke the temporary GitHub installation token.');
    }
  };

  return {
    createAuthorizationUrl,
    exchangeCode,
    revokeUserAuthorization,
    getGitHubUser,
    listUserInstallations,
    createAppJwt,
    createInstallationAccessToken,
    revokeInstallationAccessToken,
  };
};

module.exports = { createGithubAppService };
