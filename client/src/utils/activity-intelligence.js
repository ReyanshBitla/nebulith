export const ACTIVITY_WEEK_SECONDS = 7 * 24 * 60 * 60

export const ACTIVITY_PERIODS = [
  { buckets: 1, label: '7 days' },
  { buckets: 4, label: '28 days' },
  { buckets: 13, label: '91 days' },
  { buckets: 52, label: '52 weeks (about 1 year)' },
]

function normalizeWeeks(weeks) {
  if (!Array.isArray(weeks)) return null
  const sorted = [...weeks].sort((left, right) => left.week - right.week)
  const seen = new Set()
  for (const week of sorted) {
    if (
      !Number.isSafeInteger(week?.week)
      || !Number.isSafeInteger(week?.total)
      || week.week < 0
      || week.total < 0
      || seen.has(week.week)
    ) return null
    seen.add(week.week)
  }
  return sorted
}

function isContinuous(weeks) {
  return weeks.every((week, index) => (
    index === 0 || week.week - weeks[index - 1].week === ACTIVITY_WEEK_SECONDS
  ))
}

function sumWeeks(weeks) {
  return weeks.reduce((total, week) => total + week.total, 0)
}

export function getLatestActivityWindow(weeks, bucketCount) {
  const normalized = normalizeWeeks(weeks)
  if (!normalized || !Number.isSafeInteger(bucketCount) || bucketCount < 1) {
    return { status: 'invalid', weeks: [] }
  }
  if (normalized.length < bucketCount) return { status: 'insufficient', weeks: [] }

  const selected = normalized.slice(-bucketCount)
  if (!isContinuous(selected)) return { status: 'incomplete', weeks: selected }

  return {
    status: 'ready',
    weeks: selected,
    total: sumWeeks(selected),
    startWeek: selected[0].week,
    endWeek: selected[selected.length - 1].week + ACTIVITY_WEEK_SECONDS - 1,
  }
}

export function compareActivityPeriods(weeks, bucketCount) {
  const normalized = normalizeWeeks(weeks)
  const current = getLatestActivityWindow(weeks, bucketCount)
  if (current.status !== 'ready') return { status: current.status, current, previous: null }

  if (!normalized || normalized.length < bucketCount * 2) {
    return { status: 'insufficient', current, previous: null }
  }
  const previousWeeks = normalized.slice(-bucketCount * 2, -bucketCount)
  if (!isContinuous(previousWeeks) || previousWeeks.at(-1).week + ACTIVITY_WEEK_SECONDS !== current.startWeek) {
    return { status: 'incomplete', current, previous: null }
  }

  const previous = {
    status: 'ready',
    weeks: previousWeeks,
    total: sumWeeks(previousWeeks),
    startWeek: previousWeeks[0].week,
    endWeek: previousWeeks.at(-1).week + ACTIVITY_WEEK_SECONDS - 1,
  }
  const difference = current.total - previous.total

  return {
    status: 'ready',
    current,
    previous,
    difference,
    percentageChange: previous.total > 0 ? (difference / previous.total) * 100 : null,
  }
}

export function alignActivityWindow(weeks, expectedWeeks) {
  const normalized = normalizeWeeks(weeks)
  if (!normalized || !Array.isArray(expectedWeeks) || expectedWeeks.length === 0) {
    return { status: 'invalid', weeks: [] }
  }

  const byTimestamp = new Map(normalized.map((week) => [week.week, week]))
  const aligned = expectedWeeks.map((expected) => byTimestamp.get(expected.week))
  if (aligned.some((week) => !week)) {
    return {
      status: 'incomplete',
      weeks: aligned.filter(Boolean),
      availableBuckets: aligned.filter(Boolean).length,
      requiredBuckets: expectedWeeks.length,
    }
  }

  return { status: 'ready', weeks: aligned, total: sumWeeks(aligned) }
}
