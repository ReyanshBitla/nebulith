import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../services/api'
import { useAuth } from './useAuth'

const COMMIT_PAGE_SIZE = 20

function createEmptyResult(repositoryId = null) {
  return {
    repositoryId,
    commits: [],
    commitsStatus: 'idle',
    commitsError: null,
    page: 1,
    perPage: COMMIT_PAGE_SIZE,
    hasNext: false,
    loadingMore: false,
    loadMoreError: null,
    activityStatus: 'idle',
    weeks: [],
    activityError: null,
    selectedSha: null,
    details: null,
    detailsStatus: 'idle',
    detailsError: null,
  }
}

function getRepositoryApiPath(repository) {
  const fullName = repository?.fullName
  if (typeof fullName !== 'string') return null
  const [owner, name, extra] = fullName.split('/')
  if (!owner || !name || extra !== undefined) return null
  return `/github/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
}

export function useCommitIntelligence(enabled, repository) {
  const { authenticatedRequest } = useAuth()
  const repositoryId = repository?.id ?? repository?.fullName ?? null
  const repositoryApiPath = getRepositoryApiPath(repository)
  const [result, setResult] = useState(() => createEmptyResult())
  const [historyRetryVersion, setHistoryRetryVersion] = useState(0)
  const [activityRetryVersion, setActivityRetryVersion] = useState(0)
  const historyControllerRef = useRef(null)
  const activityControllerRef = useRef(null)
  const detailsControllerRef = useRef(null)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    if (!enabled || !repositoryId || !repositoryApiPath) return undefined

    const controller = new AbortController()
    historyControllerRef.current = controller
    authenticatedRequest(`${repositoryApiPath}/commits?page=1&per_page=${COMMIT_PAGE_SIZE}`, { signal: controller.signal })
      .then((data) => {
        if (!Array.isArray(data.commits) || !data.pagination || typeof data.pagination.hasNext !== 'boolean') {
          throw new ApiError(502, 'INVALID_COMMIT_RESPONSE', 'The server returned an invalid commit history response.')
        }
        if (controller.signal.aborted) return
        setResult((current) => ({
          ...(current.repositoryId === repositoryId ? current : createEmptyResult(repositoryId)),
          repositoryId,
          commits: data.commits,
          commitsStatus: 'success',
          commitsError: null,
          page: Number.isSafeInteger(data.pagination.page) ? data.pagination.page : 1,
          perPage: Number.isSafeInteger(data.pagination.perPage) ? data.pagination.perPage : COMMIT_PAGE_SIZE,
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
          commits: [],
          commitsStatus: 'error',
          commitsError: error,
          hasNext: false,
        }))
      })

    return () => {
      controller.abort()
      if (historyControllerRef.current === controller) historyControllerRef.current = null
      detailsControllerRef.current?.abort()
      detailsControllerRef.current = null
    }
  }, [enabled, repositoryId, repositoryApiPath, authenticatedRequest, historyRetryVersion])

  useEffect(() => {
    if (!enabled || !repositoryId || !repositoryApiPath) return undefined

    const controller = new AbortController()
    activityControllerRef.current = controller
    authenticatedRequest(`${repositoryApiPath}/commit-activity`, { signal: controller.signal })
      .then((data) => {
        if (!['ready', 'computing', 'unavailable'].includes(data.status) || !Array.isArray(data.weeks)) {
          throw new ApiError(502, 'INVALID_COMMIT_ACTIVITY_RESPONSE', 'The server returned an invalid commit activity response.')
        }
        if (controller.signal.aborted) return
        setResult((current) => ({
          ...(current.repositoryId === repositoryId ? current : createEmptyResult(repositoryId)),
          repositoryId,
          activityStatus: data.status,
          weeks: data.weeks,
          activityError: null,
          retryAfterSeconds: data.retryAfterSeconds,
        }))
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setResult((current) => ({
          ...(current.repositoryId === repositoryId ? current : createEmptyResult(repositoryId)),
          repositoryId,
          activityStatus: 'error',
          weeks: [],
          activityError: error,
        }))
      })

    return () => {
      controller.abort()
      if (activityControllerRef.current === controller) activityControllerRef.current = null
    }
  }, [enabled, repositoryId, repositoryApiPath, authenticatedRequest, activityRetryVersion])

  const current = result.repositoryId === repositoryId ? result : createEmptyResult(repositoryId)
  const commitsStatus = !enabled || !repositoryId
    ? 'idle'
    : !repositoryApiPath || current.commitsStatus === 'idle'
      ? (repositoryApiPath ? 'loading' : 'error')
      : current.commitsStatus
  const activityStatus = !enabled || !repositoryId
    ? 'idle'
    : !repositoryApiPath || current.activityStatus === 'idle'
      ? (repositoryApiPath ? 'loading' : 'error')
      : current.activityStatus
  const invalidRepositoryError = new ApiError(400, 'INVALID_REPOSITORY', 'Repository owner and name are unavailable.')

  const retryHistory = useCallback(() => {
    setResult((value) => ({
      ...(value.repositoryId === repositoryId ? value : createEmptyResult(repositoryId)),
      repositoryId,
      commits: [],
      commitsStatus: 'loading',
      commitsError: null,
      hasNext: false,
      loadMoreError: null,
    }))
    setHistoryRetryVersion((version) => version + 1)
  }, [repositoryId])

  const retryActivity = useCallback(() => {
    setResult((value) => ({
      ...(value.repositoryId === repositoryId ? value : createEmptyResult(repositoryId)),
      repositoryId,
      activityStatus: 'loading',
      weeks: [],
      activityError: null,
    }))
    setActivityRetryVersion((version) => version + 1)
  }, [repositoryId])

  const loadMore = useCallback(async () => {
    if (!enabled || !repositoryId || !repositoryApiPath || !current.hasNext || loadingMoreRef.current) return
    loadingMoreRef.current = true
    const page = current.page + 1
    const controller = historyControllerRef.current
    setResult((value) => ({ ...value, loadingMore: true, loadMoreError: null }))
    try {
      const data = await authenticatedRequest(`${repositoryApiPath}/commits?page=${page}&per_page=${current.perPage}`, {
        signal: controller?.signal,
      })
      if (controller?.signal.aborted) return
      if (!Array.isArray(data.commits) || !data.pagination || typeof data.pagination.hasNext !== 'boolean') {
        throw new ApiError(502, 'INVALID_COMMIT_RESPONSE', 'The server returned an invalid commit history response.')
      }
      setResult((value) => value.repositoryId !== repositoryId ? value : ({
        ...value,
        commits: [...value.commits, ...data.commits.filter((commit) => !value.commits.some((existing) => existing.sha === commit.sha))],
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

  const selectCommit = useCallback(async (sha) => {
    if (!enabled || !repositoryId || !repositoryApiPath || typeof sha !== 'string') return
    if (current.selectedSha === sha && current.detailsStatus !== 'error') return
    detailsControllerRef.current?.abort()
    const controller = new AbortController()
    detailsControllerRef.current = controller
    setResult((value) => ({
      ...(value.repositoryId === repositoryId ? value : createEmptyResult(repositoryId)),
      repositoryId,
      selectedSha: sha,
      details: null,
      detailsStatus: 'loading',
      detailsError: null,
    }))
    try {
      const data = await authenticatedRequest(`${repositoryApiPath}/commits/${encodeURIComponent(sha)}`, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (!data.commit || data.commit.sha !== sha) {
        throw new ApiError(502, 'INVALID_COMMIT_DETAILS', 'The server returned invalid commit details.')
      }
      setResult((value) => value.repositoryId !== repositoryId ? value : ({
        ...value,
        details: data.commit,
        detailsStatus: 'success',
        detailsError: null,
      }))
    } catch (error) {
      if (controller.signal.aborted) return
      setResult((value) => value.repositoryId !== repositoryId ? value : ({
        ...value,
        details: null,
        detailsStatus: 'error',
        detailsError: error,
      }))
    }
  }, [enabled, repositoryId, repositoryApiPath, current, authenticatedRequest])

  const closeCommitDetails = useCallback(() => {
    detailsControllerRef.current?.abort()
    detailsControllerRef.current = null
    setResult((value) => ({ ...value, selectedSha: null, details: null, detailsStatus: 'idle', detailsError: null }))
  }, [])

  return {
    commits: current.commits,
    commitsStatus,
    commitsError: current.commitsError || (commitsStatus === 'error' ? invalidRepositoryError : null),
    page: current.page,
    perPage: current.perPage,
    hasNext: current.hasNext,
    loadingMore: current.loadingMore,
    loadMoreError: current.loadMoreError,
    loadMore,
    retryHistory,
    activityStatus,
    weeks: current.weeks,
    activityError: current.activityError || (activityStatus === 'error' ? invalidRepositoryError : null),
    retryActivity,
    selectedSha: current.selectedSha,
    details: current.details,
    detailsStatus: current.detailsStatus,
    detailsError: current.detailsError,
    selectCommit,
    closeCommitDetails,
  }
}
