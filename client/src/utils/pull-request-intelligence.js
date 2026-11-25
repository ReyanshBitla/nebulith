export function getPullRequestStatus(pullRequest) {
  if (pullRequest.merged) return 'Merged'
  return pullRequest.state === 'open' ? (pullRequest.draft ? 'Draft' : 'Open') : 'Closed'
}

export function filterPullRequests(pullRequests, selectedState, query) {
  const search = query.trim().toLowerCase()
  return pullRequests.filter((pullRequest) => {
    const matchesState = selectedState === 'all'
      || (selectedState === 'merged' ? pullRequest.merged : selectedState === 'closed' ? pullRequest.state === 'closed' && !pullRequest.merged : pullRequest.state === 'open')
    const matchesSearch = !search || [pullRequest.title, pullRequest.author, `#${pullRequest.number}`]
      .some((value) => String(value || '').toLowerCase().includes(search))
    return matchesState && matchesSearch
  })
}

export function formatPullRequestDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
}
