import { apiRequest, ApiError } from './api'

const validateAuthResponse = (data) => {
  if (
    typeof data?.token !== 'string'
    || data.token.length === 0
    || typeof data.user?.id !== 'string'
    || typeof data.user?.name !== 'string'
    || typeof data.user?.email !== 'string'
  ) {
    throw new ApiError(502, 'INVALID_AUTH_RESPONSE', 'The server returned an incomplete sign-in response.')
  }
  return { token: data.token, user: data.user }
}

export const authApi = {
  async register({ name, email, password }) {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: { name, email, password },
    })
    return validateAuthResponse(data)
  },

  async login({ email, password }) {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    return validateAuthResponse(data)
  },

  async getCurrentUser(token, { signal } = {}) {
    const data = await apiRequest('/auth/me', { token, signal })
    const user = data.user
    if (typeof user?.id !== 'string' || typeof user?.name !== 'string' || typeof user?.email !== 'string') {
      throw new ApiError(502, 'INVALID_AUTH_RESPONSE', 'The server returned an incomplete session response.')
    }
    return user
  },
}
