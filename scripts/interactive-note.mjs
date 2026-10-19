import { readFile } from 'node:fs/promises'
import { notePaths } from '../docs/.vitepress/theme/interactive-routing.mjs'

export const notePath = notePaths[0]
export const interactiveNotes = [
  { path: notePath, source: 'stack-heap.html' },
  { path: notePaths[1], source: 'beads.html' },
  { path: notePaths[2], source: 'plane.html' },
  { path: notePaths[3], source: 'matt-pocock-skills.html' },
  { path: notePaths[4], source: 'crystal-pll-clock.html' },
  { path: notePaths[5], source: 'cortex-m-cpu-registers.html' },
  { path: notePaths[6], source: 'hardfault-stack-trace.html' },
  { path: notePaths[7], source: 'easylogger.html' },
  { path: notePaths[8], source: 'mcu-ota.html' },
  { path: notePaths[9], source: 'learning-map.html' },
  { path: notePaths[10], source: 'gpio-button.html' },
  { path: notePaths[11], source: 'gpio-button-reference.html' },
  { path: notePaths[12], source: 'gpio-led.html' },
  { path: notePaths[13], source: 'gpio-led-reference.html' },
  { path: notePaths[14], source: 'c-bits-registers.html' },
  { path: notePaths[15], source: 'c-bits-registers-reference.html' },
  { path: notePaths[16], source: 'c-objects-bounds.html' },
  { path: notePaths[17], source: 'c-objects-bounds-reference.html' },
  { path: notePaths[18], source: 'bounded-fifo.html' },
  { path: notePaths[19], source: 'bounded-fifo-reference.html' },
  { path: notePaths[20], source: 'build-link-identity.html' },
  { path: notePaths[21], source: 'build-link-identity-reference.html' },
  { path: notePaths[22], source: 'reset-runtime.html' },
  { path: notePaths[23], source: 'reset-runtime-reference.html' },
  { path: notePaths[24], source: 'memory-budget.html' },
  { path: notePaths[25], source: 'memory-budget-reference.html' },
  { path: notePaths[26], source: 'clock-timebase.html' },
  { path: notePaths[27], source: 'clock-timebase-reference.html' },
  { path: notePaths[28], source: 'timer-pwm.html' },
  { path: notePaths[29], source: 'timer-pwm-reference.html' },
  { path: notePaths[30], source: 'uart-framing.html' },
  { path: notePaths[31], source: 'uart-framing-reference.html' },
  { path: notePaths[32], source: 'bus-transactions.html' },
  { path: notePaths[33], source: 'bus-transactions-reference.html' },
  { path: notePaths[34], source: 'adc-sampling.html' },
  { path: notePaths[35], source: 'adc-sampling-reference.html' },
  { path: notePaths[36], source: 'driver-recovery.html' },
  { path: notePaths[37], source: 'driver-recovery-reference.html' },
  { path: notePaths[38], source: 'interrupt-shared-data.html' },
  { path: notePaths[39], source: 'interrupt-shared-data-reference.html' },
  { path: notePaths[40], source: 'dma-ownership.html' },
  { path: notePaths[41], source: 'dma-ownership-reference.html' },
  { path: notePaths[42], source: 'throughput-overload.html' },
  { path: notePaths[43], source: 'throughput-overload-reference.html' }
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
