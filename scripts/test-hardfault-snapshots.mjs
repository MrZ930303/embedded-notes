import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const html = await readFile(new URL('../docs/public/demos/hardfault-stack-trace.html', import.meta.url), 'utf8')
const markdown = await readFile(new URL('../docs/mcu/hardfault-stack-trace.md', import.meta.url), 'utf8')
assert.ok(!html.includes('\uFFFD') && !markdown.includes('\uFFFD'), 'article source must remain valid UTF-8 text')
assert.ok(!html.includes('\\n.snapshot-options'), 'snapshot styles must not contain an escaped newline token')
const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
assert.equal(htmlIds.length, new Set(htmlIds).size, 'interactive article ids must be unique')

const exactFixtureFacts = [
  'EXC_RETURN FFFFFFF9', 'MSP 20001000', 'PSP 20004000', 'HFSR 40000000', 'CFSR 00008200', 'BFAR 60000004',
  'R0 60000000', 'R1/R2/R3/R12 0', 'stacked LR 08002019', 'stacked PC 08001234', 'xPSR 01000000',
  'LDR r1,[r0,#4]', '60000004 has no response',
  'EXC_RETURN FFFFFFED', 'MSP 20007000', 'PSP 20002000', 'CFSR 02000000', 'CCR 00000210', 'FPCCR C0000019', 'FPCAR 20002020',
  'R0 3C', 'R1/R2/R3/R12 0', 'stacked LR 08004101', 'stacked PC 08003420', 'xPSR 01000200',
  'UDIV r2,r0,r1', 'DIV_0_TRP on', 'R1 0', '20002018', 'pre-exception PSP 2000206C',
  'MSP 20003000', 'CFSR 00000400', 'BFAR 60000004', 'BFARVALID 0', 'stacked PC 08005020', 'NOP',
  'multiple writes', '08001001', '08002005',
  'EXC_RETURN FFFFFFFD', 'MSP 20007F00', 'PSP 1FFFFFE0', 'CFSR 00001000',
  'RAM starts 20000000', 'task stack 20000000..20000800', 'PSP timing unspecified', 'CCR unspecified', 'stacked PC unknown'
]

for (const [index, fact] of exactFixtureFacts.entries()) {
  assert.ok(html.includes(fact), `interactive article must preserve fixture fact ${index + 1}: ${fact}`)
  assert.ok(markdown.includes(fact), `searchable article must preserve fixture fact ${index + 1}: ${fact}`)
}

const architectureFacts = [
  '0xE000ED28', '0xE000ED2C', '0xE000ED34', '0xE000ED38',
  'HFSR.VECTTBL', '0x00000002', 'HFSR.FORCED', '0x40000000', 'CFSR.MMARVALID', '0x00000080',
  'BFSR.PRECISERR', '0x00000200', 'BFSR.IMPRECISERR', '0x00000400', 'BFSR.STKERR', '0x00001000',
  'BFSR.BFARVALID', '0x00008000', 'MMFSR.MSTKERR', '0x00000010', 'UFSR.DIVBYZERO', '0x02000000',
  'FPCCR.LSPACT', 'bit 0', 'W1C', '先保存原始',
  'Fault Reports', 'debug driver', 'fromelf --text -c -s --output=firmware.dis.txt firmware.axf',
  'Arm Compiler 6', 'PC-2', 'PC-4', 'stack-scan', '虚构', 'unknown'
]
for (const fact of architectureFacts) {
  assert.ok(html.includes(fact), `interactive article must explain ${fact}`)
  assert.ok(markdown.includes(fact), `searchable article must include ${fact}`)
}

for (const id of ['case-a', 'case-b', 'case-c', 'case-d']) {
  assert.ok(html.includes(`id="${id}"`), `interactive article must have a selectable ${id} panel`)
  assert.ok(markdown.includes(`{#${id}}`), `searchable article must expose the ${id} anchor`)
}

const controllerMatch = html.match(/<script id="hardfault-snapshot-controller">([\s\S]*?)<\/script>/)
assert.ok(controllerMatch, 'interactive article must provide a local snapshot selector controller')
assert.doesNotMatch(controllerMatch[1], /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/, 'snapshot selection must stay local')

const radios = ['A', 'B', 'C', 'D'].map((value, index) => ({
  value,
  checked: index === 0,
  dataset: { status: `status-${value}` },
  listeners: {},
  addEventListener(event, callback) { this.listeners[event] = callback },
  dispatch(event) { this.listeners[event]?.({ target: this }) },
  dispatchEvent(event) {
    assert.equal(event.type, 'change')
    if (this.checked) radios.forEach(radio => { if (radio !== this) radio.checked = false })
    this.dispatch(event.type)
    return true
  }
}))
const panels = ['A', 'B', 'C', 'D'].map((value, index) => ({
  dataset: { hardfaultPanel: value },
  hidden: index !== 0
}))
const status = { textContent: '' }
const caseTargets = Object.fromEntries(['a', 'b', 'c', 'd'].map(letter => [`case-${letter}`, {
  scrolls: [],
  closest(selector) { assert.equal(selector, 'details'); return null },
  scrollIntoView(options) { this.scrolls.push(options) }
}]))
const detailSection = { open: false }
const otherAnchor = {
  scrolls: [],
  closest(selector) { assert.equal(selector, 'details'); return detailSection },
  scrollIntoView(options) { this.scrolls.push(options) }
}
const document = {
  querySelectorAll(selector) {
    if (selector === 'input[name="hardfault-snapshot"]') return radios
    if (selector === '[data-hardfault-panel]') return panels
    throw new Error(`unexpected selector: ${selector}`)
  },
  getElementById(id) {
    if (id === 'hardfault-snapshot-status') return status
    const radioMatch = /^snapshot-([a-d])$/.exec(id)
    if (radioMatch) return radios.find(radio => radio.value.toLowerCase() === radioMatch[1])
    if (caseTargets[id]) return caseTargets[id]
    if (id === 'sources') return otherAnchor
    return null
  }
}
vm.runInNewContext(controllerMatch[1], { document })

for (let selected = 0; selected < radios.length; selected += 1) {
  radios.forEach((radio, index) => { radio.checked = index === selected })
  radios[selected].dispatch('change')
  assert.deepEqual(panels.map(panel => panel.hidden), radios.map((_, index) => index !== selected), `choice ${radios[selected].value} shows only its own snapshot`)
  assert.equal(status.textContent, `status-${radios[selected].value}`, `choice ${radios[selected].value} announces its interpretation`)
}

const deepLinkMatch = html.match(/<script id="note-deep-links">([\s\S]*?)<\/script>/)
assert.ok(deepLinkMatch, 'interactive article must synchronize its snapshot selector with note anchors')
const hashListeners = {}
const hashWindow = {
  location: { hash: '#case-b' },
  addEventListener(event, callback) { hashListeners[event] = callback }
}
class TestEvent {
  constructor(type, options = {}) { this.type = type; this.bubbles = Boolean(options.bubbles) }
}
vm.runInNewContext(deepLinkMatch[1], {
  window: hashWindow,
  document,
  Event: TestEvent,
  requestAnimationFrame(callback) { callback() }
})

function assertDeepLinkedCase(letter) {
  const selected = letter.toUpperCase()
  assert.equal(radios.find(radio => radio.value === selected).checked, true, `#case-${letter} checks snapshot ${selected}`)
  assert.deepEqual(panels.map(panel => panel.hidden), radios.map(radio => radio.value !== selected), `#case-${letter} reveals only snapshot ${selected}`)
  assert.equal(status.textContent, `status-${selected}`, `#case-${letter} updates the live status to ${selected}`)
  assert.equal(caseTargets[`case-${letter}`].scrolls.at(-1).block, 'start', `#case-${letter} scrolls its now-visible heading into view`)
  assert.equal(caseTargets[`case-${letter}`].scrolls.at(-1).behavior, 'instant', `#case-${letter} scrolls directly to the newly revealed heading`)
}

assertDeepLinkedCase('b') // direct load with #case-b
for (const letter of ['c', 'd', 'a', 'b']) {
  hashWindow.location.hash = `#case-${letter}`
  hashListeners.hashchange()
  assertDeepLinkedCase(letter)
}
hashWindow.location.hash = '#sources'
hashListeners.hashchange()
assert.equal(detailSection.open, true, 'non-case anchors still open their containing details section')
assert.equal(otherAnchor.scrolls.at(-1).block, 'start', 'non-case anchors retain deep-link scrolling')
assert.equal(otherAnchor.scrolls.at(-1).behavior, undefined, 'non-case anchors retain the existing smooth-scroll behavior')
assertDeepLinkedCase('b')
hashWindow.location.hash = '#case-d'
hashListeners.pageshow()
assertDeepLinkedCase('d')

const frameSelectorMatch = html.match(/<script>\s*'use strict';([\s\S]*?)<\/script>/)
assert.ok(frameSelectorMatch, 'interactive article must expose its real EXC_RETURN frame selector behavior')
const chooser = {
  value: 'FFFFFFF9',
  listeners: {},
  addEventListener(event, callback) { this.listeners[event] = callback },
  dispatch(event) { this.listeners[event]?.({ target: this }) }
}
const pad = {
  checked: false,
  listeners: {},
  addEventListener(event, callback) { this.listeners[event] = callback },
  dispatch(event) { this.listeners[event]?.({ target: this }) }
}
const makeFrameRow = (offset, isFp = false) => {
  const location = { textContent: '' }
  return {
    dataset: { offset, fp: String(isFp) },
    hidden: false,
    location,
    querySelector(selector) {
      assert.equal(selector, '[data-address]')
      return location
    }
  }
}
const pcRow = makeFrameRow('+0x18')
const fpscrRow = makeFrameRow('+0x60', true)
const frameRows = [pcRow, fpscrRow]
const frameElements = Object.fromEntries([
  'exc-return', 'stack-align-pad', 'return-mode', 'entry-stack', 'frame-kind', 'restored-sp', 'frame-base', 'model-status'
].map(id => [id, { textContent: '' }]))
frameElements['exc-return'] = chooser
frameElements['stack-align-pad'] = pad
frameElements['frame-base'].replaceChildren = function (...children) { this.children = children }
const frameDocument = {
  getElementById(id) {
    assert.ok(frameElements[id], `unexpected frame selector element ${id}`)
    return frameElements[id]
  },
  querySelectorAll(selector) {
    assert.equal(selector, '[data-frame-field]')
    return frameRows
  },
  createElement(tag) {
    assert.equal(tag, 'strong')
    return { textContent: '' }
  }
}
vm.runInNewContext(frameSelectorMatch[1], { document: frameDocument })
assert.equal(frameElements['frame-kind'].textContent, '基本帧 · 0x20 B', 'basic EXC_RETURN selects the 0x20-byte core frame')
assert.equal(frameElements['entry-stack'].textContent, 'MSP', 'basic Thread/MSP return selects the entry MSP')
assert.equal(pcRow.location.textContent, '异常入口 MSP +0x18', 'basic frame keeps stacked PC at the entry frame base +0x18')
assert.equal(fpscrRow.hidden, true, 'basic frame hides the optional FPSCR slot')
assert.equal(frameElements['restored-sp'].textContent, '帧基址 + 0x20', 'basic pre-entry SP restoration accounts for the core frame')

chooser.value = 'FFFFFFED'
chooser.dispatch('change')
assert.equal(frameElements['frame-kind'].textContent, '扩展 FP 帧 · 0x68 B', 'extended EXC_RETURN selects the 0x68-byte FP frame')
assert.equal(frameElements['entry-stack'].textContent, 'PSP', 'extended Thread/PSP return selects the entry PSP')
assert.equal(pcRow.location.textContent, '异常入口 PSP +0x18', 'extended frame leaves stacked PC at the entry frame base +0x18')
assert.equal(fpscrRow.hidden, false, 'extended frame shows the FPSCR slot')
assert.equal(fpscrRow.location.textContent, '异常入口 PSP +0x60', 'extended FPSCR remains at frame base +0x60')
assert.match(frameElements['model-status'].textContent, /核心 PC 仍在帧基址 \+0x18/)
assert.equal(frameElements['restored-sp'].textContent, '帧基址 + 0x68', 'extended pre-entry SP restoration accounts for all 0x68 bytes')

pad.checked = true
pad.dispatch('change')
assert.equal(frameElements['restored-sp'].textContent, '帧基址 + 0x68 + 0x04 对齐字', 'stacked xPSR alignment adds one word after the complete frame')
assert.ok(html.includes('异常前 SP 的恢复关系'), 'the selector labels its restoration result as the pre-entry SP relation')

console.log('HardFault snapshots: four fixed fixtures, evidence limits, SCB masks, snapshot selection, and frame-selector behavior passed.')
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const html = await readFile(new URL('../docs/public/demos/hardfault-stack-trace.html', import.meta.url), 'utf8')
const markdown = await readFile(new URL('../docs/mcu/hardfault-stack-trace.md', import.meta.url), 'utf8')
assert.ok(!html.includes('\uFFFD') && !markdown.includes('\uFFFD'), 'article source must remain valid UTF-8 text')
assert.ok(!html.includes('\\n.snapshot-options'), 'snapshot styles must not contain an escaped newline token')
const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
assert.equal(htmlIds.length, new Set(htmlIds).size, 'interactive article ids must be unique')

const exactFixtureFacts = [
  'EXC_RETURN FFFFFFF9', 'MSP 20001000', 'PSP 20004000', 'HFSR 40000000', 'CFSR 00008200', 'BFAR 60000004',
  'R0 60000000', 'R1/R2/R3/R12 0', 'stacked LR 08002019', 'stacked PC 08001234', 'xPSR 01000000',
  'LDR r1,[r0,#4]', '60000004 has no response',
  'EXC_RETURN FFFFFFED', 'MSP 20007000', 'PSP 20002000', 'CFSR 02000000', 'CCR 00000210', 'FPCCR C0000019', 'FPCAR 20002020',
  'R0 3C', 'R1/R2/R3/R12 0', 'stacked LR 08004101', 'stacked PC 08003420', 'xPSR 01000200',
  'UDIV r2,r0,r1', 'DIV_0_TRP on', 'R1 0', '20002018', 'pre-exception PSP 2000206C',
  'MSP 20003000', 'CFSR 00000400', 'BFAR 60000004', 'BFARVALID 0', 'stacked PC 08005020', 'NOP',
  'multiple writes', '08001001', '08002005',
  'EXC_RETURN FFFFFFFD', 'MSP 20007F00', 'PSP 1FFFFFE0', 'CFSR 00001000',
  'RAM starts 20000000', 'task stack 20000000..20000800', 'PSP timing unspecified', 'CCR unspecified', 'stacked PC unknown'
]

for (const [index, fact] of exactFixtureFacts.entries()) {
  assert.ok(html.includes(fact), `interactive article must preserve fixture fact ${index + 1}: ${fact}`)
  assert.ok(markdown.includes(fact), `searchable article must preserve fixture fact ${index + 1}: ${fact}`)
}

const architectureFacts = [
  '0xE000ED28', '0xE000ED2C', '0xE000ED34', '0xE000ED38',
  'HFSR.VECTTBL', '0x00000002', 'HFSR.FORCED', '0x40000000', 'CFSR.MMARVALID', '0x00000080',
  'BFSR.PRECISERR', '0x00000200', 'BFSR.IMPRECISERR', '0x00000400', 'BFSR.STKERR', '0x00001000',
  'BFSR.BFARVALID', '0x00008000', 'MMFSR.MSTKERR', '0x00000010', 'UFSR.DIVBYZERO', '0x02000000',
  'FPCCR.LSPACT', 'bit 0', 'W1C', '先保存原始',
  'Fault Reports', 'debug driver', 'fromelf --text -c -s --output=firmware.dis.txt firmware.axf',
  'Arm Compiler 6', 'PC-2', 'PC-4', 'stack-scan', '虚构', 'unknown'
]
for (const fact of architectureFacts) {
  assert.ok(html.includes(fact), `interactive article must explain ${fact}`)
  assert.ok(markdown.includes(fact), `searchable article must include ${fact}`)
}

for (const id of ['case-a', 'case-b', 'case-c', 'case-d']) {
  assert.ok(html.includes(`id="${id}"`), `interactive article must have a selectable ${id} panel`)
  assert.ok(markdown.includes(`{#${id}}`), `searchable article must expose the ${id} anchor`)
}

const controllerMatch = html.match(/<script id="hardfault-snapshot-controller">([\s\S]*?)<\/script>/)
assert.ok(controllerMatch, 'interactive article must provide a local snapshot selector controller')
assert.doesNotMatch(controllerMatch[1], /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/, 'snapshot selection must stay local')

const radios = ['A', 'B', 'C', 'D'].map((value, index) => ({
  value,
  checked: index === 0,
  dataset: { status: `status-${value}` },
  listeners: {},
  addEventListener(event, callback) { this.listeners[event] = callback },
  dispatch(event) { this.listeners[event]?.({ target: this }) }
}))
const panels = ['A', 'B', 'C', 'D'].map((value, index) => ({
  dataset: { hardfaultPanel: value },
  hidden: index !== 0
}))
const status = { textContent: '' }
const document = {
  querySelectorAll(selector) {
    if (selector === 'input[name="hardfault-snapshot"]') return radios
    if (selector === '[data-hardfault-panel]') return panels
    throw new Error(`unexpected selector: ${selector}`)
  },
  getElementById(id) {
    if (id === 'hardfault-snapshot-status') return status
    throw new Error(`unexpected element id: ${id}`)
  }
}
vm.runInNewContext(controllerMatch[1], { document })

for (let selected = 0; selected < radios.length; selected += 1) {
  radios.forEach((radio, index) => { radio.checked = index === selected })
  radios[selected].dispatch('change')
  assert.deepEqual(panels.map(panel => panel.hidden), radios.map((_, index) => index !== selected), `choice ${radios[selected].value} shows only its own snapshot`)
  assert.equal(status.textContent, `status-${radios[selected].value}`, `choice ${radios[selected].value} announces its interpretation`)
}

const frameSelectorMatch = html.match(/<script>\s*'use strict';([\s\S]*?)<\/script>/)
assert.ok(frameSelectorMatch, 'interactive article must expose its real EXC_RETURN frame selector behavior')
const chooser = {
  value: 'FFFFFFF9',
  listeners: {},
  addEventListener(event, callback) { this.listeners[event] = callback },
  dispatch(event) { this.listeners[event]?.({ target: this }) }
}
const pad = {
  checked: false,
  listeners: {},
  addEventListener(event, callback) { this.listeners[event] = callback },
  dispatch(event) { this.listeners[event]?.({ target: this }) }
}
const makeFrameRow = (offset, isFp = false) => {
  const location = { textContent: '' }
  return {
    dataset: { offset, fp: String(isFp) },
    hidden: false,
    location,
    querySelector(selector) {
      assert.equal(selector, '[data-address]')
      return location
    }
  }
}
const pcRow = makeFrameRow('+0x18')
const fpscrRow = makeFrameRow('+0x60', true)
const frameRows = [pcRow, fpscrRow]
const frameElements = Object.fromEntries([
  'exc-return', 'stack-align-pad', 'return-mode', 'entry-stack', 'frame-kind', 'restored-sp', 'frame-base', 'model-status'
].map(id => [id, { textContent: '' }]))
frameElements['exc-return'] = chooser
frameElements['stack-align-pad'] = pad
frameElements['frame-base'].replaceChildren = function (...children) { this.children = children }
const frameDocument = {
  getElementById(id) {
    assert.ok(frameElements[id], `unexpected frame selector element ${id}`)
    return frameElements[id]
  },
  querySelectorAll(selector) {
    assert.equal(selector, '[data-frame-field]')
    return frameRows
  },
  createElement(tag) {
    assert.equal(tag, 'strong')
    return { textContent: '' }
  }
}
vm.runInNewContext(frameSelectorMatch[1], { document: frameDocument })
assert.equal(frameElements['frame-kind'].textContent, '基本帧 · 0x20 B', 'basic EXC_RETURN selects the 0x20-byte core frame')
assert.equal(frameElements['entry-stack'].textContent, 'MSP', 'basic Thread/MSP return selects the entry MSP')
assert.equal(pcRow.location.textContent, '异常入口 MSP +0x18', 'basic frame keeps stacked PC at the entry frame base +0x18')
assert.equal(fpscrRow.hidden, true, 'basic frame hides the optional FPSCR slot')
assert.equal(frameElements['restored-sp'].textContent, '帧基址 + 0x20', 'basic pre-entry SP restoration accounts for the core frame')

chooser.value = 'FFFFFFED'
chooser.dispatch('change')
assert.equal(frameElements['frame-kind'].textContent, '扩展 FP 帧 · 0x68 B', 'extended EXC_RETURN selects the 0x68-byte FP frame')
assert.equal(frameElements['entry-stack'].textContent, 'PSP', 'extended Thread/PSP return selects the entry PSP')
assert.equal(pcRow.location.textContent, '异常入口 PSP +0x18', 'extended frame leaves stacked PC at the entry frame base +0x18')
assert.equal(fpscrRow.hidden, false, 'extended frame shows the FPSCR slot')
assert.equal(fpscrRow.location.textContent, '异常入口 PSP +0x60', 'extended FPSCR remains at frame base +0x60')
assert.match(frameElements['model-status'].textContent, /核心 PC 仍在帧基址 \+0x18/)
assert.equal(frameElements['restored-sp'].textContent, '帧基址 + 0x68', 'extended pre-entry SP restoration accounts for all 0x68 bytes')

pad.checked = true
pad.dispatch('change')
assert.equal(frameElements['restored-sp'].textContent, '帧基址 + 0x68 + 0x04 对齐字', 'stacked xPSR alignment adds one word after the complete frame')
assert.ok(html.includes('异常前 SP 的恢复关系'), 'the selector labels its restoration result as the pre-entry SP relation')

console.log('HardFault snapshots: four fixed fixtures, evidence limits, SCB masks, snapshot selection, and frame-selector behavior passed.')
