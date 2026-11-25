import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIVITY_WEEK_SECONDS,
  alignActivityWindow,
  compareActivityPeriods,
  getLatestActivityWindow,
} from '../src/utils/activity-intelligence.js'

const weeks = (totals, start = 1_700_000_000) => totals.map((total, index) => ({
  week: start + index * ACTIVITY_WEEK_SECONDS,
  total,
}))

test('selects the most recent exact weekly buckets and sums actual counts', () => {
  const input = weeks([1, 2, 3, 4, 5]).reverse()
  const result = getLatestActivityWindow(input, 4)
  assert.equal(result.status, 'ready')
  assert.deepEqual(result.weeks.map((week) => week.total), [2, 3, 4, 5])
  assert.equal(result.total, 14)
  assert.equal(result.endWeek, result.weeks.at(-1).week + ACTIVITY_WEEK_SECONDS - 1)
})

test('does not build a continuous period across a missing weekly bucket', () => {
  const input = weeks([2, 3, 4]).map((week, index) => index === 2
    ? { ...week, week: week.week + ACTIVITY_WEEK_SECONDS }
    : week)
  assert.equal(getLatestActivityWindow(input, 3).status, 'incomplete')
})

test('rejects invalid and duplicate buckets', () => {
  assert.equal(getLatestActivityWindow([{ week: 1, total: -1 }], 1).status, 'invalid')
  assert.equal(getLatestActivityWindow([{ week: 1, total: 1 }, { week: 1, total: 2 }], 1).status, 'invalid')
})

test('compares equivalent adjacent periods and calculates percentage change', () => {
  const result = compareActivityPeriods(weeks([2, 3, 4, 6]), 2)
  assert.equal(result.status, 'ready')
  assert.equal(result.previous.total, 5)
  assert.equal(result.current.total, 10)
  assert.equal(result.difference, 5)
  assert.equal(result.percentageChange, 100)
  assert.equal(result.previous.endWeek + 1, result.current.startWeek)
})

test('does not calculate percentage change from a zero previous count', () => {
  const result = compareActivityPeriods(weeks([0, 0, 4, 6]), 2)
  assert.equal(result.status, 'ready')
  assert.equal(result.difference, 10)
  assert.equal(result.percentageChange, null)
})

test('reports insufficient history when an equivalent previous period is unavailable', () => {
  const result = compareActivityPeriods(weeks(Array(52).fill(1)), 52)
  assert.equal(result.status, 'insufficient')
  assert.equal(result.current.status, 'ready')
  assert.equal(result.previous, null)
})

test('aligns repository data only when every requested GitHub week exists', () => {
  const primary = getLatestActivityWindow(weeks([1, 2, 3]), 2)
  const other = weeks([8, 9, 10])
  assert.equal(alignActivityWindow(other, primary.weeks).total, 19)
  const missing = alignActivityWindow(other.slice(2), primary.weeks)
  assert.equal(missing.status, 'incomplete')
  assert.equal(missing.availableBuckets, 1)
  assert.equal(missing.requiredBuckets, 2)
})
