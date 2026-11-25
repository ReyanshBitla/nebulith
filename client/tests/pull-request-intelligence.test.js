import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filterPullRequests,
  formatPullRequestDate,
  getPullRequestStatus,
} from '../src/utils/pull-request-intelligence.js'

const pullRequests = [
  { number: 7, title: 'Improve session handling', author: 'octocat', state: 'open', merged: false, draft: true },
  { number: 8, title: 'Fix repository cache', author: 'octocat', state: 'closed', merged: false, draft: false },
  { number: 9, title: 'Add activity view', author: 'hubot', state: 'closed', merged: true, draft: false },
]

test('pull request filters distinguish open, closed, merged and all states', () => {
  assert.deepEqual(filterPullRequests(pullRequests, 'open', '').map((pull) => pull.number), [7])
  assert.deepEqual(filterPullRequests(pullRequests, 'closed', '').map((pull) => pull.number), [8])
  assert.deepEqual(filterPullRequests(pullRequests, 'merged', '').map((pull) => pull.number), [9])
  assert.deepEqual(filterPullRequests(pullRequests, 'all', '').map((pull) => pull.number), [7, 8, 9])
})

test('search matches pull request title, author and number', () => {
  assert.deepEqual(filterPullRequests(pullRequests, 'all', 'cache').map((pull) => pull.number), [8])
  assert.deepEqual(filterPullRequests(pullRequests, 'all', 'HUBOT').map((pull) => pull.number), [9])
  assert.deepEqual(filterPullRequests(pullRequests, 'all', '#7').map((pull) => pull.number), [7])
})

test('status labels give merged precedence over closed and show draft state', () => {
  assert.equal(getPullRequestStatus(pullRequests[0]), 'Draft')
  assert.equal(getPullRequestStatus(pullRequests[1]), 'Closed')
  assert.equal(getPullRequestStatus(pullRequests[2]), 'Merged')
})

test('date formatter handles valid and unavailable timestamps', () => {
  assert.match(formatPullRequestDate('2026-04-03T10:00:00Z'), /2026/)
  assert.equal(formatPullRequestDate(null), 'Date unavailable')
  assert.equal(formatPullRequestDate('invalid'), 'Date unavailable')
})
