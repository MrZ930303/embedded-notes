import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8')
const html = await read('docs/public/demos/memory-budget.html')
const reference = await read('docs/public/demos/memory-budget-reference.html')
const script = id => {
  const match = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'))
  assert.ok(match, 'Actual reader script: ' + id)
  return match[1]
}
const plain = value => JSON.parse(JSON.stringify(value))
const context = {}
vm.runInNewContext(script('memory-model') + ';globalThis.model=MemoryModel;', context)
const model = context.model
assert.deepEqual(plain(model.envelope(1024, 128)), { status: 'FITS', report: { used: 1024, remaining: 0, excess: 0 } })
assert.deepEqual(plain(model.envelope(1024, 129)), { status: 'EXCEEDS', report: { used: 1025, remaining: 0, excess: 1 } })
assert.deepEqual(plain(model.envelope(0, 0)), { status: 'EXCEEDS', report: { used: 896, remaining: 0, excess: 896 } })
assert.equal(model.envelope(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER).status, 'OVERFLOW')
assert.equal(model.envelope(-1, 128).status, 'INVALID')
assert.deepEqual(plain(model.stack('normal', 64, 1)), { status: 'FITS', report: { used: 240, remaining: 16, excess: 0 } })
assert.deepEqual(plain(model.stack('normal', 64, 2)), { status: 'EXCEEDS', report: { used: 304, remaining: 0, excess: 48 } })
assert.deepEqual(plain(model.stack('normal', 0, 0)), { status: 'FITS', report: { used: 176, remaining: 80, excess: 0 } })
for (const mode of ['recursion', 'target', 'irq']) assert.deepEqual(plain(model.stack(mode, 64, 1)), { status: 'UNKNOWN' })
assert.equal(model.stack('normal', Number.MAX_SAFE_INTEGER, 2).status, 'OVERFLOW')
for (const value of ['', '-1', '1.5', 'NaN', 'Infinity', '0x20', '1e3', ' 1', '9007199254740992']) assert.equal(model.parse(value), null)
assert.equal(model.parse('0'), 0)
assert.equal(model.parse('9007199254740991'), 9007199254740991)
console.log('PASS independent numerical fixtures: equality/excess/overflow/unknown and UI integer domains')

// These literal rows were fixed from the dispatch's lifetime drawing, not by
// calling the implementation to generate expectations.
const rows = [
  [true, 0, 32, 'FITS', 32, 32, 96, 96],
  [true, 1, 32, 'FITS', 64, 64, 64, 64],
  [true, 2, 32, 'FITS', 96, 96, 32, 32],
  [true, 3, 32, 'FITS', 128, 128, 0, 0],
  [false, 0, 0, 'FITS', 96, 128, 32, 32],
  [false, 2, 0, 'FITS', 64, 128, 64, 32],
  [true, 4, 48, 'EXCEEDS', 64, 128, 64, 32],
  [false, 1, 0, 'FITS', 32, 128, 96, 96],
  [true, 4, 48, 'FITS', 80, 128, 48, 48],
  [false, 3, 0, 'FITS', 48, 128, 80, 80]
]
let state = model.create()
for (const [allocate, slot, payload, status, live, peak, totalFree, largestFree] of rows) {
  const before = plain(state), result = model.step(state, allocate, slot, payload)
  assert.equal(result.status, status)
  assert.deepEqual(plain(state), before, 'Public pure step never mutates caller state')
  if (status === 'FITS') state = result.state
  else assert.ok(!Object.hasOwn(result, 'state'), 'Rejected transaction supplies no state replacement')
  assert.deepEqual(plain(model.summary(state)), { live, peak, totalFree, largestFree })
}
assert.equal(model.step(state, false, 0, 0).status, 'INVALID')
assert.equal(model.step(state, true, 8, 1).status, 'INVALID')
assert.equal(model.step(state, true, 0, 0).status, 'INVALID')
console.log('PASS finite lifetime, release, coalescing, 64-free/32-largest rejection and historical peak')

const decode = text => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&')
class Node {
  constructor(tag, attrs, parent) {
    this.tag = tag; this.attrs = attrs; this.parentElement = parent; this.children = []
    this.open = Object.hasOwn(attrs, 'open'); this.hidden = Object.hasOwn(attrs, 'hidden')
    this.disabled = Object.hasOwn(attrs, 'disabled'); this.value = attrs.value || ''
    this.textContent = ''; this.innerHTML = ''; this.listeners = {}; this.scrolls = 0
  }
  closest(tag) { for (let node = this; node; node = node.parentElement) if (node.tag === tag) return node; return null }
  querySelectorAll(tag) { return this.children.flatMap(child => [...(child.tag === tag ? [child] : []), ...child.querySelectorAll(tag)]) }
  scrollIntoView() { this.scrolls += 1 }
  addEventListener(name, handler) { (this.listeners[name] ??= []).push(handler) }
  dispatch(name) { for (const handler of this.listeners[name] || []) handler({ preventDefault() {}, target: this }) }
}
function parseStrict(text) {
  const document = new Node('document', {}, null), stack = [document], ids = {}
  const markup = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  for (const token of markup.matchAll(/<!doctype[^>]*>|<\/?([a-z][\w-]*)([^>]*)>|([^<]+)/gi)) {
    const [raw, tag, rest, data] = token
    if (raw.toLowerCase().startsWith('<!doctype')) continue
    if (data) { stack.at(-1).textContent += decode(data); continue }
    if (raw.startsWith('</')) {
      assert.equal(stack.at(-1).tag, tag, 'Strict close must match currently open element: ' + raw)
      assert.ok(stack.length > 1); stack.pop(); continue
    }
    const attrs = {}
    for (const item of rest.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[item[1]] = decode(item[2] ?? '')
    const node = new Node(tag, attrs, stack.at(-1)); stack.at(-1).children.push(node)
    if (attrs.id) { assert.ok(!ids[attrs.id], 'Unique actual ID: ' + attrs.id); ids[attrs.id] = node }
    if (!['meta', 'link', 'input', 'br', 'hr', 'img'].includes(tag) && !raw.endsWith('/>')) stack.push(node)
  }
  assert.equal(stack.length, 1, 'Every actual HTML element is closed')
  for (const select of document.querySelectorAll('select')) select.value = select.children.find(n => n.tag === 'option')?.value || ''
  return { document, ids }
}
const { document: dom, ids } = parseStrict(html)
parseStrict(reference)
const main = ids.main
for (const h2 of main.querySelectorAll('h2')) {
  assert.equal(h2.parentElement.parentElement, main, 'Every labelled h2 region is a direct main child')
  assert.equal(h2.parentElement.attrs['aria-labelledby'], h2.attrs.id)
  assert.equal(h2.parentElement.attrs.role, 'region')
}
const details = dom.querySelectorAll('details')
const answers = details.filter(n => (n.attrs.class || '').split(' ').includes('exercise-answer'))
assert.equal(answers.length, 10)
assert.ok(answers.every(n => !n.open && !n.closest('section')), 'Answer ancestry never opens the whole worksheet')
for (const pre of dom.querySelectorAll('pre')) {
  assert.equal(pre.attrs.tabindex, '0'); assert.ok(pre.attrs['aria-label'])
}
for (const node of dom.querySelectorAll('div').filter(n => n.attrs.class === 'table-wrap')) {
  assert.equal(node.attrs.tabindex, '0'); assert.ok(node.attrs['aria-label'])
}
context.document = { getElementById(id) { assert.ok(ids[id], 'Known actual control ID: ' + id); return ids[id] } }
vm.runInNewContext(script('memory-controller'), context)
const predict = (prefix, value) => { ids[prefix + '-prediction'].value = value; ids[prefix + '-prediction'].dispatch('change') }
const submit = prefix => ids[prefix + '-form'].dispatch('submit')
const edit = (id, value, event = 'input') => { ids[id].value = value; ids[id].dispatch(event) }
for (const prefix of ['envelope', 'stack', 'trace']) {
  assert.equal(ids[prefix + '-apply'].disabled, true)
  assert.equal(ids[prefix + '-result'].hidden, true)
  submit(prefix)
  assert.equal(ids[prefix + '-result'].hidden, true)
}
predict('envelope', 'FITS'); submit('envelope')
assert.match(ids['envelope-state'].textContent, /capacity=1024.*guard=128.*状态=FITS.*used=1024.*remaining=0.*excess=0/)
assert.match(ids['envelope-feedback'].textContent, /预测正确.*预留.*下一步/)
assert.equal(ids['envelope-prediction'].value, '')
assert.equal(ids['envelope-apply'].disabled, true)
let accepted = ids['envelope-state'].textContent
predict('envelope', 'FITS'); edit('envelope-guard', '129')
assert.equal(ids['envelope-prediction'].value, '')
assert.equal(ids['envelope-state'].textContent, accepted)
assert.match(ids['envelope-pending'].textContent, /待应用/)
submit('envelope'); assert.equal(ids['envelope-state'].textContent, accepted)
predict('envelope', 'FITS'); submit('envelope')
assert.match(ids['envelope-feedback'].textContent, /预测不同.*EXCEEDS.*guard.*下一步/)
assert.match(ids['envelope-state'].textContent, /guard=129.*used=1025.*excess=1/)
for (const value of ['', '-1', '1.5', 'NaN', 'Infinity', '0x20', '1e3', '9007199254740992']) {
  accepted = ids['envelope-state'].textContent
  edit('envelope-guard', value); predict('envelope', 'INVALID'); submit('envelope')
  assert.match(ids['envelope-feedback'].textContent, /预测正确.*INVALID.*旧数值报告保持/)
  assert.equal(ids['envelope-state'].textContent, accepted, 'Invalid UI cannot replace accepted input/output: ' + value)
}
edit('envelope-guard', '9007199254740991'); predict('envelope', 'OVERFLOW'); submit('envelope')
assert.match(ids['envelope-feedback'].textContent, /预测正确.*OVERFLOW/)
ids['envelope-reset'].dispatch('click')
assert.equal(ids['envelope-capacity'].value, '1024'); assert.equal(ids['envelope-guard'].value, '128')
assert.equal(ids['envelope-result'].hidden, true); assert.equal(ids['envelope-state'].textContent, '')
assert.equal(ids['envelope-prediction'].value, '')
predict('stack', 'FITS'); submit('stack')
assert.match(ids['stack-state'].textContent, /mode=normal.*每层=64.*层数=1.*FITS.*used=240.*remaining=16/)
accepted = ids['stack-state'].textContent
for (const mode of ['recursion', 'target', 'irq']) {
  predict('stack', 'FITS'); edit('stack-mode', mode, 'change')
  assert.equal(ids['stack-prediction'].value, '')
  predict('stack', 'UNKNOWN'); submit('stack')
  assert.match(ids['stack-feedback'].textContent, /预测正确.*UNKNOWN.*不能以0.*旧数值报告保持/)
  assert.equal(ids['stack-state'].textContent, accepted)
}
edit('stack-mode', 'normal', 'change'); edit('stack-nesting', '2'); predict('stack', 'FITS'); submit('stack')
assert.match(ids['stack-feedback'].textContent, /预测不同.*EXCEEDS.*max176/)
assert.match(ids['stack-state'].textContent, /used=304.*excess=48/)
ids['stack-reset'].dispatch('click')
assert.equal(ids['stack-mode'].value, 'normal'); assert.equal(ids['stack-irq'].value, '64')
assert.equal(ids['stack-nesting'].value, '1'); assert.equal(ids['stack-result'].hidden, true)
console.log('PASS actual envelope/stack handlers: predict, consume, wrong causes, pending, invalid/overflow/unknown preservation, reset')
for (const [index, row] of rows.entries()) {
  const before = ids['trace-state'].textContent
  submit('trace'); assert.equal(ids['trace-state'].textContent, before, 'No unpredicted step')
  const [, , , status, live, peak, totalFree, largestFree] = row
  predict('trace', index === 0 ? 'EXCEEDS' : status); submit('trace')
  assert.match(ids['trace-feedback'].textContent, index === 0 ? /预测不同.*FITS.*下一步/ : /预测正确/)
  assert.match(ids['trace-state'].textContent, new RegExp(`live=${live}；peak=${peak}；totalFree=${totalFree}；largestFree=${largestFree}$`))
  assert.equal((ids['trace-log'].innerHTML.match(/<li>/g) || []).length, index + 1)
  assert.equal(ids['trace-prediction'].value, '')
}
assert.equal(ids['trace-apply'].disabled, true)
assert.match(ids['trace-operation'].textContent, /已结束10\/10/)
const ended = ids['trace-state'].textContent
predict('trace', 'FITS'); submit('trace'); assert.equal(ids['trace-state'].textContent, ended)
ids['trace-reset'].dispatch('click')
assert.equal(ids['trace-result'].hidden, true); assert.equal(ids['trace-log'].innerHTML, '')
assert.equal(ids['trace-prediction'].value, ''); assert.match(ids['trace-operation'].textContent, /1\/10.*A32/)
console.log('PASS actual lifetime replay: ten bounded events, causal fragmentation failure, no unearned rows and reproducible reset')

const events = {}, classes = new Set()
const window = { location: { hash: '' }, addEventListener(name, handler) { (events[name] ??= []).push(handler) }, dispatchEvent(event) { for (const handler of events[event.type] || []) handler() }, print() {} }
const document = { getElementById(id) { return ids[id] }, querySelectorAll(tag) { return dom.querySelectorAll(tag) }, body: { classList: { add: c => classes.add(c), remove: c => classes.delete(c) } } }
vm.runInNewContext(script('memory-reader') + script('note-deep-links') + script('note-print'), { window, document, requestAnimationFrame: fn => fn(), Event: class { constructor(type) { this.type = type } } })
for (const hash of ['#memory-practice', '#memory-practice-title', '#memory-question-05', '#memory-envelope', '#memory-budget']) {
  window.location.hash = hash; window.dispatchEvent({ type: 'hashchange' })
  assert.ok(answers.every(n => !n.open), 'Ordinary hash cannot reveal unrelated answers: ' + hash)
}
window.location.hash = '#memory-answer-05'; window.dispatchEvent({ type: 'hashchange' })
assert.deepEqual(answers.map(n => n.open), [false, false, false, false, true, false, false, false, false, false])
window.dispatchEvent({ type: 'pageshow' }); assert.equal(answers.filter(n => n.open).length, 1)
window.location.hash = '#memory-question-03'; window.dispatchEvent({ type: 'hashchange' })
assert.equal(answers.filter(n => n.open).length, 1)
ids['collapse-notes'].dispatch('click'); answers[2].open = true
const beforePrint = details.map(n => n.open)
window.dispatchEvent({ type: 'beforeprint' }); assert.ok(details.every(n => n.open))
window.dispatchEvent({ type: 'afterprint' }); assert.deepEqual(details.map(n => n.open), beforePrint)
window.print = () => { assert.ok(classes.has('exercise-print')); window.dispatchEvent({ type: 'beforeprint' }) }
ids['print-questions'].dispatch('click'); window.dispatchEvent({ type: 'afterprint' })
assert.equal(classes.has('exercise-print'), false); assert.deepEqual(details.map(n => n.open), beforePrint)
window.print = () => { window.dispatchEvent({ type: 'beforeprint' }); throw Error('injected dispatch failure') }
ids['print-questions'].dispatch('click')
assert.equal(classes.has('exercise-print'), false); assert.deepEqual(details.map(n => n.open), beforePrint)
window.dispatchEvent({ type: 'beforeprint' }); window.dispatchEvent({ type: 'afterprint' })
assert.deepEqual(details.map(n => n.open), beforePrint, 'Failure clears ordinary shared print snapshot for later printing')
ids['expand-notes'].dispatch('click'); assert.ok(details.every(n => n.open))
ids['collapse-notes'].dispatch('click'); assert.ok(details.every(n => !n.open))
assert.match(html, /body\.exercise-print \.exercise-answer\{display:none!important\}/)
assert.match(html, /main>\.content-section:not\(#memory-practice\)/)
console.log('PASS strict ancestry, ordinary/direct/history hashes, native folds, normal/worksheet print and failed-dispatch restoration')

const prior = await read('docs/public/demos/gpio-led.html')
for (const [name, article] of [['memory-budget', html], ['memory-budget-reference', reference]]) {
  assert.equal(article.match(/<style>\s*\/\* Shared reading layer:[\s\S]*?<\/style>/)[0], prior.match(/<style>\s*\/\* Shared reading layer:[\s\S]*?<\/style>/)[0])
  for (const id of ['note-deep-links', 'note-print']) assert.equal(article.match(new RegExp('<script id="' + id + '">[\\s\\S]*?<\\/script>'))[0], prior.match(new RegExp('<script id="' + id + '">[\\s\\S]*?<\\/script>'))[0])
  assert.equal((article.match(/class="notes-article"/g) || []).length, 1)
  assert.ok(article.includes('<body class="notes-article">'))
  const header = article.match(/<header class="topbar">[\s\S]*?<\/header>/)[0]
  const oldHeader = html.match(/<header class="topbar">[\s\S]*?<\/header>/)[0]
  assert.deepEqual([...header.matchAll(/<a[^>]+>([^<]+)<\/a>/g)].map(m => m[1]), [...oldHeader.matchAll(/<a[^>]+>([^<]+)<\/a>/g)].map(m => m[1]), 'Shared link labels preserved')
  const md = await read('docs/learn/' + name + '.md')
  if (name === 'memory-budget-reference') {
    const nextRoute = '../learn/clock-timebase.html'
    const nextLink = parseStrict(article).document.querySelectorAll('a').find(node => node.attrs.href === nextRoute)
    assert.ok(nextLink, 'Reference has a native direct next-unit09 route')
    assert.equal(nextLink.textContent, '下一章：时钟树、切换与时基', 'Reference next route names the next chapter')
    assert.ok(md.includes('<a href="' + nextRoute + '">下一章：时钟树、切换与时基</a>'), 'Reference searchable mirror retains the same actual next route and label')
  }
  for (const [, anchor] of md.matchAll(/\{#([^}]+)\}/g)) assert.ok(article.includes('id="' + anchor + '"'), 'Search heading resolves: ' + anchor)
  for (const file of ['memory_budget.h', 'memory_budget.c', 'stack_probe.c', 'README.txt']) {
    const link = '<a href="../examples/memory-budget/' + file + '" download>'
    assert.ok(article.includes(link)); assert.ok(md.includes(link))
  }
  assert.ok(article.includes('../learn/engineering-map.html#stage-02'))
  assert.ok(article.includes('../c-memory/heap-stack.html'))
  if (name === 'memory-budget') {
    assert.ok(article.includes('../learn/reset-runtime.html'))
    assert.ok(article.includes('../learn/clock-timebase.html'))
  }
  assert.doesNotMatch(article, /localStorage|sessionStorage|fetch\(|XMLHttpRequest|setInterval/)
  for (const phrase of ['UNKNOWN', '1024', 'largest', '240', '硬件']) assert.ok(md.includes(phrase), 'Full mirror keeps condition: ' + phrase)
}
for (const file of ['memory_budget.h', 'memory_budget.c', 'stack_probe.c', 'README.txt']) {
  const source = await read('docs/public/examples/memory-budget/' + file)
  const id = 'memory-source-' + file.replace('.', '-')
  const shown = html.match(new RegExp('<details id="' + id + '">[\\s\\S]*?<pre[^>]*><code>([\\s\\S]*?)<\\/code><\\/pre>'))
  assert.ok(shown); assert.equal(decode(shown[1]), source, 'Complete source/download bytes agree: ' + file)
  const sourceMirror = await read('docs/learn/memory-budget.md')
  assert.ok(sourceMirror.includes(source), 'Full searchable source: ' + file)
  const fenced = sourceMirror.match(new RegExp('\\n\\n<details id="' + id + '">\\n<summary>[^<]*<\\/summary>\\n\\n```text\\n([\\s\\S]*?)```\\n\\n<\\/details>\\n\\n'))
  assert.ok(fenced, 'Native disclosure and code fence have CommonMark HTML-block boundaries: ' + file)
  assert.equal(fenced[1], source, 'Disclosure fence preserves every source byte including final newline: ' + file)
}
for (const prefix of ['envelope', 'stack', 'trace']) {
  const select = ids[prefix + '-prediction']
  assert.deepEqual(select.children.filter(n => n.value).map(n => [...n.textContent].length), [6, 6, 6, 6, 6])
}
console.log('PASS exact shared layers, labels, download paths, source bytes, full mirrors and varied comparable choices')

// Exercise the framework seam as well as source-text parity. An existing
// checkout's dependencies may be read through --framework-root; never install,
// copy or symlink them into this checkout. In integration, local deps are used.
const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--framework-root'),
  'Usage: node scripts/test-memory-budget.mjs [--framework-root <existing-checkout>]')
const frameworkRoot = args.length ? resolve(args[1]) : fileURLToPath(new URL('../', import.meta.url))
const vitepressEntry = join(frameworkRoot, 'node_modules/vitepress/dist/node/index.js')
if (existsSync(vitepressEntry)) {
  const { createMarkdownRenderer } = await import(pathToFileURL(vitepressEntry).href)
  const requireInstalled = createRequire(pathToFileURL(join(frameworkRoot, 'package.json')))
  const { parse, compileTemplate } = requireInstalled('@vue/compiler-sfc')
  const renderer = await createMarkdownRenderer(fileURLToPath(new URL('../docs/', import.meta.url)))
  for (const name of ['memory-budget', 'memory-budget-reference']) {
    const filename = fileURLToPath(new URL('../docs/learn/' + name + '.md', import.meta.url))
    const rendered = renderer.render(await read('docs/learn/' + name + '.md'), { path: filename })
    const parsed = parse('<template>\n' + rendered + '\n</template>', { filename })
    assert.deepEqual(parsed.errors.map(String), [], 'Installed VitePress Markdown → Vue SFC parse: ' + name)
    const compiled = compileTemplate({ source: rendered, filename, id: name })
    assert.deepEqual(compiled.errors.map(String), [], 'Installed Vue template compile: ' + name)
    if (name === 'memory-budget') {
      const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
      const decodeRendered = text => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, key) =>
        key[0] === '#' ? String.fromCodePoint(parseInt(key.slice(key[1].toLowerCase() === 'x' ? 2 : 1), key[1].toLowerCase() === 'x' ? 16 : 10)) : entities[key.toLowerCase()])
      const renderedCode = [...rendered.matchAll(/<pre\b[^>]*>[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/g)]
        .map(match => decodeRendered(match[1].replace(/<[^>]*>/g, '')))
      for (const file of ['memory_budget.h', 'memory_budget.c', 'stack_probe.c', 'README.txt']) {
        const source = await read('docs/public/examples/memory-budget/' + file)
        assert.ok(source.endsWith('\n'), 'Published source has its declared final newline: ' + file)
        // VitePress's code display removes exactly one terminal LF. Earlier
        // checks compare the raw Markdown/source bytes including that LF.
        assert.ok(renderedCode.includes(source.slice(0, -1)), 'Framework renders every source character except its final display newline: ' + file)
      }
    }
  }
  console.log('PASS installed VitePress Markdown/Vue compilation and rendered complete-source parity for both mirrors')
} else {
  assert.equal(args.length, 0, 'Requested framework dependencies must already exist')
  console.log('NOT_RUN framework compiler: no local dependencies; use --framework-root with an existing checkout')
}
