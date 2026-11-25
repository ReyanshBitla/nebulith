const createHttpError = require('./http-error');

const mapLanguageBreakdown = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned invalid repository language data.');
  }

  const languages = Object.entries(data).map(([name, bytes]) => {
    if (!name || !Number.isSafeInteger(bytes) || bytes < 0) {
      throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned invalid repository language data.');
    }
    return { name, bytes };
  }).filter((language) => language.bytes > 0).sort((left, right) => right.bytes - left.bytes || left.name.localeCompare(right.name));

  const totalBytes = languages.reduce((total, language) => {
    const next = total + language.bytes;
    if (!Number.isSafeInteger(next)) {
      throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned language totals outside the supported range.');
    }
    return next;
  }, 0);

  return {
    totalBytes,
    languages: languages.map((language) => ({
      ...language,
      percentage: totalBytes === 0 ? 0 : (language.bytes / totalBytes) * 100,
    })),
  };
};

const aggregateLanguageBreakdowns = (repositories) => {
  const uniqueRepositories = [];
  const seenRepositories = new Set();

  for (const repository of repositories) {
    const key = String(repository.id ?? repository.fullName);
    if (seenRepositories.has(key)) continue;
    seenRepositories.add(key);
    uniqueRepositories.push(repository);
  }

  const totals = new Map();
  let totalBytes = 0;
  const mappedRepositories = uniqueRepositories.map((repository) => {
    const breakdown = mapLanguageBreakdown(repository.languageBytes);
    totalBytes += breakdown.totalBytes;
    if (!Number.isSafeInteger(totalBytes)) {
      throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned language totals outside the supported range.');
    }

    for (const language of breakdown.languages) {
      const current = totals.get(language.name) || { bytes: 0, repositoryCount: 0 };
      current.bytes += language.bytes;
      current.repositoryCount += 1;
      if (!Number.isSafeInteger(current.bytes)) {
        throw createHttpError(502, 'GITHUB_INVALID_RESPONSE', 'GitHub returned language totals outside the supported range.');
      }
      totals.set(language.name, current);
    }

    return {
      id: repository.id,
      name: repository.name,
      fullName: repository.fullName,
      url: repository.url ?? null,
      totalBytes: breakdown.totalBytes,
      languages: breakdown.languages,
    };
  });

  const languages = [...totals.entries()]
    .map(([name, value]) => ({
      name,
      bytes: value.bytes,
      repositoryCount: value.repositoryCount,
      percentage: totalBytes === 0 ? 0 : (value.bytes / totalBytes) * 100,
    }))
    .sort((left, right) => right.bytes - left.bytes || left.name.localeCompare(right.name));

  return {
    repositories: mappedRepositories,
    aggregate: { totalBytes, languages },
    attribution: 'GitHub attributes languages by detected code bytes; this is an approximation, not a measure of developer effort.',
  };
};

module.exports = { mapLanguageBreakdown, aggregateLanguageBreakdowns };
