import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8')
const html = await read('docs/public/demos/gpio-led.html')
const getScript = id => {
  const match = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'))
  assert.ok(match, 'Actual page script required: ' + id)
  return match[1]
}
const context = {}
vm.runInNewContext(getScript('led-model') + '\n;globalThis.model = LedModel;', context, { timeout: 1000 })
const model = context.model

// Independent fixed case from the chapter contract: PP high supplies the LED branch.
assert.equal(model.path({ mode: 'pp', bit: 1, topology: 'source', pullup: false }).kind, 'source')
// Expected results are literal fixtures from the agreed electrical teaching table.
const paths = [
  ['pp', 0, 'source', false, 'off'], ['pp', 0, 'source', true, 'off'],
  ['pp', 0, 'sink', false, 'sink'], ['pp', 0, 'sink', true, 'sink'],
  ['pp', 1, 'source', false, 'source'], ['pp', 1, 'source', true, 'source'],
  ['pp', 1, 'sink', false, 'off'], ['pp', 1, 'sink', true, 'off'],
  ['od', 0, 'source', false, 'off'], ['od', 0, 'source', true, 'off'],
  ['od', 0, 'sink', false, 'sink'], ['od', 0, 'sink', true, 'sink'],
  ['od', 1, 'source', false, 'off'], ['od', 1, 'source', true, 'pullup'],
  ['od', 1, 'sink', false, 'off'], ['od', 1, 'sink', true, 'off']
]
for (const [mode, bit, topology, pullup, expected] of paths) {
  const result = model.path({ mode, bit, topology, pullup })
  assert.equal(result.kind, expected, [mode, bit, topology, pullup].join('/'))
  assert.equal(result.extraPullup, pullup && bit === 0, 'Pull-up current is separate from the LED branch')
  assert.match(result.path, /VIO|稳态/)
}
assert.match(model.path({ mode: 'od', bit: 1, topology: 'source', pullup: true }).node, /负载|不保证/)
assert.match(model.path({ mode: 'od', bit: 1, topology: 'sink', pullup: false }).node, /不保证/)
for (const bad of [{ mode: 'unknown', bit: 1, topology: 'sink', pullup: false }, { mode: 'pp', bit: 2, topology: 'source', pullup: true }, { mode: 'pp', bit: 1, topology: 'unknown', pullup: true }, { mode: 'od', bit: 1, topology: 'sink', pullup: 'false' }]) assert.throws(() => model.path(bad), /Invalid/)
console.log('PASS GPIO LED: sixteen independent path fixtures, separate pull-up current, loaded release and invalid settings.')

const plain = value => JSON.parse(JSON.stringify(value))
assert.deepEqual(plain(model.replay()), [
  { t: 0, event: 'NONE', on: false, bit: 1 },
  { t: 11, event: 'PRESSED', on: true, bit: 0 },
  { t: 12, event: 'NONE', on: true, bit: 0 },
  { t: 31, event: 'RELEASED', on: true, bit: 0 },
  { t: 41, event: 'PRESSED', on: false, bit: 1 }
])
assert.deepEqual(plain(model.replay()), plain(model.replay()), 'Replay always starts from desired off')
console.log('PASS GPIO LED: qualified events toggle only on PRESSED, fixed PP sink commands 1/0/0/0/1.')

class Element {
  constructor(value = '') { this.value = value; this.disabled = false; this.listeners = {}; this._text = ''; this._html = '' }
  set textContent(value) { this._text = String(value); this._html = '' }
  get textContent() { return this._text }
  set innerHTML(value) { this._html = String(value); this._text = '' }
  get innerHTML() { return this._html }
  addEventListener(name, handler) { this.listeners[name] = handler }
  dispatch(name) { let prevented = false; this.listeners[name]?.({ target: this, preventDefault: () => { prevented = true } }); return prevented }
}
const elements = {}
for (const [, id] of html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').matchAll(/\bid="([^"]+)"/g)) elements[id] = new Element()
for (const [id, value] of Object.entries({ 'pending-mode': 'pp', 'pending-bit': '1', 'pending-topology': 'sink', 'pending-pullup': 'no', 'path-prediction': '' })) {
  assert.ok(elements[id], 'Missing actual control: ' + id)
  elements[id].value = value
}
context.document = { getElementById(id) { assert.ok(elements[id], 'Unknown LED control: ' + id); return elements[id] } }
vm.runInNewContext(getScript('led-controller'), context, { timeout: 1000 })
assert.equal(elements['path-kind'].textContent, '无稳态通路')
assert.equal(elements['apply-path'].disabled, true)
const initialSvg = elements['path-svg'].innerHTML
const initialCurrent = elements['path-current'].textContent
elements['pending-bit'].value = '0'
elements['pending-bit'].dispatch('change')
assert.equal(elements['path-svg'].innerHTML, initialSvg, 'Pending changes cannot alter the applied circuit')
assert.equal(elements['path-current'].textContent, initialCurrent, 'Pending changes cannot disclose the new result')
assert.equal(elements['path-form'].dispatch('submit'), true)
assert.equal(elements['path-svg'].innerHTML, initialSvg, 'No prediction means no application')
elements['path-prediction'].value = 'sink'; elements['path-prediction'].dispatch('change')
assert.equal(elements['apply-path'].disabled, false)
elements['path-form'].dispatch('submit')
assert.equal(elements['path-kind'].textContent, '向引脚灌入')
assert.match(elements['path-feedback'].textContent, /预测正确/)
assert.equal(elements['apply-path'].disabled, true, 'Every application consumes the prediction')
console.log('PASS GPIO LED controller: real pending/edit/predict/submit handlers preserve disclosure ordering.')

const labels = { source: '由引脚拉出', sink: '向引脚灌入', pullup: '由上拉供给', off: '无稳态通路' }
let previousSvg = elements['path-svg'].innerHTML
let previousFeedback = elements['path-feedback'].textContent
for (const [mode, bit, topology, pullup, expected] of paths) {
  elements['pending-mode'].value = mode; elements['pending-bit'].value = String(bit)
  elements['pending-topology'].value = topology; elements['pending-pullup'].value = pullup ? 'yes' : 'no'
  for (const id of ['pending-mode', 'pending-bit', 'pending-topology', 'pending-pullup']) {
    elements[id].dispatch('change')
    assert.equal(elements['path-svg'].innerHTML, previousSvg)
    assert.equal(elements['path-feedback'].textContent, previousFeedback)
    assert.equal(elements['path-prediction'].value, '')
    assert.equal(elements['apply-path'].disabled, true)
  }
  elements['path-prediction'].value = expected; elements['path-prediction'].dispatch('change')
  elements['path-form'].dispatch('submit')
  assert.equal(elements['path-kind'].textContent, labels[expected])
  assert.match(elements['path-feedback'].textContent, /预测正确/)
  const svg = elements['path-svg'].innerHTML
  assert.match(svg, /aria-labelledby="live-led-title live-led-desc"/)
  assert.match(svg, /GPIO/)
  assert.match(svg, /Rled/)
  assert.match(svg, /A→K/)
  assert.equal(svg.includes('class="led-current-path"'), expected !== 'off')
  assert.equal(svg.includes('class="pullup-current-path"'), pullup && bit === 0)
  const arrow = svg.match(/class="led-current-path" d="([^"]+)"/)
  if (arrow) assert.equal(arrow[1], { source: 'M130 42V150H260V275', sink: 'M260 42V150H130V275', pullup: 'M45 42V150H260V275' }[expected], 'Direction is independently fixed to the teaching circuit')
  assert.equal(elements['apply-path'].disabled, true)
  assert.equal(elements['path-prediction'].value, '')
  previousSvg = svg; previousFeedback = elements['path-feedback'].textContent
}
elements['pending-mode'].value = 'od'; elements['pending-bit'].value = '1'; elements['pending-topology'].value = 'source'; elements['pending-pullup'].value = 'yes'
elements['pending-mode'].dispatch('change'); elements['path-prediction'].value = 'source'; elements['path-prediction'].dispatch('change'); elements['path-form'].dispatch('submit')
assert.equal(elements['path-kind'].textContent, '由上拉供给')
assert.match(elements['path-feedback'].textContent, /再沿电流走一次/)
assert.match(elements['path-feedback'].textContent, /你选了“由引脚拉出”/)
assert.match(elements['path-node'].textContent, /负载|加载/)
assert.match(elements['path-node'].textContent, /不保证/)
previousSvg = elements['path-svg'].innerHTML
elements['pending-bit'].value = '2'; elements['pending-bit'].dispatch('change'); elements['path-prediction'].value = 'off'; elements['path-prediction'].dispatch('change'); elements['path-form'].dispatch('submit')
assert.equal(elements['path-svg'].innerHTML, previousSvg)
assert.match(elements['path-pending'].textContent, /条件无效/)
elements['reset-path'].dispatch('click')
assert.equal(elements['path-kind'].textContent, '无稳态通路')
assert.equal(elements['path-svg'].innerHTML, initialSvg)
assert.deepEqual(['pending-mode', 'pending-bit', 'pending-topology', 'pending-pullup', 'path-prediction'].map(id => elements[id].value), ['pp', '1', 'sink', 'no', ''])
assert.equal(elements['apply-path'].disabled, true)
console.log('PASS GPIO LED controller: all sixteen applied diagrams, separate pull-up arrows, wrong-answer reasons, invalid retention and reproducible reset.')

assert.deepEqual(['replay-time', 'replay-event', 'replay-state', 'replay-bit'].map(id => elements[id].textContent), ['0', 'NONE', '灭', '1'])
for (const row of [['11', 'PRESSED', '亮', '0'], ['12', 'NONE', '亮', '0'], ['31', 'RELEASED', '亮', '0'], ['41', 'PRESSED', '灭', '1']]) {
  elements['replay-step'].dispatch('click')
  assert.deepEqual(['replay-time', 'replay-event', 'replay-state', 'replay-bit'].map(id => elements[id].textContent), row)
}
assert.equal(elements['replay-step'].disabled, true)
assert.equal((elements['replay-log'].innerHTML.match(/<li>/g) || []).length, 5)
elements['replay-step'].dispatch('click'); assert.equal(elements['replay-time'].textContent, '41')
elements['replay-reset'].dispatch('click')
assert.equal(elements['replay-step'].disabled, false)
assert.equal(elements['replay-time'].textContent, '0')
assert.equal(elements['replay-state'].textContent, '灭')
assert.equal(elements['replay-bit'].textContent, '1')
assert.equal((elements['replay-log'].innerHTML.match(/<li>/g) || []).length, 1)
elements['replay-step'].dispatch('click'); assert.equal(elements['replay-time'].textContent, '11')
console.log('PASS GPIO LED replay controller: step, hold/release persistence, bounded end, reset and replay from the beginning.')

const reference = await read('docs/public/demos/gpio-led-reference.html')
for (const [route, article] of [['gpio-led', html], ['gpio-led-reference', reference]]) {
  const markdown = await read('docs/learn/' + route + '.md')
  if (route === 'gpio-led') {
    for (const source of [article, markdown]) {
      for (const condition of ['PC13、PC14、PC15', '3 mA', '≤2 MHz', '≤30 pF', '脚注 5']) assert.ok(source.includes(condition), 'Critical MCU pin conditions must reach reader and search: ' + condition)
    }
  }
  const markdownIds = [...markdown.matchAll(/^#{1,6} .+\{#([^}]+)\}/gm)].map(match => match[1])
  assert.equal(markdownIds.length, new Set(markdownIds).size, 'Unique searchable Markdown heading anchors: ' + route)
  const ids = [...article.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
  assert.equal(ids.length, new Set(ids).size, 'Unique HTML IDs: ' + route)
  for (const heading of markdown.replace(/```[\s\S]*?```/g, '').match(/^#{1,6} .+$/gm) || []) {
    const anchor = heading.match(/\{#([^}]+)\}/)?.[1]
    assert.ok(anchor, 'Explicit Markdown anchor: ' + heading)
    assert.ok(ids.includes(anchor), 'Matching real reader anchor: ' + anchor)
  }
  for (const id of ['note-deep-links', 'note-print']) assert.equal(article.match(new RegExp('<script id="' + id + '">[\\s\\S]*?<\\/script>'))[0], (await read('docs/public/demos/gpio-button.html')).match(new RegExp('<script id="' + id + '">[\\s\\S]*?<\\/script>'))[0], 'Unchanged shared reader script: ' + id)
  assert.equal(article.match(/\/\* Shared reading layer:[\s\S]*?<\/style>/)[0], (await read('docs/public/demos/gpio-button.html')).match(/\/\* Shared reading layer:[\s\S]*?<\/style>/)[0], 'Unchanged shared reading style')
  assert.match(article, /<details[^>]*id="(?:reference-recall|path-recall)"/)
  for (const phrase of ['未做硬件验证', 'PRESSED', 'RELEASED', 'NONE', 'Rled', 'Rpu', 'VOH', 'VOL']) assert.ok(article.includes(phrase), 'No-JS teaching content: ' + phrase)
  assert.ok(!/<(?:script|iframe)[^>]+src=/i.test(article))
}
const predictedOptions = [...html.match(/<select id="path-prediction">([\s\S]*?)<\/select>/)[1].matchAll(/<option value="(?:source|sink|pullup|off)">([^<]+)<\/option>/g)].map(match => match[1])
assert.deepEqual(predictedOptions.map(text => text.length), [5, 5, 5, 5], 'Comparable prediction lengths')
assert.equal((html.match(/<table id="path-truth-table">([\s\S]*?)<\/table>/)[1].match(/<tr>/g) || []).length, 17, 'Sixteen no-JS cases plus header')
console.log('PASS GPIO LED reader contract: prose/reference anchors, hidden native recall, exact shared styles/scripts, sixteen-row fallback and equal-length predictions.')

// Fictional engineering bounds from the spec, not values inferred from the MCU case.
const budgetDefaults = { vMin: 3, vMax: 3.6, vfMin: 1.8, vfMax: 2.2, dropMax: 0.4, rOhm: 680, tolPct: 5, channels: 4, pinBudget: 4, groupBudget: 12, totalBudget: 30, other: 10 }
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} differs from independent worked value ${expected}`)
const defaultBudget = model.limits(budgetDefaults)
near(defaultBudget.rMin, 646); near(defaultBudget.rMax, 714)
near(defaultBudget.iMaxMa, 2.7863777089783284); near(defaultBudget.iMinMa, 0.560224089635854)
near(defaultBudget.pMaxW, 0.005015479876160991)
near(defaultBudget.groupMa, 11.145510835913313); near(defaultBudget.totalMa, 21.145510835913313)
assert.equal(defaultBudget.kind, 'within')
assert.deepEqual(plain(defaultBudget.exceeded), [])
console.log('PASS GPIO LED calculator: independent default tolerance/current/power and simultaneous rail budget fixture.')

const fiveBudget = model.limits({ ...budgetDefaults, channels: 5 })
near(fiveBudget.groupMa, 13.931888544891642); near(fiveBudget.totalMa, 23.931888544891642)
assert.equal(fiveBudget.kind, 'over'); assert.deepEqual(plain(fiveBudget.exceeded), ['group'])
const eightBudget = model.limits({ ...budgetDefaults, channels: 8 })
near(eightBudget.totalMa, 32.29102167182663)
assert.deepEqual(plain(eightBudget.exceeded), ['group', 'total'])
assert.deepEqual(plain(model.limits({ ...budgetDefaults, rOhm: 330 }).exceeded), ['pin', 'group', 'total'])
assert.deepEqual(plain(model.limits({ ...budgetDefaults, rOhm: 560 }).exceeded), ['group'])
const equalBudget = model.limits({ vMin: 3, vMax: 3, vfMin: 1, vfMax: 1, dropMax: 0, rOhm: 1000, tolPct: 0, channels: 2, pinBudget: 2, groupBudget: 4, totalBudget: 5, other: 1 })
assert.equal(equalBudget.kind, 'within'); assert.equal(equalBudget.iMaxMa, 2)
const noHeadroom = model.limits({ ...budgetDefaults, vMin: 1, vMax: 1.8 })
assert.equal(noHeadroom.kind, 'headroom'); assert.equal(noHeadroom.iMaxMa, 0); assert.equal(noHeadroom.pMaxW, 0)
const lowZero = model.limits({ ...budgetDefaults, dropMax: 1 })
assert.equal(lowZero.iMinMa, 0); assert.equal(lowZero.kind, 'within')
console.log('PASS GPIO LED calculator: five/eight/330/560 overload, equality, no-headroom and unassured minimum conduction fixtures.')

for (const [key, value] of [['vMin', ''], ['vMax', Infinity], ['vfMin', -1], ['rOhm', 0], ['rOhm', 1e-320], ['tolPct', 100], ['tolPct', -1], ['channels', 1.5], ['channels', 0], ['channels', 33], ['pinBudget', 0], ['groupBudget', -1], ['totalBudget', 0], ['other', -1], ['dropMax', 3.1], ['dropMax', -1], ['vMin', 4], ['vfMin', 3]]) assert.throws(() => model.limits({ ...budgetDefaults, [key]: value }), /Invalid/, key + '=' + value)
assert.throws(() => model.limits({ ...budgetDefaults, vMax: 1e308 }), /Invalid/, 'Finite inputs must not produce infinite outputs')
assert.throws(() => model.limits({ ...budgetDefaults, channels: true }), /Invalid/, 'Booleans are not numeric engineering inputs')
assert.throws(() => model.limits({ ...budgetDefaults, vMax: 1e153, rOhm: 1 }), /Invalid/, 'Display conversion to milliwatts must remain finite')
console.log('PASS GPIO LED calculator: empty/nonfinite/ordered bounds/domain/integer/overflow validation.')

const budgetElements = {}
for (const [, id] of html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').matchAll(/\bid="([^"]+)"/g)) budgetElements[id] = new Element()
for (const [key, value] of Object.entries(budgetDefaults)) {
  assert.ok(budgetElements['budget-' + key], 'Actual calculator input: ' + key)
  budgetElements['budget-' + key].value = String(value)
}
const budgetContext = { LedModel: model, document: { getElementById(id) { assert.ok(budgetElements[id], 'Actual calculator element: ' + id); return budgetElements[id] } } }
vm.runInNewContext(getScript('led-budget-controller'), budgetContext, { timeout: 1000 })
assert.equal(budgetElements['budget-results'].hidden, true)
assert.equal(budgetElements['calculate-budget'].disabled, true)
budgetElements['budget-form'].dispatch('submit')
assert.equal(budgetElements['budget-results'].hidden, true, 'No answer before prediction')
budgetElements['budget-prediction'].value = 'within'; budgetElements['budget-prediction'].dispatch('change')
budgetElements['budget-form'].dispatch('submit')
assert.equal(budgetElements['budget-results'].hidden, false)
assert.equal(budgetElements['budget-imax'].textContent, '2.786')
assert.equal(budgetElements['budget-imin'].textContent, '0.560')
assert.equal(budgetElements['budget-power'].textContent, '5.015')
assert.equal(budgetElements['budget-group'].textContent, '11.146')
assert.equal(budgetElements['budget-total'].textContent, '21.146')
assert.match(budgetElements['budget-feedback'].textContent, /预测正确/)
assert.match(budgetElements['budget-feedback'].textContent, /条件化数学/)
const appliedReading = budgetElements['budget-group'].textContent
budgetElements['budget-channels'].value = '5'; budgetElements['budget-channels'].dispatch('input')
assert.equal(budgetElements['budget-group'].textContent, appliedReading)
assert.equal(budgetElements['budget-prediction'].value, '')
assert.equal(budgetElements['calculate-budget'].disabled, true)
budgetElements['budget-prediction'].value = 'within'; budgetElements['budget-prediction'].dispatch('change'); budgetElements['budget-form'].dispatch('submit')
assert.equal(budgetElements['budget-group'].textContent, '13.932')
assert.match(budgetElements['budget-feedback'].textContent, /组预算超出/)
assert.match(budgetElements['budget-feedback'].textContent, /重新核对/)
console.log('PASS GPIO LED calculator controller: actual inputs and submit, concealed initial answer, independent readouts, pending retention and reasoned five-channel failure.')

for (const [key, value] of Object.entries({ ...budgetDefaults, channels: 8 })) budgetElements['budget-' + key].value = String(value)
budgetElements['budget-channels'].dispatch('change'); budgetElements['budget-prediction'].value = 'over'; budgetElements['budget-prediction'].dispatch('change'); budgetElements['budget-form'].dispatch('submit')
assert.match(budgetElements['budget-feedback'].textContent, /组预算超出；总预算超出/)
const priorTotal = budgetElements['budget-total'].textContent
budgetElements['budget-rOhm'].value = ''; budgetElements['budget-rOhm'].dispatch('input'); budgetElements['budget-prediction'].value = 'over'; budgetElements['budget-prediction'].dispatch('change'); budgetElements['budget-form'].dispatch('submit')
assert.equal(budgetElements['budget-total'].textContent, priorTotal)
assert.match(budgetElements['budget-pending'].textContent, /输入无效/)
budgetElements['reset-budget'].dispatch('click')
assert.equal(budgetElements['budget-results'].hidden, true)
assert.equal(budgetElements['budget-imax'].textContent, '')
assert.equal(budgetElements['budget-rOhm'].value, '680')
assert.equal(budgetElements['budget-channels'].value, '4')
for (const [key, value] of Object.entries({ ...budgetDefaults, vMin: 1, vMax: 1.8 })) budgetElements['budget-' + key].value = String(value)
budgetElements['budget-vMin'].dispatch('input'); budgetElements['budget-prediction'].value = 'headroom'; budgetElements['budget-prediction'].dispatch('change'); budgetElements['budget-form'].dispatch('submit')
assert.equal(budgetElements['budget-imax'].textContent, '0.000')
assert.match(budgetElements['budget-feedback'].textContent, /无正向压差余量/)
assert.match(budgetElements['budget-feedback'].textContent, /导通不获保证/)
const beforeOverflow = budgetElements['budget-total'].textContent
for (const [key, value] of Object.entries({ ...budgetDefaults, vMax: 1e153, rOhm: 1 })) budgetElements['budget-' + key].value = String(value)
budgetElements['budget-vMax'].dispatch('input'); budgetElements['budget-prediction'].value = 'over'; budgetElements['budget-prediction'].dispatch('change'); budgetElements['budget-form'].dispatch('submit')
assert.equal(budgetElements['budget-total'].textContent, beforeOverflow)
assert.match(budgetElements['budget-pending'].textContent, /输入无效/)
for (const [key, value] of Object.entries({ ...budgetDefaults, vMin: 1, vMax: 1.8, other: 40 })) budgetElements['budget-' + key].value = String(value)
budgetElements['budget-other'].dispatch('input'); budgetElements['budget-prediction'].value = 'headroom'; budgetElements['budget-prediction'].dispatch('change'); budgetElements['budget-form'].dispatch('submit')
assert.equal(budgetElements['budget-total'].textContent, '40.000')
assert.match(budgetElements['budget-feedback'].textContent, /无正向压差余量/)
assert.match(budgetElements['budget-feedback'].textContent, /总预算超出/)
console.log('PASS GPIO LED calculator controller: real change/input invalid retention, eight-channel multiple failures, reproducible empty reset and no-headroom feedback.')

assert.ok(budgetElements['diagnosis-form'], 'Actual diagnostic form')
budgetElements['diagnosis-case'].value = 'missing'
const optionNodes = {}
for (const id of ['diagnosis-option-a', 'diagnosis-option-b', 'diagnosis-option-c']) optionNodes[id] = budgetElements[id]
vm.runInNewContext(getScript('led-diagnosis-controller'), budgetContext, { timeout: 1000 })
assert.equal(budgetElements['diagnose-submit'].disabled, true)
const diagnosticFixtures = [['missing', 'a', /限流/], ['reverse', 'b', /极性/], ['release', 'c', /负载/], ['contention', 'a', /冲突/], ['budget', 'b', /同时/], ['gate', 'c', /VGS|驱动/]]
for (const [caseId, correct, reason] of diagnosticFixtures) {
  budgetElements['diagnosis-case'].value = caseId; budgetElements['diagnosis-case'].dispatch('change')
  assert.equal(budgetElements['diagnosis-prediction'].value, '')
  assert.equal(budgetElements['diagnose-submit'].disabled, true)
  assert.deepEqual(Object.values(optionNodes).map(node => node.textContent.length), [6, 6, 6])
  budgetElements['diagnosis-prediction'].value = correct; budgetElements['diagnosis-prediction'].dispatch('change'); budgetElements['diagnosis-form'].dispatch('submit')
  assert.match(budgetElements['diagnosis-feedback'].textContent, /选择正确/)
  assert.match(budgetElements['diagnosis-feedback'].textContent, reason)
  assert.equal(budgetElements['diagnose-submit'].disabled, true)
}
budgetElements['diagnosis-case'].value = 'gate'; budgetElements['diagnosis-case'].dispatch('change'); budgetElements['diagnosis-prediction'].value = 'a'; budgetElements['diagnosis-prediction'].dispatch('change'); budgetElements['diagnosis-form'].dispatch('submit')
assert.match(budgetElements['diagnosis-feedback'].textContent, /重新检查/)
assert.match(budgetElements['diagnosis-feedback'].textContent, /RDS/)
budgetElements['diagnose-reset'].dispatch('click'); assert.equal(budgetElements['diagnosis-case'].value, 'missing'); assert.equal(budgetElements['diagnose-submit'].disabled, true)
console.log('PASS GPIO LED diagnosis controller: six actual scenario/change/predict/submit handlers, equal choices, varied positions, wrong-answer reason and reset.')

const exercises = [...html.matchAll(/<article class="exercise" id="exercise-(\d\d)">([\s\S]*?)<\/article>/g)]
assert.equal(exercises.length, 10, 'Ten independent question-and-reason exercises')
for (const [index, match] of exercises.entries()) {
  assert.equal(match[1], String(index + 1).padStart(2, '0'))
  assert.match(match[2], new RegExp('<details class="exercise-answer" id="answer-' + match[1] + '"><summary>'))
  assert.ok(!/<details[^>]*\bopen\b/.test(match[2]), 'Recall answers start folded')
}
const classes = new Set(), printEvents = {}, printCalls = []
budgetContext.document.body = { classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) } }
budgetContext.window = { addEventListener: (event, handler) => { printEvents[event] = handler }, print: () => { printCalls.push(classes.has('exercise-print')) } }
vm.runInNewContext(getScript('led-worksheet'), budgetContext, { timeout: 1000 })
budgetElements['print-questions'].dispatch('click')
assert.deepEqual(printCalls, [true]); assert.equal(classes.has('exercise-print'), true)
printEvents.afterprint(); assert.equal(classes.has('exercise-print'), false)
budgetContext.window.print = () => { throw new Error('Printer unavailable') }
budgetElements['print-questions'].dispatch('click'); assert.equal(classes.has('exercise-print'), false, 'Failed print cleans mode too')
assert.match(html, /body\.exercise-print \.exercise-answer\{display:none!important\}/)
assert.match(exercises[9][2], /NONE@0.*PRESSED@11.*NONE@12.*RELEASED@31.*PRESSED@41/)
console.log('PASS GPIO LED worksheet: ten native folded reasoned exercises, complete event inputs, actual print dispatch, restoration and print failure cleanup.')
