import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const html = read('docs/public/demos/c-objects-bounds.html')
const script = id => {
  const match = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'))
  assert.ok(match, 'Actual reader script: ' + id)
  return match[1]
}
const context = {}
vm.runInNewContext(script('objects-model') + '\n;globalThis.model = ObjectsModel;', context)
assert.equal(context.model.classify('element').kind, 'read', 'Live byte array frame[1] reads the declared 0x12 byte')
assert.equal(context.model.classify('element').value, '0x12')
console.log('PASS objects grid: fixed live element fixture.')
for (const [caseId, kind] of [['endpoint', 'endpoint'], ['past-read', 'forbidden'], ['outside', 'forbidden'], ['null', 'forbidden'], ['expired', 'forbidden'], ['cast', 'forbidden']]) {
  const actual = context.model.classify(caseId)
  assert.equal(actual.kind, kind, caseId + ' classification from source rules')
  assert.equal(Object.hasOwn(actual, 'value'), false, 'No invented read value for ' + caseId)
}
console.log('PASS objects grid: endpoint, outside-array, null, expired and type/alignment classifications.')
assert.throws(() => context.model.classify('other'), /Invalid/)
vm.runInNewContext(script('objects-decode-model'), context)
for (const [length, offset, kind, value] of [
  [4, 1, 'success', 0x1234], [4, 0, 'success', 0x347E], [4, 2, 'success', 0xFF12],
  [2, 0, 'success', 0x347E], [3, 1, 'success', 0x1234],
  [0, 0, 'rejected', 0xBEEF], [1, 0, 'rejected', 0xBEEF], [4, 3, 'rejected', 0xBEEF],
  [4, 4, 'rejected', 0xBEEF], [4, 5, 'rejected', 0xBEEF], [4, 'SIZE_MAX', 'rejected', 0xBEEF]
]) {
  const result = context.model.decode(length, offset, 'live', 'live', 0xBEEF)
  assert.equal(result.kind, kind); assert.equal(result.value, value)
}
for (const [input, output] of [['null', 'live'], ['live', 'null'], ['null', 'null']]) {
  const result = context.model.decode(4, 1, input, output, 0xBEEF)
  assert.equal(result.kind, 'rejected'); assert.equal(result.value, 0xBEEF)
}
for (const args of [[-1, 0], [5, 0], [1.5, 0], [NaN, 0], [4, -1], [4, 1.5], [4, Infinity], [4, Number.MAX_SAFE_INTEGER + 1]]) assert.throws(() => context.model.decode(...args, 'live', 'live', 0xBEEF), /Invalid/)
console.log('PASS decoder model: independent wire fixtures, truthful prefix, exact/zero/short/endpoint/SIZE_MAX/null, sentinel preservation and invalid domains.')

// A tree keeps native ancestor selection faithful: practice has a div ancestor,
// while direct answer hashes have exactly one details ancestor.
class Element {
  constructor(tag, attributes = {}, parent = null) {
    this.tagName = tag; this.attributes = attributes; this.parentElement = parent; this.children = []
    this.id = attributes.id; this.value = attributes.value || ''; this.listeners = {}; this._text = ''
    this.open = Object.hasOwn(attributes, 'open'); this.hidden = Object.hasOwn(attributes, 'hidden'); this.disabled = Object.hasOwn(attributes, 'disabled')
    this.classes = new Set((attributes.class || '').split(/\s+/))
    this.classList = { add: x => this.classes.add(x), remove: x => this.classes.delete(x), contains: x => this.classes.has(x) }
    if (parent) parent.children.push(this)
  }
  set textContent(value) { this._text = String(value) }
  get textContent() { return this._text }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler) }
  dispatch(name) { let prevented = false; for (const handler of this.listeners[name] || []) handler({ target: this, preventDefault() { prevented = true } }); return prevented }
  closest(tag) { for (let node = this; node; node = node.parentElement) if (node.tagName === tag) return node; return null }
  querySelectorAll(tag) { return this.children.flatMap(child => [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)]) }
  scrollIntoView() { this.scrolled = true }
}
const tree = new Element('document'), elements = {}, stack = [tree]
const markup = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '')
const voidTags = new Set(['meta', 'link', 'input', 'br', 'hr', 'img'])
for (const match of markup.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
  const [, close, rawTag, rawAttrs] = match, tag = rawTag.toLowerCase()
  if (close) { if (stack.at(-1)?.tagName === tag) stack.pop(); continue }
  const attrs = {}
  for (const attr of rawAttrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[attr[1]] = attr[2] ?? ''
  const node = new Element(tag, attrs, stack.at(-1))
  if (node.id) { assert.ok(!elements[node.id], 'Unique DOM id ' + node.id); elements[node.id] = node }
  if (!voidTags.has(tag) && !rawAttrs.endsWith('/')) stack.push(node)
}
const document = { getElementById(id) { assert.ok(elements[id], 'Actual reader control ' + id); return elements[id] }, querySelectorAll: tag => tree.querySelectorAll(tag), body: tree.querySelectorAll('body')[0] }
const events = {}, window = { location: { hash: '' }, addEventListener: (type, fn) => (events[type] ||= []).push(fn), dispatchEvent: event => { for (const handler of events[event.type] || []) handler(event) } }
const fire = type => window.dispatchEvent({ type })
const defaults = { 'grid-case': 'element', 'grid-prediction': '', 'decode-length': '4', 'decode-offset': '1', 'decode-input': 'live', 'decode-output': 'live', 'decode-prediction': '' }
for (const [id, value] of Object.entries(defaults)) elements[id].value = value
Object.assign(context, { document, window, Event: class { constructor(type) { this.type = type } }, requestAnimationFrame: fn => fn() })
vm.runInNewContext(script('objects-controller') + '\n' + script('objects-decode-controller'), context)
assert.equal(elements['grid-result'].hidden, true)
assert.equal(elements['grid-form'].dispatch('submit'), true)
assert.equal(elements['grid-result'].hidden, true, 'Initial classification concealed without prediction')
for (const [caseId, prediction, reason] of [['element', 'read', /0x12/], ['endpoint', 'endpoint', /one-past/], ['past-read', 'forbidden', /解引用/], ['outside', 'forbidden', /形成/], ['null', 'forbidden', /空指针/], ['expired', 'forbidden', /不确定/], ['cast', 'forbidden', /对齐/]]) {
  const prior = elements['grid-applied'].textContent
  elements['grid-case'].value = caseId; elements['grid-case'].dispatch('change')
  assert.equal(elements['grid-applied'].textContent, prior, 'Pending case does not reveal new classification')
  assert.equal(elements['grid-prediction'].value, ''); assert.equal(elements['grid-apply'].disabled, true)
  elements['grid-prediction'].value = prediction; elements['grid-prediction'].dispatch('change')
  assert.equal(elements['grid-apply'].disabled, false)
  elements['grid-form'].dispatch('submit')
  assert.match(elements['grid-feedback'].textContent, /预测正确/); assert.match(elements['grid-feedback'].textContent, reason)
  assert.equal(elements['grid-result'].hidden, false); assert.equal(elements['grid-apply'].disabled, true)
}
elements['grid-case'].value = 'past-read'; elements['grid-case'].dispatch('change')
elements['grid-prediction'].value = 'read'; elements['grid-prediction'].dispatch('change'); elements['grid-form'].dispatch('submit')
assert.match(elements['grid-feedback'].textContent, /预测不符.*解引用/)
const beforeInvalid = elements['grid-applied'].textContent
elements['grid-case'].value = 'bogus'; elements['grid-case'].dispatch('change'); elements['grid-prediction'].value = 'read'; elements['grid-form'].dispatch('submit')
assert.equal(elements['grid-applied'].textContent, beforeInvalid); assert.match(elements['grid-pending'].textContent, /输入无效/)
elements['grid-reset'].dispatch('click')
assert.equal(elements['grid-case'].value, 'element'); assert.equal(elements['grid-result'].hidden, true)
assert.equal(elements['grid-feedback'].textContent, ''); assert.equal(elements['grid-prediction'].value, '')
console.log('PASS grid actual controller: all seven cases, prediction consumption, pending concealment, causal wrong answer, invalid retention and reset.')

assert.equal(elements['decode-result'].hidden, true); assert.equal(elements['decode-apply'].disabled, true)
elements['decode-form'].dispatch('submit'); assert.equal(elements['decode-result'].hidden, true)
function applyDecode(length, offset, input, output, prediction) {
  for (const [id,value] of [['decode-length',length],['decode-offset',offset],['decode-input',input],['decode-output',output]]) {
    const prior = elements['decode-value'].textContent
    elements[id].value = String(value); elements[id].dispatch('input'); elements[id].dispatch('change')
    assert.equal(elements['decode-value'].textContent, prior, 'Input edits retain only old applied output')
    assert.equal(elements['decode-prediction'].value, ''); assert.equal(elements['decode-apply'].disabled, true)
  }
  elements['decode-prediction'].value = prediction; elements['decode-prediction'].dispatch('change'); elements['decode-form'].dispatch('submit')
  assert.equal(elements['decode-prediction'].value, ''); assert.equal(elements['decode-apply'].disabled, true)
}
applyDecode(4, 1, 'live', 'live', 'success')
assert.equal(elements['decode-value'].textContent, '0x1234'); assert.match(elements['decode-feedback'].textContent, /预测正确/)
applyDecode(4, 3, 'live', 'live', 'success')
assert.equal(elements['decode-value'].textContent, '0x1234'); assert.match(elements['decode-feedback'].textContent, /预测不符.*不足两个/)
for (const [length, offset, input, output] of [[0,0,'live','live'],[1,0,'live','live'],[4,4,'live','live'],[4,5,'live','live'],[4,'SIZE_MAX','live','live'],[4,1,'null','live'],[4,1,'live','null']]) {
  applyDecode(length,offset,input,output,'rejected')
  assert.equal(elements['decode-value'].textContent, '0x1234'); assert.match(elements['decode-feedback'].textContent, /预测正确/)
}
for (const [length, offset, input, output] of [['',1,'live','live'],['-1',1,'live','live'],['4.5',1,'live','live'],[5,1,'live','live'],[4,'','live','live'],[4,-1,'live','live'],[4,1.5,'live','live'],[4,'9007199254740992','live','live'],[4,1,'bogus','live']]) {
  applyDecode(length,offset,input,output,'success')
  assert.equal(elements['decode-value'].textContent, '0x1234'); assert.match(elements['decode-pending'].textContent, /输入无效/)
}
elements['decode-reset'].dispatch('click')
assert.equal(elements['decode-result'].hidden, true); assert.equal(elements['decode-value'].textContent, '')
for (const id of Object.keys(defaults).filter(id=>id.startsWith('decode-'))) assert.equal(elements[id].value, defaults[id])
applyDecode(4,3,'live','live','rejected'); assert.equal(elements['decode-value'].textContent,'0xBEEF','Reset restores sentinel before the next rejection')
console.log('PASS decoder actual controller: complete inputs/submit, causal failure, prior-output preservation, invalid input, prediction consumption and deterministic reset.')

vm.runInNewContext(script('note-deep-links') + '\n' + script('note-print') + '\n' + script('objects-reader') + '\n' + script('objects-worksheet'), context)
const details = document.querySelectorAll('details'), answers = Array.from({ length:10 },(_,i)=>elements['answer-'+String(i+1).padStart(2,'0')])
assert.equal(answers.length,10); assert.equal(details.length,10)
assert.ok(answers.every(answer => !answer.open))
assert.equal(elements['practice'].closest('section'), null, 'Exercise region cannot inherit the shared section expansion rule')
for (const hash of ['#objects-title','#practice','#question-01','#span-contract-title']) { window.location.hash=hash;fire('hashchange');assert.ok(answers.every(answer=>!answer.open)) }
window.location.hash='#answer-03';fire('hashchange')
assert.deepEqual(answers.map(answer=>answer.open),[false,false,true,false,false,false,false,false,false,false])
window.location.hash='#question-04';fire('hashchange');assert.equal(answers[3].open,false)
window.location.hash='#answer-08';fire('pageshow');assert.equal(answers[7].open,true);assert.equal(answers[9].open,false)
elements['expand-notes'].dispatch('click');assert.ok(answers.every(answer=>answer.open))
elements['collapse-notes'].dispatch('click');assert.ok(answers.every(answer=>!answer.open))
answers[1].open=true;answers[6].open=true
const previousFolds=answers.map(answer=>answer.open)
fire('beforeprint');assert.ok(answers.every(answer=>answer.open));fire('afterprint');assert.deepEqual(answers.map(answer=>answer.open),previousFolds)
window.print = () => { assert.equal(document.body.classList.contains('exercise-print'),true);fire('beforeprint') }
elements['print-questions'].dispatch('click');assert.equal(document.body.classList.contains('exercise-print'),true)
fire('afterprint');assert.equal(document.body.classList.contains('exercise-print'),false);assert.deepEqual(answers.map(answer=>answer.open),previousFolds)
window.print = () => {fire('beforeprint');throw new Error('Print unavailable')}
elements['print-questions'].dispatch('click');assert.equal(document.body.classList.contains('exercise-print'),false)
assert.deepEqual(answers.map(answer=>answer.open),previousFolds,'Print dispatch failure restores native disclosure state as well as mode')
console.log('PASS disclosure/printing: faithful native ancestors, normal vs direct hashes, history events, expand/collapse, question-only dispatch, normal and failure restoration.')

const decodeEntities = text => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&')
const normalized = text => decodeEntities(text.replace(/<[^>]+>/g, '')).replace(/\s+/g, '')
const accepted = read('docs/public/demos/gpio-led.html')
const ref = read('docs/public/demos/c-objects-bounds-reference.html')
const map = read('docs/public/demos/learning-map.html')
assert.ok(map.includes('id="stage-01"'), 'Actual learning-map reader contains the linked stage anchor')
for (const [name, article] of [['c-objects-bounds', html], ['c-objects-bounds-reference', ref]]) {
  const markdown = read('docs/learn/' + name + '.md')
  const ids = [...article.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
  assert.equal(ids.length, new Set(ids).size, 'Unique reader IDs ' + name)
  const header = article.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1]
  assert.ok(header, 'Common standalone header ' + name)
  assert.match(header, /class="brand" href="\.\.\/"/, 'Brand resolves to the home directory')
  assert.equal((header.match(/<nav /g) || []).length, 1, 'One common header navigation')
  const expectedNav = name === 'c-objects-bounds'
    ? [['../learn/', '返回分类'], ['#grid-lab', '交互实验'], ['#learning-path', '完整笔记'], ['../?search=1', '搜索笔记']]
    : [['../learn/', '返回分类'], ['#reference-recall-region', '交互实验'], ['#reference-scope', '完整笔记'], ['../?search=1', '搜索笔记']]
  for (const [href, label] of expectedNav) {
    assert.ok(header.includes('href="' + href + '" data-no-router>' + label + '</a>'), 'Shared navigation destination and label ' + name + ': ' + label)
    if (href.startsWith('#')) assert.ok(ids.includes(href.slice(1)), 'Actual local header anchor ' + href)
  }
  assert.ok(article.includes('<body class="notes-article">'))
  const mapHref = '../learn/engineering-map.html#stage-01'
  assert.ok(article.includes('href="' + mapHref + '"'), 'Map link works from canonical and compatibility readers')
  assert.ok(!article.includes('href="engineering-map.html#stage-01"'), 'No compatibility-relative map filename')
  for (const base of ['/', '/embedded-notes/']) {
    for (const directory of ['learn/', 'demos/']) {
      const url = new URL(mapHref, 'https://example.invalid' + base + directory + name + '.html')
      assert.equal(url.pathname + url.hash, base + 'learn/engineering-map.html#stage-01')
    }
  }
  const headings = [...markdown.replace(/```[\s\S]*?```/g, '').matchAll(/^#{1,6} .+$/gm)]
  for (const [heading] of headings) {
    const anchor = heading.match(/\{#([^}]+)\}/)?.[1]
    assert.ok(anchor && ids.includes(anchor), 'Search heading resolves to reader: ' + heading)
  }
  assert.equal(headings.length, new Set(headings.map(([h])=>h.match(/\{#([^}]+)\}/)[1])).size)
  for (const sharedId of ['note-deep-links', 'note-print']) {
    const pattern = new RegExp('<script id="'+sharedId+'">[\\s\\S]*?<\\/script>')
    assert.equal(article.match(pattern)[0],accepted.match(pattern)[0], 'Exact shared script '+sharedId)
  }
  assert.equal(article.match(/\/\* Shared reading layer:[\s\S]*?<\/style>/)[0],accepted.match(/\/\* Shared reading layer:[\s\S]*?<\/style>/)[0])
  const mdPlain = decodeEntities(markdown.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<a\b[^>]*>|<\/a>/g,'').replace(/`/g,'')).replace(/\s+/g,'')
  for (const filename of ['objects.c', 'README.txt']) assert.ok(markdown.includes('<a href="../examples/c-objects-bounds/' + filename + '" download>'), 'Native Markdown download link '+filename)
  assert.ok(!markdown.includes('../public/examples/'), 'No public filesystem segment in download URLs')
  const main = article.slice(article.indexOf('<main'),article.indexOf('</main>'))
  for (const [,paragraph] of main.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)) {
    const text = normalized(paragraph)
    assert.ok(mdPlain.includes(text), 'Full paragraph reaches search prose: '+text.slice(0,70))
  }
  for (const phrase of ['未做硬件验证','生命周期','one-past','CHAR_BIT','SIZE_MAX','伪造','悬空','独立','NDEBUG','实现定义的信号','GCC 13.1','2011-04-12']) {
    assert.ok(article.includes(phrase), 'Reader condition '+phrase);assert.ok(markdown.includes(phrase),'Search condition '+phrase)
  }
  assert.ok(!/<(?:script|iframe)[^>]+src=/i.test(article))
}
const source = read('docs/public/examples/c-objects-bounds/objects.c')
const searchChapter = read('docs/learn/c-objects-bounds.md')
const memorySearch = searchChapter.split('{#memory-audit-title}')[1]?.split('###')[0]
assert.ok(memorySearch, 'Memory-grid declarations belong to the existing search section')
for (const declaration of [
  'frame = {0x34, 0x12, 0xA0, 0x00}',
  '| frame[0] | 0x1000 | 0x34 |', '| frame[1] | 0x1001 | 0x12 |',
  '| frame[2] | 0x1002 | 0xA0 |', '| frame[3] | 0x1003 | 0x00 |',
  '0x1004', 'one-past', '不是 frame 元素', 'CHAR_BIT=8', 'uint8_t', '生命周期有效', '虚构'
]) assert.ok(memorySearch.includes(declaration), 'Independent complete SVG declaration reaches search: ' + declaration)
const sourceModule = source.split('\n#ifdef OBJECTS_TEST')[0].trimEnd()
assert.ok(!/\(void\)\s*(?:fprintf|puts)\(/.test(source), 'Output API results cannot be discarded')
assert.equal((source.match(/if \(fprintf\(/g) || []).length, 3, 'Every diagnostic call immediately checks failure')
assert.equal((source.match(/if \(puts\(/g) || []).length, 1, 'Success-message write immediately checks failure')
assert.match(source, /if \(fflush\(stdout\) == EOF\)/, 'Buffered success output failure returns nonzero')
assert.ok(read('docs/public/examples/c-objects-bounds/README.txt').includes('failed success-message puts'))
assert.equal(decodeEntities(html.match(/<code id="decoder-source">([\s\S]*?)<\/code>/)[1]), sourceModule, 'Complete displayed module equals compiled source')
assert.ok(read('docs/learn/c-objects-bounds.md').includes(sourceModule))
const exercises = [...html.matchAll(/<article class="exercise" id="exercise-(\d\d)">([\s\S]*?)<\/article>/g)]
assert.equal(exercises.length,10)
for (const [i, match] of exercises.entries()) {
  assert.equal(match[1],String(i+1).padStart(2,'0'))
  assert.match(match[2],new RegExp('<details class="exercise-answer" id="answer-'+match[1]+'"><summary>'))
  assert.ok(!/<details[^>]*\bopen\b/.test(match[2]))
}
for (const select of ['grid-prediction','decode-prediction']) {
  const labels = [...html.match(new RegExp('<select id="'+select+'">([\\s\\S]*?)<\\/select>'))[1].matchAll(/<option value="[^"]+">([^<]+)<\/option>/g)].map(m=>m[1].length)
  assert.equal(new Set(labels).size,1,'Comparable choice labels '+select)
}
assert.match(html,/body\.exercise-print \.exercise-answer\{display:none!important\}/)
assert.match(html,/body\.exercise-print main>\.content-section/)
assert.equal((html.match(/<table id="decode-fixtures">([\s\S]*?)<\/table>/)[1].match(/<tr>/g)||[]).length,11)
console.log('PASS readers: exact shared layers, one common header with verified category/home/search and actual local anchors, ten independent folded answers, printable input scope, complete anchored prose, module parity and technical caveats.')
