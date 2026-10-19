import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const html=await read('docs/public/demos/bus-transactions.html');
const accepted=await read('docs/public/demos/bounded-fifo.html');
const script=id=>{const m=html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'));assert.ok(m,'Actual script '+id);return m[1];};
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

const plain=v=>JSON.parse(JSON.stringify(v));
const context={};vm.runInNewContext(script('bus-model')+';globalThis.M=BusModel;',context);const M=context.M;
const q={protocol:'i2c',address7:24,reg:15},ok={kind:'OK',received:51};
let s=M.start(M.init(),q,0).next;
const expected=['WAIT_FREE','START','ADDRESS_WRITE','SUBADDRESS','RESTART','ADDRESS_READ','DATA','FINAL_NACK','STOP'];
for(let i=0;i<9;i++){
 const r=M.poll(s,i,ok);assert.equal(r.call,'OK');assert.equal(r.report.phase,expected[i]);assert.equal(r.report.newResult,i===8);assert.equal(r.report.candidatePresent,i>=6);s=r.next;
 if(i<8)assert.equal(r.report.resultPresent,false);else assert.equal(r.report.result,51);
}
assert.equal(s.status,'READY');assert.equal(s.resource,'RELEASED');const end=plain(s);assert.equal(M.poll(s,8,ok).report.action,false);assert.deepEqual(plain(s),end);
assert.equal(M.start(s,{...q,address7:48},9).call,'INVALID_ARGUMENT');assert.deepEqual(plain(s),end);
s=M.start(s,q,9).next;assert.equal(M.start(s,q,9).call,'BUSY');
for(let i=0;i<3;i++)s=M.poll(s,9+i,ok).next;
let r=M.poll(s,12,{kind:'NACK',received:0});assert.equal(r.report.cause,'DATA_NACK');assert.equal(r.report.failurePhase,'SUBADDRESS');assert.equal(r.report.nextPhase,'ERROR_STOP');assert.equal(r.report.result,51);s=r.next;
r=M.poll(s,29,ok);assert.equal(r.report.cause,'DATA_NACK');assert.equal(r.report.policyCause,'TIMEOUT');assert.equal(r.report.failurePhase,'SUBADDRESS');assert.equal(r.report.resource,'UNKNOWN');assert.equal(r.report.action,false);assert.equal(r.report.result,51);assert.equal(M.start(r.next,q,29).call,'BUSY');
for(const phase of [2,3,5]){
 s=M.start(M.init(),q,0).next;for(let i=0;i<phase;i++)s=M.poll(s,i,ok).next;
 r=M.poll(s,phase,{kind:'NACK',received:0});assert.equal(r.report.cause,phase===3?'DATA_NACK':'ADDRESS_NACK');assert.equal(r.report.resource,'OWNED');
 r=M.poll(r.next,phase+1,ok);assert.equal(r.report.status,'FAILED');assert.equal(r.report.resource,'RELEASED');assert.equal(r.report.newResult,false);
}
s=M.start(M.init(),q,0).next;for(let i=0;i<2;i++)s=M.poll(s,i,ok).next;
r=M.poll(s,2,{kind:'ARLO',received:0});assert.equal(r.report.resource,'LOST');assert.equal(r.report.nextPhase,'DONE');assert.equal(r.report.transmitted,false);assert.equal(M.poll(r.next,3,ok).report.action,false);assert.equal(M.start(r.next,q,3).next.phase,'WAIT_FREE');
s=M.start(M.init(),{...q,protocol:'spi'},0).next;
for(const [i,received,phase,tx] of [[0,0,'SELECT',null],[1,126,'COMMAND',143],[2,51,'SPI_DATA',0],[3,0,'DESELECT',null]]){
 r=M.poll(s,i,{kind:'OK',received});assert.equal(r.report.phase,phase);assert.equal(r.report.resource,i===3?'RELEASED':'OWNED');if(tx!==null)assert.equal(r.report.tx,tx);
 assert.equal(r.report.discarded,i===1);assert.equal(r.report.candidatePresent,i>=2);assert.equal(r.report.newResult,i===3);s=r.next;
}
s=M.start(M.init(),q,100).next;r=M.poll(s,119,{kind:'WAIT',received:0});assert.equal(r.report.status,'PENDING');assert.equal(r.report.elapsed,19);r=M.poll(r.next,120,ok);assert.equal(r.report.status,'FAILED');assert.equal(r.report.action,false);
s=M.start(M.init(),q,4294967290).next;for(let i=0;i<9;i++)s=M.poll(s,(4294967290+i)%4294967296,ok).next;assert.equal(s.elapsed,8);assert.equal(s.status,'READY');
s=M.start(M.init(),q,0).next;const before=plain(s);assert.equal(M.poll(s,2147483648,ok).call,'TIME_REJECTED');assert.deepEqual(plain(s),before);assert.equal(M.poll(s,0,{kind:'NACK',received:0}).call,'INVALID_ARGUMENT');
console.log('PASS unit12 independent literal phase/byte/ownership/deadline/wrap model fixtures');

for(const slug of ['bus-transactions','bus-transactions-reference']){
 const source=await read('docs/public/demos/'+slug+'.html'),tree=parseTree(source),mirror=await read('docs/learn/'+slug+'.md');
 assert.equal(tree.root.querySelectorAll('main').length,1);assert.equal(tree.root.querySelectorAll('h1').length,1);
 assert.equal(source.match(/<style>[\s\S]*?<\/style>/g)[1],accepted.match(/<style>[\s\S]*?<\/style>/g)[1]);
 for(const id of ['note-deep-links','note-print'])assert.equal(source.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0],accepted.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0]);
 for(const h of tree.root.querySelectorAll('h2')){assert.equal(h.parentElement.parentElement.tagName,'main');assert.ok(mirror.includes('{#'+h.id+'}'));}
 for(const a of tree.root.querySelectorAll('a'))if(a.attrs.href?.startsWith('#'))assert.ok(tree.ids[a.attrs.href.slice(1)]);
 const header=source.match(/<header class="topbar">[\s\S]*?<\/header>/)[0];for(const text of ['../','../learn/','../?search=1','返回分类','交互实验','完整笔记','搜索笔记'])assert.ok(header.includes(text));
 assert.ok(source.includes('<body class="notes-article">'));
 for(const css of source.match(/<style>[\s\S]*?<\/style>/g).filter(v=>!v.includes('Shared reading layer:')))assert.ok(!css.includes('#clock-practice'));
}
const code=[...html.matchAll(/<code class="language-text">([\s\S]*?)<\/code>/g)].map(m=>decode(m[1]));
const inventory=[['bus-transactions','bus.h'],['bus-transactions','bus.c'],['bus-transactions','README.txt'],['timer-pwm','time.h'],['timer-pwm','time.c']];
const mirror=await read('docs/learn/bus-transactions.md');
for(const [i,[folder,name]] of inventory.entries()){const text=await read('docs/public/examples/'+folder+'/'+name);assert.equal(code[i],text);assert.ok(mirror.includes('```text\n'+text+'```'));for(const slug of ['bus-transactions','bus-transactions-reference'])assert.ok((await read('docs/public/demos/'+slug+'.html')).includes('href="../examples/'+folder+'/'+name+'" download'));}
const tree=parseTree(html),{ids}=tree;assert.equal(tree.root.querySelectorAll('article').filter(e=>e.classes.has('exercise')).length,10);
for(let i=1;i<=10;i++){const n=String(i).padStart(2,'0');assert.equal(ids['bus-answer-'+n].open,false);assert.equal(ids['bus-answer-'+n].parentElement,ids['bus-exercise-'+n]);}
const listeners={},window={location:{hash:''},addEventListener:(n,f)=>(listeners[n]??=[]).push(f),dispatchEvent:e=>{for(const f of listeners[e.type]??[])f()},print:()=>{}};
const document={body:tree.root.querySelectorAll('body')[0],getElementById:id=>{assert.ok(ids[id],id);return ids[id]},querySelectorAll:tag=>tree.root.querySelectorAll(tag)};
Object.assign(context,{window,document,requestAnimationFrame:f=>f(),Event:class{constructor(type){this.type=type}}});
vm.runInNewContext(script('bus-controller'),context);
const submit=p=>ids[p+'-form'].dispatch('submit'),edit=(id,v)=>{ids[id].value=String(v);ids[id].dispatch('input');},predict=(p,v)=>{ids[p+'-prediction'].value=v;ids[p+'-prediction'].dispatch(p==='command'?'input':'change');};
for(const p of ['address','command','trace']){assert.equal(ids[p+'-apply'].disabled,true);submit(p);assert.equal(ids[p+'-result'].hidden,true);}
predict('address','MATCH');submit('address');assert.match(ids['address-feedback'].textContent,/预测正确/);assert.match(ids['address-state'].textContent,/address7=24.*0x30.*0x31/);assert.equal(ids['address-prediction'].value,'');
const old=ids['address-state'].textContent;predict('address','MATCH');edit('address-input',48);assert.equal(ids['address-prediction'].value,'');assert.match(ids['address-pending'].textContent,/待应用.*旧结果/);assert.equal(ids['address-state'].textContent,old);
predict('address','MATCH');submit('address');assert.match(ids['address-feedback'].textContent,/预测需修正.*合法7位.*禁止猜/);
const acceptedAddress=ids['address-state'].textContent;
for(const value of ['', '-1','1.5','NaN','Infinity','128','0x18','1e2']){edit('address-input',value);predict('address','INVALID');submit('address');assert.equal(ids['address-state'].textContent,acceptedAddress);assert.match(ids['address-feedback'].textContent,/拒绝.*下一步/);}
predict('command','143');submit('command');assert.match(ids['command-feedback'].textContent,/预测正确.*128.*15.*143/);assert.match(ids['command-state'].textContent,/0x8F/);const command=ids['command-state'].textContent;
edit('command-input',64);predict('command','143');submit('command');assert.equal(ids['command-state'].textContent,command);assert.match(ids['command-feedback'].textContent,/旧接受行.*下一步/);
ids['command-reset'].dispatch('click');predict('command','128');submit('command');assert.match(ids['command-feedback'].textContent,/预测需修正/);
for(const [name,statuses] of [['i2c',['PENDING','PENDING','PENDING','PENDING','PENDING','PENDING','PENDING','PENDING','READY']],['spi',['PENDING','PENDING','PENDING','READY']],['nack',['PENDING','PENDING','PENDING','PENDING','FAILED']],['arlo',['PENDING','PENDING','FAILED']],['timeout',['PENDING','FAILED']]]){
 edit('trace-input',name);for(const status of statuses){predict('trace',status);submit('trace');assert.match(ids['trace-feedback'].textContent,/预测正确.*下一步/);assert.equal(ids['trace-prediction'].value,'');}
 const terminal=ids['trace-state'].textContent;predict('trace','PENDING');assert.equal(ids['trace-apply'].disabled,true);submit('trace');assert.equal(ids['trace-state'].textContent,terminal);
}
for(const p of ['address','command','trace']){ids[p+'-reset'].dispatch('click');assert.equal(ids[p+'-result'].hidden,true);assert.equal(ids[p+'-prediction'].value,'');assert.match(ids[p+'-feedback'].textContent,/尚未应用/);}
console.log('PASS unit12 actual controller prediction/consume/causal-wrong/reject/edit/reset/finite-end');
for(const id of ['bus-reader','bus-worksheet','bus-ordinary-print','note-deep-links','note-print'])vm.runInNewContext(script(id),context);
const folds=()=>document.querySelectorAll('details').map(p=>[p,p.open]);
window.location.hash='#bus-practice';window.dispatchEvent({type:'hashchange'});assert.ok(folds().every(([,o])=>!o));window.location.hash='#bus-answer-03';window.dispatchEvent({type:'hashchange'});assert.equal(ids['bus-answer-03'].open,true);assert.equal(ids['bus-answer-04'].open,false);
const original=folds();
for(const cls of [null,'','notes-article custom','notes-article exercise-print custom'])for(const id of ['print-all','print-questions']){
 if(cls===null)document.body.removeAttribute('class');else document.body.setAttribute('class',cls);
 for(const before of [false,true]){window.print=()=>{if(before)window.dispatchEvent({type:'beforeprint'});throw Error('injected');};ids[id].dispatch('click');assert.deepEqual(folds(),original);assert.equal(document.body.getAttribute('class'),cls);}
 window.print=()=>{window.dispatchEvent({type:'beforeprint'});assert.ok(folds().every(([,o])=>o));assert.equal(document.body.classList.contains('exercise-print'),id==='print-questions');window.dispatchEvent({type:'afterprint'});};ids[id].dispatch('click');assert.deepEqual(folds(),original);assert.equal(document.body.getAttribute('class'),cls);
}
console.log('PASS unit12 protected shared blocks, strict native folds, ten questions, exact print restore including both dispatch faults');
for(const slug of ['bus-transactions','bus-transactions-reference']){
 const source=await read('docs/public/demos/'+slug+'.html'),t=parseTree(source),events={};
 const d={body:t.root.querySelectorAll('body')[0],getElementById:id=>t.ids[id],querySelectorAll:tag=>t.root.querySelectorAll(tag)};
 const w={addEventListener:(n,f)=>(events[n]??=[]).push(f),dispatchEvent:e=>{for(const f of events[e.type]??[])f()},print:()=>{}};
 const c={document:d,window:w,Event:class{constructor(type){this.type=type}}};
 for(const id of ['bus-ordinary-print','note-print'])vm.runInNewContext(source.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))[1],c);
 const panels=d.querySelectorAll('details');panels.forEach((p,i)=>p.open=i%2===0);const initial=panels.map(p=>p.open);
 for(const cls of [null,'','notes-article custom','notes-article exercise-print custom']){
  if(cls===null)d.body.removeAttribute('class');else d.body.setAttribute('class',cls);
  for(const trigger of [false,true]){
   w.print=()=>{if(trigger)w.dispatchEvent({type:'beforeprint'});throw Error('ordinary dispatch failure');};t.ids['print-all'].dispatch('click');assert.deepEqual(panels.map(p=>p.open),initial);assert.equal(d.body.getAttribute('class'),cls);
  }
  w.print=()=>{w.dispatchEvent({type:'beforeprint'});assert.ok(panels.every(p=>p.open));assert.equal(d.body.classList.contains('exercise-print'),false);w.dispatchEvent({type:'afterprint'});};t.ids['print-all'].dispatch('click');assert.deepEqual(panels.map(p=>p.open),initial);assert.equal(d.body.getAttribute('class'),cls);
 }
}
console.log('PASS unit12 both readers ordinary-print exact class/fold restoration');

const consumerSource="#include \"bus.h\"\n#include \"bus.h\"\n#include \"time.h\"\n#include \"time.h\"\n#include <stdio.h>\n#define CHECK(c) do { if (!(c)) { return __LINE__; } } while (0)\n\nstatic int boundaries(void)\n{\n    BusState s;\n    BusState saved;\n    BusRequest q = {BUS_SPI, 0x18U, 0x0FU};\n    BusEvent e = {BUS_EVENT_OK, 0x7EU};\n    BusReport r = {0};\n    CHECK(bus_init(&s) == BUS_OK);\n    CHECK(bus_start(&s, &q, 100U) == BUS_OK);\n    q.protocol = BUS_I2C;\n    CHECK(bus_poll(&s, 100U, &e, &r) == BUS_OK && r.phase == BUS_SELECT && r.resource == BUS_OWNED);\n    CHECK(bus_poll(&s, 101U, &e, &r) == BUS_OK && r.tx == 0x8FU && r.discarded && !r.candidatePresent);\n    e.received = 0x33U;\n    CHECK(bus_poll(&s, 102U, &e, &r) == BUS_OK && r.tx == 0U && r.candidate == 0x33U && !r.newResult);\n    CHECK(bus_poll(&s, 103U, &e, &r) == BUS_OK && r.status == BUS_READY && r.newResult && r.identityMatches);\n    CHECK(bus_start(&s, &q, 104U) == BUS_OK);\n    saved = s;\n    q.address7 = 0x30U;\n    CHECK(bus_start(&s, &q, 104U) == BUS_INVALID_ARGUMENT && s.phase == saved.phase && s.result == 0x33U);\n    q.address7 = 0x18U;\n    CHECK(bus_start(&s, &q, 104U) == BUS_BUSY && s.phase == saved.phase);\n    CHECK(bus_poll(&s, UINT32_C(2147483752), &e, &r) == BUS_TIME_REJECTED && s.lastObserved == 104U);\n    CHECK(bus_poll(&s, 104U, &e, &r) == BUS_OK);\n    CHECK(bus_poll(&s, 104U, &e, &r) == BUS_OK);\n    e.kind = BUS_EVENT_ARLO;\n    CHECK(bus_poll(&s, 104U, &e, &r) == BUS_OK && r.cause == BUS_ARLO && r.resource == BUS_LOST);\n    CHECK(r.nextPhase == BUS_DONE && r.result == 0x33U && !r.transmitted && !r.newResult);\n    e.kind = BUS_EVENT_OK;\n    CHECK(bus_poll(&s, 104U, &e, &r) == BUS_OK && !r.action && r.phase == BUS_DONE);\n    CHECK(bus_start(&s, &q, 105U) == BUS_OK && s.phase == BUS_WAIT_FREE);\n    CHECK(bus_poll(&s, 105U, &e, &r) == BUS_OK);\n    CHECK(bus_poll(&s, 105U, &e, &r) == BUS_OK);\n    CHECK(bus_poll(&s, 105U, &e, &r) == BUS_OK);\n    e.kind = BUS_EVENT_NACK;\n    CHECK(bus_poll(&s, 106U, &e, &r) == BUS_OK && r.cause == BUS_DATA_NACK && r.failurePhase == BUS_SUBADDRESS);\n    e.kind = BUS_EVENT_OK;\n    CHECK(bus_poll(&s, 125U, &e, &r) == BUS_OK && r.policyCause == BUS_TIMEOUT && r.cause == BUS_DATA_NACK);\n    CHECK(r.status == BUS_FAILED && r.resource == BUS_UNKNOWN && !r.action && r.result == 0x33U);\n    CHECK(bus_start(&s, &q, 125U) == BUS_BUSY);\n    return 0;\n}\n\nstatic int deadlines(void)\n{\n    BusState s;\n    BusState wrapState;\n    BusRequest q = {BUS_I2C, 0x18U, 0x0FU};\n    BusEvent e = {BUS_EVENT_OK, 0x33U};\n    BusReport r;\n    unsigned int i;\n    CHECK(bus_init(&s) == BUS_OK);\n    CHECK(bus_start(&s, &q, 100U) == BUS_OK);\n    for (i = 0U; i < 8U; i++) {\n        CHECK(bus_poll(&s, 100U, &e, &r) == BUS_OK);\n    }\n    CHECK(r.candidatePresent && !r.resultPresent && r.nextPhase == BUS_STOP);\n    e.kind = BUS_EVENT_WAIT;\n    CHECK(bus_poll(&s, 119U, &e, &r) == BUS_OK && r.status == BUS_PENDING && r.elapsed == 19U);\n    e.kind = BUS_EVENT_OK;\n    CHECK(bus_poll(&s, 120U, &e, &r) == BUS_OK && r.status == BUS_FAILED && !r.action && r.policyCause == BUS_TIMEOUT);\n    CHECK(r.failurePhase == BUS_STOP && !r.resultPresent);\n    CHECK(bus_init(&wrapState) == BUS_OK);\n    CHECK(bus_start(&wrapState, &q, UINT32_C(4294967290)) == BUS_OK);\n    for (i = 0U; i < 9U; i++) {\n        CHECK(bus_poll(&wrapState, (uint32_t)(UINT32_C(4294967290) + i), &e, &r) == BUS_OK);\n    }\n    CHECK(r.status == BUS_READY && r.elapsed == 8U && r.result == 0x33U);\n    CHECK(bus_start(&wrapState, &q, 3U) == BUS_OK);\n    e.kind = BUS_EVENT_STUCK;\n    CHECK(bus_poll(&wrapState, 3U, &e, &r) == BUS_OK && r.cause == BUS_STUCK && r.resource == BUS_UNKNOWN);\n    return 0;\n}\nstatic bool same_state(BusState a, BusState b)\n{\n    return a.initialized == b.initialized &&\n        a.request.protocol == b.request.protocol &&\n        a.request.address7 == b.request.address7 &&\n        a.request.reg == b.request.reg &&\n        a.status == b.status &&\n        a.phase == b.phase &&\n        a.cause == b.cause &&\n        a.policyCause == b.policyCause &&\n        a.failurePhase == b.failurePhase &&\n        a.resource == b.resource &&\n        a.lastObserved == b.lastObserved &&\n        a.elapsed == b.elapsed &&\n        a.candidatePresent == b.candidatePresent &&\n        a.candidate == b.candidate &&\n        a.resultPresent == b.resultPresent &&\n        a.result == b.result;\n}\n\nstatic bool same_report(BusReport a, BusReport b)\n{\n    return a.status == b.status &&\n        a.phase == b.phase &&\n        a.nextPhase == b.nextPhase &&\n        a.cause == b.cause &&\n        a.policyCause == b.policyCause &&\n        a.failurePhase == b.failurePhase &&\n        a.resource == b.resource &&\n        a.elapsed == b.elapsed &&\n        a.action == b.action &&\n        a.transmitted == b.transmitted &&\n        a.tx == b.tx &&\n        a.discarded == b.discarded &&\n        a.candidatePresent == b.candidatePresent &&\n        a.candidate == b.candidate &&\n        a.resultPresent == b.resultPresent &&\n        a.result == b.result &&\n        a.newResult == b.newResult &&\n        a.identityMatches == b.identityMatches;\n}\n\nstatic int preserve(void)\n{\n    BusState s;\n    BusState saved;\n    BusRequest q = {BUS_I2C, 0x18U, 0x0FU};\n    BusEvent e = {BUS_EVENT_OK, 0x33U};\n    BusReport r = {0};\n    BusReport old;\n    CHECK(bus_init(&s) == BUS_OK && bus_start(&s, &q, 100U) == BUS_OK);\n    CHECK(bus_poll(&s, 100U, &e, &r) == BUS_OK);\n    saved = s;\n    old = r;\n    CHECK(bus_poll(&s, UINT32_C(2147483748), &e, &r) == BUS_TIME_REJECTED);\n    CHECK(same_state(s, saved) && same_report(r, old));\n    e.kind = BUS_EVENT_NACK;\n    CHECK(bus_poll(&s, 100U, &e, &r) == BUS_INVALID_ARGUMENT);\n    CHECK(same_state(s, saved) && same_report(r, old));\n    CHECK(bus_poll(&s, 100U, &e, NULL) == BUS_INVALID_ARGUMENT && same_state(s, saved));\n    q.address7 = 0x30U;\n    CHECK(bus_start(&s, &q, 100U) == BUS_INVALID_ARGUMENT && same_state(s, saved));\n    q.address7 = 0x18U;\n    CHECK(bus_start(&s, &q, 100U) == BUS_BUSY && same_state(s, saved));\n    s.elapsed = 21U;\n    saved = s;\n    CHECK(bus_poll(&s, 100U, &e, &r) == BUS_BAD_STATE);\n    CHECK(same_state(s, saved) && same_report(r, old));\n    return 0;\n}\nstatic int unexpected(void)\n{\n    BusState s;\n    BusRequest q = {BUS_I2C, 0x18U, 0x0FU};\n    BusEvent e = {BUS_EVENT_OK, 0x22U};\n    BusReport r;\n    unsigned int i;\n    CHECK(bus_init(&s) == BUS_OK && bus_start(&s, &q, 0U) == BUS_OK);\n    for (i = 0U; i < 9U; i++) {\n        CHECK(bus_poll(&s, i, &e, &r) == BUS_OK);\n    }\n    CHECK(r.status == BUS_READY && r.result == 0x22U && !r.identityMatches);\n    CHECK(bus_start(&s, &q, 9U) == BUS_OK);\n    e.received = 0x33U;\n    for (i = 0U; i < 8U; i++) {\n        CHECK(bus_poll(&s, 9U + i, &e, &r) == BUS_OK && r.result == 0x22U && !r.newResult);\n    }\n    CHECK(r.candidatePresent && r.candidate == 0x33U && r.nextPhase == BUS_STOP);\n    CHECK(bus_poll(&s, 17U, &e, &r) == BUS_OK && r.newResult && r.result == 0x33U);\n    CHECK(printf(\"host sizes state=%zu report=%zu\\n\", sizeof s, sizeof r) > 0);\n    return 0;\n}\n\nint main(void)\n{\n    BusState s;\n    BusRequest q = {BUS_I2C, 0x18U, 0x0FU};\n    BusEvent e = {BUS_EVENT_OK, 0x33U};\n    BusReport r;\n    const BusPhase phases[] = {BUS_WAIT_FREE, BUS_START, BUS_ADDRESS_WRITE, BUS_SUBADDRESS,\n        BUS_RESTART, BUS_ADDRESS_READ, BUS_DATA, BUS_FINAL_NACK, BUS_STOP};\n    const unsigned int bytes[] = {256U, 256U, 0x30U, 0x0FU, 256U, 0x31U, 256U, 256U, 256U};\n    unsigned int i;\n    if (bus_init(&s) != BUS_OK || bus_start(&s, &q, 0U) != BUS_OK) { return 1; }\n    for (i = 0U; i < 9U; i++) {\n        if (bus_poll(&s, i, &e, &r) != BUS_OK || r.phase != phases[i] || (i < 8U && r.newResult)) { return 2; }\n        if (r.transmitted != (bytes[i] < 256U) || (r.transmitted && r.tx != bytes[i])) { return 13; }\n        if (r.cause != BUS_CAUSE_NONE || r.candidatePresent != (i >= 6U)) { return 14; }\n    }\n    if (r.status != BUS_READY || !r.newResult || r.result != 0x33U) { return 3; }\n    if (bus_start(&s, &q, 9U) != BUS_OK) { return 5; }\n    if (bus_poll(&s, 9U, &e, &r) != BUS_OK || bus_poll(&s, 10U, &e, &r) != BUS_OK) { return 6; }\n    e.kind = BUS_EVENT_NACK;\n    if (bus_poll(&s, 11U, &e, &r) != BUS_OK || r.cause != BUS_ADDRESS_NACK ||\n        r.nextPhase != BUS_ERROR_STOP || r.resource != BUS_OWNED || r.result != 0x33U) { return 7; }\n    e.kind = BUS_EVENT_OK;\n    if (bus_poll(&s, 12U, &e, &r) != BUS_OK || r.status != BUS_FAILED ||\n        r.resource != BUS_RELEASED || r.failurePhase != BUS_ADDRESS_WRITE || r.newResult) { return 8; }\n    if (puts(\"PASS literal nine-phase S30A0FA Sr31A33NP commits at8\") < 0) { return 4; }\n    i = (unsigned int)boundaries();\n    if (i != 0U) { printf(\"FAIL line %u\\n\", i); return 9; }\n    i = (unsigned int)preserve();\n    if (i != 0U) { printf(\"FAIL preservation %u\\n\", i); return 11; }\n    i = (unsigned int)unexpected();\n    if (i != 0U) { printf(\"FAIL unexpected %u\\n\", i); return 12; }\n    i = (unsigned int)deadlines();\n    if (i != 0U) { printf(\"FAIL deadline line %u\\n\", i); return 10; }\n    return 0;\n}\n";
if(process.argv.includes('--c')){
 const {spawnSync}=await import('node:child_process');
 const {createHash}=await import('node:crypto');
 const {readFileSync,writeFileSync,existsSync,mkdirSync,mkdtempSync,statSync,readdirSync}=await import('node:fs');
 const {resolve,join,dirname,relative,isAbsolute,delimiter}=await import('node:path');
 const {fileURLToPath}=await import('node:url');
 const {homedir}=await import('node:os');
 const args=process.argv.slice(2).filter(a=>a!=='--c'),options={};
 for(let i=0;i<args.length;i+=2){const key=args[i].slice(2);assert.ok(['compiler','python','router','output'].includes(key)&&args[i+1]&&!options[key],'Use --c --compiler <existing-cc> --python <existing-python> --router <build_router.py> --output .scratch/<dir>');options[key]=args[i+1];}
 const root=fileURLToPath(new URL('../',import.meta.url));
 function executable(value){
  if(isAbsolute(value)||value.includes('/')||value.includes('\\'))return resolve(value);
  const extensions=process.platform==='win32'?['',...(process.env.PATHEXT||'.EXE;.CMD').split(';')]:[''];
  for(const directory of (process.env.PATH||'').split(delimiter)){
   for(const extension of extensions){
    const candidate=join(directory,value+extension.toLowerCase());
    if(existsSync(candidate))return resolve(candidate);
   }
  }
  return value;
 }
 const compiler=executable(options.compiler||process.env.CC||'cc');
 const python=executable(options.python||process.env.PYTHON||'python');
 const router=resolve(options.router||process.env.MCU_BUILD_ROUTER||join(homedir(),'.codex/skills/mcu-build/scripts/build_router.py'));
 const parent=resolve(root,options.output||'.scratch/protocol-acquisition/c-evidence'),rel=relative(root,parent).replaceAll('\\','/');
 assert.ok(rel.startsWith('.scratch/')&&!rel.split('/').includes('..')&&!isAbsolute(rel));mkdirSync(parent,{recursive:true});const output=mkdtempSync(join(parent,'run-'));
 const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
 const meta=p=>existsSync(p)?{path:p,bytes:statSync(p).size,sha256:hash(p),mtime:statSync(p).mtime.toISOString()}:null;
 const source=join(root,'docs/public/examples/bus-transactions'),time=join(root,'docs/public/examples/timer-pwm');
 const report={status:'running',startedAt:new Date().toISOString(),runner:meta(fileURLToPath(import.meta.url)),node:process.versions,sources:[join(source,'bus.c'),join(source,'bus.h'),join(time,'time.c'),join(time,'time.h')].map(meta),commands:[],builds:[],executions:[],tools:[compiler,python,router].map(meta),limitations:'Host C11 only; no MMIO, physical bus/board timing/recovery, target maximum stack or hardware guarantee.'};
 const save=()=>writeFileSync(join(output,'receipt.json'),JSON.stringify(report,null,2)+'\n');
 const run=(command,argv)=>{const r=spawnSync(command,argv,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,env:{...process.env,PYTHONIOENCODING:'utf-8',PATH:dirname(compiler)+delimiter+(process.env.PATH||'')}});const v={command:[command,...argv],status:r.status,stdout:r.stdout||'',stderr:r.stderr||'',error:r.error?.message||null};report.commands.push(v);save();assert.ok(!r.error&&r.status===0,JSON.stringify(v));return v;};
 report.compilerIdentity=run(compiler,['--version']);
 const consumer=join(output,'consumer.c');writeFileSync(consumer,consumerSource);report.consumer=meta(consumer);save();
 function build(name,args,artifact){
  assert.equal(existsSync(artifact),false,'New artifact required');
  const quote=v=>JSON.stringify(v.replaceAll('\\','/')),profile=join(output,name+'.toml');
  const command=[compiler,...args];
  writeFileSync(profile,'version = 1\ndefault_profile = "test"\n[settings]\nworkspace_root = '+quote(root)+'\nlog_dir = '+quote(relative(root,join(output,'logs')))+'\n[environments.host]\nkind = "custom"\n[profiles.test]\nenvironment = "host"\nplatform = "host-c11"\ncommand = ['+command.map(quote).join(', ')+']\nartifacts = ['+quote(relative(root,artifact))+']\nartifact_policy = "all"\n');
  const b={name,profile:meta(profile),command,stages:[],before:meta(artifact)};report.builds.push(b);save();
  for(const stage of [['validate','--config',profile],['build','--config',profile,'--dry-run'],['build','--config',profile]])b.stages.push(run(python,[router,...stage]));
  const actual=b.stages[2];b.rawReturnCode=Number(actual.stdout.match(/Return code: (-?\d+)/)?.[1]);assert.equal(b.rawReturnCode,0);
  const log=actual.stdout.match(/Log: ([^\r\n]+)/)?.[1];assert.ok(log&&existsSync(log));b.log=meta(log);b.diagnostics=readFileSync(log,'utf8').split(/\r?\n/).filter(s=>/error|warning/i.test(s));b.artifact=meta(artifact);assert.ok(b.artifact?.bytes>0);b.fresh=true;save();
 }
 const flags=['-std=c11','-Wall','-Wextra','-Werror','-pedantic','-fstack-usage','-I',source,'-I',time];
 for(const mode of ['normal','ndebug']){
  const objects=[];
  for(const [name,input] of [['bus',join(source,'bus.c')],['time',join(time,'time.c')],['consumer',consumer]]){
   const object=join(output,mode+'-'+name+'.o');build(mode+'-'+name,[...flags,...(mode==='ndebug'?['-DNDEBUG']:[]),'-c',input,'-o',object],object);objects.push(object);
  }
  const executable=join(output,mode+(process.platform==='win32'?'.exe':''));build(mode+'-link',[...objects,'-o',executable],executable);
  assert.ok(report.builds.at(-1).fresh&&report.builds.at(-1).artifact.sha256===hash(executable));const r=run(executable,[]);assert.match(r.stdout,/PASS literal nine-phase/);report.executions.push({mode,artifact:meta(executable),...r});save();
 }
 report.stackFiles=readdirSync(output).filter(p=>p.endsWith('.su')).map(p=>({...meta(join(output,p)),text:readFileSync(join(output,p),'utf8')}));report.status='passed';save();console.log('PASS unit12 routed strict C11 normal/NDEBUG separate modules + repeated-header consumer; receipt '+join(output,'receipt.json'));
}
