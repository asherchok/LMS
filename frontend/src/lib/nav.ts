/** Open a problem respecting the user's "open in new tab" preference. */
export function openProblem(id: number, newTab: boolean) {
  if (newTab) window.open(`/problem/${id}`, '_blank')
  else window.location.href = `/problem/${id}`
}
