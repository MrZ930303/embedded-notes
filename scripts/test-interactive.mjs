import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { createInteractiveNoteGuard, isInteractiveNote } from '../docs/.vitepress/theme/interactive-routing.mjs'
import { readInteractiveNote, interactiveNoteDevPlugin, interactiveNotes } from './interactive-note.mjs'

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
  for (const href of ['../', note.path.startsWith('mcu/') ? '../mcu/' : '../tools/', '../?search=1']) assert.ok(article.includes('href="' + href + '"'), 'Missing hub link: ' + href)
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
