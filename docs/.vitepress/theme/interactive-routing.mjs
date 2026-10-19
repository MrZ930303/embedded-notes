export const notePaths = ['c-memory/heap-stack.html', 'tools/beads.html', 'tools/plane.html', 'tools/matt-pocock-skills.html', 'mcu/crystal-pll-clock.html', 'mcu/cortex-m-cpu-registers.html', 'mcu/hardfault-stack-trace.html', 'debug/easylogger.html', 'mcu/mcu-ota.html', 'learn/engineering-map.html', 'learn/gpio-button.html', 'learn/gpio-button-reference.html', 'learn/gpio-led.html', 'learn/gpio-led-reference.html', 'learn/c-bits-registers.html', 'learn/c-bits-registers-reference.html', 'learn/c-objects-bounds.html', 'learn/c-objects-bounds-reference.html', 'learn/bounded-fifo.html', 'learn/bounded-fifo-reference.html', 'learn/build-link-identity.html', 'learn/build-link-identity-reference.html', 'learn/reset-runtime.html', 'learn/reset-runtime-reference.html', 'learn/memory-budget.html', 'learn/memory-budget-reference.html', 'learn/clock-timebase.html', 'learn/clock-timebase-reference.html', 'learn/timer-pwm.html', 'learn/timer-pwm-reference.html', 'learn/uart-framing.html', 'learn/uart-framing-reference.html', 'learn/bus-transactions.html', 'learn/bus-transactions-reference.html', 'learn/adc-sampling.html', 'learn/adc-sampling-reference.html', 'learn/driver-recovery.html', 'learn/driver-recovery-reference.html', 'learn/interrupt-shared-data.html', 'learn/interrupt-shared-data-reference.html', 'learn/dma-ownership.html', 'learn/dma-ownership-reference.html', 'learn/throughput-overload.html', 'learn/throughput-overload-reference.html']
export const notePath = notePaths[0]

export function isInteractiveNote(href, base, currentUrl) {
  const target = new URL(href, currentUrl)
  const current = new URL(currentUrl)
  return target.origin === current.origin && notePaths.some(path => target.pathname === base + path)
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
