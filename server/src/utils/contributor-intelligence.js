const createHttpError = require('./http-error');

const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

const safeAvatarUrl = (value) => {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:'
      || !['avatars.githubusercontent.com', 'github.com'].includes(url.hostname.toLowerCase())
    ) return null;
    return url.href;
  } catch {
    return null;
  }
};

const mapContributor = (contributor) => {
  if (!contributor || typeof contributor !== 'object' || !Number.isSafeInteger(contributor.contributions) || contributor.contributions < 0) {
    throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned invalid contributor data.');
  }

  const id = Number.isSafeInteger(contributor.id) && contributor.id > 0 ? contributor.id : null;
  const login = typeof contributor.login === 'string' && GITHUB_LOGIN_PATTERN.test(contributor.login)
    ? contributor.login
    : null;
  const verified = id !== null && login !== null;

  return {
    id: verified ? id : null,
    login: verified ? login : null,
    avatarUrl: verified ? safeAvatarUrl(contributor.avatar_url) : null,
    profileUrl: verified ? `https://github.com/${encodeURIComponent(login)}` : null,
    verified,
    contributions: contributor.contributions,
  };
};

const mapContributorActivity = (data) => {
  if (!Array.isArray(data)) {
    throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned invalid contributor activity data.');
  }

  const weeksByTimestamp = new Map();
  const contributors = [];
  for (const entry of data) {
    if (!entry || typeof entry !== 'object' || !Number.isSafeInteger(entry.total) || entry.total < 0 || !Array.isArray(entry.weeks)) {
      throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned invalid contributor activity data.');
    }

    const mappedWeeks = entry.weeks.map((week) => {
      if (!Number.isSafeInteger(week?.w) || !Number.isSafeInteger(week?.c) || week.c < 0) {
        throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned invalid contributor activity data.');
      }
      const total = (weeksByTimestamp.get(week.w) || 0) + week.c;
      if (!Number.isSafeInteger(total)) {
        throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned contributor totals outside the supported range.');
      }
      weeksByTimestamp.set(week.w, total);
      return { week: week.w, commits: week.c };
    });

    const author = entry.author;
    const mappedAuthor = author && Number.isSafeInteger(author.id) && author.id > 0
      && typeof author.login === 'string' && GITHUB_LOGIN_PATTERN.test(author.login)
      ? { id: author.id, login: author.login }
      : null;
    if (mappedAuthor) contributors.push({ ...mappedAuthor, weeks: mappedWeeks });
  }

  return {
    status: 'ready',
    weeks: [...weeksByTimestamp.entries()]
      .map(([week, commits]) => ({ week, commits }))
      .sort((left, right) => left.week - right.week),
    contributors,
  };
};

module.exports = { mapContributor, mapContributorActivity, safeAvatarUrl };
