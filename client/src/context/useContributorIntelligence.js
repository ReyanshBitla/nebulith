import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../services/api'
import { useAuth } from './useAuth'

const PAGE_SIZE = 30

function createEmptyResult(repositoryId = null) {
  return {
    repositoryId,
    contributors: [],
    contributorsStatus: 'idle',
    contributorsError: null,
    page: 1,
    perPage: PAGE_SIZE,
    hasNext: false,
    loadingMore: false,
    loadMoreError: null,
    activityStatus: 'idle',
    weeks: [],
    activityContributors: [],
    activityError: null,
    retryAfterSeconds: null,
  }
}

function getRepositoryApiPath(repository) {
  const fullName = repository?.fullName
  if (typeof fullName !== 'string') return null
  const [owner, name, extra] = fullName.split('/')
  if (!owner || !name || extra !== undefined) return null
  return `/github/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
}

function isContributorList(data) {
  return data
    && Array.isArray(data.contributors)
    && data.pagination
    && typeof data.pagination.hasNext === 'boolean'
    && Number.isSafeInteger(data.pagination.page)
    && Number.isSafeInteger(data.pagination.perPage)
}

export function useContributorIntelligence(enabled, repository) {
  const { authenticatedRequest } = useAuth()
  const repositoryId = repository?.id ?? repository?.fullName ?? null
  const repositoryApiPath = getRepositoryApiPath(repository)
  const [result, setResult] = useState(() => createEmptyResult())
  const [contributorsRetryVersion, setContributorsRetryVersion] = useState(0)
  const [activityRetryVersion, setActivityRetryVersion] = useState(0)
  const contributorsControllerRef = useRef(null)
  const activityControllerRef = useRef(null)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    if (!enabled || !repositoryId || !repositoryApiPath) return undefined

    const controller = new AbortController()
    contributorsControllerRef.current = controller
    authenticatedRequest(`${repositoryApiPath}/contributors?page=1&per_page=${PAGE_SIZE}`, { signal: controller.signal })
      .then((data) => {
        if (!isContributorList(data)) throw new ApiError(502, 'INVALID_CONTRIBUTOR_RESPONSE', 'The server returned an invalid contributor list.')
        if (controller.signal.aborted) return
        setResult((current) => ({
          ...(current.repositoryId === repositoryId ? current : createEmptyResult(repositoryId)),
          repositoryId,
          contributors: data.contributors,
          contributorsStatus: 'success',
          contributorsError: null,
          page: data.pagination.page,
          perPage: data.pagination.perPage,
          hasNext: data.pagination.hasNext,
          loadingMore: false,
          loadMoreError: null,
        }))
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setResult((current) => ({
          ...(current.repositoryId === repositoryId ? current : createEmptyResult(repositoryId)),
          repositoryId,
          contributors: [],
          contributorsStatus: 'error',
          contributorsError: error,
          hasNext: false,
        }))
      })

    return () => {
      controller.abort()
      if (contributorsControllerRef.current === controller) contributorsControllerRef.current = null
    }
  }, [enabled, repositoryId, repositoryApiPath, authenticatedRequest, contributorsRetryVersion])

  useEffect(() => {
    if (!enabled || !repositoryId || !repositoryApiPath) return undefined

    const controller = new AbortController()
    activityControllerRef.current = controller
    authenticatedRequest(`${repositoryApiPath}/contributor-activity`, { signal: controller.signal })
      .then((data) => {
        if (!['ready', 'computing', 'unavailable'].includes(data.status) || !Array.isArray(data.weeks) || !Array.isArray(data.contributors)) {
          throw new ApiError(502, 'INVALID_CONTRIBUTOR_ACTIVITY_RESPONSE', 'The server returned invalid contributor activity.')
        }
        if (controller.signal.aborted) return
        setResult((current) => ({
          ...(current.repositoryId === repositoryId ? current : createEmptyResult(repositoryId)),
          repositoryId,
          activityStatus: data.status,
          weeks: data.weeks,
          activityContributors: data.contributors,
          activityError: null,
          retryAfterSeconds: data.retryAfterSeconds ?? null,
        }))
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setResult((current) => ({
          ...(current.repositoryId === repositoryId ? current : createEmptyResult(repositoryId)),
          repositoryId,
          activityStatus: 'error',
          weeks: [],
          activityContributors: [],
          activityError: error,
        }))
      })

    return () => {
      controller.abort()
      if (activityControllerRef.current === controller) activityControllerRef.current = null
    }
  }, [enabled, repositoryId, repositoryApiPath, authenticatedRequest, activityRetryVersion])

  const current = result.repositoryId === repositoryId ? result : createEmptyResult(repositoryId)
  const contributorsStatus = !enabled || !repositoryId
    ? 'idle'
    : !repositoryApiPath || current.contributorsStatus === 'idle'
      ? (repositoryApiPath ? 'loading' : 'error')
      : current.contributorsStatus
  const activityStatus = !enabled || !repositoryId
    ? 'idle'
    : !repositoryApiPath || current.activityStatus === 'idle'
      ? (repositoryApiPath ? 'loading' : 'error')
      : current.activityStatus
  const invalidRepositoryError = new ApiError(400, 'INVALID_REPOSITORY', 'Repository owner and name are unavailable.')

  const retryContributors = useCallback(() => {
    setResult((value) => ({
      ...(value.repositoryId === repositoryId ? value : createEmptyResult(repositoryId)),
      repositoryId,
      contributors: [],
      contributorsStatus: 'loading',
      contributorsError: null,
      hasNext: false,
      loadMoreError: null,
    }))
    setContributorsRetryVersion((version) => version + 1)
  }, [repositoryId])

  const retryActivity = useCallback(() => {
    setResult((value) => ({
      ...(value.repositoryId === repositoryId ? value : createEmptyResult(repositoryId)),
      repositoryId,
      activityStatus: 'loading',
      weeks: [],
      activityContributors: [],
      activityError: null,
    }))
    setActivityRetryVersion((version) => version + 1)
  }, [repositoryId])

  const loadMore = useCallback(async () => {
    if (!enabled || !repositoryId || !repositoryApiPath || !current.hasNext || loadingMoreRef.current) return
    loadingMoreRef.current = true
    const controller = contributorsControllerRef.current
    const page = current.page + 1
    setResult((value) => ({ ...value, loadingMore: true, loadMoreError: null }))
    try {
      const data = await authenticatedRequest(`${repositoryApiPath}/contributors?page=${page}&per_page=${current.perPage}`, {
        signal: controller?.signal,
      })
      if (controller?.signal.aborted) return
      if (!isContributorList(data)) throw new ApiError(502, 'INVALID_CONTRIBUTOR_RESPONSE', 'The server returned an invalid contributor list.')
      setResult((value) => value.repositoryId !== repositoryId ? value : ({
        ...value,
        contributors: [...value.contributors, ...data.contributors.filter((contributor) => (
          !contributor.verified || !value.contributors.some((loaded) => loaded.verified && loaded.id === contributor.id)
        ))],
        page: data.pagination.page,
        perPage: data.pagination.perPage,
        hasNext: data.pagination.hasNext,
        loadingMore: false,
      }))
    } catch (error) {
      if (!controller?.signal.aborted) setResult((value) => value.repositoryId !== repositoryId ? value : ({
        ...value,
        loadMoreError: error,
        loadingMore: false,
      }))
    } finally {
      loadingMoreRef.current = false
    }
  }, [enabled, repositoryId, repositoryApiPath, current, authenticatedRequest])

  return {
    contributors: current.contributors,
    contributorsStatus,
    contributorsError: current.contributorsError || (contributorsStatus === 'error' ? invalidRepositoryError : null),
    page: current.page,
    perPage: current.perPage,
    hasNext: current.hasNext,
    loadingMore: current.loadingMore,
    loadMoreError: current.loadMoreError,
    loadMore,
    retryContributors,
    activityStatus,
    weeks: current.weeks,
    activityContributors: current.activityContributors,
    activityError: current.activityError || (activityStatus === 'error' ? invalidRepositoryError : null),
    retryActivity,
    retryAfterSeconds: current.retryAfterSeconds,
  }
}
