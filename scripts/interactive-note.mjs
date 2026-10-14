import { readFile } from 'node:fs/promises'
import { notePaths } from '../docs/.vitepress/theme/interactive-routing.mjs'

export const notePath = notePaths[0]
export const interactiveNotes = [
  { path: notePath, source: 'stack-heap.html' },
  { path: notePaths[1], source: 'beads.html' },
  { path: notePaths[2], source: 'plane.html' },
  { path: notePaths[3], source: 'matt-pocock-skills.html' },
  { path: notePaths[4], source: 'crystal-pll-clock.html' }
]

export function readInteractiveNote(path = notePath) {
  const note = interactiveNotes.find(note => note.path === path)
  if (!note) throw new Error('Unknown interactive note: ' + path)
  return readFile(new URL('../docs/public/demos/' + note.source, import.meta.url), 'utf8')
}

// Development and production serve the same complete, self-contained HTML.
export function interactiveNoteDevPlugin(base) {
  return {
    name: 'standalone-interactive-note',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname
        const note = interactiveNotes.find(note => pathname === base + note.path || pathname === '/' + note.path)
        if (!note) return next()
        try {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(await readInteractiveNote(note.path))
        } catch (error) {
          next(error)
        }
      })
    }
  }
}
