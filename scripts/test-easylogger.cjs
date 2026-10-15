const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../docs/public/demos/easylogger.html'), 'utf8');
const window = {};
vm.runInNewContext(html.match(/<script id="easylogger-models">([\s\S]*?)<\/script>/)[1], { window, TextEncoder });
const M = window.EasyLoggerModels;
let result = M.filter({C:2,F:5,R:5,L:3},0);
assert.equal(result.stage,'compiled-out'); assert.equal(result.counter,0);
result = M.filter({C:4,F:5,R:1,L:4},0);
assert.equal(result.stage,'runtime'); assert.equal(result.counter,1);
assert.equal(M.filter({C:4,F:2,R:5,L:4},0).stage,'compiled-out');
console.log('PASS filter: independent editorial fixtures');
for (const mode of ['SKIP','TRIM','BLOCK']) {
  const ring=M.createRTT(32,mode); ring.write('x'.repeat(20));
  assert.equal(ring.snapshot().free,11);
  const written=ring.write('x'.repeat(16));
  assert.equal(written.accepted,mode==='SKIP'?0:11);
  assert.equal(ring.snapshot().pending,mode==='BLOCK'?5:0);
  if(mode==='BLOCK') { assert.throws(()=>ring.write('again')); ring.read(8); assert.equal(ring.snapshot().pending,0); assert.equal(ring.snapshot().used,28); }
}
console.log('PASS RTT: N32 / 20 / 16 / read8 fixtures');
for (const [priority,allowed] of [[0,false],[4,false],[5,true],[15,true]]) {
  const irq=M.isr({bits:4,threshold:5,priority});assert.equal(irq.register,80);assert.equal(irq.allowed,allowed);
}
console.log('PASS ISR: b4 T5 fixed examples');
const serial=M.uart({baud:115200,bytes:100,frequency:200,buffer:2048});
assert.equal(serial.rate,11520);assert.equal(serial.demand,20000);
assert.ok(Math.abs(serial.lineMs-8.68056)<0.00001);assert.ok(Math.abs(serial.occupancy-1.73611)<0.00001);assert.ok(Math.abs(serial.fillSeconds-0.241509)<0.000001);
console.log('PASS UART: editorial 115200 / 100 / 200 / 2048 fixture');
// The controller under test is the exact script that runs in the standalone page.
class Element {
  constructor(value=''){this.value=value;this.textContent='';this.listeners={};this.children=[];this.style={};this.disabled=false;this.attributes={};}
  addEventListener(type,fn){this.listeners[type]=fn;}
  dispatch(type){this.listeners[type]?.({target:this});}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(name,value){this.attributes[name]=value;}
}
const elements={};
for(const match of html.matchAll(/<(?:input|select|button|div|span|p)[^>]*\bid="([^"]+)"[^>]*>/g)) {
  elements[match[1]]=new Element(match[0].match(/\bvalue="([^"]*)"/)?.[1]||'');
}
const document={getElementById:id=>{assert.ok(elements[id],'unknown controller id '+id);return elements[id];},createElement:()=>new Element()};
const controller=html.match(/<script id="easylogger-controller">([\s\S]*?)<\/script>/);
assert.ok(controller,'page must expose the real controller seam');
vm.runInNewContext(controller[1],{window,document});
elements['filter-C'].value='2';elements['filter-R'].value='5';elements['filter-L'].value='3';elements['filter-run'].dispatch('click');
assert.match(elements['filter-result'].textContent,/编译删除/);assert.match(elements['filter-count'].textContent, /0/);
elements['filter-reset'].dispatch('click');assert.match(elements['filter-count'].textContent,/0/);
elements['rtt-mode'].value='BLOCK';elements['rtt-mode'].dispatch('change');
elements['rtt-write'].dispatch('click');elements['rtt-text'].value='x'.repeat(16);elements['rtt-write'].dispatch('click');
assert.equal(elements['rtt-write'].disabled,true);assert.equal(elements['rtt-capacity'].disabled,true);assert.match(elements['rtt-result'].textContent,/等待 5/);
elements['rtt-connected'].value='no';elements['rtt-connected'].dispatch('change');elements['rtt-read'].dispatch('click');assert.match(elements['rtt-result'].textContent,/等待 5/);
elements['rtt-connected'].value='yes';elements['rtt-connected'].dispatch('change');elements['rtt-read'].dispatch('click');
assert.equal(elements['rtt-write'].disabled,false);assert.match(elements['rtt-result'].textContent,/等待 0/);
elements['rtt-reset'].dispatch('click');assert.match(elements['rtt-result'].textContent,/已用 0/);
elements['isr-priority'].value='5';elements['isr-priority'].dispatch('input');assert.match(elements['isr-result'].textContent,/0x50/);assert.match(elements['isr-result'].textContent,/可调用适用/);
elements['uart-baud'].value='0';elements['uart-baud'].dispatch('input');assert.match(elements['uart-result'].textContent,/输入无效/);
console.log('PASS controller: rendered outcomes, BLOCK input lock, disconnect, completion, reset, ISR and invalid UART');
// Literal boundary expectations are independent of the implementation formulas.
assert.equal(M.filter({C:5,F:5,R:5,L:3,tag:'',tagQuery:'app'},0).stage,'tag');
assert.equal(M.filter({C:5,F:5,R:5,L:3,tag:'sensor',tagQuery:'sen',keyword:'模拟记录'},0).stage,'output');
assert.equal(M.filter({C:5,F:5,R:5,L:3,keyword:'missing'},0).stage,'keyword');
for(const invalid of [-1,6,NaN,Infinity,1.5]) assert.throws(()=>M.filter({C:invalid,F:5,R:5,L:3}));
for(const capacity of [0,1,4097,NaN,3.2]) assert.throws(()=>M.createRTT(capacity,'SKIP'));
assert.throws(()=>M.createRTT(32,'unknown'));
const utf=M.createRTT(8,'SKIP');assert.equal(utf.write('中文').length,6);assert.equal(utf.write('🙂').accepted,0);assert.equal(utf.snapshot().lostBytes,4);
const trim=M.createRTT(4,'TRIM');assert.equal(trim.write('🙂').accepted,3);assert.equal(trim.snapshot().lostBytes,1);assert.equal(trim.snapshot().incomplete,1);
const wrap=M.createRTT(8,'SKIP');wrap.write('12345');wrap.read(4);wrap.write('abcde');assert.equal(wrap.snapshot().writePointer,2);assert.equal(wrap.snapshot().readPointer,4);assert.equal(wrap.snapshot().used,6);
assert.equal(wrap.read(100).read,6);assert.equal(wrap.snapshot().readPointer,2);assert.equal(wrap.snapshot().free,7);
const off=M.createRTT(4,'BLOCK');off.setConnected(false);off.write('123456');assert.equal(off.read(8).read,0);assert.equal(off.snapshot().pending,3);off.setConnected(true);off.read(3);assert.equal(off.snapshot().pending,0);assert.equal(off.snapshot().used,3);
assert.equal(off.write('').length,0);
for(const value of [-1,0.5,NaN,Infinity,1000001]) assert.throws(()=>off.read(value));
assert.throws(()=>off.write('x'.repeat(16385)));
for(const values of [{bits:0,threshold:1,priority:0},{bits:9,threshold:1,priority:0},{bits:4,threshold:0,priority:0},{bits:4,threshold:16,priority:0},{bits:4,threshold:5,priority:16},{bits:4,threshold:5,priority:2.5}]) assert.throws(()=>M.isr(values));
assert.equal(M.isr({bits:1,threshold:1,priority:1}).register,128);assert.equal(M.isr({bits:8,threshold:255,priority:255}).register,255);
assert.equal(M.uart({baud:100,bytes:1,frequency:10,buffer:0}).overloaded,false);
assert.equal(M.uart({baud:100,bytes:1,frequency:0,buffer:0}).occupancy,0);
assert.equal(M.uart({baud:100,bytes:1,frequency:20,buffer:0}).fillSeconds,0);
for(const values of [{baud:0,bytes:1,frequency:1,buffer:1},{baud:1,bytes:0,frequency:1,buffer:1},{baud:1,bytes:1,frequency:-1,buffer:1},{baud:Infinity,bytes:1,frequency:1,buffer:1},{baud:1,bytes:1e308,frequency:1e308,buffer:1},{baud:Number.MIN_VALUE,bytes:1,frequency:1,buffer:1},{baud:10,bytes:1,frequency:1e307,buffer:1}]) assert.throws(()=>M.uart(values));
console.log('PASS model boundaries: Unicode, empty text, wraparound, disconnected BLOCK, finite ranges and overflow');
elements['rtt-capacity'].value='1';elements['rtt-capacity'].dispatch('change');assert.match(elements['rtt-result'].textContent,/输入无效/);
elements['rtt-capacity'].value='32';elements['rtt-reset'].dispatch('click');assert.match(elements['rtt-result'].textContent,/已用 0/);
elements['rtt-read-count'].value='-1';elements['rtt-read'].dispatch('click');assert.match(elements['rtt-result'].textContent,/输入无效/);
elements['rtt-reset'].dispatch('click');assert.match(elements['rtt-result'].textContent,/已用 0/);
elements['isr-bits'].value='';elements['isr-bits'].dispatch('input');assert.match(elements['isr-result'].textContent,/输入无效/);assert.equal(elements['isr-scale'].children.length,0);
elements['uart-baud'].value='115200';elements['uart-frequency'].value='0';elements['uart-baud'].dispatch('input');assert.match(elements['uart-result'].textContent,/平均速率可容纳/);assert.equal(elements['uart-load'].style.width,'0%');
const hooks={},outer={open:false,parentElement:null},inner={open:false,parentElement:{closest:()=>outer}};
let scrolls=0;
const target={closest:()=>inner,scrollIntoView:()=>scrolls++};
const deepWindow={location:{hash:'#nested'},addEventListener:(name,fn)=>{hooks[name]=fn;}};
vm.runInNewContext(html.match(/<script id="note-deep-links">([\s\S]*?)<\/script>/)[1],{window:deepWindow,document:{getElementById:id=>id==='nested'?target:null},requestAnimationFrame:fn=>fn()});
assert.equal(inner.open,true);assert.equal(outer.open,true);assert.equal(scrolls,1);
inner.open=false;outer.open=false;hooks.hashchange();assert.equal(outer.open,true);
deepWindow.location.hash='#%ZZ';assert.doesNotThrow(hooks.pageshow);
deepWindow.location.hash='#missing';assert.doesNotThrow(hooks.hashchange);
// Search points to the chapter heading; matched prose can be in its child details.
const chapterHooks={},matchedPanel={open:false},nestedPanel={open:false},otherChapterPanel={open:false};
const chapter={querySelectorAll:selector=>{assert.equal(selector,'details');return [matchedPanel,nestedPanel];}};
const chapterHeading={closest:selector=>selector==='section'?chapter:null,scrollIntoView(){}};
const chapterWindow={location:{hash:'#validation-limits'},addEventListener:(name,fn)=>{chapterHooks[name]=fn;}};
vm.runInNewContext(html.match(/<script id="note-deep-links">([\s\S]*?)<\/script>/)[1],{window:chapterWindow,document:{getElementById:()=>chapterHeading},requestAnimationFrame:fn=>fn()});
assert.equal(matchedPanel.open,true,'section-heading search must reveal matching collapsed prose');
assert.equal(nestedPanel.open,true,'nested chapter details must also be readable');
assert.equal(otherChapterPanel.open,false,'deep links must not expand unrelated chapters');
matchedPanel.open=false;chapterHooks.hashchange();assert.equal(matchedPanel.open,true);
matchedPanel.open=false;chapterHooks.pageshow();assert.equal(matchedPanel.open,true);
// The seven-article harness supplies only closest(), without parentElement.
vm.runInNewContext(html.match(/<script id="note-deep-links">([\s\S]*?)<\/script>/)[1],{window:{location:{hash:'#simple'},addEventListener(){}},document:{getElementById:()=>({closest:()=>({open:false}),scrollIntoView(){}})},requestAnimationFrame:fn=>fn()});
const printHooks={},panels=[{open:false},{open:true}];
vm.runInNewContext(html.match(/<script id="note-print">([\s\S]*?)<\/script>/)[1],{window:{addEventListener:(name,fn)=>{printHooks[name]=fn;}},document:{querySelectorAll:()=>panels}});
printHooks.beforeprint();assert.equal(panels[0].open,true);printHooks.beforeprint();printHooks.afterprint();assert.equal(panels[0].open,false);assert.equal(panels[1].open,true);assert.doesNotThrow(printHooks.afterprint);
const source=fs.readFileSync(path.join(__dirname,'../docs/public/demos/hardfault-stack-trace.html'),'utf8');
assert.equal(html.match(/\/\* Shared reading layer:[\s\S]*?<\/style>/)[0],source.match(/\/\* Shared reading layer:[\s\S]*?<\/style>/)[0]);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
console.log('PASS reader shell: invalid/repeated reset, nested and harness deep links, print restore, identical reading CSS and unique ids');
