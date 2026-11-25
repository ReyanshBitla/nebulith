import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../services/api'
import { useAuth } from './useAuth'

function isLanguageIntelligenceResponse(data) {
  return data
    && Array.isArray(data.repositories)
    && data.aggregate
    && Number.isSafeInteger(data.aggregate.totalBytes)
    && Array.isArray(data.aggregate.languages)
    && data.repositories.every((repository) => (
      repository
      && typeof repository.fullName === 'string'
      && Number.isSafeInteger(repository.totalBytes)
      && Array.isArray(repository.languages)
    ))
}

export function useLanguageIntelligence(enabled) {
  const { user, authenticatedRequest } = useAuth()
  const userId = user?.id || null
  const [result, setResult] = useState({ userId: null, status: 'idle', data: null, error: null })
  const [retryVersion, setRetryVersion] = useState(0)

  useEffect(() => {
    if (!enabled || !userId) return undefined
    if (result.userId === userId && ['success', 'error'].includes(result.status)) return undefined

    const controller = new AbortController()
    authenticatedRequest('/github/languages', { signal: controller.signal })
      .then((data) => {
        if (!isLanguageIntelligenceResponse(data)) {
          throw new ApiError(502, 'INVALID_LANGUAGE_RESPONSE', 'The server returned invalid language analytics.')
        }
        if (!controller.signal.aborted) setResult({ userId, status: 'success', data, error: null })
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ userId, status: 'error', data: null, error })
      })

    return () => controller.abort()
  }, [enabled, userId, authenticatedRequest, retryVersion, result.userId, result.status])

  const retry = useCallback(() => {
    setResult((current) => ({ ...current, userId, status: 'loading', error: null }))
    setRetryVersion((version) => version + 1)
  }, [userId])

  const isCurrentUser = result.userId === userId
  const status = !enabled
    ? 'idle'
    : !isCurrentUser || result.status === 'idle'
      ? 'loading'
      : result.status

  return {
    status,
    data: isCurrentUser ? result.data : null,
    error: isCurrentUser ? result.error : null,
    retry,
  }
}
