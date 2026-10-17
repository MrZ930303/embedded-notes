import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
const read = path => readFile(new URL('../'+path,import.meta.url),'utf8')
const html = await read('docs/public/demos/timer-pwm.html')
const script = id => {
  const match=html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))
  assert.ok(match,'Actual reader script '+id)
  if(process.env.TIMER_TEST_FAULT==='prediction'&&id==='timer-controller') {
    assert.ok(match[1].includes('if(!prediction)return;'))
    return match[1].replace('if(!prediction)return;','')
  }
  return match[1]
}
const context={}
vm.runInNewContext(script('timer-model')+';globalThis.model=TimerModel;',context)
const model=context.model, plain=v=>JSON.parse(JSON.stringify(v))
const seed={sourceHz:84000000,prescaler:83,autoReload:999,dutyBp:2500}
assert.deepEqual(plain(model.plan(seed)),{status:'OK',requested:seed,count:1000,compare:250,divisor:84000,errorNum:0,errorDen:10000000})
for(const [duty,compare,error] of [[5000,2,5000],[1000,0,-3000],[9000,3,3000]]){
 const p=model.plan({...seed,autoReload:2,dutyBp:duty});assert.equal(p.compare,compare);assert.equal(p.errorNum,error);assert.equal(p.errorDen,30000)
}
assert.equal(model.plan({...seed,prescaler:65535,autoReload:65535,dutyBp:0}).divisor,4294967296)
assert.equal(model.plan({...seed,autoReload:65534,dutyBp:10000}).compare,65535)
assert.equal(model.plan({...seed,autoReload:1,dutyBp:5000}).compare,1)
for(const [k,v,s] of [['sourceHz',0,'INVALID'],['sourceHz',84000001,'INVALID'],['prescaler',65536,'INVALID'],['autoReload',0,'INVALID'],['autoReload',65536,'INVALID'],['dutyBp',10001,'INVALID'],['autoReload',1.5,'INVALID']])assert.equal(model.plan({...seed,[k]:v}).status,s)
assert.equal(model.plan({...seed,autoReload:65535,dutyBp:10000}).status,'NOT_REPRESENTABLE')
let state=model.init(10,100).next
for(const [now,work,missed,remainder] of [[109,false,0,9],[110,true,0,0],[145,true,2,5],[145,false,0,5]]){
 const r=model.service(state,now);assert.equal(r.status,'OK');assert.equal(r.report.work,work);assert.equal(r.report.missed,missed);assert.equal(r.report.remainder,remainder);state=r.next
}
assert.equal(model.elapsed(4294967290,4).delta,10)
assert.equal(model.elapsed(0,2147483647).status,'OK');assert.equal(model.elapsed(0,2147483648).status,'GAP_REJECTED')
assert.equal(model.service({period:2147483647,lastObserved:2147483646,remainder:2147483646},4294967293).report.total,4294967293)
assert.equal(model.service({period:1,lastObserved:0,remainder:0},2147483647).report.missed,2147483646)
for(const period of [0,2147483648,NaN])assert.equal(model.init(period,0).status,'INVALID')
assert.equal(model.service({period:10,lastObserved:0,remainder:10},1).status,'BAD_STATE')
let trace=model.stage(model.begin(),{...seed,prescaler:167,autoReload:499,dutyBp:5000}).next
for(const [event,psc,arr,cnt] of [['PRELOAD_WAIT',83,999,500],['UDIS_UG_HOLD',83,999,0],['URS_UG_TRANSFER',167,499,0],['OVERFLOW_FINISH',167,499,0]]){
 const r=model.step(trace);trace=r.next;assert.equal(r.event,event);assert.deepEqual([trace.active.requested.prescaler,trace.active.requested.autoReload,trace.counter],[psc,arr,cnt])
}
assert.equal(trace.terminal,true);const saved=plain(trace);assert.equal(model.step(trace).status,'DONE');assert.deepEqual(plain(trace),saved)
console.log('PASS unit10 literal rational PWM, quantization, wide boundaries, finite preload and unsigned phase policy')
const decode=s=>s.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&#39;',"'").replaceAll('&amp;','&')
class Element {
  constructor(tag,attrs={}) {
    this.tagName=tag;this.attrs=attrs;this.children=[];this.parentElement=null;this.listeners={};this.value=attrs.value??'';
    this.disabled='disabled' in attrs;this.hidden='hidden' in attrs;this.open='open' in attrs;this.data='';this.classes=new Set((attrs.class??'').split(/\s+/).filter(Boolean));
    this.classList={add:c=>{this.classes.add(c);this.attrs.class=[...this.classes].join(' ')},remove:c=>{this.classes.delete(c);this.attrs.class=[...this.classes].join(' ')},contains:c=>this.classes.has(c)}
  }
  getAttribute(name){return name in this.attrs?this.attrs[name]:null}
  setAttribute(name,value){this.attrs[name]=String(value);if(name==='class')this.classes=new Set(String(value).split(/\s+/).filter(Boolean))}
  removeAttribute(name){delete this.attrs[name];if(name==='class')this.classes.clear()}
  get id(){return this.attrs.id}
  get textContent(){return this.data+this.children.map(c=>c.textContent).join('')}
  set textContent(value){this.data=String(value);this.children=[]}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn)}
  dispatch(name){for(const fn of this.listeners[name]??[])fn({preventDefault(){},target:this})}
  closest(tag){for(let e=this;e;e=e.parentElement)if(e.tagName===tag)return e;return null}
  querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tagName===tag?[c]:[]),...c.querySelectorAll(tag)])}
  scrollIntoView(){this.scrolled=true}
}
function parseTree(source) {
  const clean=source.replace(/<(script|style)\b([^>]*)>[\s\S]*?<\/\1>/g,'<$1$2></$1>')
  const root=new Element('document'), stack=[root], ids={}
  const voids=new Set(['meta','link','input','br','hr','img','area','base','col','embed','param','source','track','wbr'])
  for(const token of clean.matchAll(/<!--[^]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>|[^<]+/g)) {
    const text=token[0];if(text.startsWith('<!'))continue
    if(text.startsWith('</')) {
      const tag=text.slice(2,-1).trim().toLowerCase()
      assert.equal(stack.at(-1).tagName,tag,'Strict closing tag '+tag+' at '+token.index)
      stack.pop();continue
    }
    if(text.startsWith('<')) {
      const tag=text.match(/^<([\w-]+)/)[1].toLowerCase(), attrs={}
      for(const m of text.slice(tag.length+1).matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[m[1]]=decode(m[2]??'')
      const element=new Element(tag,attrs);element.parentElement=stack.at(-1);stack.at(-1).children.push(element)
      if(element.id){assert.ok(!ids[element.id],'Unique ID '+element.id);ids[element.id]=element}
      if(!voids.has(tag)&&!text.endsWith('/>'))stack.push(element)
    } else stack.at(-1).data+=decode(text)
  }
  assert.equal(stack.length,1,'All tags close in exact stack order')
  for(const select of root.querySelectorAll('select')) select.value=select.children.find(c=>c.tagName==='option')?.value??''
  return {root,ids}
}

assert.throws(()=>parseTree('<main><div><p>x</div></p></main>'),'Strict parser must reject repair')
for(const slug of ['timer-pwm','timer-pwm-reference']){
 const source=await read('docs/public/demos/'+slug+'.html'),tree=parseTree(source),mirror=await read('docs/learn/'+slug+'.md')
 assert.equal(tree.root.querySelectorAll('main').length,1)
 const h=tree.root.querySelectorAll('h1');assert.equal(h.length,1)
 const mh=mirror.match(/^# (.+) \{#([^}]+)\}$/m);assert.ok(mh);assert.equal(h[0].id,mh[2]);assert.equal(h[0].textContent,mh[1])
 for(const h2 of tree.root.querySelectorAll('h2')){assert.equal(h2.parentElement.parentElement.tagName,'main');assert.equal(h2.parentElement.attrs['aria-labelledby'],h2.id);assert.ok(mirror.includes('{#'+h2.id+'}'))}
 for(const a of tree.root.querySelectorAll('a'))if(a.attrs.href?.startsWith('#'))assert.ok(tree.ids[a.attrs.href.slice(1)],'actual hash '+a.attrs.href)
 const accepted=await read('docs/public/demos/bounded-fifo.html')
 const localStyles=source.match(/<style>[\s\S]*?<\/style>/g).filter(css=>!css.includes('Shared reading layer:'))
 for(const css of localStyles){
  assert.ok(!css.includes('#clock-practice'),'No copied clock practice target in timer local print rules '+slug)
  for(const match of css.matchAll(/body\.exercise-print main>\.content-section:not\(#([^)]+)\)/g))assert.equal(match[1],'timer-practice','Actual worksheet exclusion target '+slug)
 }
 const header=source.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1]
 assert.ok(header,'Actual existing topbar contract '+slug)
 for(const href of ['../','../learn/','../?search=1'])assert.ok(header.includes('href="'+href+'"'),'Existing hub href '+slug+': '+href)
 for(const label of ['嵌入式技术笔记','返回分类','交互实验','完整笔记','搜索笔记'])assert.ok(header.includes(label),'Existing navigation label '+slug+': '+label)
 assert.equal((header.match(/<nav /g)||[]).length,1)
 assert.ok(source.includes('<body class="notes-article">'),'Existing reader body class contract '+slug)
 assert.equal(source.match(/<style>([\s\S]*?)<\/style>/g)[1],accepted.match(/<style>([\s\S]*?)<\/style>/g)[1])
 for(const id of ['note-deep-links','note-print'])assert.equal(source.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0],accepted.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0])
 const blocks=[...source.matchAll(/<code class="language-text">([\s\S]*?)<\/code>/g)].map(m=>decode(m[1]))
 for(const [i,name] of ['timer.h','timer.c','time.h','time.c','README.txt'].entries()){
  const code=await read('docs/public/examples/timer-pwm/'+name);assert.equal(blocks[i],code)
  assert.ok(mirror.includes('```text\n'+code+'```'),'full mirror source '+name)
  const a=tree.root.querySelectorAll('a').find(e=>e.attrs.href==='../examples/timer-pwm/'+name)
  assert.ok(a&&'download' in a.attrs);assert.ok(mirror.includes('<a href="../examples/timer-pwm/'+name+'" download>'))
 }
}
const tree=parseTree(html),{ids}=tree
assert.equal(tree.root.querySelectorAll('article').filter(e=>e.classes.has('exercise')).length,10)
for(let i=1;i<=10;i++){const n=String(i).padStart(2,'0');assert.equal(ids['timer-answer-'+n].open,false);assert.equal(ids['timer-answer-'+n].parentElement,ids['timer-exercise-'+n])}
const windowListeners={},window={location:{hash:''},addEventListener:(n,f)=>(windowListeners[n]??=[]).push(f),dispatchEvent:e=>{for(const f of windowListeners[e.type]??[])f()},print:()=>{}}
const document={body:tree.root.querySelectorAll('body')[0],getElementById:id=>{assert.ok(ids[id],'Real DOM '+id);return ids[id]},querySelectorAll:tag=>tree.root.querySelectorAll(tag)}
Object.assign(context,{window,document,requestAnimationFrame:f=>f(),Event:class{constructor(type){this.type=type}}})
vm.runInNewContext(script('timer-controller'),context)
const predict=(p,v)=>{ids[p+'-prediction'].value=v;ids[p+'-prediction'].dispatch('change')}
const submit=p=>ids[p+'-form'].dispatch('submit')
const edit=(id,v)=>{ids[id].value=String(v);ids[id].dispatch('input')}
for(const p of ['pwm','update','time']){assert.equal(ids[p+'-apply'].disabled,true);submit(p);assert.equal(ids[p+'-result'].hidden,true,'prediction required at actual handler '+p)}
predict('pwm','OK');submit('pwm');assert.match(ids['pwm-feedback'].textContent,/预测正确/);assert.match(ids['pwm-state'].textContent,/CCR=250.*achieved=250\/1000/)
const accepted=ids['pwm-state'].textContent
predict('pwm','OK');edit('pwm-arr',0);assert.equal(ids['pwm-prediction'].value,'');submit('pwm');assert.equal(ids['pwm-state'].textContent,accepted)
predict('pwm','OK');submit('pwm');assert.match(ids['pwm-feedback'].textContent,/预测不同.*INVALID.*ARR0/);assert.equal(ids['pwm-state'].textContent,accepted)
for(const invalid of ['', '-1','1.5','NaN','Infinity','0x10','1e2','9007199254740992']){
 edit('pwm-source',invalid);predict('pwm','OK');submit('pwm');assert.match(ids['pwm-feedback'].textContent,/INVALID/);assert.equal(ids['pwm-state'].textContent,accepted)
}
ids['pwm-reset'].dispatch('click');assert.equal(ids['pwm-result'].hidden,true);edit('pwm-arr',65535);edit('pwm-duty',10000);predict('pwm','NOT_REPRESENTABLE');submit('pwm');assert.match(ids['pwm-feedback'].textContent,/CCR65536.*16位65535/);assert.equal(ids['pwm-result'].hidden,true)
ids['pwm-reset'].dispatch('click');edit('pwm-arr',2);edit('pwm-duty',5000);predict('pwm','OK');submit('pwm');assert.match(ids['pwm-state'].textContent,/CCR=2.*achieved=2\/3.*error=5000\/30000/)
for(const prediction of ['hold','hold','transfer','finish']){predict('update',prediction);submit('update');assert.match(ids['update-feedback'].textContent,/预测正确/);assert.equal(ids['update-prediction'].value,'')}
assert.match(ids['update-state'].textContent,/OVERFLOW_FINISH.*terminal=true/)
const end=ids['update-state'].textContent;predict('update','finish');assert.equal(ids['update-apply'].disabled,true);submit('update');assert.equal(ids['update-state'].textContent,end)
edit('update-arr',0);predict('update','hold');submit('update');assert.match(ids['update-feedback'].textContent,/预测不同.*INVALID/);assert.equal(ids['update-state'].textContent,end)
ids['update-reset'].dispatch('click');assert.equal(ids['update-result'].hidden,true);predict('update','transfer');submit('update');assert.match(ids['update-feedback'].textContent,/预测不同.*PRELOAD_WAIT.*未发生更新/)
for(const [now,pred,work,missed,rem] of [[109,'nowork',false,0,9],[110,'work',true,0,0],[145,'work',true,2,5],[145,'nowork',false,0,5]]){
 edit('time-now',now);predict('time',pred);submit('time');assert.match(ids['time-feedback'].textContent,/预测正确/);assert.match(ids['time-state'].textContent,new RegExp('work='+work+'，missed='+missed+'，remainder='+rem))
}
const last=ids['time-state'].textContent
edit('time-now',2147483793);predict('time','reject');submit('time');assert.match(ids['time-feedback'].textContent,/GAP_REJECTED.*真实观察间隔/);assert.equal(ids['time-state'].textContent,last)
for(const id of ['time-period','time-start','time-now']){
 for(const value of ['', '0.5','NaN','Infinity','-1','4294967296']){
  ids['time-reset'].dispatch('click');edit(id,value);predict('time','reject');submit('time');assert.equal(ids['time-result'].hidden,true);assert.match(ids['time-feedback'].textContent,/INVALID/)
 }
}
ids['time-reset'].dispatch('click');edit('time-start',4294967290);edit('time-now',4);predict('time','work');submit('time');assert.match(ids['time-state'].textContent,/delta=10.*work=true.*remainder=0/)
console.log('PASS unit10 actual handlers: prediction/consume/wrong/edit-pending/invalid-preservation/reset/terminal')
for(const id of ['timer-reader','timer-worksheet','note-deep-links','note-print'])vm.runInNewContext(script(id),context)
const folds=()=>tree.root.querySelectorAll('details').map(e=>[e,e.open])
window.location.hash='#timer-practice';window.dispatchEvent({type:'hashchange'});assert.ok(folds().every(([,v])=>!v))
window.location.hash='#timer-answer-03';window.dispatchEvent({type:'hashchange'});assert.equal(ids['timer-answer-03'].open,true);assert.equal(ids['timer-answer-04'].open,false)
const before=folds();window.dispatchEvent({type:'beforeprint'});assert.ok(folds().every(([,v])=>v));window.dispatchEvent({type:'afterprint'});assert.deepEqual(folds(),before)
for(const beforeClass of [null,'','reader custom-class','reader exercise-print custom-class']){
 if(beforeClass===null)document.body.removeAttribute('class');else document.body.setAttribute('class',beforeClass)
 for(const dispatchBefore of [false,true]){
  window.print=()=>{if(dispatchBefore)window.dispatchEvent({type:'beforeprint'});throw Error('injected print failure')};ids['print-questions'].dispatch('click');assert.deepEqual(folds(),before);assert.equal(document.body.getAttribute('class'),beforeClass)
 }
 window.print=()=>{window.dispatchEvent({type:'beforeprint'});assert.equal(document.body.classList.contains('exercise-print'),true);window.dispatchEvent({type:'afterprint'})};ids['print-questions'].dispatch('click');assert.deepEqual(folds(),before);assert.equal(document.body.getAttribute('class'),beforeClass)
}
document.body.removeAttribute('class')
ids['collapse-notes'].dispatch('click');assert.ok(folds().every(([,v])=>!v));ids['expand-notes'].dispatch('click');assert.ok(folds().every(([,v])=>v))
console.log('PASS unit10 strict HTML, protected layers, complete source/mirrors, ten native answers, print/failure restore')
for(const slug of ['timer-pwm','timer-pwm-reference']){
 const source=await read('docs/public/demos/'+slug+'.html'), t=parseTree(source), listeners={}
 const d={body:t.root.querySelectorAll('body')[0],getElementById:id=>t.ids[id],querySelectorAll:tag=>t.root.querySelectorAll(tag)}
 assert.ok(t.ids['print-all'],'Actual ordinary-print button on '+slug)
 const w={addEventListener:(n,f)=>(listeners[n]??=[]).push(f),dispatchEvent:e=>{for(const f of listeners[e.type]??[])f()},print:()=>{}}
 const c={document:d,window:w,Event:class{constructor(type){this.type=type}}}
 for(const id of ['timer-ordinary-print','note-print']){
  const code=source.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'));assert.ok(code)
  vm.runInNewContext(code[1],c)
 }
 const panels=t.root.querySelectorAll('details');panels.forEach((p,i)=>{p.open=i%2===1})
 const snapshot=()=>panels.map(p=>p.open), original=snapshot()
 for(const priorClass of [null,'','reader custom-class','reader exercise-print custom-class']){
  if(priorClass===null)d.body.removeAttribute('class');else d.body.setAttribute('class',priorClass)
  w.print=()=>{w.dispatchEvent({type:'beforeprint'});assert.ok(panels.every(p=>p.open));assert.equal(d.body.classList.contains('exercise-print'),false);w.dispatchEvent({type:'afterprint'})}
  t.ids['print-all'].dispatch('click');assert.deepEqual(snapshot(),original);assert.equal(d.body.getAttribute('class'),priorClass)
  for(const dispatchBefore of [false,true]){
   w.print=()=>{if(dispatchBefore)w.dispatchEvent({type:'beforeprint'});throw Error('ordinary dispatch fault')}
   t.ids['print-all'].dispatch('click');assert.deepEqual(snapshot(),original);assert.equal(d.body.getAttribute('class'),priorClass)
  }
 }
 assert.ok((await read('docs/learn/'+slug+'.md')).includes('正常结束或打印调度失败都会恢复此前折叠状态与临时模式'))
}
console.log('PASS unit10 both ordinary-print actions restore exact folds after success and dispatch exceptions with/without beforeprint')
