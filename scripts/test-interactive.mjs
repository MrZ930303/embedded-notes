import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { createInteractiveNoteGuard, isInteractiveNote } from '../docs/.vitepress/theme/interactive-routing.mjs'
import { readInteractiveNote, interactiveNoteDevPlugin, interactiveNotes } from './interactive-note.mjs'

const registerNote = 'mcu/cortex-m-cpu-registers.html'
assert.ok(interactiveNotes.some(note => note.path === registerNote && note.source === 'cortex-m-cpu-registers.html'), 'Register note must be registered at its published route')
const originalNotes = [
  { path: 'c-memory/heap-stack.html', source: 'stack-heap.html' },
  { path: 'tools/beads.html', source: 'beads.html' },
  { path: 'tools/plane.html', source: 'plane.html' },
  { path: 'tools/matt-pocock-skills.html', source: 'matt-pocock-skills.html' },
  { path: 'mcu/crystal-pll-clock.html', source: 'crystal-pll-clock.html' }
]
assert.deepEqual(interactiveNotes.slice(0, originalNotes.length), originalNotes, 'The five original interactive routes and HTML sources must remain stable')
assert.deepEqual(interactiveNotes.slice(originalNotes.length), [
  { path: 'mcu/cortex-m-cpu-registers.html', source: 'cortex-m-cpu-registers.html' },
  { path: 'mcu/hardfault-stack-trace.html', source: 'hardfault-stack-trace.html' },
  { path: 'debug/easylogger.html', source: 'easylogger.html' },
  { path: 'mcu/mcu-ota.html', source: 'mcu-ota.html' },
  { path: 'learn/engineering-map.html', source: 'learning-map.html' },
  { path: 'learn/gpio-button.html', source: 'gpio-button.html' },
  { path: 'learn/gpio-button-reference.html', source: 'gpio-button-reference.html' },
  { path: 'learn/gpio-led.html', source: 'gpio-led.html' },
  { path: 'learn/gpio-led-reference.html', source: 'gpio-led-reference.html' }
], 'New interactive readers must append after the stable original routes')

for (const base of ['/', '/embedded-notes/']) {
  const origin = 'https://notes.example'
  const events = []
  const location = {
    href: origin + base,
    assign: href => events.push(['assign', href]),
    replace: href => events.push(['replace', href])
  }
  const guard = createInteractiveNoteGuard(base, location)
  for (const note of interactiveNotes) {
    const target = origin + base + note.path + '#search-section'
    assert.equal(guard(target), false)
    assert.deepEqual(events.at(-1), ['assign', new URL(target).href])
    assert.equal(guard(base + 'guide/memory-roadmap.html'), undefined)
    assert.equal(isInteractiveNote('https://other.example' + base + note.path, base, location.href), false)
    location.href = new URL(target).href
    assert.equal(guard(location.href), false)
    assert.deepEqual(events.at(-1), ['replace', location.href])
    location.href = origin + base
  }

  let middleware
  interactiveNoteDevPlugin(base).configureServer({ middlewares: { use: fn => { middleware = fn } } })
  let next = false
  for (const note of interactiveNotes) {
    let body, header
    await middleware({ url: base + note.path }, {
      setHeader: (name, value) => { header = [name, value] },
      end: value => { body = value }
    }, () => { next = true })
    assert.equal(body, await readInteractiveNote(note.path))
    assert.deepEqual(header, ['Content-Type', 'text/html; charset=utf-8'])
    assert.equal(next, false)
  }
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

// All additional interactive-note search sections must have unique, real HTML anchors.
for (const note of interactiveNotes.slice(1)) {
  const article = await readInteractiveNote(note.path)
  const ids = [...article.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
  assert.equal(ids.length, new Set(ids).size, 'Duplicate HTML id: ' + note.path)
  const markdown = await readFile(new URL('../docs/' + note.path.replace(/\.html$/, '.md'), import.meta.url), 'utf8')
  const headings = markdown.replace(/```[\s\S]*?```/g, '').match(/^#{1,6} .+$/gm) || []
  for (const heading of headings) {
    const match = heading.match(/\{#([^}]+)\}/)
    assert.ok(match, 'Explicit search anchor required: ' + heading)
    assert.ok(ids.includes(match[1]), 'Missing search anchor: ' + match[1])
  }
  const deepLink = article.match(/<script id="note-deep-links">([\s\S]*?)<\/script>/)
  if (article.includes('<details')) {
    assert.ok(deepLink, 'Collapsed articles require search deep-link support')
    const section = { open: false }, events = {}
    const target = { closest: () => section, scrollIntoView: () => {} }
    const window = { location: { hash: '#section' }, addEventListener: (event, fn) => { events[event] = fn } }
    vm.runInNewContext(deepLink[1], { window, document: { getElementById: () => target }, requestAnimationFrame: fn => fn() })
    assert.equal(section.open, true)
    section.open = false; events.hashchange(); assert.equal(section.open, true)
    window.location.hash = '#%ZZ'; assert.doesNotThrow(events.pageshow)
  }
  const categoryHref = note.path.startsWith('mcu/') ? '../mcu/' : note.path.startsWith('debug/') ? '../debug/' : note.path.startsWith('learn/') ? '../learn/' : '../tools/'
  for (const href of ['../', categoryHref, '../?search=1']) assert.ok(article.includes('href="' + href + '"'), 'Missing hub link: ' + href)
  assert.ok(!/<(?:script|iframe)[^>]+src=/i.test(article), 'Self-contained article must not load scripts or integrations')
  assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/.test([...article.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('')), 'Teaching state stays in page memory')
}
console.log('PASS: all interactive-note headings resolve, HTML ids are unique, hub/search links exist, and teaching pages have no external execution or persistence.');

// The standalone pages share a scoped reading layer while keeping their own diagrams.
let sharedReadingLayer
for (const note of interactiveNotes) {
  const article = await readInteractiveNote(note.path)
  const layer = article.match(/\/\* Shared reading layer:[\s\S]*?<\/style>/)?.[0]
  assert.ok(layer, 'Shared reading layer missing: ' + note.path)
  if (sharedReadingLayer) assert.equal(layer, sharedReadingLayer, 'Reading styles drifted: ' + note.path)
  sharedReadingLayer = layer
  assert.ok(article.includes('<body class="notes-article">'))
  const header = article.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1]
  for (const text of ['嵌入式技术笔记', '返回分类', '交互实验', '完整笔记', '搜索笔记']) assert.ok(header.includes(text), 'Navigation label missing: ' + text)
  assert.equal((header.match(/<nav /g) || []).length, 1)
  assert.ok(article.includes('href="../favicon.svg"'))
  assert.match(layer, /max-width:44rem;font-size:16px;line-height:1\.95/)
  assert.match(layer, /min-height:44px;min-width:44px;font-size:14px/)
  assert.match(layer, /prefers-reduced-motion:reduce/)
  assert.ok(!article.split('<script')[0].includes('↗'), 'Decorative icon must use SVG: ' + note.path)
}
const planeArticle = await readInteractiveNote('tools/plane.html')
assert.equal((planeArticle.match(/class="section-index" aria-hidden="true"/g) || []).length, 10)
assert.ok(!planeArticle.includes('h2:before{content:counter'), 'Section numbers must be hidden from assistive technology')
const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
  return .2126 * r + .7152 * g + .0722 * b
}
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((a, b) => b - a)
  return (light + .05) / (dark + .05)
}
for (const [ink, paper] of [['#21382e', '#fafbf8'], ['#526359', '#fafbf8'], ['#22664f', '#fafbf8'], ['#ffffff', '#22664f'], ['#e2efca', '#173e33']]) assert.ok(contrast(ink, paper) >= 4.5, 'Reading/navigation normal-text contrast must meet WCAG AA: ' + ink)
console.log('PASS: identical scoped reading theme, consistent navigation, 16px/44rem prose, 44px controls, SVG decoration, reduced motion, semantic numbering and core text contrast.')

for (const paper of ['#fafbf8', '#ffffff', '#e7ede1']) assert.ok(contrast('#ad751d', paper) >= 3, 'Focus ring must contrast with Plane light panels')
assert.match(planeArticle, /\.notes-article \.scope-picker :focus-visible,\.notes-article \.board :focus-visible,\.notes-article \.detail :focus-visible\{outline-color:#ad751d\}/)
console.log('PASS: Plane light-panel focus ring override and at least 3:1 contrast against page, control and lane surfaces.')

const registerArticle = await readInteractiveNote(registerNote)
const registerMarkdown = await readFile(new URL('../docs/mcu/cortex-m-cpu-registers.md', import.meta.url), 'utf8')
for (const [label, source] of [['interactive CONTROL reference', registerArticle], ['searchable CONTROL reference', registerMarkdown]]) {
  assert.ok(source.includes('MSR CONTROL'), `${label} must explain how software writes CONTROL`)
  assert.ok(source.includes('ISB'), `${label} must explain the instruction synchronization after CONTROL changes`)
}
assert.ok(registerArticle.includes('id="active-handler-state"'), 'priority demo must show the already-active IRQ priority 3 Handler separately')
assert.ok(registerArticle.includes('已在执行的异常（与 Pending 示例分开）'), 'active Handler must be visibly separated from pending exceptions')
const priorityController = registerArticle.match(/<script id="mask-demo">([\s\S]*?)<\/script>/)
assert.ok(priorityController, 'priority model must expose its user-facing controller')
const priorityControls = {
  'basepri-level': { value: '5', listeners: {}, addEventListener(event, callback) { this.listeners[event] = callback }, dispatch(event) { this.listeners[event]?.({ target: this }) } },
  'primask-on': { checked: false, listeners: {}, addEventListener(event, callback) { this.listeners[event] = callback }, dispatch(event) { this.listeners[event]?.({ target: this }) } },
  'faultmask-on': { checked: false, listeners: {}, addEventListener(event, callback) { this.listeners[event] = callback }, dispatch(event) { this.listeners[event]?.({ target: this }) } },
  'priority-rows': { children: [], replaceChildren(...children) { this.children = children } },
  'basepri-encoding-status': { textContent: '' },
  'active-handler-state': { textContent: '' }
}
const priorityDocument = {
  getElementById(id) {
    assert.ok(priorityControls[id], `unexpected priority demo element ${id}`)
    return priorityControls[id]
  },
  createElement(tag) {
    return { tagName: tag, textContent: '', className: '', children: [], append(...children) { this.children.push(...children) } }
  }
}
vm.runInNewContext(priorityController[1], { document: priorityDocument })
assert.match(priorityControls['active-handler-state'].textContent, /IRQ.*3.*Active.*BASEPRI = 0x50/)
const priority3Row = priorityControls['priority-rows'].children.find(row => row.children[0].textContent === 'IRQ（逻辑优先级 3）')
assert.ok(priority3Row, 'priority 3 must be a visible new-activation example beside the separate active Handler')
assert.equal(priority3Row.children[1].className, 'can-activate', 'priority 3 is above the logical BASEPRI threshold 5')
priorityControls['primask-on'].checked = true
priorityControls['primask-on'].dispatch('change')
priorityControls['faultmask-on'].checked = true
priorityControls['faultmask-on'].dispatch('change')
assert.match(priorityControls['active-handler-state'].textContent, /IRQ.*3.*Active.*BASEPRI = 0x50/, 'masking new activations must not terminate the separate already-active priority 3 Handler')
console.log('PASS: CONTROL writes include ISB guidance; BASEPRI priority 3 activation and separate active Handler behavior are covered.')

await import('./test-ota.mjs')

await import('./test-learning-map.mjs')
await import('./test-gpio-button.mjs')
await import('./test-gpio-led.mjs')
for (const path of ['learn/gpio-button.html', 'learn/gpio-button-reference.html']) {
  const article = await readInteractiveNote(path)
  assert.ok(article.includes('href="gpio-led.html"'), 'Previous chapter must link to the real LED reader: ' + path)
  assert.ok(article.includes('href="gpio-led-reference.html"'), 'Previous chapter must link to the real LED reference: ' + path)
  assert.ok(!article.includes('下一章“GPIO 输出与 LED 限流”'), 'Previous chapter must not call the available next chapter unfinished: ' + path)
}
console.log('PASS: previous GPIO chapter and reference lead to the registered LED chapter and printable reference.')
