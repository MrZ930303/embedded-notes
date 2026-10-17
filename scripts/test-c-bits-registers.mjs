import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createHash } from 'node:crypto'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const html = read('docs/public/demos/c-bits-registers.html')
const script = id => {
  const match = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'))
  assert.ok(match, 'Actual page script: ' + id)
  return match[1]
}
const context = {}
vm.runInNewContext(script('bits-model') + ';globalThis.model=BitsModel', context)
const model = context.model
assert.equal(model.apply({ width: 8, value: 165, mask: 12, op: 'set' }), 173, 'A5 set 0C preserves unrelated bits')
console.log('PASS literal mask set fixture')
for (const [op, expected] of [['clear', 161], ['toggle', 169], ['invert', 90], ['extract', 2], ['shift', 74]]) {
  assert.equal(model.apply({ width: 8, value: 165, mask: 12, op, offset: 4, length: 3, count: 1 }), expected, op)
}
assert.equal(model.apply({ width: 8, value: 1, mask: 128, op: 'set' }), 129)
assert.equal(model.apply({ width: 8, value: 1, op: 'shift', count: 7 }), 128)
assert.equal(model.apply({ width: 1, value: 1, op: 'invert' }), 0)
for (const bad of [{ width: 0 }, { width: 9 }, { width: 1.5 }, { value: -1 }, { value: 256 }, { value: 1.5 }, { mask: -1 }, { mask: 256 }, { op: 'unknown' }, { op: 'shift', count: -1 }, { op: 'shift', count: 8 }, { op: 'shift', count: 0.5 }, { op: 'extract', offset: 8 }, { op: 'extract', length: 0 }, { op: 'extract', length: 9 }]) {
  assert.throws(() => model.apply({ width: 8, value: 165, mask: 12, op: 'set', offset: 4, length: 3, count: 1, ...bad }), /Invalid/)
}
assert.equal(model.apply({ width: 8, value: 255, op: 'extract', offset: 0, length: 8 }), 255)
assert.equal(model.apply({ width: 8, value: 165, op: 'shift', count: 0 }), 165)
console.log('PASS mask/field/count boundaries')
for (const [mode, expected] of [['RW', 12], ['RO', 165], ['W1C', 161]]) {
  assert.equal(model.write(8, 165, 12, mode), expected)
}
assert.throws(() => model.write(8, 165, 12, 'WO'), /Invalid/)
assert.throws(() => model.write(8, 256, 12, 'RW'), /Invalid/)
assert.deepEqual(JSON.parse(JSON.stringify(model.timeline('rw'))).map(row => row.state), [0, 0, 2, 1])
assert.deepEqual(JSON.parse(JSON.stringify(model.timeline('w1c'))).map(row => row.state), [3, 3, 3, 0])
console.log('PASS access and two staged timelines')

class Element {
  constructor(value = '') { this.value = value; this.textContent = ''; this.disabled = false; this.listeners = {} }
  addEventListener(name, callback) { (this.listeners[name] ??= []).push(callback) }
  dispatch(name) { for (const callback of this.listeners[name] ?? []) callback({ preventDefault() {} }) }
}
const elements = {}
for (const id of ['mask-form', 'mask-width', 'mask-value', 'mask-mask', 'mask-op', 'mask-offset', 'mask-length', 'mask-count', 'mask-prediction', 'mask-apply', 'mask-reset', 'mask-pending', 'mask-result', 'mask-feedback', 'reg-form', 'reg-initial', 'reg-data', 'reg-mode', 'reg-prediction', 'reg-apply', 'reg-reset', 'reg-pending', 'reg-read', 'reg-written', 'reg-result', 'reg-feedback', 'rw-step', 'rw-reset', 'rw-state', 'rw-action', 'w1c-step', 'w1c-reset', 'w1c-state', 'w1c-action']) elements[id] = new Element()
for (const id of Object.keys(elements)) assert.ok(html.includes('id="' + id + '"'), 'Real DOM control ' + id)
elements['reg-operation'] = new Element()
assert.ok(html.includes('id="reg-operation"'), 'Last-applied operation has its own real output')
context.document = { getElementById(id) { assert.ok(elements[id], 'Unknown control ' + id); return elements[id] } }
vm.runInNewContext(script('bits-controller'), context)
assert.equal(elements['mask-result'].textContent, '尚未应用')
assert.equal(elements['mask-apply'].disabled, true)
elements['mask-prediction'].value = '173'; elements['mask-prediction'].dispatch('input')
elements['mask-form'].dispatch('submit')
assert.equal(elements['mask-result'].textContent, '0xAD / 10101101 / 173')
assert.match(elements['mask-feedback'].textContent, /预测正确/)
assert.equal(elements['mask-prediction'].value, '')
elements['mask-op'].value = 'clear'; elements['mask-op'].dispatch('change')
assert.match(elements['mask-pending'].textContent, /待应用/)
assert.equal(elements['mask-result'].textContent, '0xAD / 10101101 / 173')
assert.equal(elements['mask-apply'].disabled, true)
elements['mask-form'].dispatch('submit')
assert.equal(elements['mask-result'].textContent, '0xAD / 10101101 / 173')
elements['mask-prediction'].value = '173'; elements['mask-prediction'].dispatch('input'); elements['mask-form'].dispatch('submit')
assert.equal(elements['mask-result'].textContent, '0xA1 / 10100001 / 161')
assert.match(elements['mask-feedback'].textContent, /预测需修正.*掩码.*检查/)
elements['mask-value'].value = '-1'; elements['mask-value'].dispatch('input')
elements['mask-prediction'].value = '0'; elements['mask-prediction'].dispatch('input'); elements['mask-form'].dispatch('submit')
assert.equal(elements['mask-result'].textContent, '0xA1 / 10100001 / 161')
assert.match(elements['mask-pending'].textContent, /输入无效/)
elements['mask-reset'].dispatch('click')
assert.deepEqual(['mask-width','mask-value','mask-mask','mask-op','mask-offset','mask-length','mask-count','mask-prediction'].map(id => elements[id].value), ['8','165','12','set','4','3','1',''])
assert.equal(elements['mask-result'].textContent, '尚未应用')
assert.equal(elements['reg-result'].textContent, '尚未应用')
for (const [mode, predicted, expected] of [['RW','12','0x0C'], ['RO','165','0xA5'], ['W1C','161','0xA1']]) {
  elements['reg-mode'].value = mode; elements['reg-mode'].dispatch('change')
  elements['reg-prediction'].value = predicted; elements['reg-prediction'].dispatch('input'); elements['reg-form'].dispatch('submit')
  assert.equal(elements['reg-read'].textContent, '0xA5'); assert.equal(elements['reg-written'].textContent, '0x0C')
  assert.equal(elements['reg-result'].textContent, expected)
  assert.equal(elements['reg-operation'].textContent, mode)
  assert.equal(elements['reg-apply'].disabled, true)
}
elements['reg-mode'].value = 'RW'; elements['reg-mode'].dispatch('change')
assert.equal(elements['reg-result'].textContent, '0xA1')
assert.equal(elements['reg-operation'].textContent, 'W1C', 'Editing mode preserves the operation of the last applied record')
elements['reg-prediction'].value = '165'; elements['reg-prediction'].dispatch('input'); elements['reg-form'].dispatch('submit')
assert.match(elements['reg-feedback'].textContent, /预测需修正.*替换.*检查/)
elements['reg-reset'].dispatch('click'); assert.equal(elements['reg-result'].textContent, '尚未应用')
for (const [kind, values] of [['rw', ['0','0','2','1']], ['w1c',['3','3','3','0']]]) {
  assert.equal(elements[kind + '-state'].textContent, values[0])
  for (const value of values.slice(1)) { elements[kind + '-step'].dispatch('click'); assert.equal(elements[kind + '-state'].textContent, value) }
  assert.equal(elements[kind + '-step'].disabled, true)
  elements[kind + '-step'].dispatch('click'); assert.equal(elements[kind + '-state'].textContent, values[3])
  elements[kind + '-reset'].dispatch('click'); assert.equal(elements[kind + '-state'].textContent, values[0])
  assert.equal(elements[kind + '-step'].disabled, false)
}
console.log('PASS actual controller handlers: predict/apply, pending concealment, wrong reasons, rejection/reset, independent bounded timelines')

for (const [id,value] of [['mask-width','0'],['mask-width','9'],['mask-width','1.5'],['mask-value','256'],['mask-value',''],['mask-mask','-1'],['mask-count','8'],['mask-count','-1'],['mask-offset','8'],['mask-length','0']]) {
  elements['mask-reset'].dispatch('click')
  if (id.includes('count')) elements['mask-op'].value = 'shift'
  if (id.includes('offset') || id.includes('length')) elements['mask-op'].value = 'extract'
  elements[id].value = value; elements[id].dispatch('input')
  elements['mask-prediction'].value = '0'; elements['mask-prediction'].dispatch('input'); elements['mask-form'].dispatch('submit')
  assert.equal(elements['mask-result'].textContent, '尚未应用')
  assert.match(elements['mask-pending'].textContent, /输入无效/)
}
for (const invalid of ['-1','256','1.5','']) {
  elements['reg-reset'].dispatch('click'); elements['reg-data'].value = invalid; elements['reg-data'].dispatch('input')
  elements['reg-prediction'].value = '0'; elements['reg-prediction'].dispatch('input'); elements['reg-form'].dispatch('submit')
  assert.equal(elements['reg-result'].textContent, '尚未应用')
  assert.match(elements['reg-pending'].textContent, /输入无效/)
}

const reference = read('docs/public/demos/c-bits-registers-reference.html')
const baseline = read('docs/public/demos/gpio-led.html')
for (const [route, article] of [['c-bits-registers',html],['c-bits-registers-reference',reference]]) {
  const markdown = read('docs/learn/'+route+'.md')
  for (const filename of ['bits.c','README.txt']) {
    const href = '../examples/c-bits-registers/'+filename
    for (const [surface, text] of [['HTML',article],['Markdown',markdown]]) {
      const anchors = [...text.matchAll(/<a\b([^>]+)>/g)].map(match => match[1])
      const target = anchors.find(attrs => attrs.match(/\bhref="([^"]+)"/)?.[1] === href)
      assert.ok(target, surface+' has the exact downloadable source href '+filename)
      assert.match(target, /(?:^|\s)download(?:\s|=|$)/, surface+' source anchor has download '+filename)
      assert.ok(!text.includes('c-bits-registers/'+filename+'.html'), surface+' does not rewrite a download as a document route')
    }
  }
  assert.ok(!/\]\(\.\.\/examples\/c-bits-registers\//.test(markdown), 'No source-download Markdown document links')
  for (const text of [article, markdown]) {
    assert.ok(text.includes('按位取反'), 'Use bitwise-complement operation terminology')
    assert.ok(text.includes("two's complement"), 'Distinguish signed representation from the operation')
    assert.ok(!/八位补码|宽度内补码|模型补码|补码（~）|§6\.5\.3\.3补码/.test(text), 'No ambiguous complement operation labels')
  }
  const ids = [...article.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
  const header = article.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1]
  assert.ok(header, 'Existing topbar contract '+route)
  assert.match(header, /<a class="brand" href="\.\.\/">/)
  assert.equal((header.match(/<nav\b/g) ?? []).length, 1, 'Single navigation region')
  const navigation = [...header.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)[1].matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(match => [match[1],match[2]])
  assert.deepEqual(navigation, [['../learn/','返回分类'],[route.endsWith('-reference')?'#reference-recall-heading':'#mask-lab','交互实验'],[route.endsWith('-reference')?'#reference-masks':'#prerequisites','完整笔记'],['../?search=1','搜索笔记']])
  for (const [href] of navigation.filter(([href]) => href.startsWith('#'))) assert.ok(ids.includes(href.slice(1)), 'Local header target exists '+href)
  assert.equal(ids.length,new Set(ids).size,'Unique reader IDs '+route)
  const headings = markdown.replace(/~~~[\s\S]*?~~~/g,'').match(/^#{1,6} .+$/gm) ?? []
  for (const heading of headings) {
    const id = heading.match(/\{#([^}]+)\}/)?.[1]
    assert.ok(id,'Explicit search anchor '+heading); assert.ok(ids.includes(id),'Actual reader section '+id)
  }
  for (const id of ['note-deep-links','note-print']) assert.equal(article.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0],baseline.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0])
  assert.equal(article.match(/\/\* Shared reading layer:[\s\S]*?<\/style>/)[0],baseline.match(/\/\* Shared reading layer:[\s\S]*?<\/style>/)[0])
  for (const phrase of ['未做硬件验证','uint32_t','BITS_INVALID','W1C','volatile','Word','Rev9','connectivity','31:20','悬空']) assert.ok(article.includes(phrase),'Complete no-JS scope '+phrase)
  assert.ok(!/<(?:script|iframe)[^>]+src=/i.test(article))
  assert.ok(article.includes('href="../learn/engineering-map.html#stage-01"'), 'Map link works from canonical and compatibility reader paths')
  assert.ok(!article.includes('href="./engineering-map.html#stage-01"'), 'Map link does not assume the reader directory')
}
assert.equal((html.match(/class="exercise-answer"/g) ?? []).length,10)
assert.equal((html.match(/<details[^>]*\bopen(?:\s|>)/g) ?? []).length,0,'Initially folded retrieval')
const c = read('docs/public/examples/c-bits-registers/bits.c')
assert.ok(read('docs/learn/c-bits-registers.md').includes(createHash('sha256').update(c).digest('hex')), 'Published actual source hash is current')
assert.equal(read('docs/learn/c-bits-registers.md').match(/~~~c\n([\s\S]*?)~~~/)[1],c,'Full searchable C source parity')
const shown = html.match(/<details id="published-c">[\s\S]*?<pre><code>([\s\S]*?)<\/code><\/pre>/)[1].replaceAll('&quot;','"').replaceAll('&gt;','>').replaceAll('&lt;','<').replaceAll('&amp;','&')
assert.equal(shown,c,'Full shown C bytes equal compiled published file')
console.log('PASS complete reader/search anchors, exact shared layers, ten folded exercises and full C parity')
const apiParagraph=html.match(/<p\b([^>]*)>公开interface：([\s\S]*?)<\/p>/)
assert.ok(apiParagraph,'Actual public-interface prose paragraph exists')
assert.match(apiParagraph[1],/\bclass="bits-api-signatures"/,'Local wrap rule targets the exact long-signature prose paragraph')
for(const name of ['bits_apply','bits_field','bits_shift','bits_write','bits_bad_rmw']) assert.ok(apiParagraph[2].includes(name),'Every complete API signature remains present '+name)
const localWrap=html.match(/<style id="bits-interface-wrap">([\s\S]*?)<\/style>/)?.[1]
assert.equal(localWrap,'.notes-article .bits-api-signatures{overflow-wrap:anywhere}','Wrap long plain-text signatures without clipping body or changing pre layout')

// A faithful element tree, including real closest() ancestry and descendant queries.
class Node {
  constructor(tag, attrs, parent) { this.tagName=tag; this.attrs=attrs; this.parentElement=parent; this.children=[]; this.open=false; this.id=attrs.match(/\bid="([^"]+)"/)?.[1]; if(parent) parent.children.push(this) }
  attribute(name) { return this.attrs.match(new RegExp('(?:^|\\s)'+name+'="([^"]*)"'))?.[1] }
  hasClass(name) { return (this.attribute('class') ?? '').split(/\s+/).includes(name) }
  closest(selector) { let node=this; while(node) { if(node.tagName===selector) return node; node=node.parentElement } return null }
  querySelectorAll(selector) { return this.children.flatMap(node => [...(node.tagName===selector?[node]:[]),...node.querySelectorAll(selector)]) }
  scrollIntoView() {}
}
function parseReader(article, route) {
  const tree = new Node('root','',null), byId = {}, stack=[tree]
  const markup = article.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g,'').replace(/<!--[\s\S]*?-->/g,'')
  const voids = new Set(['input','meta','link','br','hr','img'])
  let cursor=0
  for (const match of markup.matchAll(/<\/?([a-z][a-z0-9-]*)([^>]*)>/gi)) {
    const [raw,tagName,attrs]=match, tag=tagName.toLowerCase()
    if(stack.at(-1).id==='main') assert.equal(markup.slice(cursor,match.index).trim(),'','No loose text directly under main '+route)
    cursor=match.index+raw.length
    if(raw.startsWith('</')) {
      assert.equal(stack.at(-1).tagName,tag,'Actual HTML closing tag must match open element '+route+' at '+raw)
      stack.pop()
    } else {
      const node=new Node(tag,attrs,stack.at(-1)); if(node.id) byId[node.id]=node
      if(!voids.has(tag) && !raw.endsWith('/>')) stack.push(node)
    }
  }
  assert.equal(stack.length,1,'Every nonvoid element closes '+route)
  const main=byId.main
  assert.ok(main)
  for(const child of main.children) assert.ok(child.tagName==='div' && ['chapter-intro','chapter-tools','content-section'].some(name=>child.hasClass(name)), 'No leaked prose/table directly under main '+route+' '+child.tagName)
  for(const heading of main.querySelectorAll('h2')) assert.ok(heading.parentElement.hasClass('content-section') && heading.parentElement.parentElement===main && heading.parentElement.attribute('aria-labelledby')===heading.id,'Section heading remains in its labelled main region '+heading.id)
  for(const table of main.querySelectorAll('table')) {
    const wrapper=table.parentElement
    assert.ok(wrapper.hasClass('table-wrap'),'Real table has its scroll wrapper '+route)
    assert.equal(wrapper.attribute('role'),'region'); assert.equal(wrapper.attribute('tabindex'),'0'); assert.ok(wrapper.attribute('aria-label'))
  }
  return {tree,byId}
}
const {tree,byId}=parseReader(html,'chapter')
parseReader(reference,'reference')
const main=byId.main, questions=byId['questions-region']
assert.equal(questions.parentElement,main,'Question-print region is a direct main region')
const inside=(node,ancestor)=>{ while(node) { if(node===ancestor)return true;node=node.parentElement } return false }
assert.equal(questions.querySelectorAll('details').length,10,'All ten retrieval explanations stay inside the worksheet region')
for(const node of [...main.querySelectorAll('p'),...main.querySelectorAll('pre'),...main.querySelectorAll('table'),...main.querySelectorAll('figure')].filter(node=>!inside(node,questions))) {
  let region=node; while(region.parentElement!==main)region=region.parentElement
  assert.ok(region.hasClass('chapter-intro')||region.hasClass('content-section'),'Non-question content has an ancestor matched by actual worksheet hide rules')
}
assert.match(html,/body\.exercise-print main>\.chapter-intro[\s\S]*?body\.exercise-print main>\.content-section[^{}]*\{display:none!important\}/)
assert.match(html,/body\.exercise-print main>#questions-region\{display:block!important/)
console.log('PASS balanced real HTML trees, labelled section ownership, accessible table wrappers and no worksheet prose leaks')
const details = tree.querySelectorAll('details')
const events = {}
const window = { location:{ hash:'#ten-exercises' }, addEventListener(name,callback) { (events[name]??=[]).push(callback) }, dispatchEvent(event) { for(const callback of events[event.type]??[]) callback(event) } }
const dom = { getElementById:id=>byId[id], querySelectorAll:selector=>tree.querySelectorAll(selector) }
const disclosure = { document:dom, window, requestAnimationFrame:callback=>callback() }
vm.runInNewContext(script('note-deep-links'),disclosure)
assert.ok(details.every(node=>!node.open),'Normal section hash cannot reveal answers')
window.location.hash='#answer-05'; window.dispatchEvent({type:'hashchange'})
assert.deepEqual(details.filter(node=>node.open).map(node=>node.id),['answer-05'])
details.forEach(node=>{node.open=false})
window.location.hash='#mask-rules'; window.dispatchEvent({type:'pageshow'})
assert.ok(details.every(node=>!node.open),'History normal hash preserves folds')
window.location.hash='#answer-08'; window.dispatchEvent({type:'hashchange'})
assert.deepEqual(details.filter(node=>node.open).map(node=>node.id),['answer-08'])
console.log('PASS real-tree closest/descendants: section links concealed, direct answer isolated, repeated/history hashes')

const modes = new Set()
dom.body={ classList:{ add:mode=>modes.add(mode),remove:mode=>modes.delete(mode) } }
for(const id of ['print-questions','print-all','expand-notes','collapse-notes']) byId[id]={ listeners:{}, addEventListener(name,callback){this.listeners[name]=callback}, click(){this.listeners.click()} }
const Event = class { constructor(type) {this.type=type} }
const printing={ document:dom,window,Event }
for(const id of ['note-print','bits-reader','bits-worksheet']) vm.runInNewContext(script(id),printing)
const before = details.map(node=>node.open)
window.print=()=>{ window.dispatchEvent({type:'beforeprint'}); assert.ok(details.every(node=>node.open)); assert.ok(modes.has('exercise-print')); window.dispatchEvent({type:'afterprint'}) }
byId['print-questions'].click()
assert.deepEqual(details.map(node=>node.open),before); assert.equal(modes.size,0)
window.print=()=>{window.dispatchEvent({type:'beforeprint'});throw Error('print dispatch failed')}
byId['print-questions'].click(); assert.equal(modes.size,0); assert.deepEqual(details.map(node=>node.open),before)
window.print=()=>{window.dispatchEvent({type:'beforeprint'});assert.ok(details.every(node=>node.open));window.dispatchEvent({type:'afterprint'})}
byId['print-all'].click(); assert.deepEqual(details.map(node=>node.open),before)
byId['expand-notes'].click(); assert.ok(details.every(node=>node.open))
byId['collapse-notes'].click(); assert.ok(details.every(node=>!node.open))
assert.match(html,/body\.exercise-print \.exercise-answer\{display:none!important\}/)
assert.match(html,/body\.exercise-print main>#questions-region\{display:block!important/)
console.log('PASS actual worksheet/reader/print events: expansion, fold restore, questions mode cleanup including dispatch failure')
