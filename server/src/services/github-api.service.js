const createHttpError = require('../utils/http-error');

const API_BASE_URL = 'https://api.github.com';
const API_VERSION = '2026-03-10';

const parseJson = async (response) => {
  try {
    return await response.json();
  } catch {
    throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned an invalid response.');
  }
};

const getRetryAfterSeconds = (response) => {
  const rawRetryAfter = response.headers.get('retry-after');
  const retryAfter = rawRetryAfter === null ? NaN : Number(rawRetryAfter);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(Math.ceil(retryAfter), 86400);
  }

  const resetAt = Number(response.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(resetAt) && resetAt > 0) {
    return Math.min(Math.max(0, Math.ceil(resetAt - Date.now() / 1000)), 86400);
  }

  return undefined;
};

const mapGithubError = (response) => {
  const remaining = response.headers.get('x-ratelimit-remaining');
  if (
    response.status === 429
    || (response.status === 403 && (remaining === '0' || response.headers.has('retry-after')))
  ) {
    const error = createHttpError(429, 'GITHUB_RATE_LIMITED', 'GitHub rate limit reached. Retry later.');
    error.retryAfter = getRetryAfterSeconds(response);
    return error;
  }

  if (response.status === 401) {
    return createHttpError(401, 'GITHUB_AUTHORIZATION_EXPIRED', 'GitHub authorization is no longer valid. Reconnect the GitHub account.');
  }
  if (response.status === 403) {
    return createHttpError(403, 'GITHUB_ACCESS_DENIED', 'GitHub denied access to this resource.');
  }
  if (response.status === 404) {
    return createHttpError(404, 'GITHUB_RESOURCE_NOT_FOUND', 'The GitHub resource was not found or is not available to this installation.');
  }
  if (response.status >= 500) {
    return createHttpError(502, 'GITHUB_UNAVAILABLE', 'GitHub is temporarily unavailable.');
  }

  return createHttpError(502, 'GITHUB_REQUEST_FAILED', 'The GitHub request could not be completed.');
};

const requestGithubApi = async ({ path, token, method = 'GET', body, fetchImpl = globalThis.fetch, returnResponse = false }) => {
  if (typeof fetchImpl !== 'function') {
    throw createHttpError(503, 'FETCH_UNAVAILABLE', 'GitHub integration requires a Node.js runtime with fetch support.');
  }

  const url = new URL(path, API_BASE_URL);
  if (url.origin !== API_BASE_URL || !path.startsWith('/')) {
    throw createHttpError(500, 'GITHUB_REQUEST_CONFIGURATION_ERROR', 'GitHub request configuration is invalid.');
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method,
      redirect: 'error',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': API_VERSION,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw createHttpError(502, 'GITHUB_UNAVAILABLE', 'Could not reach GitHub.');
  }

  if (!response.ok) {
    throw mapGithubError(response);
  }

  if (returnResponse) {
    if (response.status === 204 || response.status === 202) {
      return { status: response.status, data: null, headers: response.headers };
    }
    return { status: response.status, data: await parseJson(response), headers: response.headers };
  }

  return parseJson(response);
};

module.exports = { requestGithubApi, mapGithubError, API_BASE_URL, API_VERSION };
