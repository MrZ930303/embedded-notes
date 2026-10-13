export const notePath = 'c-memory/heap-stack.html'

export function isInteractiveNote(href, base, currentUrl) {
  const target = new URL(href, currentUrl)
  const current = new URL(currentUrl)
  return target.origin === current.origin && target.pathname === base + notePath
}

export function createInteractiveNoteGuard(base, location) {
  return (href) => {
    if (!isInteractiveNote(href, base, location.href)) return
    const target = new URL(href, location.href).href
    // History traversal may already have changed the URL; don't add a new entry.
    if (target === location.href) location.replace(target)
    else location.assign(target)
    return false
  }
}
