import { readFile } from 'node:fs/promises'

export const notePath = 'c-memory/heap-stack.html'
const source = new URL('../docs/public/demos/stack-heap.html', import.meta.url)

export function readInteractiveNote() {
  return readFile(source, 'utf8')
}

// The development server serves the same complete HTML as the production hook.
export function interactiveNoteDevPlugin(base) {
  return {
    name: 'standalone-interactive-note',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname
        if (pathname !== base + notePath && pathname !== '/' + notePath) return next()
        try {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(await readInteractiveNote())
        } catch (error) {
          next(error)
        }
      })
    }
  }
}
