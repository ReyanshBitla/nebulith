export const WORKSPACE_PAGES = ['overview', 'repositories', 'code-reviews', 'analytics', 'settings']
const VALID_PAGES = new Set(['landing', 'login', 'register', ...WORKSPACE_PAGES])
export const CODE_REVIEW_SELECTION_KEY = 'nebulith.workspace.code-reviews'

export function normalizePage(page) {
  return VALID_PAGES.has(page) ? page : 'landing'
}

export function readPageFromSearch(search = '') {
  return normalizePage(new URLSearchParams(search).get('page') || 'landing')
}

export function searchWithPage(search = '', page) {
  const params = new URLSearchParams(search)
  if (page === 'landing') params.delete('page')
  else params.set('page', normalizePage(page))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function resolveVisiblePage({ page, status, authMessage = '', returnPage = 'overview' }) {
  const safePage = normalizePage(page)
  if (status === 'checking' || status === 'unavailable') return safePage
  if (status === 'authenticated') {
    if (safePage === 'login' || safePage === 'register') {
      return WORKSPACE_PAGES.includes(returnPage) ? returnPage : 'overview'
    }
    return safePage
  }
  if (authMessage || WORKSPACE_PAGES.includes(safePage)) return 'login'
  return safePage
}

export function resolveNavigationTarget(page, status) {
  const safePage = normalizePage(page)
  if (!WORKSPACE_PAGES.includes(safePage)) return { page: safePage, returnPage: null }
  if (status === 'checking' || status === 'unavailable' || status === 'authenticated') {
    return { page: safePage, returnPage: null }
  }
  return { page: 'login', returnPage: safePage }
}

export function readCodeReviewSelection(storage) {
  try {
    const value = JSON.parse(storage?.getItem(CODE_REVIEW_SELECTION_KEY) || 'null')
    return {
      repositoryId: typeof value?.repositoryId === 'string' && /^\d{1,30}$/.test(value.repositoryId) ? value.repositoryId : '',
      pullNumber: Number.isSafeInteger(value?.pullNumber) && value.pullNumber > 0 ? value.pullNumber : null,
      stateFilter: ['open', 'closed', 'merged', 'all'].includes(value?.stateFilter) ? value.stateFilter : 'open',
    }
  } catch {
    return { repositoryId: '', pullNumber: null, stateFilter: 'open' }
  }
}

export function saveCodeReviewSelection(storage, selection) {
  try {
    storage?.setItem(CODE_REVIEW_SELECTION_KEY, JSON.stringify({
      repositoryId: typeof selection?.repositoryId === 'string' && /^\d{1,30}$/.test(selection.repositoryId)
        ? selection.repositoryId : '',
      pullNumber: Number.isSafeInteger(selection?.pullNumber) && selection.pullNumber > 0 ? selection.pullNumber : null,
      stateFilter: ['open', 'closed', 'merged', 'all'].includes(selection?.stateFilter) ? selection.stateFilter : 'open',
    }))
  } catch {
    // Selection persistence is best effort and has no effect on authentication.
  }
}
