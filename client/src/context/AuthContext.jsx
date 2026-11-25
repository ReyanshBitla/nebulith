import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { AuthContext } from './auth-context'
import { authApi } from '../services/auth-api'

const TOKEN_STORAGE_KEY = 'nebulith.auth.token'
const MAX_TIMEOUT = 2_147_000_000

function readStoredToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function removeStoredToken() {
  try {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // The in-memory auth state is still cleared when browser storage is unavailable.
  }
}

function createInitialState() {
  let token = readStoredToken()
  let authMessage = ''
  const expiresAt = token ? readTokenExpiration(token) : null
  if (expiresAt && expiresAt <= Date.now()) {
    removeStoredToken()
    token = null
    authMessage = 'Your session expired. Sign in again to continue.'
  }
  return {
    token,
    user: null,
    status: token ? 'checking' : 'anonymous',
    authMessage,
    restoreError: '',
    storageWarning: '',
  }
}

function authReducer(state, action) {
  switch (action.type) {
    case 'AUTHENTICATED':
      return {
        ...state,
        token: action.token,
        user: action.user,
        status: 'authenticated',
        authMessage: '',
        restoreError: '',
        storageWarning: action.storageWarning,
      }
    case 'RESTORED':
      return { ...state, user: action.user, status: 'authenticated', authMessage: '', restoreError: '' }
    case 'EXPIRED':
      return {
        ...state,
        token: null,
        user: null,
        status: 'anonymous',
        authMessage: 'Your session expired. Sign in again to continue.',
        restoreError: '',
        storageWarning: '',
      }
    case 'RESTORE_FAILED':
      return { ...state, user: null, status: 'unavailable', restoreError: action.message }
    case 'RETRY':
      return { ...state, status: 'checking', restoreError: '' }
    case 'SIGNED_OUT':
      return {
        token: null,
        user: null,
        status: 'anonymous',
        authMessage: '',
        restoreError: '',
        storageWarning: '',
      }
    case 'CLEAR_MESSAGES':
      return { ...state, authMessage: '', storageWarning: '' }
    default:
      return state
  }
}

function readTokenExpiration(token) {
  try {
    const encodedPayload = token.split('.')[1]
    if (!encodedPayload) return null
    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(window.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')))
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, undefined, createInitialState)
  const [retryVersion, setRetryVersion] = useState(0)

  useEffect(() => {
    if (state.status !== 'checking' || !state.token) return undefined

    const controller = new AbortController()
    authApi.getCurrentUser(state.token, { signal: controller.signal })
      .then((user) => {
        if (!controller.signal.aborted) dispatch({ type: 'RESTORED', user })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        if (error.status === 401) {
          removeStoredToken()
          dispatch({ type: 'EXPIRED' })
          return
        }
        const message = error.status === 0 || error.status >= 500
          ? 'NEBULITH could not verify your session because the server is unavailable.'
          : error.message
        dispatch({ type: 'RESTORE_FAILED', message })
      })

    return () => controller.abort()
  }, [state.status, state.token, retryVersion])

  useEffect(() => {
    if (state.status !== 'authenticated' || !state.token) return undefined

    const expiresAt = readTokenExpiration(state.token)
    if (!expiresAt) return undefined

    let timerId
    const checkExpiry = () => {
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) {
        removeStoredToken()
        dispatch({ type: 'EXPIRED' })
        return
      }
      timerId = window.setTimeout(checkExpiry, Math.min(remaining, MAX_TIMEOUT))
    }
    checkExpiry()

    return () => window.clearTimeout(timerId)
  }, [state.status, state.token])

  const establishSession = useCallback(async (operation, credentials) => {
    const { token, user } = await operation(credentials)
    let storageWarning = ''
    try {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
    } catch {
      storageWarning = 'This browser could not save the session for refresh. You are signed in for this tab only.'
    }
    dispatch({ type: 'AUTHENTICATED', token, user, storageWarning })
    return user
  }, [])

  const login = useCallback((credentials) => establishSession(authApi.login, credentials), [establishSession])
  const register = useCallback((credentials) => establishSession(authApi.register, credentials), [establishSession])

  const logout = useCallback(() => {
    removeStoredToken()
    dispatch({ type: 'SIGNED_OUT' })
  }, [])

  const retrySession = useCallback(() => {
    dispatch({ type: 'RETRY' })
    setRetryVersion((version) => version + 1)
  }, [])

  const clearMessages = useCallback(() => dispatch({ type: 'CLEAR_MESSAGES' }), [])

  const value = useMemo(() => ({
    user: state.user,
    status: state.status,
    authMessage: state.authMessage,
    restoreError: state.restoreError,
    storageWarning: state.storageWarning,
    login,
    register,
    logout,
    retrySession,
    clearMessages,
  }), [state, login, register, logout, retrySession, clearMessages])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

