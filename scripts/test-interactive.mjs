import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { createInteractiveNoteGuard, isInteractiveNote } from '../docs/.vitepress/theme/interactive-routing.mjs'
import { readInteractiveNote, interactiveNoteDevPlugin } from './interactive-note.mjs'

for (const base of ['/', '/embedded-notes/']) {
  const origin = 'https://notes.example'
  const events = []
  const location = {
    href: origin + base,
    assign: href => events.push(['assign', href]),
    replace: href => events.push(['replace', href])
  }
  const guard = createInteractiveNoteGuard(base, location)
  const target = origin + base + 'c-memory/heap-stack.html#任务栈历史余量'
  assert.equal(guard(target), false)
  assert.deepEqual(events[0], ['assign', new URL(target).href])
  assert.equal(guard(base + 'guide/memory-roadmap.html'), undefined)
  assert.equal(isInteractiveNote('https://other.example' + base + 'c-memory/heap-stack.html', base, location.href), false)
  location.href = new URL(target).href
  assert.equal(guard(location.href), false)
  assert.deepEqual(events[1], ['replace', location.href])

  let middleware
  interactiveNoteDevPlugin(base).configureServer({ middlewares: { use: fn => { middleware = fn } } })
  let body, header, next = false
  await middleware({ url: base + 'c-memory/heap-stack.html' }, {
    setHeader: (name, value) => { header = [name, value] },
    end: value => { body = value }
  }, () => { next = true })
  assert.equal(body, await readInteractiveNote())
  assert.deepEqual(header, ['Content-Type', 'text/html; charset=utf-8'])
  assert.equal(next, false)
  await middleware({ url: base + 'guide/memory-roadmap.html' }, {}, () => { next = true })
  assert.equal(next, true)
}

const html = await readInteractiveNote()
const deepLinkScript = html.match(/<script id="note-deep-links">([\s\S]*?)<\/script>/)[1]
const section = { open: false }
const scrolls = []
const target = { closest: () => section, scrollIntoView: options => scrolls.push(options.block) }
const events = {}
const window = { location: { hash: '#%E4%BB%BB%E5%8A%A1%E6%A0%88%E5%8E%86%E5%8F%B2%E4%BD%99%E9%87%8F' }, addEventListener: (name, fn) => { events[name] = fn } }
const document = { getElementById: id => id === '任务栈历史余量' ? target : null }
vm.runInNewContext(deepLinkScript, { window, document, requestAnimationFrame: fn => fn() })
assert.equal(section.open, true)
assert.deepEqual(scrolls, ['start'])
section.open = false
events.hashchange()
assert.equal(section.open, true)
window.location.hash = '#unknown'
assert.doesNotThrow(events.pageshow)
window.location.hash = '#%ZZ'
assert.doesNotThrow(events.hashchange)
assert.ok(html.includes('href="../?search=1"'))
assert.ok(html.includes('href="../c-memory/"'))
// Adding hub links must not send empty hashes to querySelector in the section observer.
const observerStart = html.indexOf("if('IntersectionObserver'in window)")
const observerEnd = html.indexOf('\n})();', observerStart)
const observerScript = html.slice(observerStart, observerEnd)
const observed = []
const localLink = { hash: '#stack', setAttribute() {}, removeAttribute() {} }
const hubLink = { hash: '', setAttribute() {}, removeAttribute() {} }
vm.runInNewContext(observerScript, {
  window: { IntersectionObserver: true },
  IntersectionObserver: class { observe(element) { observed.push(element.id) } },
  document: {
    querySelectorAll: selector => selector === '.topbar nav a[href^="#"]' ? [localLink] : [hubLink, localLink],
    querySelector: selector => {
      assert.ok(selector && selector.startsWith('#'), 'Observer must only inspect local anchors')
      return { id: selector.slice(1) }
    }
  }
})
assert.deepEqual(observed, ['stack'])
console.log('PASS: canonical HTML navigation, click/search/history guard, both base paths, dev HTML serving, collapsed search anchors and invalid hashes.')
