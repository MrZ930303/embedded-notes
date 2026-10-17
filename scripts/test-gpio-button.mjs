import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8')
const html = await read('docs/public/demos/gpio-button.html')
const reference = await read('docs/public/demos/gpio-button-reference.html')
const script = html.match(/<script id="gpio-controller">([\s\S]*?)<\/script>/)[1]

// The same controller used in the page runs against a small event-capable DOM.
class Element {
  constructor(value = '') { this.value = value; this.checked = false; this.disabled = false; this.open = false; this.listeners = {}; this._text = ''; this._html = '' }
  set textContent(value) { this._text = String(value); this._html = '' }
  get textContent() { return this._text }
  set innerHTML(value) { this._html = String(value); this._text = '' }
  get innerHTML() { return this._html }
  addEventListener(name, handler) { this.listeners[name] = handler }
  dispatch(name) { let prevented = false; this.listeners[name]?.({ target: this, preventDefault: () => { prevented = true } }); return prevented }
}
const elements = {}
const staticHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
for (const [, id, attrs] of staticHtml.matchAll(/<[a-z][^>]*?\bid="([^"]+)"([^>]*)>/g)) {
  elements[id] = new Element(attrs.match(/value="([^"]*)"/)?.[1] || '')
  elements[id].disabled = /\bdisabled\b/.test(attrs)
}
for (const [id, value] of Object.entries({ 'pending-mode': 'up', 'pending-resistor': 'connected', 'pending-button': 'released', prediction: '', threshold: '5' })) elements[id].value = value
let nextTimer = 0
const timers = new Map()
const bodyClasses = new Set(['notes-article'])
const windowListeners = new Map()
let printCalls = 0
const context = {
  document: {
    getElementById(id) { assert.ok(elements[id], 'Unknown GPIO control: ' + id); return elements[id] },
    body: { classList: { add(name) { bodyClasses.add(name) }, remove(name) { bodyClasses.delete(name) } } },
    querySelectorAll(selector) {
      assert.equal(selector, 'details')
      return [...staticHtml.matchAll(/<details\b[^>]*\bid="([^"]+)"/g)].map(([,id]) => elements[id])
    }
  },
  window: {
    addEventListener(name, handler) { const handlers = windowListeners.get(name) || []; handlers.push(handler); windowListeners.set(name, handlers) },
    print() { printCalls++ }
  },
  setInterval(fn, delay) { assert.equal(delay, 160); const id = ++nextTimer; timers.set(id, fn); return id },
  clearInterval(id) { timers.delete(id) }
}
vm.runInNewContext(script + '\n;globalThis.model = GpioModel;', context, { timeout: 1000 })
const model = context.model
const plain = value => JSON.parse(JSON.stringify(value))

// Independent truth table: all eight physical states, including no-pull release.
const circuits = [
  ['up', true, false, '1'], ['up', true, true, '0'],
  ['up', false, false, 'unknown'], ['up', false, true, '0'],
  ['down', true, false, '0'], ['down', true, true, '1'],
  ['down', false, false, 'unknown'], ['down', false, true, '1']
]
for (const [mode, resistor, pressed, expected] of circuits) assert.equal(model.circuit(mode, resistor, pressed).raw, expected)
assert.match(model.circuit('up', false, false).path, /不声称必然随机翻转/)
assert.throws(() => model.circuit('sideways', true, false), /Unknown pull mode/)
assert.equal(elements['raw-value'].textContent, '1 · 高电平')
assert.equal(elements['apply-circuit'].disabled, true)
let appliedSnapshot = elements['circuit-svg'].innerHTML

for (const [mode, resistor, pressed, expected] of circuits) {
  elements['pending-mode'].value = mode
  elements['pending-resistor'].value = resistor ? 'connected' : 'removed'
  elements['pending-button'].value = pressed ? 'pressed' : 'released'
  elements['pending-button'].dispatch('change')
  assert.equal(elements['circuit-svg'].innerHTML, appliedSnapshot, 'Pending settings must not reveal or apply the new state')
  assert.equal(elements['apply-circuit'].disabled, true)
  assert.equal(elements.prediction.value, '')
  assert.equal(elements['prediction-form'].dispatch('submit'), true)
  assert.equal(elements['circuit-svg'].innerHTML, appliedSnapshot, 'Submitting without a prediction cannot apply a new state')
  elements.prediction.value = expected
  elements.prediction.dispatch('change')
  assert.equal(elements['apply-circuit'].disabled, false)
  elements['prediction-form'].dispatch('submit')
  assert.match(elements['circuit-feedback'].textContent, /预测正确/)
  assert.match(elements['raw-value'].textContent, expected === 'unknown' ? /无法保证/ : new RegExp('^' + expected))
  assert.match(elements['circuit-svg'].innerHTML, /允许的 I\/O 电源/)
  assert.match(elements['circuit-svg'].innerHTML, /GPIO 输入/)
  assert.match(elements['circuit-svg'].innerHTML, /GND/)
  assert.equal(elements['apply-circuit'].disabled, true, 'Every new application requires a fresh prediction')
  assert.match(elements['circuit-svg'].innerHTML, /aria-labelledby="live-circuit-title live-circuit-desc"/)
  assert.match(elements['circuit-svg'].innerHTML, /id="live-current-arrow"/)
  const arrow = elements['circuit-svg'].innerHTML.match(/<path d="([^"]+)"[^>]*marker-end="url\(#live-current-arrow\)"/)
  assert.equal(Boolean(arrow), resistor && pressed, 'Current arrow exists only for a closed resistor branch')
  if (arrow) assert.equal(arrow[1], mode === 'up' ? 'M230 185H275' : 'M260 185H215', 'Current follows the GPIO branch in the correct direction')
  if (!resistor && !pressed) assert.doesNotMatch(elements['circuit-svg'].innerHTML, /opacity="\.7"/, 'Floating input has no certain highlighted path')
  appliedSnapshot = elements['circuit-svg'].innerHTML
}
elements['pending-mode'].value = 'up'; elements['pending-resistor'].value = 'connected'; elements['pending-button'].value = 'pressed'
elements['pending-mode'].dispatch('change'); elements.prediction.value = '1'; elements.prediction.dispatch('change'); elements['prediction-form'].dispatch('submit')
assert.match(elements['circuit-feedback'].textContent, /再沿线路看一次/)
assert.match(elements['circuit-feedback'].textContent, /不能据此猜原始值为 1/)
assert.equal(elements['raw-value'].textContent, '0 · 低电平')
console.log('PASS GPIO circuit: eight independent truth-table fixtures, pending-state isolation, prediction-before-apply, wrong-answer feedback and physical current-arrow direction.')

// These fixed answers are hand-specified from the published teaching input.
const base = model.samples(5)
assert.equal(base.length, 21)
assert.deepEqual(plain([base[0].since, base[0].age, base[1].since, base[1].age]), [-5, 5, -5, 6], 'Displayed t=0 follows a qualified release warmup matching the C clock')
for (const threshold of [1, 5, 10, 12]) assert.deepEqual(plain([model.samples(threshold)[0].since, model.samples(threshold)[0].age]), [-threshold, threshold])
assert.deepEqual(plain(base.slice(0, 8).map(frame => [frame.t, frame.raw])), [[0, 1], [1, 1], [2, 0], [3, 1], [4, 0], [5, 1], [6, 0], [7, 0]])
assert.deepEqual(plain(base.filter(frame => frame.event).map(frame => [frame.t, frame.event, frame.presses])), [[11, 'pressed', 1]])
assert.deepEqual(plain([base[6].age, base[10].age, base[10].stable, base[11].age, base[11].stable]), [0, 4, 1, 5, 0], 'Elapsed time reaches five milliseconds at 11, not at 10')
assert.equal(base.at(-1).falls, 3)
assert.equal(base.at(-1).presses, 1, 'Holding low does not emit another press')
assert.equal(base.at(-1).raw, 0)
assert.deepEqual(plain(model.samples(5, true).filter(frame => frame.event).map(frame => [frame.t, frame.event, frame.presses])), [[11, 'pressed', 1], [31, 'released', 1], [41, 'pressed', 2]])
assert.equal(model.samples(5, true).at(-1).falls, 6)
assert.deepEqual(plain(model.samples(1).filter(frame => frame.event).map(frame => frame.t)), [7])
assert.deepEqual(plain(model.samples(10).filter(frame => frame.event).map(frame => frame.t)), [16])
assert.deepEqual(plain(model.samples(12, true).filter(frame => frame.event).map(frame => [frame.t, frame.event])), [[18, 'pressed']], 'A release lasting only eight milliseconds is filtered at a twelve-millisecond threshold')
for (const value of [NaN, Infinity, -Infinity, 0, -1, 1.5, 13]) assert.throws(() => model.samples(value), /Threshold/)
console.log('PASS GPIO filter: exact 1 ms input, three raw falls, first press at 11 ms, no hold repeats, release 31 ms and second press 41 ms; independent threshold and short-state fixtures.')

for (let t = 1; t <= 10; t++) elements['timeline-step'].onclick()
assert.equal(elements['sample-time'].textContent, '10')
assert.equal(elements['sample-values'].textContent, '0 / 1')
assert.equal(elements['press-count'].textContent, '0')
elements['timeline-step'].onclick()
assert.equal(elements['sample-time'].textContent, '11')
assert.equal(elements['press-count'].textContent, '1')
assert.match(elements['event-log'].innerHTML, /11 ms/)
elements['timeline-finish'].onclick()
assert.equal(elements['sample-time'].textContent, '20')
assert.equal(elements['fall-count'].textContent, '3')
assert.equal(elements['press-count'].textContent, '1')
assert.equal(elements['timeline-step'].disabled, true)
elements['timeline-reset'].onclick()
assert.equal(elements['sample-time'].textContent, '0')
elements['timeline-play'].onclick()
assert.equal(timers.size, 1)
assert.equal(elements['timeline-play'].textContent, '暂停回放')
for (let i = 0; i < 20; i++) [...timers.values()][0]?.()
assert.equal(elements['sample-time'].textContent, '20')
assert.equal(timers.size, 0, 'Playback stops itself at the last sample')
elements['timeline-play'].onclick(); [...timers.values()][0]()
assert.equal(elements['sample-time'].textContent, '1', 'Replay at the end starts from zero')
elements['timeline-play'].onclick()
assert.equal(timers.size, 0)
elements.extended.checked = true; elements.extended.dispatch('change'); elements['timeline-finish'].onclick()
assert.equal(elements['sample-time'].textContent, '50')
assert.equal(elements['press-count'].textContent, '2')
assert.match(elements['event-log'].innerHTML, /31 ms/)
assert.match(elements['event-log'].innerHTML, /41 ms/)
elements.threshold.value = '12'; elements.threshold.dispatch('input'); elements['timeline-finish'].onclick()
assert.equal(elements['press-count'].textContent, '1')
for (const invalid of ['', 'NaN', 'Infinity', '1e309', '0', '-1', '5.5', '13']) {
  elements.threshold.value = invalid; elements.threshold.dispatch('input')
  assert.equal(elements['timeline-step'].disabled, true)
  assert.equal(elements['timeline-play'].disabled, true)
  assert.equal(elements['timeline-finish'].disabled, true)
  assert.equal(timers.size, 0)
  assert.match(elements['timeline-feedback'].textContent, /请输入 1 到 12 的整数/)
  assert.equal(elements['sample-time'].textContent, '50', 'Invalid settings retain the previous valid diagram')
}
elements.threshold.value = '5'; elements.threshold.dispatch('input')
assert.equal(elements['sample-time'].textContent, '0')
assert.equal(elements['timeline-play'].disabled, false)
assert.equal(elements['timeline-finish'].disabled, false)
console.log('PASS GPIO controls: step, complete result, reset, animated play/pause/replay, extension, live threshold reset and empty/non-finite/fractional/out-of-range rejection.')

vm.runInNewContext(html.match(/<script id="gpio-exercises">([\s\S]*?)<\/script>/)[1], context, { timeout: 1000 })
const expectedVoltages = [[-1,'outside'], [0,'low'], [0.2,'low'], [0.8,'low'], [0.81,'unknown'], [1.2,'unknown'], [1.99,'unknown'], [2,'high'], [3.3,'high'], [5,'outside']]
for (const [voltage, answer] of expectedVoltages) {
  elements['voltage-input'].value = String(voltage)
  elements['voltage-input'].dispatch('input')
  assert.equal(elements['voltage-prediction'].value, '')
  assert.equal(elements['voltage-submit'].disabled, true)
  assert.equal(elements['voltage-exercise-answer'].open, false, 'Changing a pending voltage cannot reveal its answer')
  assert.match(elements['voltage-feedback'].textContent, /尚未揭晓/)
  const pendingFeedback = elements['voltage-feedback'].textContent
  for (const malformed of ['', 'invalid', 'LOW']) {
    elements['voltage-prediction'].value = malformed
    assert.equal(elements['voltage-prediction-form'].dispatch('submit'), true)
    assert.equal(elements['voltage-feedback'].textContent, pendingFeedback, 'Malformed guesses cannot reveal a voltage answer')
    assert.equal(elements['voltage-exercise-answer'].open, false)
  }
  elements['voltage-prediction'].value = answer
  elements['voltage-prediction'].dispatch('change')
  assert.equal(elements['voltage-submit'].disabled, false)
  assert.equal(elements['voltage-prediction-form'].dispatch('submit'), true)
  assert.match(elements['voltage-feedback'].textContent, /预测正确/)
  assert.match(elements['voltage-feedback'].textContent, /虚构规格/)
  assert.equal(elements['voltage-answer-heading'].textContent, '上次提交的输入 ' + voltage + ' V 的门限推理')
  assert.match(elements['voltage-answer-text'].textContent, new RegExp('^输入 ' + voltage + ' V：'))
  if (voltage === 2) {
    assert.match(elements['voltage-answer-text'].textContent, /保证为高（1）/)
    assert.doesNotMatch(elements['voltage-answer-text'].textContent, /不能保证读到 0 或 1/)
  }
  assert.equal(elements['voltage-exercise-answer'].open, true)
  assert.equal(elements['voltage-submit'].disabled, true, 'New prediction is required after revealing')
}
elements['voltage-input'].value = '2'; elements['voltage-input'].dispatch('input')
elements['voltage-prediction'].value = 'high'; elements['voltage-prediction'].dispatch('change'); elements['voltage-prediction-form'].dispatch('submit')
elements['voltage-input'].value = '1.2'; elements['voltage-input'].dispatch('input')
assert.equal(elements['voltage-answer-heading'].textContent, '上次提交的输入 2 V 的门限推理', 'A pending voltage must label the retained answer as the previous submission')
assert.match(elements['voltage-answer-text'].textContent, /^输入 2 V：/, 'Changing the input must not reveal its new result')
assert.match(elements['voltage-feedback'].textContent, /尚未揭晓/)
assert.equal(elements['voltage-exercise-answer'].open, false)
assert.equal(elements['voltage-prediction'].value, '')
assert.equal(elements['voltage-submit'].disabled, true)
for (const invalid of ['', ' ', 'NaN', 'Infinity', '-Infinity', '1e999', 'abc']) {
  elements['voltage-input'].value = invalid
  elements['voltage-input'].dispatch('input')
  elements['voltage-prediction'].value = 'low'
  elements['voltage-prediction'].dispatch('change')
  assert.equal(elements['voltage-submit'].disabled, true)
  const feedback = elements['voltage-feedback'].textContent
  elements['voltage-prediction-form'].dispatch('submit')
  assert.equal(elements['voltage-feedback'].textContent, feedback)
  assert.equal(elements['voltage-exercise-answer'].open, false)
}
elements['voltage-input'].value = '1.2'; elements['voltage-input'].dispatch('input')
elements['voltage-prediction'].value = 'high'; elements['voltage-prediction'].dispatch('change'); elements['voltage-prediction-form'].dispatch('submit')
assert.match(elements['voltage-feedback'].textContent, /再检查区间/)
assert.match(elements['voltage-feedback'].textContent, /不能保证读到 0 或 1/)
for (const [id, answer, wrong, reason] of [
  ['scenario-boot','after-release','at-5',/不为初始按住/],
  ['scenario-short-release','filtered','both',/31 ms.*41 ms/],
  ['scenario-gap','105','100',/最早 105 ms/],
  ['scenario-glitch','may-miss','threshold',/没有采到的数据/]
]) {
  const feedback = elements[id + '-feedback'].textContent
  for (const invalid of ['', 'unknown', 'NaN']) {
    elements[id + '-prediction'].value = invalid
    elements[id + '-prediction'].dispatch('change')
    assert.equal(elements[id + '-submit'].disabled, true)
    const pending = elements[id + '-feedback'].textContent
    assert.equal(elements[id + '-form'].dispatch('submit'), true)
    assert.equal(elements[id + '-feedback'].textContent, pending)
    assert.equal(elements[id + '-answer'].open, false)
  }
  for (const guess of [wrong, answer]) {
    elements[id + '-prediction'].value = guess
    elements[id + '-prediction'].dispatch('change')
    assert.equal(elements[id + '-answer'].open, false, 'Choosing a scenario answer does not reveal it')
    assert.equal(elements[id + '-submit'].disabled, false)
    assert.equal(elements[id + '-form'].dispatch('submit'), true)
    assert.match(elements[id + '-feedback'].textContent, guess === answer ? /预测正确/ : /再按契约推一次/)
    assert.match(elements[id + '-feedback'].textContent, reason)
    assert.equal(elements[id + '-answer'].open, true)
    assert.equal(elements[id + '-prediction'].value, '')
    assert.equal(elements[id + '-submit'].disabled, true)
  }
}
console.log('PASS GPIO reasoning controllers: threshold boundaries/allowed range, finite-number validation, pending isolation, four predictions and reasoned right/wrong feedback through actual page scripts.')

vm.runInNewContext(html.match(/<script id="note-print">([\s\S]*?)<\/script>/)[1], context, { timeout: 1000 })
const panels = context.document.querySelectorAll('details')
panels.forEach((panel,index) => { panel.open = index % 3 === 0 })
const beforePrint = panels.map(panel => panel.open)
elements['print-exercises'].onclick()
assert.equal(printCalls, 1)
assert.equal(bodyClasses.has('exercise-print'), true)
for (const handler of windowListeners.get('beforeprint')) handler()
assert.ok(panels.every(panel => panel.open), 'Shared print handler can expand all answers; exercise CSS hides them only in print')
for (const handler of windowListeners.get('afterprint')) handler()
assert.equal(bodyClasses.has('exercise-print'), false, 'Completing or canceling print clears the local mode')
assert.deepEqual(panels.map(panel => panel.open), beforePrint, 'Printing restores all original disclosure states')
for (const handler of windowListeners.get('beforeprint')) handler()
assert.equal(bodyClasses.has('exercise-print'), false, 'Later ordinary print is not stuck in question-only mode')
for (const handler of windowListeners.get('afterprint')) handler()
assert.match(html, /@media print\{[^}]*\.reasoning-form/)
assert.match(html, /body\.exercise-print \.exercise-answer\{display:none!important\}/)
const worksheetRecord = staticHtml.match(/<div class="card worksheet-input" id="exercise-input-record">([\s\S]*?)<\/div>/)?.[1]
assert.ok(worksheetRecord, 'Question-only print needs a static complete input record for the waveform questions')
assert.match(staticHtml, /id="recall-questions">[\s\S]*?<h3>十个独立练习[^<]*<\/h3>[\s\S]*?id="exercise-input-record">[\s\S]*?id="recall-answers">/, 'Worksheet title and input must precede the ten questions within the printed wrapper')
const worksheetMarkdown = await read('docs/learn/gpio-button.md')
for (const phrase of ['t=0 前已经确认释放', '预热时长至少等于所选阈值', 'raw=1', '每 1 ms 采样', '2/3/4/5/6 ms 的 raw 依次为 0/1/0/1/0', '24/25/26 ms 的 1/0/1', '34/35/36 ms 的 0/1/0', '未列出的时刻保持前值', '最后保持到 50 ms', '阈值按各题给定']) {
  assert.ok(worksheetRecord.includes(phrase), 'Worksheet input missing: ' + phrase)
  assert.ok(worksheetMarkdown.includes(phrase), 'Full search text must retain worksheet input: ' + phrase)
}
assert.doesNotMatch(worksheetRecord, /\b(?:11|31|41)\s*ms|PRESSED|解析|答案/, 'Printed input record must not reveal event answers')
assert.doesNotMatch(worksheetRecord, /<details\b|<script\b/, 'Input record must remain readable without JavaScript and without opening an answer')
const chapterStyles = html.match(/<style>\s*\/\* GPIO chapter controls only;[\s\S]*?<\/style>/)[0]
const scrollRule = chapterStyles.match(/@media screen\{([^{}]+)\{scroll-margin-top:124px\}\}/)[1]
for (const selector of ['#voltage-exercise', '#sampling-limits', '.scenario-card', '#c-syntax', '#c-contract', '#c-source', '#c-host-lab', '#recall-questions', '#recall-answers', '.exercise', '.exercise-answer']) {
  assert.ok(scrollRule.split(',').includes('.notes-article ' + selector), 'New nested chapter anchor needs a screen-only sticky-header offset: ' + selector)
}
console.log('PASS GPIO print controller: exercise-only mode, shared answer expansion/state restoration, afterprint cancellation cleanup and ordinary subsequent print.')

const ota = await read('docs/public/demos/mcu-ota.html')
const sharedLayer = source => source.match(/<style>\s*\/\* Shared reading layer:[\s\S]*?<\/style>/)[0]
const noteScript = (source, id) => source.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'))[1]
for (const [name, source, markdownFile] of [
  ['lesson', html, 'docs/learn/gpio-button.md'],
  ['reference', reference, 'docs/learn/gpio-button-reference.md']
]) {
  const markdown = await read(markdownFile)
  const body = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  const ids = [...body.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
  assert.equal(ids.length, new Set(ids).size, name + ' HTML must have unique real IDs')
  const literalIds = [...source.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
  assert.equal(literalIds.length, new Set(literalIds).size, name + ' source including controller templates must have unique literal IDs')
  for (const heading of markdown.split('\n').filter(line => /^#{1,6} /.test(line))) {
    const id = heading.match(/\{#([^}]+)\}$/)?.[1]
    assert.ok(id, 'Search heading requires explicit anchor: ' + heading)
    assert.equal(ids.filter(candidate => candidate === id).length, 1, 'Search heading must resolve to a unique real HTML ID: ' + id)
  }
  assert.equal(sharedLayer(source), sharedLayer(ota), name + ' keeps the exact shared reading style')
  for (const id of ['note-deep-links', 'note-print']) assert.equal(noteScript(source, id), noteScript(ota, id))
  assert.match(source, /<body class="notes-article">/)
  const header = source.match(/<header class="topbar">([\s\S]*?)<\/header>/)[1]
  for (const label of ['嵌入式技术笔记', '返回分类', '交互实验', '完整笔记', '搜索笔记']) assert.ok(header.includes(label), name + ' shared navigation label missing: ' + label)
  for (const path of ['href="../"', 'href="../learn/"', 'href="../?search=1"', 'href="../favicon.svg"', 'href="../learn/engineering-map.html#stage-01"']) assert.ok(source.includes(path), name + ' missing shared contract URL ' + path)
  assert.ok(markdown.includes('./engineering-map.html#stage-01'))
  assert.doesNotMatch(source + markdown, /mcu-roadmap\.html/)
  assert.ok(ids.includes('lesson-notes'))
  for (const phrase of ['无法保证', '悬空', '下拉', '11 ms', '5 ms', '未做硬件验证', '人工', '逻辑', '输入门限']) assert.ok((source + markdown).includes(phrase), name + ' searchable condition missing: ' + phrase)
  for (const url of [...source.matchAll(/<a href="(https:[^"]+)" target="_blank"/g)].map(match => match[1])) assert.ok(markdown.includes(url), name + ' official or method source absent from search text')
  assert.doesNotMatch(source, /<script\b[^>]*\bsrc=|<link\b[^>]*rel="stylesheet"/)
  for (const text of [source, markdown]) {
    assert.match(text, /<a\b[^>]*\bhref="\.\.\/examples\/gpio-button\/button\.c"[^>]*\bdownload(?:\s|>)/, name + ' must download the real public C asset')
    assert.doesNotMatch(text, /href="[^\"]*(?:button\.c\.html|README\.html)"/, name + ' download assets must not be rewritten as documentation pages')
  }
  const visibleProse = source.replace(/<(script|style|pre)\b[^>]*>[\s\S]*?<\/\1>/g, '')
  assert.ok(!visibleProse.includes('**'), name + ' prose must not retain raw Markdown emphasis artifacts')
}
const decodeHtml = value => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
const downloadable = await read('docs/public/examples/gpio-button/button.c')
const testStart = downloadable.lastIndexOf('#ifdef BUTTON_TEST')
assert.ok(testStart > 0, 'Downloadable source must retain its standalone test section')
const cCore = downloadable.slice(0, testStart).trimEnd()
assert.equal(decodeHtml(html.match(/<code id="button-c-source">([\s\S]*?)<\/code>/)[1]).trimEnd(), cCore, 'Displayed C core must be exact downloadable source before its last test section')
assert.ok((await read('docs/learn/gpio-button.md')).includes('```c\n' + cCore + '\n```'), 'Search C core must exactly match the download')
for (let number = 1; number <= 10; number++) {
  assert.match(staticHtml, new RegExp('<article[^>]+id="exercise-' + number + '"'))
  assert.match(staticHtml, new RegExp('<details[^>]+id="exercise-answer-' + number + '"[^>]+class="exercise-answer"'))
}
const map = await read('docs/public/demos/learning-map.html')
assert.match(map, /id="stage-01"/, 'Cross-ticket map target must contain stage-01')
console.log('PASS GPIO publishing contract: exact shared style/deep-link/print scripts, explicit search anchors, full searchable conditions/references, canonical map target, offline inline execution and unique IDs.')
