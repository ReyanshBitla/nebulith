import { ApiError } from './api'

export function getSafeAuthError(error) {
  if (error instanceof ApiError) return error.message
  return 'The request could not be completed. Please try again.'
}
