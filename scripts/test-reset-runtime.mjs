import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const root=new URL('../',import.meta.url)
const html=readFileSync(new URL('docs/public/demos/reset-runtime.html',root),'utf8')
const script=id=>{const m=html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'));assert.ok(m,id);return m[1]}
const context={}
vm.runInNewContext(script('runtime-model')+';globalThis.model=ResetRuntimeModel',context)
const flash=Array(64).fill(165),ram=Array(64).fill(165)
flash.splice(0,8,64,32,0,0,17,16,0,0);flash.splice(32,4,17,34,51,68)
const request={flashBase:4096,ramBase:8192,flashLength:64,ramLength:64,execStart:4112,execEnd:4114,dataSource:32,dataDestination:8,dataLength:4,bssDestination:16,bssLength:4}
const report={initialSp:0,entryWord:0,entryTarget:0,copied:0,zeroed:0,mainReady:false}
const result=context.model.initialize(flash,request,ram,report)
assert.equal(result.status,'OK','valid fixed image must initialize')
assert.deepEqual(Array.from(result.ram),[165,165,165,165,165,165,165,165,17,34,51,68,165,165,165,165,0,0,0,0,...Array(44).fill(165)])
console.log('PASS fixed fictional image transaction')
const plain=v=>JSON.parse(JSON.stringify(v))
const expectedReport={initialSp:8256,entryWord:4113,entryTarget:4112,copied:4,zeroed:4,mainReady:true}
assert.deepEqual(plain(result.report),expectedReport)
assert.deepEqual(ram,Array(64).fill(165),'pure JS operation leaves original RAM untouched')
for(const [patch,status] of [
  [{flashLength:7},'BAD_VECTOR'],[{flashLength:65},'BAD_LENGTH'],[{ramLength:65},'BAD_LENGTH'],[{ramLength:0},'BAD_LENGTH'],
  [{flashBase:4294967232},'ADDRESS_OVERFLOW'],[{ramBase:4294967232},'ADDRESS_OVERFLOW'],
  [{execEnd:4113},'BAD_ENTRY'],[{execStart:4113},'BAD_ENTRY'],[{execEnd:4161},'BAD_ENTRY'],
  [{dataSource:61},'BAD_RANGE'],[{dataDestination:61},'BAD_RANGE'],[{bssDestination:61},'BAD_RANGE'],
  [{bssDestination:10},'OVERLAP'],[{dataSource:Number.MAX_SAFE_INTEGER},'ADDRESS_OVERFLOW'],
  [{dataDestination:Number.MAX_SAFE_INTEGER},'ADDRESS_OVERFLOW'],[{bssDestination:Number.MAX_SAFE_INTEGER},'ADDRESS_OVERFLOW'],
  [{dataLength:-1},'INVALID_ARGUMENT'],[{dataLength:NaN},'INVALID_ARGUMENT'],[{dataLength:0,dataSource:65},'BAD_RANGE'],
  [{dataLength:0,dataDestination:65},'BAD_RANGE'],[{bssLength:0,bssDestination:65},'BAD_RANGE']
]){
 const prior=plain(result),f=flash.slice(),r={...request,...patch}
 const actual=context.model.initialize(f,r,result.ram,result.report)
 assert.equal(actual.status,status,JSON.stringify(patch))
 assert.deepEqual(plain(actual.ram),prior.ram);assert.deepEqual(plain(actual.report),prior.report)
 assert.deepEqual(f,flash)
}
for(const [offset,bytes,status] of [[0,[255,31,0,0],'BAD_SP'],[0,[65,32,0,0],'BAD_SP'],[0,[60,32,0,0],'BAD_SP'],[4,[16,16,0,0],'BAD_ENTRY'],[4,[19,16,0,0],'BAD_ENTRY'],[4,[15,16,0,0],'BAD_ENTRY']]){
 const f=flash.slice();f.splice(offset,4,...bytes)
 const actual=context.model.initialize(f,request,result.ram,result.report)
 assert.equal(actual.status,status);assert.deepEqual(plain(actual.ram),plain(result.ram));assert.deepEqual(plain(actual.report),expectedReport)
}
for(let i=0;i<4;i++){
 const args=[flash,request,result.ram,result.report];args[i]=null
 assert.equal(context.model.initialize(...args).status,'INVALID_ARGUMENT')
}
const empty=context.model.initialize(flash,{...request,dataSource:64,dataDestination:64,dataLength:0,bssDestination:64,bssLength:0},ram,report)
assert.equal(empty.status,'OK');assert.deepEqual(plain(empty.ram),Array(64).fill(165));assert.deepEqual([empty.report.copied,empty.report.zeroed],[0,0])
assert.equal(context.model.initialize(flash,{...request,dataSource:60,dataDestination:60,bssDestination:56},ram,report).status,'OK')
const sparse=flash.slice();delete sparse[33]
assert.equal(context.model.initialize(sparse,request,ram,report).status,'INVALID_ARGUMENT','a hole is not an initialized byte')
console.log('PASS JS vectors, exact endpoints, empty spans, overflow, overlap, NULL and preservation')

// Strict authored-tree parser: mismatched closing tags fail rather than auto-pop.
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,'&')
class Element{
 constructor(tag,attrs,parent){this.tag=tag;this.attrs=attrs;this.parentElement=parent;this.children=[];this.parts=[];this.listeners={};this.open=Object.hasOwn(attrs,'open');this.hidden=Object.hasOwn(attrs,'hidden');this.disabled=Object.hasOwn(attrs,'disabled');this.value=attrs.value??'';this.scrolls=0}
 get textContent(){return this.override??this.parts.map(p=>typeof p==='string'?p:p.textContent).join('')}
 set textContent(v){this.override=String(v)}
 addEventListener(n,f){(this.listeners[n]??=[]).push(f)}
 dispatch(n){for(const f of this.listeners[n]??[])f({preventDefault(){},target:this})}
 closest(tag){for(let n=this;n;n=n.parentElement)if(n.tag===tag)return n;return null}
 querySelectorAll(tag){return this.children.flatMap(n=>[...(n.tag===tag?[n]:[]),...n.querySelectorAll(tag)])}
 scrollIntoView(){this.scrolls++}
}
function tree(source){
 const root=new Element('root',{},null),stack=[root],nodes={}
 const markup=source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g,'').replace(/<!--[\s\S]*?-->/g,'')
 const voids=['meta','link','input','br','hr','img','wbr','source','area','base','col','embed','param','track']
 for(const token of markup.matchAll(/<!doctype[^>]*>|<\/?[a-z][^>]*>|[^<]+/gi)){
  const text=token[0];if(/^<!doctype/i.test(text))continue
  if(!text.startsWith('<')){stack.at(-1).parts.push(decode(text));continue}
  const [,slash,tag,rest]=text.match(/^<(\/?)([a-z][\w-]*)([^>]*)>$/i)
  if(slash){assert.equal(stack.at(-1).tag,tag,'strict matching close '+text);stack.pop();continue}
  const attrs={};for(const a of rest.matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=decode(a[2]??'')
  assert.ok(!(stack.at(-1).tag==='p'&&['div','p','table','article','details','h2','h3'].includes(tag)),'no invalid block inside p')
  const node=new Element(tag,attrs,stack.at(-1));stack.at(-1).children.push(node);stack.at(-1).parts.push(node)
  if(attrs.id){assert.ok(!nodes[attrs.id],'unique '+attrs.id);nodes[attrs.id]=node}
  if(!voids.includes(tag))stack.push(node)
 }
 assert.equal(stack.length,1,'all authored tags explicitly closed')
 for(const select of root.querySelectorAll('select'))select.value=select.querySelectorAll('option')[0]?.attrs.value??''
 return {root,nodes}
}
const {root:dom,nodes}=tree(html),answers=dom.querySelectorAll('details').filter(n=>n.attrs.class==='exercise-answer')
assert.equal(answers.length,10);assert.ok(answers.every(n=>!n.open&&!n.closest('section')))
for(const heading of dom.querySelectorAll('h2')){
 const region=heading.parentElement
 assert.equal(region.parentElement,nodes.main,'h2 regions are direct main children')
 assert.equal(region.attrs.role,'region');assert.equal(region.attrs['aria-labelledby'],heading.attrs.id)
}
for(const n of [...dom.querySelectorAll('pre'),...dom.querySelectorAll('table')]){
 assert.equal(n.parentElement.attrs.role,'region');assert.equal(n.parentElement.attrs.tabindex,'0');assert.ok(n.parentElement.attrs['aria-label'])
}
const doc={getElementById:id=>{assert.ok(nodes[id],'known actual DOM id '+id);return nodes[id]},querySelectorAll:tag=>dom.querySelectorAll(tag)}
context.document=doc;vm.runInNewContext(script('runtime-controller'),context)
assert.equal(nodes['runtime-apply'].disabled,true);assert.equal(nodes['runtime-result'].hidden,true)
nodes['runtime-form'].dispatch('submit');assert.equal(nodes['runtime-result'].hidden,true)
const change=(id,value,event='input')=>{nodes[id].value=value;nodes[id].dispatch(event)}
const predict=(status,byte)=>{change('runtime-prediction',status,'change');change('runtime-byte',String(byte))}
predict('OK',17);nodes['runtime-form'].dispatch('submit')
assert.equal(nodes['runtime-result'].hidden,false);assert.match(nodes['runtime-state'].textContent,/17,34,51,68/)
assert.match(nodes['runtime-state'].textContent,/"mainReady":true/);assert.match(nodes['runtime-feedback'].textContent,/预测正确.*下一次/)
assert.equal(nodes['runtime-prediction'].value,'');assert.equal(nodes['runtime-byte'].value,'');assert.equal(nodes['runtime-apply'].disabled,true)
const acceptedText=nodes['runtime-state'].textContent,acceptedInputs=nodes['runtime-accepted'].textContent
predict('OK',17);change('runtime-bssDestination','10')
assert.equal(nodes['runtime-prediction'].value,'');assert.equal(nodes['runtime-byte'].value,'')
assert.equal(nodes['runtime-state'].textContent,acceptedText);assert.equal(nodes['runtime-accepted'].textContent,acceptedInputs);assert.match(nodes['runtime-pending'].textContent,/待应用/)
predict('OVERLAP',17);nodes['runtime-form'].dispatch('submit');assert.match(nodes['runtime-feedback'].textContent,/预测正确.*OVERLAP.*零填充.*下一次/)
assert.equal(nodes['runtime-state'].textContent,acceptedText);assert.equal(nodes['runtime-accepted'].textContent,acceptedInputs)
change('runtime-bssDestination','12');predict('BAD_SP',165);nodes['runtime-form'].dispatch('submit')
assert.match(nodes['runtime-feedback'].textContent,/预测不同.*OK.*校验.*下一次/)
for(const bad of ['', '-1','4.5','NaN','Infinity','0x4','4294967296']){
 const before=nodes['runtime-state'].textContent;change('runtime-dataLength',bad);predict('OK',17);nodes['runtime-form'].dispatch('submit')
 assert.equal(nodes['runtime-state'].textContent,before,bad);assert.match(nodes['runtime-feedback'].textContent,/输入无效/);assert.equal(nodes['runtime-apply'].disabled,true)
}
change('runtime-dataLength','4');change('runtime-bssDestination','16')
for(const [fault,status] of [['short-vector','BAD_VECTOR'],['short-source','BAD_RANGE'],['address-overflow','ADDRESS_OVERFLOW']]){
 const before=nodes['runtime-state'].textContent;change('runtime-fault',fault,'change');predict(status,17);nodes['runtime-form'].dispatch('submit');assert.match(nodes['runtime-feedback'].textContent,/预测正确/);assert.equal(nodes['runtime-state'].textContent,before)
}
nodes['runtime-reset'].dispatch('click');assert.equal(nodes['runtime-result'].hidden,true);assert.equal(nodes['runtime-state'].textContent,'');assert.equal(nodes['runtime-sp'].value,'8256');assert.equal(nodes['runtime-fault'].value,'none');assert.equal(nodes['runtime-byte'].value,'')
assert.match(nodes['runtime-feedback'].textContent,/mainReady=false/)
console.log('PASS actual transaction handlers: prediction, consume, pending, wrong/reject, invalid UI, accepted labels and reset')
const tracePred=(phase,byte)=>{change('trace-prediction',phase,'change');change('trace-byte',String(byte))}
assert.equal(nodes['trace-apply'].disabled,true);assert.equal(nodes['trace-result'].hidden,true)
for(const [i,phase,byte,privateBytes,bss,committed] of [
 [0,'validate',165,'165,165,165,165','165,165,165,165',false],
 [1,'copy',17,'17,34,51,68','165,165,165,165',false],
 [2,'zero',17,'17,34,51,68','0,0,0,0',false],
 [3,'commit',17,'17,34,51,68','0,0,0,0',true]]){
 const before=nodes['trace-log'].textContent;nodes['trace-form'].dispatch('submit');assert.equal(nodes['trace-log'].textContent,before)
 tracePred(i===1?'zero':phase,byte);nodes['trace-form'].dispatch('submit')
 assert.ok(nodes['trace-state'].textContent.includes('私有RAM[8..11]='+privateBytes))
 assert.ok(nodes['trace-state'].textContent.includes('私有BSS[16..19]='+bss))
 assert.ok(nodes['trace-state'].textContent.includes('已接受RAM[8..11]='+(committed?'17,34,51,68':'165,165,165,165')))
 assert.ok(nodes['trace-state'].textContent.endsWith('mainReady='+committed));assert.equal(nodes['trace-prediction'].value,'');assert.equal(nodes['trace-byte'].value,'')
 assert.match(nodes['trace-feedback'].textContent,i===1?/预测不同/:/预测正确/)
}
assert.match(nodes['trace-next'].textContent,/已结束4\/4/);tracePred('commit',17);assert.equal(nodes['trace-apply'].disabled,true)
const ended=nodes['trace-log'].textContent;nodes['trace-form'].dispatch('submit');assert.equal(nodes['trace-log'].textContent,ended)
nodes['trace-reset'].dispatch('click');assert.equal(nodes['trace-result'].hidden,true);assert.equal(nodes['trace-state'].textContent,'');assert.equal(nodes['trace-log'].textContent,'');assert.match(nodes['trace-next'].textContent,/下一步1\/4/)
console.log('PASS actual four-step handlers: private/accepted state, gated steps, wrong feedback, finite end and reproducible reset')

const events={},classes=new Set(),allDetails=dom.querySelectorAll('details')
const window={location:{hash:''},addEventListener(n,f){(events[n]??=[]).push(f)},dispatchEvent(e){for(const f of events[e.type]??[])f()},print(){this.dispatchEvent({type:'beforeprint'});this.dispatchEvent({type:'afterprint'})}}
doc.body={classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}}
const ctx={document:doc,window,requestAnimationFrame:f=>f(),Event:class{constructor(type){this.type=type}}}
for(const id of ['note-deep-links','note-print','runtime-reader','runtime-worksheet'])vm.runInNewContext(script(id),ctx)
for(const id of ['runtime-practice','runtime-practice-title','runtime-question-04','runtime-c-lab','reset-runtime']){window.location.hash='#'+id;window.dispatchEvent({type:'hashchange'});assert.ok(answers.every(d=>!d.open))}
window.location.hash='#runtime-answer-04';window.dispatchEvent({type:'hashchange'});assert.deepEqual(answers.map(d=>d.open),[false,false,false,true,false,false,false,false,false,false])
nodes['collapse-notes'].dispatch('click');assert.ok(answers.every(d=>!d.open));nodes['expand-notes'].dispatch('click');assert.ok(answers.every(d=>d.open));nodes['collapse-notes'].dispatch('click')
answers[2].open=true;answers[7].open=true;const prior=allDetails.map(d=>d.open)
window.dispatchEvent({type:'beforeprint'});assert.ok(allDetails.every(d=>d.open));window.dispatchEvent({type:'afterprint'});assert.deepEqual(allDetails.map(d=>d.open),prior)
window.print=()=>{assert.ok(classes.has('exercise-print'));window.dispatchEvent({type:'beforeprint'});window.dispatchEvent({type:'afterprint'})}
nodes['print-questions'].dispatch('click');assert.ok(!classes.has('exercise-print'));assert.deepEqual(allDetails.map(d=>d.open),prior)
for(const withBefore of [false,true]){window.print=()=>{if(withBefore)window.dispatchEvent({type:'beforeprint'});throw Error('simulated print dispatch failure')};nodes['print-questions'].dispatch('click');assert.deepEqual(allDetails.map(d=>d.open),prior);assert.ok(!classes.has('exercise-print'))}
console.log('PASS strict authored ancestry, native disclosures, direct/section hashes, print fold and failed-dispatch restoration')

const reference=readFileSync(new URL('docs/public/demos/reset-runtime-reference.html',root),'utf8')
tree(reference)
// Inspect authored print hiding rules against actual question ancestry. This
// catches an earlier !important ancestor rule that later local CSS cannot undo.
function printHidingSelectors(page){
 const selectors=[]
 for(const style of page.matchAll(/<style>([\s\S]*?)<\/style>/g)){
  const css=style[1]
  for(const media of css.matchAll(/@media\s+print\s*\{/g)){
   const start=media.index+media[0].length;let end=start,depth=1
   while(end<css.length&&depth){if(css[end]==='{')depth++;if(css[end]==='}')depth--;end++}
   assert.equal(depth,0,'balanced authored print-media block')
   for(const rule of css.slice(start,end-1).matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    if(/(?:^|;)\s*display\s*:\s*none\b/.test(rule[2]))selectors.push(...rule[1].split(',').map(s=>s.trim()))
   }
  }
 }
 return selectors
}
function printCompoundMatches(node,selector){
 if(!node)return false
 const excluded=[...selector.matchAll(/:not\((#[\w-]+|\.[\w-]+)\)/g)].map(m=>m[1])
 const simple=selector.replace(/:not\((#[\w-]+|\.[\w-]+)\)/g,'')
 assert.match(simple,/^(?:[\w-]+)?(?:[.#][\w-]+)*$/,'supported authored hiding selector: '+selector)
 const type=simple.match(/^[\w-]+/)?.[0]
 if(type&&node.tag!==type)return false
 const classes=(node.attrs.class??'').split(/\s+/)
 if(node.tag==='body')classes.push('exercise-print')
 for(const part of simple.matchAll(/([.#])([\w-]+)/g))if(part[1]==='#'?node.attrs.id!==part[2]:!classes.includes(part[2]))return false
 return !excluded.some(s=>printCompoundMatches(node,s))
}
function printSelectorMatches(node,selector){
 const parts=selector.split(/\s*(>)\s*|\s+/).filter(Boolean)
 const walk=(current,index)=>{
  if(!printCompoundMatches(current,parts[index]))return false
  if(index===0)return true
  if(parts[index-1]==='>')return walk(current.parentElement,index-2)
  for(let parent=current.parentElement;parent;parent=parent.parentElement)if(walk(parent,index-1))return true
  return false
 }
 return walk(node,parts.length-1)
}
const hiding=printHidingSelectors(html)
for(let index=1;index<=10;index++){
 const question=nodes['runtime-question-'+String(index).padStart(2,'0')]
 for(let ancestor=question;ancestor;ancestor=ancestor.parentElement){
  for(const selector of hiding)assert.ok(!printSelectorMatches(ancestor,selector),'print rule hides worksheet question '+index+': '+selector)
 }
 const answer=nodes['runtime-answer-'+String(index).padStart(2,'0')]
 assert.ok(hiding.some(selector=>printSelectorMatches(answer,selector)),'worksheet excludes answer '+index)
}
for(const page of [html,reference])assert.ok(!page.includes('#fifo-practice'),'no inherited FIFO worksheet target in runtime reader CSS')
console.log('PASS authored print rules keep all ten question ancestries visible and hide every answer')
const base=readFileSync(new URL('docs/public/demos/bounded-fifo.html',root),'utf8')
const shared=s=>s.match(/<style>\s*\/\* Shared reading layer:[\s\S]*?<\/style>/)[0]
for(const page of [html,reference]){
 assert.equal(shared(page),shared(base),'exact accepted shared reading CSS')
 for(const id of ['note-deep-links','note-print'])assert.equal(page.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0],base.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0])
 assert.ok(page.includes('../learn/engineering-map.html#stage-02'));assert.ok(!page.includes('localStorage'));assert.ok(!page.includes('sessionStorage'))
 for(const name of ['runtime_image.h','runtime_image.c','README.txt']){
  const source=readFileSync(new URL('docs/public/examples/reset-runtime/'+name,root),'utf8')
  const shown=page.match(new RegExp('<pre data-source="'+name.replace('.','\\.')+'"><code>([\\s\\S]*?)<\\/code><\\/pre>'))
  assert.ok(shown,name);assert.equal(decode(shown[1]),source,'exact source display '+name)
  assert.ok(page.includes('href="../examples/reset-runtime/'+name+'" download'))
 }
}
for(const slug of ['reset-runtime','reset-runtime-reference']){
 const md=readFileSync(new URL('docs/learn/'+slug+'.md',root),'utf8'),page=slug==='reset-runtime'?html:reference
 const authored=tree(page)
 const nextLinks=authored.root.querySelectorAll('div').find(n=>n.attrs.class==='next-links')
 assert.ok(nextLinks,'actual course next-navigation group')
 const requiredLinks=['../learn/memory-budget.html','../learn/engineering-map.html#stage-02','../mcu/cortex-m-cpu-registers.html#stack-link-pc-title',...(slug==='reset-runtime'?['../learn/build-link-identity.html','../learn/reset-runtime-reference.html']:['../learn/reset-runtime.html'])]
 for(const href of requiredLinks){
  assert.ok(nextLinks.querySelectorAll('a').some(a=>a.attrs.href===href),'canonical sequence link in '+slug+': '+href)
  assert.ok(md.includes('href="'+href+'"'),'matching mirror sequence link in '+slug+': '+href)
 }
 for(const text of [page,md])assert.doesNotMatch(text,/后续单元08\/09的入口先回到阶段地图|避免链接尚未交付的阅读器|下一章与阶段02地图/,'no stale undelivered08/09 or map-only next claim')
 const mirrorHeadingIds=new Set(),narrative=md.replace(/```[\s\S]*?```/g,'')
 for(const tag of ['h1','h2','h3','h4','h5','h6']){
  for(const heading of authored.root.querySelectorAll(tag))assert.ok(heading.attrs.id,'explicit unique reader heading id: '+heading.textContent)
 }
 for(const heading of narrative.matchAll(/^(#{1,6})\s+(.+)$/gm)){
  const anchor=heading[2].match(/\{#([\w-]+)\}\s*$/)
  assert.ok(anchor,'explicit mirror narrative heading anchor: '+heading[2])
  assert.ok(!mirrorHeadingIds.has(anchor[1]),'unique mirror heading id: '+anchor[1]);mirrorHeadingIds.add(anchor[1])
  assert.ok(authored.nodes[anchor[1]],'mirror heading target exists in actual reader: '+anchor[1])
  assert.equal(authored.nodes[anchor[1]].tag,'h'+heading[1].length,'matching reader heading level')
 }
 for(const heading of narrative.matchAll(/<h([1-6])\b[^>]*\bid="([^"]+)"/g)){
  assert.ok(!mirrorHeadingIds.has(heading[2]),'unique raw mirror heading id: '+heading[2]);mirrorHeadingIds.add(heading[2])
  assert.equal(authored.nodes[heading[2]]?.tag,'h'+heading[1],'raw mirror heading target and level')
 }
 for(const n of ['runtime_image.h','runtime_image.c','README.txt']){const source=readFileSync(new URL('docs/public/examples/reset-runtime/'+n,root),'utf8');assert.ok(md.includes('```'+(n==='README.txt'?'text':'c')+'\n'+source+'```'));assert.ok(md.includes('href="../examples/reset-runtime/'+n+'" download'))}
 const {root:mirrorDom}=tree(page)
 const simple=s=>decode(s).replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]*>/g,'').replace(/[*`\s]/g,'')
 const searchable=simple(md.replace(/```[\s\S]*?```/g,''))
 for(const p of mirrorDom.querySelectorAll('p')){if(p.closest('form')||p.closest('header')||!p.textContent.trim()||p.closest('pre'))continue;if(p.attrs.id?.startsWith('runtime-')||p.attrs.id?.startsWith('trace-'))continue;const content=simple(p.textContent);assert.ok(searchable.includes(content),'full prose/answer/diagram mirror: '+content.slice(0,70))}
}
assert.ok(html.includes('body.exercise-print main>.content-section:not(#runtime-practice)'))
assert.ok(html.includes('body.exercise-print .exercise-answer'))
console.log('PASS references, full prose/answer/diagram/source mirrors, exact shared layers, native downloads and worksheet isolation')
