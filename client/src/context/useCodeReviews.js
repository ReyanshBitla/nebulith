import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { isReviewActive } from '../utils/code-review-status'

export { isReviewActive }
const empty = (identity, status = 'idle') => ({ identity, reviews: [], status, error: null, submitting: false, actionError: null })

export function useCodeReviews(repository, pullRequest) {
  const { authenticatedRequest } = useAuth()
  const [result, setResult] = useState(() => empty(null))
  const [refresh, setRefresh] = useState(0)
  const inFlight = useRef(false)
  const fullName = repository?.fullName || ''
  const [owner, name, extra] = fullName.split('/')
  const number = pullRequest?.number
  const identity = owner && name && !extra && Number.isSafeInteger(number) ? `${repository.id}:${number}` : null

  useEffect(() => {
    if (!identity) return undefined
    const controller = new AbortController()
    const load = async () => {
      try {
        const query = new URLSearchParams({ repository_id: String(repository.id), pull_number: String(number), per_page: '50' })
        const data = await authenticatedRequest(`/reviews?${query}`, { signal: controller.signal })
        if (!controller.signal.aborted) setResult({ identity, reviews: Array.isArray(data.reviews) ? data.reviews : [], status: 'success', error: null, submitting: false, actionError: null })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ ...empty(identity, 'error'), error })
      }
    }
    load()
    return () => controller.abort()
  }, [identity, repository?.id, number, authenticatedRequest, refresh])

  const current = result.identity === identity ? result : empty(identity, identity ? 'loading' : 'idle')
  const active = current.reviews.some((review) => isReviewActive(review.status))
  useEffect(() => {
    if (!identity || !active) return undefined
    const interval = window.setInterval(() => setRefresh((value) => value + 1), 2500)
    return () => window.clearInterval(interval)
  }, [identity, active])

  const action = useCallback(async (path, method = 'POST', body) => {
    if (inFlight.current) return
    inFlight.current = true
    setResult((previous) => previous.identity === identity ? { ...previous, submitting: true, actionError: null } : previous)
    try {
      await authenticatedRequest(path, { method, ...(body === undefined ? {} : { body }) })
      setRefresh((value) => value + 1)
    } catch (error) {
      setResult((previous) => previous.identity === identity ? { ...previous, actionError: error } : previous)
    } finally {
      inFlight.current = false
      setResult((previous) => previous.identity === identity ? { ...previous, submitting: false } : previous)
    }
  }, [authenticatedRequest, identity])

  const request = useCallback((rerun = false) => {
    if (!owner || !name || !Number.isSafeInteger(number)) return
    return action('/reviews', 'POST', { owner, repository: name, pullNumber: number, ...(rerun ? { rerun: true } : {}) })
  }, [action, owner, name, number])
  const retry = useCallback((reviewId) => action(`/reviews/${encodeURIComponent(reviewId)}/retry`), [action])
  const cancel = useCallback((reviewId) => action(`/reviews/${encodeURIComponent(reviewId)}/cancel`), [action])
  const reload = useCallback(() => setRefresh((value) => value + 1), [])
  return { ...current, active, request, retry, cancel, reload }
}
