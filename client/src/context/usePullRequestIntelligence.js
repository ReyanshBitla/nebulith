import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../services/api'
import { useAuth } from './useAuth'

const PULL_REQUEST_PAGE_SIZE = 30
const FILE_PAGE_SIZE = 30

function repositoryPath(repository) {
  const [owner, name, extra] = (repository?.fullName || '').split('/')
  if (!owner || !name || extra) return null
  return `/github/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
}

function validatePagination(data, listName) {
  if (!data.pagination || !Number.isSafeInteger(data.pagination.page)
    || !Number.isSafeInteger(data.pagination.perPage) || typeof data.pagination.hasNext !== 'boolean'
    || !Array.isArray(data[listName])) {
    throw new ApiError(502, 'INVALID_PULL_REQUEST_RESPONSE', 'The server returned an invalid pull request response.')
  }
}

function emptyListResult(identity, status = 'loading') {
  return { identity, pullRequests: [], status, error: null, page: 1, perPage: PULL_REQUEST_PAGE_SIZE, hasNext: false, loadingMore: false, loadMoreError: null }
}

function emptyDetailResult(identity, status = 'loading') {
  return { identity, pullRequest: null, detailStatus: status, detailError: null, files: [], filesStatus: status, filesError: null, page: 1, perPage: FILE_PAGE_SIZE, hasNext: false, loadingMore: false, loadMoreError: null }
}

export function usePullRequestList(enabled, repository, selectedState) {
  const { authenticatedRequest } = useAuth()
  const path = repositoryPath(repository)
  const apiState = selectedState === 'merged' ? 'closed' : selectedState
  const identity = enabled && path ? `${path}:${apiState}` : null
  const [result, setResult] = useState(() => emptyListResult(null, 'idle'))
  const [retryVersion, setRetryVersion] = useState(0)
  const controllerRef = useRef(null)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    if (!identity) return undefined
    const controller = new AbortController()
    controllerRef.current = controller
    authenticatedRequest(`${path}/pulls?state=${apiState}&page=1&per_page=${PULL_REQUEST_PAGE_SIZE}`, { signal: controller.signal })
      .then((data) => {
        validatePagination(data, 'pullRequests')
        if (!controller.signal.aborted) setResult({
          ...emptyListResult(identity, 'success'),
          pullRequests: data.pullRequests,
          page: data.pagination.page,
          perPage: data.pagination.perPage,
          hasNext: data.pagination.hasNext,
        })
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ ...emptyListResult(identity, 'error'), error })
      })
    return () => {
      controller.abort()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [identity, path, apiState, authenticatedRequest, retryVersion])

  const current = result.identity === identity ? result : emptyListResult(identity, identity ? 'loading' : 'idle')
  const loadMore = useCallback(async () => {
    if (!identity || !path || !current.hasNext || loadingMoreRef.current) return
    const controller = controllerRef.current
    if (!controller || controller.signal.aborted) return
    loadingMoreRef.current = true
    const nextPage = current.page + 1
    setResult((existing) => existing.identity === identity ? { ...existing, loadingMore: true, loadMoreError: null } : existing)
    try {
      const data = await authenticatedRequest(`${path}/pulls?state=${apiState}&page=${nextPage}&per_page=${current.perPage}`, { signal: controller.signal })
      validatePagination(data, 'pullRequests')
      if (!controller.signal.aborted) setResult((existing) => existing.identity !== identity ? existing : ({
        ...existing,
        pullRequests: [...existing.pullRequests, ...data.pullRequests.filter((pull) => !existing.pullRequests.some((item) => item.number === pull.number))],
        page: data.pagination.page,
        perPage: data.pagination.perPage,
        hasNext: data.pagination.hasNext,
        loadingMore: false,
      }))
    } catch (error) {
      if (!controller.signal.aborted) setResult((existing) => existing.identity === identity ? { ...existing, loadingMore: false, loadMoreError: error } : existing)
    } finally {
      loadingMoreRef.current = false
    }
  }, [identity, path, apiState, current, authenticatedRequest])

  const retry = useCallback(() => {
    setResult(emptyListResult(identity))
    setRetryVersion((version) => version + 1)
  }, [identity])

  return { ...current, loadMore, retry, invalidRepository: Boolean(enabled && !path) }
}

export function usePullRequestDetails(enabled, repository, pullNumber) {
  const { authenticatedRequest } = useAuth()
  const path = repositoryPath(repository)
  const identity = enabled && path && Number.isSafeInteger(pullNumber) ? `${path}:${pullNumber}` : null
  const [result, setResult] = useState(() => emptyDetailResult(null, 'idle'))
  const [retryVersion, setRetryVersion] = useState(0)
  const controllerRef = useRef(null)
  const filesControllerRef = useRef(null)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    if (!identity) return undefined
    const controller = new AbortController()
    controllerRef.current = controller
    filesControllerRef.current = controller
    setResult(emptyDetailResult(identity))
    authenticatedRequest(`${path}/pulls/${pullNumber}`, { signal: controller.signal })
      .then((data) => {
        if (!data.pullRequest || data.pullRequest.number !== pullNumber) {
          throw new ApiError(502, 'INVALID_PULL_REQUEST_RESPONSE', 'The server returned invalid pull request details.')
        }
        if (!controller.signal.aborted) setResult((current) => current.identity === identity ? { ...current, pullRequest: data.pullRequest, detailStatus: 'success', detailError: null } : current)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult((current) => current.identity === identity ? { ...current, detailStatus: 'error', detailError: error } : current)
      })
    authenticatedRequest(`${path}/pulls/${pullNumber}/files?page=1&per_page=${FILE_PAGE_SIZE}`, { signal: controller.signal })
      .then((data) => {
        validatePagination(data, 'files')
        if (!controller.signal.aborted) setResult((current) => current.identity === identity ? {
          ...current, files: data.files, filesStatus: 'success', filesError: null,
          page: data.pagination.page, perPage: data.pagination.perPage, hasNext: data.pagination.hasNext,
        } : current)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult((current) => current.identity === identity ? { ...current, filesStatus: 'error', filesError: error } : current)
      })
    return () => {
      controller.abort()
      if (controllerRef.current === controller) controllerRef.current = null
      if (filesControllerRef.current === controller) filesControllerRef.current = null
    }
  }, [identity, path, pullNumber, authenticatedRequest, retryVersion])

  const current = result.identity === identity ? result : emptyDetailResult(identity, identity ? 'loading' : 'idle')
  const loadMoreFiles = useCallback(async () => {
    if (!identity || !path || !current.hasNext || loadingMoreRef.current) return
    const controller = filesControllerRef.current
    if (!controller || controller.signal.aborted) return
    loadingMoreRef.current = true
    const nextPage = current.page + 1
    setResult((existing) => existing.identity === identity ? { ...existing, loadingMore: true, loadMoreError: null } : existing)
    try {
      const data = await authenticatedRequest(`${path}/pulls/${pullNumber}/files?page=${nextPage}&per_page=${current.perPage}`, { signal: controller.signal })
      validatePagination(data, 'files')
      if (!controller.signal.aborted) setResult((existing) => existing.identity !== identity ? existing : ({
        ...existing,
        files: [...existing.files, ...data.files.filter((file) => !existing.files.some((item) => item.filename === file.filename))],
        page: data.pagination.page,
        perPage: data.pagination.perPage,
        hasNext: data.pagination.hasNext,
        loadingMore: false,
      }))
    } catch (error) {
      if (!controller.signal.aborted) setResult((existing) => existing.identity === identity ? { ...existing, loadingMore: false, loadMoreError: error } : existing)
    } finally {
      loadingMoreRef.current = false
    }
  }, [identity, path, pullNumber, current, authenticatedRequest])

  const retry = useCallback(() => {
    setResult(emptyDetailResult(identity))
    setRetryVersion((version) => version + 1)
  }, [identity])

  return { ...current, loadMoreFiles, retry, invalidRepository: Boolean(enabled && pullNumber && !path) }
}

