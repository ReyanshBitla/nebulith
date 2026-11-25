import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../services/api'
import { useAuth } from './useAuth'

const PAGE_SIZE = 100

async function fetchAllRepositories(authenticatedRequest, signal) {
  const repositories = []
  let page = 1
  let total = Number.POSITIVE_INFINITY

  while (repositories.length < total) {
    const data = await authenticatedRequest(`/github/repositories?page=${page}&per_page=${PAGE_SIZE}`, { signal })
    if (!Array.isArray(data.repositories) || !data.pagination || !Number.isSafeInteger(data.pagination.total)) {
      throw new ApiError(502, 'INVALID_GITHUB_RESPONSE', 'The server returned an invalid repository response.')
    }

    repositories.push(...data.repositories)
    total = data.pagination.total
    if (data.repositories.length === 0) break
    page += 1
  }

  return repositories
}

export function useGithubRepositories(enabled) {
  const { user, authenticatedRequest } = useAuth()
  const userId = user?.id || null
  const [result, setResult] = useState({ userId: null, repositories: [], status: 'idle', error: null })
  const [retryVersion, setRetryVersion] = useState(0)

  useEffect(() => {
    if (!enabled || !userId) return undefined

    const controller = new AbortController()
    fetchAllRepositories(authenticatedRequest, controller.signal)
      .then((repositories) => {
        if (!controller.signal.aborted) setResult({ userId, repositories, status: 'success', error: null })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setResult({ userId, repositories: [], status: 'error', error })
      })

    return () => controller.abort()
  }, [enabled, userId, authenticatedRequest, retryVersion])

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
    repositories: isCurrentUser ? result.repositories : [],
    status,
    error: isCurrentUser ? result.error : null,
    retry,
  }
}
