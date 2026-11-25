const configuredApiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

export const API_BASE_URL = configuredApiBase.replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export async function apiRequest(path, { method = 'GET', body, token, signal } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: 'no-store',
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the NEBULITH server. Check that it is running and try again.')
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'The NEBULITH server returned an invalid response.')
  }

  if (!response.ok || payload?.success === false) {
    const message = typeof payload?.error?.message === 'string'
      ? payload.error.message
      : 'The request could not be completed. Please try again.'
    const code = typeof payload?.error?.code === 'string' ? payload.error.code : 'REQUEST_FAILED'
    throw new ApiError(response.status, code, message)
  }

  if (payload?.success !== true || !payload.data || typeof payload.data !== 'object') {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'The NEBULITH server returned an invalid response.')
  }

  return payload.data
}
