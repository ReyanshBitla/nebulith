import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../services/api'
import { useAuth } from './useAuth'

function apiPath(repository) {
  const [owner, name, extra] = (repository?.fullName || '').split('/')
  return owner && name && !extra
    ? `/github/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commit-activity`
    : null
}

export function useActivityComparison(enabled, repositories) {
  const { authenticatedRequest } = useAuth()
  const [results, setResults] = useState({})
  const [retryVersion, setRetryVersion] = useState(0)
  const controllers = useRef(new Map())
  const resultsRef = useRef({})
  const requested = useMemo(() => repositories.map((repository) => ({
    repository,
    key: String(repository.id ?? repository.fullName),
    path: apiPath(repository),
  })), [repositories])

  useEffect(() => {
    if (!enabled) return undefined
    const controllerMap = controllers.current
    const activeKeys = new Set(requested.map(({ key }) => key))
    for (const [key, controller] of controllerMap) {
      if (!activeKeys.has(key)) {
        controller.abort()
        controllerMap.delete(key)
      }
    }
    requested.forEach(({ key, path }) => {
      const existing = resultsRef.current[key]
      if (!path || (existing && existing.status !== 'loading') || controllerMap.has(key)) return
      const controller = new AbortController()
      controllerMap.set(key, controller)
      resultsRef.current = { ...resultsRef.current, [key]: { status: 'loading', weeks: [] } }
      setResults(resultsRef.current)
      authenticatedRequest(path, { signal: controller.signal })
        .then((data) => {
          if (!['ready', 'computing', 'unavailable'].includes(data.status) || !Array.isArray(data.weeks)) {
            throw new ApiError(502, 'INVALID_COMMIT_ACTIVITY_RESPONSE', 'The server returned an invalid activity response.')
          }
          if (!controller.signal.aborted) {
            resultsRef.current = { ...resultsRef.current, [key]: { ...data, error: null } }
            setResults(resultsRef.current)
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            resultsRef.current = { ...resultsRef.current, [key]: { status: 'error', weeks: [], error } }
            setResults(resultsRef.current)
          }
        })
        .finally(() => {
          if (controllerMap.get(key) === controller) controllerMap.delete(key)
        })
    })
    return () => {
      for (const controller of controllerMap.values()) controller.abort()
      controllerMap.clear()
    }
  }, [enabled, requested, authenticatedRequest, retryVersion])

  const retry = useCallback((key) => {
    const next = { ...resultsRef.current }
    delete next[key]
    resultsRef.current = next
    setResults(next)
    setRetryVersion((version) => version + 1)
  }, [])

  return { results, retry }
}
