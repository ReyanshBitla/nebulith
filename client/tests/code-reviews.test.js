import assert from 'node:assert/strict'
import test from 'node:test'
import { isReviewActive } from '../src/utils/code-review-status.js'

test('review polling remains active only for queued and running records', () => {
  assert.equal(isReviewActive('queued'), true)
  assert.equal(isReviewActive('running'), true)
  for (const status of ['completed', 'failed', 'stale', 'cancelled', null]) assert.equal(isReviewActive(status), false)
})
