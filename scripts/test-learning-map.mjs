import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import vm from 'node:vm'

const html = await readFile(new URL('../docs/public/demos/learning-map.html', import.meta.url), 'utf8')
const markdown = await readFile(new URL('../docs/learn/engineering-map.md', import.meta.url), 'utf8')
const controller = html.match(/<script id="learning-map-controller">([\s\S]*?)<\/script>/)?.[1]
assert.ok(controller, 'The map must test its actual user-facing controller')

class Element {
  constructor() { this.dataset = {}; this.attributes = {}; this.listeners = {}; this.disabled = false; this.innerHTML = ''; this.textContent = ''; this.href = '' }
  setAttribute(key, value) { this.attributes[key] = String(value) }
  addEventListener(event, handler) { this.listeners[event] = handler }
  click() { if (!this.disabled) this.listeners.click?.() }
}
const buttons = [...html.matchAll(/<button type="button" class="stage-button" data-stage="(\d+)"/g)].map(([, id]) => {
  const button = new Element(); button.dataset.stage = id; return button
})
const stages = [...html.matchAll(/<article class="roadmap-stage" id="([^"]+)" data-title="([^"]+)">([\s\S]*?)<\/article>/g)].map(([, id, title, body]) => {
  const fields = {}
  for (const field of ['prereq', 'knowledge', 'project', 'accept', 'notes']) {
    const text = body.match(new RegExp('<(?:dd|div) class="stage-' + field + '">([\\s\\S]*?)<\\/(?:dd|div)>'))?.[1]
    assert.ok(text, 'Full static field missing for ' + id + ': ' + field)
    fields['.stage-' + field] = { innerHTML: text }
  }
  return { id, dataset: { title }, querySelector: selector => fields[selector] }
})
const elements = Object.fromEntries(['previous-stage', 'next-stage', 'focus-title', 'focus-link'].map(id => [id, new Element()]))
const focus = Object.fromEntries(['prereq', 'knowledge', 'project', 'accept', 'notes'].map(field => ['.focus-' + field, new Element()]))
const document = {
  querySelectorAll(selector) { assert.equal(selector, '.stage-button'); return buttons },
  getElementById(id) { const element = elements[id] || stages.find(stage => stage.id === id); assert.ok(element, 'Unknown map control: ' + id); return element },
  querySelector(selector) { assert.ok(focus[selector], 'Unknown focus field: ' + selector); return focus[selector] }
}
vm.runInNewContext(controller, { document }, { timeout: 1000 })
assert.equal(buttons.length, 8)
assert.equal(stages.length, 8, 'All eight full stage bodies must exist before JavaScript runs')
const titles = ['电路与 C', '启动与内存', '外设与协议', '中断与 DMA', '任务与并发', '调试与测试', '启动与升级', '架构与可靠性']
for (let i = 0; i < 8; i++) {
  buttons[i].click()
  assert.ok(elements['focus-title'].textContent.includes(titles[i]), 'Stage selection must show the chosen topic')
  assert.equal(elements['focus-link'].href, '#stage-0' + (i + 1))
  assert.equal(elements['previous-stage'].disabled, i === 0)
  assert.equal(elements['next-stage'].disabled, i === 7)
  assert.deepEqual(buttons.map(button => button.attributes['aria-pressed']), titles.map((_, index) => String(index === i)))
  for (const field of ['prereq', 'knowledge', 'project', 'accept', 'notes']) assert.equal(focus['.focus-' + field].innerHTML, stages[i].querySelector('.stage-' + field).innerHTML)
}
buttons[0].click()
for (let i = 1; i < 8; i++) { elements['next-stage'].click(); assert.ok(elements['focus-title'].textContent.includes(titles[i])) }
elements['next-stage'].click()
assert.match(elements['focus-title'].textContent, /^08/)
for (let i = 6; i >= 0; i--) { elements['previous-stage'].click(); assert.ok(elements['focus-title'].textContent.includes(titles[i])) }
elements['previous-stage'].click()
assert.match(elements['focus-title'].textContent, /^01/)
buttons[3].click()
assert.match(focus['.focus-accept'].innerHTML, /不能把 volatile 当作并发同步/)
buttons[6].click()
assert.match(focus['.focus-accept'].innerHTML, /禁止的旧版不能绕过版本策略.*CRC 不替代签名/)
assert.match(focus['.focus-notes'].innerHTML, /\.\.\/mcu\/mcu-ota\.html/)
buttons[0].click()
assert.match(focus['.focus-notes'].innerHTML, /href="gpio-led\.html"/, 'Stage01 must lead from input into the real LED output chapter')
assert.match(focus['.focus-notes'].innerHTML, /href="gpio-led-reference\.html"/, 'Stage01 must include the real printable LED reference')
for (const name of ['c-bits-registers', 'c-objects-bounds', 'bounded-fifo']) {
  for (const suffix of ['', '-reference']) {
    assert.ok(focus['.focus-notes'].innerHTML.includes('href="' + name + suffix + '.html"'), 'Stage01 must reach each actual C foundation reader: ' + name + suffix)
  }
}
buttons[1].click()
for (const name of ['build-link-identity', 'reset-runtime', 'memory-budget', 'clock-timebase']) {
  for (const suffix of ['', '-reference']) assert.ok(focus['.focus-notes'].innerHTML.includes('href="' + name + suffix + '.html"'), 'Stage02 must reach each actual build/startup reader: ' + name + suffix)
}
for (const source of [html, markdown]) {
  for (const phrase of ['03—05', '06—09', '第 10 单元']) assert.ok(source.includes(phrase), 'Course order must retain the next C prerequisites before timers: ' + phrase)
}
console.log('PASS learning map: actual eight-stage selection, next/previous controls, boundaries, ARIA selection and complete field rendering.')

const notePaths = ['c-memory/heap-stack.html', 'mcu/crystal-pll-clock.html', 'mcu/cortex-m-cpu-registers.html', 'mcu/hardfault-stack-trace.html', 'debug/easylogger.html', 'tools/beads.html', 'tools/plane.html', 'tools/matt-pocock-skills.html', 'mcu/mcu-ota.html']
for (const path of notePaths) {
  assert.ok(html.includes('href="../' + path + '"'), 'Real note link missing: ' + path)
  assert.ok(markdown.includes('../' + path), 'Search input link missing: ' + path)
  await access(new URL('../docs/' + path.replace(/\.html$/, '.md'), import.meta.url))
}
for (const stage of stages) {
  const prereq = stage.querySelector('.stage-prereq').innerHTML
  assert.ok(!/Beads|Plane|Matt/.test(prereq), 'Engineering tools must not become peripheral prerequisites')
}
for (const phrase of ['已核对目录', '仅入口', '待核对正文', '计划课程', 'F407', 'F103', '已核对 README 与目录', '未逐例编译', '正文抽样', '其余正文待核对', '不能冒充 F407', 'SPL、HAL、LL', '不能保证岗位或收入', '硬件已验证，是四件不同的事', '不代表本页已经完成相应硬件实验']) {
  assert.ok(html.includes(phrase), 'Evidence boundary missing in HTML: ' + phrase)
  assert.ok(markdown.includes(phrase), 'Evidence boundary missing in searchable input: ' + phrase)
}
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id)
assert.equal(new Set(ids).size, ids.length)
for (const heading of markdown.match(/^#{1,6} .+$/gm) || []) {
  const id = heading.match(/\{#([^}]+)\}/)?.[1]
  assert.ok(id && ids.includes(id), 'Every search heading must land on its exact standalone anchor: ' + heading)
}
const ota = await readFile(new URL('../docs/public/demos/mcu-ota.html', import.meta.url), 'utf8')
assert.equal(html.match(/\/\* Shared reading layer:[\s\S]*?<\/style>/)?.[0], ota.match(/\/\* Shared reading layer:[\s\S]*?<\/style>/)?.[0])
for (const id of ['note-deep-links', 'note-print']) assert.equal(html.match(new RegExp('<script id="' + id + '">[\\s\\S]*?<\\/script>'))?.[0], ota.match(new RegExp('<script id="' + id + '">[\\s\\S]*?<\\/script>'))?.[0])
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(([, source]) => source).join('\n')
assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/.test(scripts))
assert.ok(!/<(?:script|iframe)[^>]+src=/i.test(html))
assert.ok(!/\bhidden\b/.test(html.replace(/aria-hidden/g, '')), 'Full prose remains readable without script execution')
console.log('PASS learning map: all nine real note links, evidence scope and board differences, static full prose, exact search anchors, shared reader/print handlers and self-contained execution.')

const coverage = await readFile(new URL('../curriculum/coverage.md', import.meta.url), 'utf8')
const unitRows = coverage.match(/^\| \d{2} \|.+$/gm) || []
assert.deepEqual(unitRows.map(row => row.split('|')[1].trim()), Array.from({ length: 32 }, (_, index) => String(index + 1).padStart(2, '0')), 'The finite course ledger must retain all thirty-two ordered units')
assert.equal((coverage.match(/^### 阶段 \d{2} /gm) || []).length, 8, 'All eight stage evidence scopes must remain')
assert.match(unitRows[1], /\| 完整 \| 已通过 \| 本单元无新工作 \| 未验 \| 已发布 \|$/, 'Unit02 publication must retain its no-new-C and hardware limits')
for (const row of unitRows.slice(2, 5)) assert.match(row, /\| 完整 \| 已通过 \| 已有 C 证据 \| 未验 \| 已发布 \|$/, 'Units03–05 publication uses parent-confirmed78723d5 evidence and retains hardware limits')
for (const row of unitRows.slice(5, 9)) assert.match(row, /\| 完整 \| 已通过 \| 已有 C 证据 \| 未验 \| 已发布 \|$/, 'Units06–09 publication uses parent-confirmed4ac57c4/CI39068664322 evidence and retains hardware limits')
for (const row of unitRows.slice(9, 11)) assert.match(row, /\| 完整 \| 已通过 \| 已有 C 证据 \| 未验 \| 已发布 \|$/, 'Units10–11 publication uses parent-confirmed f215/CI39073047054 while hardware remains unverified')
for (const row of unitRows.slice(11,14)) assert.match(row, /\| 本地完整 \| 已通过 \| 已有 C 证据 \| 未验 \| 本地候选 \|$/, 'Units12–14 retain distinct local content/model/C evidence and hardware/publication limits')
for (const row of unitRows.slice(14)) assert.match(row, /\| 待写 \| 未做 \| 未做 \| 未验 \| 未发布 \|$/, 'Units15–32 remain pending; research and existing topic notes do not earn course credit')
await access(new URL('../curriculum/stage01-evidence.md', import.meta.url))
await access(new URL('../curriculum/stage02-evidence.md', import.meta.url))
assert.ok(coverage.includes('10—14') && coverage.includes('39058801087') && coverage.includes('78723d525775feb83b91071b3f634a9c65863a1a'))
assert.ok(coverage.includes('4ac57c4f5021cf9bb13344792c3c7961f54981fb') && coverage.includes('39068664322'))
await access(new URL('../curriculum/stage03-evidence.md', import.meta.url))
buttons[2].click()
for (const name of ['timer-pwm', 'uart-framing', 'bus-transactions', 'adc-sampling', 'driver-recovery']) {
  for (const suffix of ['', '-reference']) {
    assert.ok(focus['.focus-notes'].innerHTML.includes('href="' + name + suffix + '.html"'), 'Stage03 must reach each actual time/serial reader: ' + name + suffix)
    assert.ok(markdown.includes(name + suffix + '.html'), 'Search mirror must include each actual time/serial reader: ' + name + suffix)
  }
}
assert.match(focus['.focus-notes'].innerHTML, /12[—–]14.*本地候选/, 'The remaining stage03 protocol/ADC/fault units remain pending')
console.log('PASS course ledger:32 ordered units,8 stages,01–11 published with bounded proof,12–14 local candidates,15–32 and all hardware pending.')
