import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CODE_REVIEW_SELECTION_KEY,
  readCodeReviewSelection,
  readPageFromSearch,
  resolveNavigationTarget,
  resolveVisiblePage,
  saveCodeReviewSelection,
  searchWithPage,
} from '../src/utils/workspace-navigation.js'

test('refresh restores the workspace page from the URL after a valid session check', () => {
  const page = readPageFromSearch('?page=code-reviews')
  assert.equal(page, 'code-reviews')
  assert.equal(resolveVisiblePage({ page, status: 'authenticated' }), 'code-reviews')
})

test('authentication initialization keeps the saved route pending instead of choosing the landing page', () => {
  const page = readPageFromSearch('?page=code-reviews')
  assert.equal(resolveVisiblePage({ page, status: 'checking' }), 'code-reviews')
})

test('protected workspace routes resolve to login for anonymous users', () => {
  assert.equal(resolveVisiblePage({ page: 'code-reviews', status: 'anonymous' }), 'login')
  assert.equal(searchWithPage('?campaign=local', 'code-reviews'), '?campaign=local&page=code-reviews')
})

test('protected navigation waits while auth is checking and sends anonymous users to login', () => {
  assert.deepEqual(resolveNavigationTarget('code-reviews', 'checking'), { page: 'code-reviews', returnPage: null })
  assert.deepEqual(resolveNavigationTarget('code-reviews', 'anonymous'), { page: 'login', returnPage: 'code-reviews' })
  assert.deepEqual(resolveNavigationTarget('code-reviews', 'authenticated'), { page: 'code-reviews', returnPage: null })
})

test('an expired or invalid session resolves to login while a server outage stays in recovery', () => {
  assert.equal(resolveVisiblePage({ page: 'code-reviews', status: 'anonymous', authMessage: 'Session expired.' }), 'login')
  assert.equal(resolveVisiblePage({ page: 'code-reviews', status: 'unavailable' }), 'code-reviews')
})

test('Code Reviews repository, pull request and filter selection survives a tab refresh', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  saveCodeReviewSelection(storage, { repositoryId: '185288544', pullNumber: 42, stateFilter: 'closed' })
  assert.equal(values.has(CODE_REVIEW_SELECTION_KEY), true)
  assert.deepEqual(readCodeReviewSelection(storage), { repositoryId: '185288544', pullNumber: 42, stateFilter: 'closed' })
})

test('invalid saved Code Reviews selection is discarded safely', () => {
  const storage = { getItem: () => '{invalid json', setItem() {} }
  assert.deepEqual(readCodeReviewSelection(storage), { repositoryId: '', pullNumber: null, stateFilter: 'open' })
})
