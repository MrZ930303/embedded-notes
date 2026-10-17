import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8')
const html = await read('docs/public/demos/bounded-fifo.html')
const repeatedOutputPremise='所有pop连续复用同一个、独立于队列的output；仅在序列开始初始化为165'
for(const text of [html,await read('docs/learn/bounded-fifo.md')]) {
  assert.ok(text.includes(repeatedOutputPremise),'Question10 reuses one caller output across the full sequence')
  assert.ok(!text.includes('每次pop使用独立output，初值165'),'No per-pop fresh-sentinel ambiguity')
}
const script = id => {
  const match = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'))
  assert.ok(match, 'Actual reader script: ' + id)
  return match[1]
}
const context = {}
vm.runInNewContext(script('fifo-model') + ';globalThis.model = FifoModel;', context)
const model = context.model
assert.deepEqual(JSON.parse(JSON.stringify(model.create())), { slots: [0, 0, 0, 0], head: 0, tail: 0, count: 0 })
console.log('PASS FIFO empty seed')

// Literal, hand-worked rows: status/head/tail/count/logical queue/pop output.
const rows = [
  ['push', 17, 'OK', 0, 1, 1, [17], 165],
  ['push', 34, 'OK', 0, 2, 2, [17, 34], 165],
  ['push', 51, 'OK', 0, 3, 3, [17, 34, 51], 165],
  ['push', 68, 'OK', 0, 0, 4, [17, 34, 51, 68], 165],
  ['push', 85, 'FULL', 0, 0, 4, [17, 34, 51, 68], 165],
  ['pop', 0, 'OK', 1, 0, 3, [34, 51, 68], 17],
  ['pop', 0, 'OK', 2, 0, 2, [51, 68], 34],
  ['push', 85, 'OK', 2, 1, 3, [51, 68, 85], 34],
  ['push', 102, 'OK', 2, 2, 4, [51, 68, 85, 102], 34],
  ['pop', 0, 'OK', 3, 2, 3, [68, 85, 102], 51],
  ['pop', 0, 'OK', 0, 2, 2, [85, 102], 68],
  ['pop', 0, 'OK', 1, 2, 1, [102], 85],
  ['pop', 0, 'OK', 2, 2, 0, [], 102],
  ['pop', 0, 'EMPTY', 2, 2, 0, [], 102]
]
const plain = value => JSON.parse(JSON.stringify(value))
let queue = model.create(), output = 165
for (const [op, byte, status, head, tail, count, logical, expectedOutput] of rows) {
  const before = plain(queue)
  const result = model.apply(queue, op, byte, output)
  assert.equal(result.status, status)
  queue = result.queue; output = result.output
  assert.deepEqual([queue.head, queue.tail, queue.count], [head, tail, count])
  assert.deepEqual(plain(model.logical(queue)), logical)
  assert.equal(output, expectedOutput)
  if (status !== 'OK') assert.deepEqual(plain(queue), before)
}
console.log('PASS FIFO literal replay, full/empty preservation and wrap')
assert.equal(model.apply(model.create(), 'pop', 0, null).status, 'INVALID_ARGUMENT')

class Element {
  constructor(value = '') { this.value = value; this.disabled = false; this.hidden = false; this.listeners = {}; this.textContent = ''; this.innerHTML = '' }
  addEventListener(event, handler) { this.listeners[event] = handler }
  dispatch(event) { this.listeners[event]?.({preventDefault() {}, target:this}) }
}
const elements = {}
for (const [, id] of html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').matchAll(/\bid="([^"]+)"/g)) elements[id] = new Element()
for (const id of ['fifo-state','replay-state']) elements[id].textContent = html.match(new RegExp('<p id="'+id+'">([^<]*)</p>'))[1]
for (const [id, value] of Object.entries({'fifo-operation':'push','fifo-byte':'17','fifo-fault':'none','fifo-status-prediction':'','fifo-queue-prediction':'','replay-status-prediction':'','replay-queue-prediction':''})) {
  assert.ok(elements[id], 'Actual control required: ' + id)
  elements[id].value = value
}
context.document = {getElementById(id) {assert.ok(elements[id], 'Known DOM ID: ' + id); return elements[id]}}
vm.runInNewContext(script('fifo-controller'), context)
assert.equal(elements['fifo-apply'].disabled, true)
elements['fifo-form'].dispatch('submit')
assert.match(elements['fifo-state'].textContent, /count=0/)
console.log('PASS FIFO controller requires prediction')

const predict = (prefix, status, values) => {
  elements[prefix+'-status-prediction'].value=status
  elements[prefix+'-status-prediction'].dispatch('change')
  elements[prefix+'-queue-prediction'].value=values.length?values.join(','):'空'
  elements[prefix+'-queue-prediction'].dispatch('input')
}
const submit = prefix => elements[prefix+'-form'].dispatch('submit')
predict('fifo','OK',[17]);submit('fifo')
assert.match(elements['fifo-state'].textContent,/head=0 tail=1 count=1.*17/)
assert.match(elements['fifo-feedback'].textContent,/预测正确.*复制.*tail/)
assert.equal(elements['fifo-apply'].disabled,true)
assert.equal(elements['fifo-status-prediction'].value,'')
const applied = elements['fifo-state'].textContent
predict('fifo','OK',[17,34])
elements['fifo-byte'].value='34';elements['fifo-byte'].dispatch('input')
assert.equal(elements['fifo-status-prediction'].value,'')
assert.equal(elements['fifo-queue-prediction'].value,'')
assert.equal(elements['fifo-state'].textContent,applied,'Pending byte edits conceal new state')
submit('fifo');assert.equal(elements['fifo-state'].textContent,applied)
predict('fifo','FULL',[]);submit('fifo')
assert.match(elements['fifo-feedback'].textContent,/预测不同.*OK.*复制.*下一次/)
assert.match(elements['fifo-state'].textContent,/count=2.*17,34/)
for (const bad of ['', '-1', '256', '1.5', 'NaN', 'Infinity', '0xFF']) {
  const before=elements['fifo-state'].textContent
  elements['fifo-byte'].value=bad;elements['fifo-byte'].dispatch('input')
  predict('fifo','OK',[]);submit('fifo')
  assert.equal(elements['fifo-state'].textContent,before,'Invalid UI retains state: '+bad)
  assert.match(elements['fifo-feedback'].textContent,/输入无效/)
}
elements['fifo-reset'].dispatch('click')
assert.equal(elements['fifo-byte'].value,'17')
assert.equal(elements['fifo-operation'].value,'push')
assert.equal(elements['fifo-fault'].value,'none')
assert.match(elements['fifo-state'].textContent,/head=0 tail=0 count=0.*输出=165/)
assert.equal(elements['fifo-queue-prediction'].value,'')
assert.match(elements['fifo-feedback'].textContent,/尚未/)
for (const [op, byte, status, head, tail, count, logical, output] of rows) {
  elements['fifo-operation'].value=op;elements['fifo-operation'].dispatch('change')
  elements['fifo-byte'].value=String(byte);elements['fifo-byte'].dispatch('input')
  predict('fifo',status,logical);submit('fifo')
  assert.match(elements['fifo-feedback'].textContent,/预测正确/)
  assert.match(elements['fifo-state'].textContent,new RegExp(`head=${head} tail=${tail} count=${count}.*输出=${output}$`))
}
for (const fault of ['null-queue','null-output','bad-range','bad-relation']) {
  elements['fifo-fault'].value=fault;elements['fifo-fault'].dispatch('change')
  const before=elements['fifo-state'].textContent
  predict('fifo',fault.startsWith('null')?'INVALID_ARGUMENT':'BAD_STATE',[]);submit('fifo')
  assert.match(elements['fifo-feedback'].textContent,/预测正确/)
  assert.equal(elements['fifo-state'].textContent,before,'Independent fault fixture preserves normal queue')
  assert.match(elements['fifo-last'].textContent,/独立故障副本未改变/)
}
elements['fifo-reset'].dispatch('click')
for (const byte of ['0','255']) {
  elements['fifo-byte'].value=byte;elements['fifo-byte'].dispatch('input')
  predict('fifo','OK',byte==='0'?[0]:[0,255]);submit('fifo')
  assert.match(elements['fifo-feedback'].textContent,/预测正确/)
}
console.log('PASS FIFO actual manual controls: fixed trace, wrong reasons, edits, consume/reset,0/255,invalid UI,fault fixtures')

for (const [index,row] of rows.entries()) {
  const [, , status, head,tail,count,logical,output]=row
  const before=elements['replay-state'].textContent
  submit('replay');assert.equal(elements['replay-state'].textContent,before)
  predict('replay',status,logical);submit('replay')
  assert.match(elements['replay-feedback'].textContent,/预测正确/)
  assert.match(elements['replay-state'].textContent,new RegExp(`head=${head} tail=${tail} count=${count}.*输出=${output}$`))
  assert.equal((elements['replay-log'].innerHTML.match(/<li>/g)||[]).length,index+1,'Only applied rows appear')
}
assert.equal(elements['replay-apply'].disabled,true)
assert.match(elements['replay-operation'].textContent,/已结束14\/14/)
const ended=elements['replay-state'].textContent
predict('replay','OK',[99]);submit('replay');assert.equal(elements['replay-state'].textContent,ended)
elements['replay-reset'].dispatch('click')
assert.match(elements['replay-operation'].textContent,/下一步1\/14：push17/)
assert.match(elements['replay-state'].textContent,/count=0.*输出=165/)
assert.equal(elements['replay-log'].innerHTML,'')
assert.equal(elements['replay-status-prediction'].value,'')
console.log('PASS FIFO actual replay:14 independent rows, no unpredicted step, bounded end and deterministic reset')

for (const byte of [0,255]) {
  const result=model.apply(model.create(),'push',byte)
  assert.equal(result.status,'OK')
  assert.equal(model.apply(result.queue,'pop',0).output,byte)
}
for (const byte of [-1,256,1.5,NaN,Infinity,'17',undefined,null]) {
  const q=model.create(), before=plain(q)
  assert.equal(model.apply(q,'push',byte).status,'INVALID_ARGUMENT')
  assert.deepEqual(plain(q),before)
}
assert.equal(model.apply(null,'pop',0).status,'INVALID_ARGUMENT')
for (const patch of [{head:4},{tail:4},{count:5},{head:-1},{count:1},{head:1,tail:2,count:0}]) {
  const q={...plain(model.create()),...patch}, before=plain(q)
  for (const op of ['push','pop']) {
    const result=model.apply(q,op,7,165)
    assert.equal(result.status,'BAD_STATE')
    assert.deepEqual(plain(result.queue),before)
    assert.equal(result.output,165)
  }
}
let source=17
const copied=model.apply(model.create(),'push',source)
source=99
assert.equal(model.apply(copied.queue,'pop',0).output,17)
assert.equal(source,99)
console.log('PASS FIFO model boundaries, real initialized metadata and value ownership')

// Parse actual HTML ancestry; closest(section) genuinely traverses parents.
class Node {
  constructor(tag,attrs,parent) {this.tag=tag;this.attrs=attrs;this.parentElement=parent;this.children=[];this.open=Object.hasOwn(attrs,'open');this.listeners={};this.scrolls=0}
  closest(tag) {for(let n=this;n;n=n.parentElement) if(n.tag===tag) return n;return null}
  querySelectorAll(tag) {return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag)])}
  scrollIntoView() {this.scrolls+=1}
  addEventListener(name,handler) {(this.listeners[name]??=[]).push(handler)}
  dispatch(name) {for(const handler of this.listeners[name]||[]) handler({})}
}
const dom=new Node('root',{},null), stack=[dom], nodes={}
const markup=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g,'')
for (const match of markup.matchAll(/<\/?([a-z][\w-]*)([^>]*)>/gi)) {
  const [,tag,rest]=match
  if(match[0].startsWith('</')) {const at=stack.findLastIndex(n=>n.tag===tag);if(at>0) stack.length=at;continue}
  const attrs={}
  for(const a of rest.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]]=a[2]??''
  const node=new Node(tag,attrs,stack.at(-1));stack.at(-1).children.push(node)
  if(attrs.id) {assert.ok(!nodes[attrs.id],'Unique ID: '+attrs.id);nodes[attrs.id]=node}
  if(!['meta','link','input','br','hr','img','path','rect'].includes(tag)&&!match[0].endsWith('/>')) stack.push(node)
}
const details=dom.querySelectorAll('details')
const answers=details.filter(n=>(n.attrs.class||'').split(' ').includes('exercise-answer'))
assert.equal(answers.length,10)
assert.ok(answers.every(n=>!n.open&&!n.closest('section')),'Native folded answers have no broad section ancestor')
const eventHandlers={},classes=new Set()
const window={location:{hash:''},addEventListener(name,fn) {(eventHandlers[name]??=[]).push(fn)},dispatchEvent(event) {for(const fn of eventHandlers[event.type]||[]) fn()},print() {}}
const doc={getElementById(id) {return nodes[id]},querySelectorAll(tag) {return dom.querySelectorAll(tag)},body:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}}}
const readerContext={document:doc,window,requestAnimationFrame:fn=>fn(),Event:class {constructor(type){this.type=type}}}
vm.runInNewContext(script('note-deep-links')+script('note-print')+script('fifo-reader')+script('fifo-worksheet'),readerContext)
for(const hash of ['#fifo-practice','#fifo-practice-title','#fifo-question-07','#fifo-c-lab','#bounded-fifo']) {
  window.location.hash=hash;window.dispatchEvent({type:'hashchange'});assert.ok(answers.every(n=>!n.open),'Normal section/search hash keeps all answers folded: '+hash)
}
window.location.hash='#fifo-answer-07';window.dispatchEvent({type:'hashchange'})
assert.deepEqual(answers.map(n=>n.open),[false,false,false,false,false,false,true,false,false,false])
window.location.hash='#fifo-question-02';window.dispatchEvent({type:'pageshow'})
assert.equal(answers.filter(n=>n.open).length,1,'History preserves other folds without expanding all')
nodes['collapse-notes'].dispatch('click');assert.ok(details.every(n=>!n.open))
nodes['expand-notes'].dispatch('click');assert.ok(details.every(n=>n.open))
nodes['collapse-notes'].dispatch('click')
answers[2].open=true
const initialFolds=details.map(n=>n.open)
window.dispatchEvent({type:'beforeprint'});assert.ok(details.every(n=>n.open))
window.dispatchEvent({type:'afterprint'});assert.deepEqual(details.map(n=>n.open),initialFolds)
window.print=()=>{assert.equal(classes.has('exercise-print'),true);window.dispatchEvent({type:'beforeprint'})}
nodes['print-questions'].dispatch('click')
assert.equal(classes.has('exercise-print'),true)
window.dispatchEvent({type:'afterprint'})
assert.equal(classes.has('exercise-print'),false)
assert.deepEqual(details.map(n=>n.open),initialFolds)
window.print=()=>{window.dispatchEvent({type:'beforeprint'});throw new Error('print dispatch failed')}
nodes['print-questions'].dispatch('click')
assert.equal(classes.has('exercise-print'),false)
assert.deepEqual(details.map(n=>n.open),initialFolds,'Failure restores folds and clears shared print snapshot')
assert.match(html,/body\.exercise-print \.exercise-answer\{display:none!important\}/)
console.log('PASS FIFO actual ancestry deep links, repeated hashes/history,folds,ordinary print,worksheet afterprint/failure cleanup')

const reference=await read('docs/public/demos/bounded-fifo-reference.html')
const statusLabels=[...html.match(/<select id="fifo-status-prediction">([\s\S]*?)<\/select>/)[1].matchAll(/<option value="[^"]+">([^<]+)<\/option>/g)].map(m=>m[1])
assert.deepEqual(statusLabels.map(s=>[...s].length),[6,6,6,6,6],'Comparable choice labels avoid formatting cues')
const prior=await read('docs/public/demos/gpio-led.html')
for(const article of [html,reference]) {
  assert.ok(article.includes('<body class="notes-article">'),'Shared reader class belongs on body')
  assert.equal((article.match(/class="notes-article"/g)||[]).length,1,'One reader class, without nested duplicate wrapper')
  const header=article.match(/<header class="topbar">([\s\S]*?)<\/header>/)[1]
  assert.match(header,/<a class="brand" href="\.\.\/">/)
  assert.equal((header.match(/<nav\b/g)||[]).length,1,'One shared topbar navigation')
  const nav=header.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)[1]
  const links=[...nav.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(m=>[m[1],m[2]])
  const isReference=article===reference
  assert.deepEqual(links,[['../learn/','返回分类'],[isReference?'#fifo-ref-replay':'#fifo-lab','交互实验'],[isReference?'#fifo-ref-contract':'#fifo-ownership','完整笔记'],['../?search=1','搜索笔记']])
  for(const [href] of links) if(href.startsWith('#')) assert.ok(article.includes('id="'+href.slice(1)+'"'),'Topbar local anchor exists: '+href)
  const reading=article.match(/<style>\s*\/\* Shared reading layer:[\s\S]*?<\/style>/)[0]
  assert.equal(reading,prior.match(/<style>\s*\/\* Shared reading layer:[\s\S]*?<\/style>/)[0])
  for(const id of ['note-deep-links','note-print']) assert.equal(article.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0],prior.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0])
  const ids=[...article.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1])
  assert.equal(new Set(ids).size,ids.length,'Every chapter/reference ID unique')
}
const decode=text=>text.replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#x27;',"'")
const cSource=await read('docs/public/examples/bounded-fifo/fifo.c')
assert.equal(decode(html.match(/<details id="fifo-complete-source">[\s\S]*?<pre><code>([\s\S]*?)<\/code><\/pre>/)[1]),cSource,'Complete visible source matches compiled/download source bytes')
for(const name of ['bounded-fifo','bounded-fifo-reference']) {
  const md=await read('docs/learn/'+name+'.md'),article=name==='bounded-fifo'?html:reference
  for(const file of ['fifo.c','README.txt']) assert.ok(md.includes('<a href="../examples/bounded-fifo/'+file+'" download>'),'Native static download link required: '+name+'/'+file)
  assert.doesNotMatch(md,/\]\(\.\.\/public\/examples\/bounded-fifo\//,'No public-directory document links')
  for(const [,anchor] of md.matchAll(/\{#([^}]+)\}/g)) assert.ok(article.includes('id="'+anchor+'"'),'Search heading resolves: '+anchor)
  for(const phrase of ['不可重入','SPSC','不重叠','BAD_STATE','20000','硬件未验证']) assert.ok(md.includes(phrase),'Full mirror retains condition: '+phrase)
}
assert.ok((await read('docs/learn/bounded-fifo.md')).includes(cSource.trim()),'Search source is complete compiled C')
assert.doesNotMatch(html,/localStorage|sessionStorage|fetch\(|setInterval|XMLHttpRequest/)
console.log('PASS FIFO exact shared layers,unique anchors,complete C/source mirrors and no persistence')
