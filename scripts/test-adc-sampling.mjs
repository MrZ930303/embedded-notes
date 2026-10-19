import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises'
import {readFileSync,existsSync,statSync} from 'node:fs'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {resolve,relative,join,dirname,delimiter,isAbsolute} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8')
const html=await read('docs/public/demos/adc-sampling.html')
const readme=await read('docs/public/examples/adc-sampling/README.txt')
const consumerBegin='----- BEGIN consumer.c -----\n',consumerEnd='----- END consumer.c -----'
assert.equal(readme.split(consumerBegin).length,2,'README must supply one complete independent consumer.c')
assert.equal(readme.split(consumerEnd).length,2,'README consumer.c needs one unambiguous end marker')
export const readmeConsumer=readme.slice(readme.indexOf(consumerBegin)+consumerBegin.length,readme.indexOf(consumerEnd))
assert.match(readmeConsumer,/#include "adc.h"/)
assert.match(readmeConsumer,/int main\(void\)/)
assert.equal((readmeConsumer.match(/adc_poll\(/g)||[]).length,3,'README executes the three finite public calls')
for(const token of ['adc_init(&state)','adc_start(&state, &request, 0U)','ADC_READY','report.samplePresent','report.sample != 2048U','return 0;'])assert.ok(readmeConsumer.includes(token),'Complete README behavior check '+token)
assert.ok(!/\bassert\s*\(/.test(readmeConsumer),'README checks remain live with NDEBUG')
const script=(id,source=html)=>{
 const match=source.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'));assert.ok(match,'Actual script '+id)
 if(process.env.ADC_TEST_FAULT==='prediction'&&id==='adc-controller')return match[1].replace('if(!prediction)return;','')
 return match[1]
}
const context={};vm.runInNewContext(script('adc-model')+';globalThis.model=AdcModel;',context)
const m=context.model,plain=v=>JSON.parse(JSON.stringify(v)),seed=m.seed()
for(const [input,code]of [[0,0],[1649999,2047],[1650000,2048],[3300000,4095]])assert.equal(m.quantize({...seed,inputUv:input}).code,code)
assert.equal(m.quantize({...seed,referenceUv:3600000,inputUv:3600000}).product,14745600000)
assert.deepEqual(plain(m.reconstruct(seed,2048,false)),{status:'OK',num:6758400000,den:4096})
assert.deepEqual(plain(m.reconstruct(seed,2048,true)),{status:'OK',num:6758400000,den:4095})
assert.deepEqual(plain(m.reconstruct(seed,4095,false)),{status:'OK',num:13513500000,den:4096})
for(const bits of [6,8,10,12])assert.equal(m.quantize({...seed,bits}).code,({6:32,8:128,10:512,12:2048})[bits])
for(const sampleCycles of [3,15,28,56,84,112,144,480])assert.equal(m.plan({...seed,sampleCycles}).status,'OK')
for(const[divider,adcHz]of [[4,21000000],[6,14000000],[8,10500000]])assert.equal(m.plan({...seed,divider}).adcHz,adcHz)
for(const patch of [{bits:11},{divider:2},{divider:3},{sampleCycles:16},{referenceUv:0},{referenceUv:3600001},{inputUv:-1},{inputUv:3300001}])assert.equal(m.plan({...seed,...patch}).status,'INVALID')
for(const code of [-1,4096,NaN,Infinity,1.5])assert.equal(m.reconstruct(seed,code,false).status,'INVALID')
for(const ref of [1,3600000])assert.equal(m.quantize({...seed,referenceUv:ref,inputUv:ref}).code,4095)
assert.equal(m.settling(10).enough,false);assert.equal(m.settling(91).enough,true);assert.ok(Math.abs(m.settling(10).minimum-90.10913347279289)<1e-10)
for(let n=0;n<10;n++)assert.ok(Math.abs(Math.sin(2*Math.PI*600*n/1000)+Math.sin(2*Math.PI*400*n/1000))<1e-12)
let s=m.begin(),r=m.start(s,seed,0);s=r.next
const edited={...seed},copied=m.start(m.begin(),edited,0).next;edited.inputUv=0;assert.equal(copied.request.inputUv,1650000);r=m.start(s,edited,0);assert.equal(r.status,'BUSY');assert.equal(s.request.inputUv,1650000)
for(const[now,phase,next,status,present]of [[0,'ACQUIRE','CONVERT','PENDING',false],[1,'CONVERT','RESULT','PENDING',false],[2,'RESULT','TERMINAL','READY',true]]){
 r=m.poll(s,now,'ADVANCE');s=r.next;assert.equal(r.status,status);assert.equal(r.report.phase,phase);assert.equal(s.phase,next);assert.equal(r.report.samplePresent,present)
}
assert.equal(s.committed,2048);assert.equal(m.poll(s,2,'ADVANCE').status,'BAD_STATE')
s=m.start(s,seed,100).next;r=m.poll(s,119,'WAIT');assert.equal(r.status,'PENDING');s=r.next;s=m.poll(s,119,'ADVANCE').next;s=m.poll(s,119,'ADVANCE').next;r=m.poll(s,120,'ADVANCE');assert.equal(r.status,'TIMEOUT');assert.equal(r.next.committed,2048);assert.equal(r.report.samplePresent,false)
s=m.start(r.next,seed,4294967290).next;r=m.poll(s,4,'WAIT');assert.equal(r.next.age,10);s=r.next;r=m.poll(s,2147483652,'ADVANCE');assert.equal(r.status,'TIME_REJECTED');assert.equal(s.lastObserved,4)
r=m.cancel(s);assert.equal(r.status,'CANCELLED');assert.equal(r.next.active,false);assert.equal(r.next.committed,2048);assert.equal(m.cancel(r.next).status,'BAD_STATE')
s=m.start(r.next,seed,0).next;r=m.poll(s,0,'FAIL');assert.equal(r.status,'BACKEND_ERROR');assert.equal(r.next.committed,2048)
console.log('PASS ADC actual model: literal threshold/rational/domain/clock/RC/alias/three-phase/deadline/wrap/cancel')
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


assert.throws(()=>parseTree('<main><div><p>x</div></p></main>'))
for(const slug of ['adc-sampling','adc-sampling-reference']){
 const source=await read('docs/public/demos/'+slug+'.html'),t=parseTree(source),mirror=await read('docs/learn/'+slug+'.md'),accepted=await read('docs/public/demos/timer-pwm.html')
 assert.equal(t.root.querySelectorAll('main').length,1);assert.equal(t.root.querySelectorAll('h1').length,1)
 assert.equal(source.match(/<style>[\s\S]*?<\/style>/g)[1],accepted.match(/<style>[\s\S]*?<\/style>/g)[1])
 for(const id of ['note-print','note-deep-links','timer-ordinary-print'])assert.equal(source.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0],accepted.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0])
 assert.ok(source.includes('<body class="notes-article">'));assert.ok(!source.match(/<style>[\s\S]*?<\/style>/g)[0].includes('#clock-practice'))
 assert.ok(source.includes('href="./bus-transactions.html"'));assert.ok(source.includes('href="./driver-recovery.html"'));assert.ok(!source.includes('href="./i2c-spi.html"'))
 for(const match of source.matchAll(/body\.exercise-print main>\.content-section:not\(#([^)]+)\)/g))assert.equal(match[1],'adc-practice')
 for(const h of t.root.querySelectorAll('h2')){assert.ok(mirror.includes('{#'+h.id+'}'));assert.equal(h.parentElement.attrs['aria-labelledby'],h.id)}
 for(const a of t.root.querySelectorAll('a'))if(a.attrs.href?.startsWith('#'))assert.ok(t.ids[a.attrs.href.slice(1)],'Existing local hash '+a.attrs.href)
 const blocks=[...source.matchAll(/<code class="language-text">([\s\S]*?)<\/code>/g)].map(x=>decode(x[1]))
 for(const[i,path]of ['adc-sampling/adc.h','adc-sampling/adc.c','timer-pwm/time.h','timer-pwm/time.c','adc-sampling/README.txt'].entries()){
  const text=await read('docs/public/examples/'+path);assert.equal(blocks[i],text);assert.ok(mirror.includes('```text\n'+text+'```'));assert.ok(source.includes('href="../examples/'+path+'" download'))
 }
}
const tree=parseTree(html),{ids}=tree
assert.equal(tree.root.querySelectorAll('article').filter(e=>e.classes.has('exercise')).length,10)
for(let i=1;i<=10;i++){const n=String(i).padStart(2,'0');assert.equal(ids['adc-answer-'+n].parentElement,ids['adc-exercise-'+n]);assert.equal(ids['adc-answer-'+n].open,false)}
const windowListeners={},window={location:{hash:''},addEventListener:(n,f)=>(windowListeners[n]??=[]).push(f),dispatchEvent:e=>{for(const f of windowListeners[e.type]??[])f()},print:()=>{}}
const document={body:tree.root.querySelectorAll('body')[0],getElementById:id=>{assert.ok(ids[id],'Real DOM '+id);return ids[id]},querySelectorAll:tag=>tree.root.querySelectorAll(tag)}
Object.assign(context,{window,document,requestAnimationFrame:f=>f(),Event:class{constructor(type){this.type=type}}});vm.runInNewContext(script('adc-controller'),context)
const predict=(p,v)=>{ids[p+'-prediction'].value=v;ids[p+'-prediction'].dispatch('change')},submit=p=>ids[p+'-form'].dispatch('submit'),edit=(id,v)=>{ids[id].value=String(v);ids[id].dispatch('input')}
for(const p of ['plan','bin','rc','fake']){assert.equal(ids[p+'-apply'].disabled,true);submit(p);assert.equal(ids[p+'-result'].hidden,true)}
predict('plan','OK');submit('plan');assert.match(ids['plan-state'].textContent,/adcHz=21000000.*totalCycles=27/);assert.match(ids['plan-feedback'].textContent,/预测正确/)
const plan=ids['plan-state'].textContent;edit('plan-divider',2);assert.equal(ids['plan-prediction'].value,'');assert.match(ids['plan-pending'].textContent,/待应用/);submit('plan');assert.equal(ids['plan-state'].textContent,plan);predict('plan','OK');submit('plan');assert.match(ids['plan-feedback'].textContent,/预测不同.*INVALID/);assert.equal(ids['plan-state'].textContent,plan)
predict('bin','high');submit('bin');assert.match(ids['bin-state'].textContent,/code=2048.*6758400000\/4096.*6758400000\/4095/)
const bin=ids['bin-state'].textContent
for(const bad of ['', '-1','1.5','NaN','Infinity','0x10','1e2','9007199254740992','3300001']){edit('bin-input',bad);predict('bin','high');submit('bin');assert.match(ids['bin-feedback'].textContent,/INVALID.*下一检查/);assert.equal(ids['bin-state'].textContent,bin)}
ids['bin-reset'].dispatch('click');assert.equal(ids['bin-result'].hidden,true);predict('bin','low');submit('bin');assert.match(ids['bin-feedback'].textContent,/预测不同.*floor阈值/)
predict('rc','short');submit('rc');assert.match(ids['rc-feedback'].textContent,/预测正确/);edit('rc-time',91);predict('rc','enough');submit('rc');assert.match(ids['rc-feedback'].textContent,/预测正确/)
for(const value of ['PENDING','PENDING','READY']){predict('fake',value);submit('fake');assert.match(ids['fake-feedback'].textContent,/预测正确/);assert.equal(ids['fake-prediction'].value,'')}
assert.match(ids['fake-state'].textContent,/committed=2048.*samplePresent=true/);const terminal=ids['fake-state'].textContent;predict('fake','READY');assert.equal(ids['fake-apply'].disabled,true);submit('fake');assert.equal(ids['fake-state'].textContent,terminal)
edit('fake-scenario','timeout');for(const value of ['PENDING','PENDING','TIMEOUT']){predict('fake',value);submit('fake')};assert.match(ids['fake-state'].textContent,/status=TIMEOUT.*committed=2048.*samplePresent=false/)
for(const[scenario,status]of [['error','BACKEND_ERROR'],['cancel','CANCELLED']]){edit('fake-scenario',scenario);predict('fake',status);submit('fake');assert.match(ids['fake-state'].textContent,new RegExp('status='+status+'.*committed=2048'))}
ids['fake-reset'].dispatch('click');assert.equal(ids['fake-result'].hidden,true);predict('fake','READY');submit('fake');assert.match(ids['fake-feedback'].textContent,/预测不同.*PENDING.*下一检查/)
console.log('PASS actual ADC handlers: prediction/consume/wrong/edit/invalid-preservation/reset/finite-terminal')
for(const id of ['timer-reader','timer-worksheet','timer-ordinary-print','note-deep-links','note-print'])vm.runInNewContext(script(id),context)
const folds=()=>tree.root.querySelectorAll('details').map(p=>[p,p.open]);window.location.hash='#adc-answer-03';window.dispatchEvent({type:'hashchange'});assert.equal(ids['adc-answer-03'].open,true);assert.equal(ids['adc-answer-04'].open,false)
const original=folds();window.dispatchEvent({type:'beforeprint'});assert.ok(folds().every(([,v])=>v));window.dispatchEvent({type:'afterprint'});assert.deepEqual(folds(),original)
for(const id of ['print-all','print-questions'])for(const classValue of [null,'','notes-article custom','notes-article exercise-print custom']){
 if(classValue===null)document.body.removeAttribute('class');else document.body.setAttribute('class',classValue)
 for(const fireBefore of [false,true]){window.print=()=>{if(fireBefore)window.dispatchEvent({type:'beforeprint'});throw Error('injected dispatch failure')};ids[id].dispatch('click');assert.deepEqual(folds(),original);assert.equal(document.body.getAttribute('class'),classValue)}
 window.print=()=>{window.dispatchEvent({type:'beforeprint'});assert.equal(document.body.classList.contains('exercise-print'),id==='print-questions');window.dispatchEvent({type:'afterprint'})};ids[id].dispatch('click');assert.deepEqual(folds(),original);assert.equal(document.body.getAttribute('class'),classValue)
}
document.body.setAttribute('class','notes-article');ids['collapse-notes'].dispatch('click');assert.ok(folds().every(([,v])=>!v));ids['expand-notes'].dispatch('click');assert.ok(folds().every(([,v])=>v))
console.log('PASS strict real HTML/mirror/source/shared blocks/ten answers/deep links/ordinary+worksheet print exact restore')

const CONSUMER="#include \"adc.h\"\n#include \"adc.h\"\n#include \"time.h\"\n#include \"time.h\"\n#include <stddef.h>\n#include <stdint.h>\n#include <stdio.h>\n#define CHECK(x) do { if (!(x)) { fprintf(stderr, \"FAIL line %d: %s\\n\", __LINE__, #x); return 1; } } while (0)\nstatic int same_state(AdcState a, AdcState b)\n{\n    return a.request.bits==b.request.bits && a.request.sampleCycles==b.request.sampleCycles &&\n        a.request.divider==b.request.divider && a.request.referenceUv==b.request.referenceUv &&\n        a.request.inputUv==b.request.inputUv && a.phase==b.phase && a.status==b.status &&\n        a.lastObserved==b.lastObserved && a.elapsedMs==b.elapsedMs && a.candidate==b.candidate &&\n        a.committed==b.committed && a.hasSample==b.hasSample && a.active==b.active;\n}\nstatic int same_report(AdcReport a, AdcReport b)\n{\n    return a.status==b.status && a.phase==b.phase && a.elapsedMs==b.elapsedMs &&\n        a.samplePresent==b.samplePresent && a.sample==b.sample;\n}\nstatic int arithmetic(void)\n{\n    AdcRequest request = {12U, 15U, 4U, 3300000U, 0U};\n    AdcPlan plan = {77U, 88U};\n    AdcRational fraction = {99U, 77U};\n    uint16_t code = 71U;\n    const uint32_t inputs[] = {0U, 1649999U, 1650000U, 3300000U};\n    const uint16_t expected[] = {0U, 2047U, 2048U, 4095U};\n    const uint32_t bits[] = {6U, 8U, 10U, 12U};\n    const uint16_t halves[] = {32U, 128U, 512U, 2048U};\n    const uint32_t samples[] = {3U,15U,28U,56U,84U,112U,144U,480U};\n    const uint32_t totals[] = {15U,27U,40U,68U,96U,124U,156U,492U};\n    const uint32_t dividers[] = {4U,6U,8U};\n    const uint32_t clocks[] = {21000000U,14000000U,10500000U};\n    size_t index;\n    for (index=0U;index<4U;index++) {\n        request.inputUv=inputs[index];\n        CHECK(adc_quantize(&request,&code)==ADC_OK && code==expected[index]);\n    }\n    CHECK(adc_reconstruct(&request,2048U,false,&fraction)==ADC_OK &&\n        fraction.numeratorUv==UINT64_C(6758400000) && fraction.denominator==4096U);\n    CHECK(adc_reconstruct(&request,2048U,true,&fraction)==ADC_OK &&\n        fraction.numeratorUv==UINT64_C(6758400000) && fraction.denominator==4095U);\n    CHECK(adc_reconstruct(&request,4095U,false,&fraction)==ADC_OK &&\n        fraction.numeratorUv==UINT64_C(13513500000) && fraction.denominator==4096U);\n    CHECK(adc_reconstruct(&request,4095U,true,&fraction)==ADC_OK && fraction.denominator==4095U);\n    CHECK(adc_reconstruct(&request,4096U,false,&fraction)==ADC_INVALID_ARGUMENT && fraction.denominator==4095U);\n    CHECK(adc_reconstruct(&request,UINT32_MAX,false,&fraction)==ADC_INVALID_ARGUMENT);\n    CHECK(UINT64_C(3600000)*UINT64_C(4096)==UINT64_C(14745600000));\n    request.referenceUv=3600000U;request.inputUv=3600000U;\n    CHECK(adc_quantize(&request,&code)==ADC_OK && code==4095U);\n    request.referenceUv=1U;request.inputUv=1U;\n    CHECK(adc_quantize(&request,&code)==ADC_OK && code==4095U);\n    request.referenceUv=3300000U;request.inputUv=1650000U;\n    for (index=0U;index<4U;index++) {\n        request.bits=bits[index];\n        CHECK(adc_quantize(&request,&code)==ADC_OK && code==halves[index]);\n    }\n    request.bits=12U;\n    for (index=0U;index<8U;index++) {\n        request.sampleCycles=samples[index];\n        CHECK(adc_plan(&request,&plan)==ADC_OK && plan.totalCycles==totals[index]);\n    }\n    request.sampleCycles=15U;\n    for (index=0U;index<3U;index++) {\n        request.divider=dividers[index];\n        CHECK(adc_plan(&request,&plan)==ADC_OK && plan.adcHz==clocks[index] && plan.totalCycles==27U);\n    }\n    request.divider=2U;\n    CHECK(adc_plan(&request,&plan)==ADC_INVALID_ARGUMENT && plan.adcHz==10500000U);\n    request.divider=3U;CHECK(adc_plan(&request,&plan)==ADC_INVALID_ARGUMENT);\n    request.divider=4U;request.sampleCycles=16U;CHECK(adc_plan(&request,&plan)==ADC_INVALID_ARGUMENT);\n    request.sampleCycles=15U;request.bits=11U;CHECK(adc_quantize(&request,&code)==ADC_INVALID_ARGUMENT && code==2048U);\n    request.bits=12U;request.referenceUv=0U;CHECK(adc_quantize(&request,&code)==ADC_INVALID_ARGUMENT);\n    request.referenceUv=3600001U;CHECK(adc_quantize(&request,&code)==ADC_INVALID_ARGUMENT);\n    request.referenceUv=3300000U;request.inputUv=UINT32_MAX;CHECK(adc_quantize(&request,&code)==ADC_INVALID_ARGUMENT);\n    request.inputUv=3300001U;CHECK(adc_quantize(&request,&code)==ADC_INVALID_ARGUMENT);\n    CHECK(adc_quantize(NULL,&code)==ADC_INVALID_ARGUMENT && adc_plan(&request,NULL)==ADC_INVALID_ARGUMENT);\n    return 0;\n}\nstatic int lifecycle(void)\n{\n    AdcState state;\n    AdcRequest request={12U,15U,4U,3300000U,1650000U};\n    AdcReport report={ADC_READY,ADC_RESULT,7U,true,123U};\n    AdcState saved;\n    AdcReport savedReport;\n    CHECK(adc_init(&state)==ADC_OK && !state.active && !state.hasSample);\n    CHECK(adc_cancel(&state,&report)==ADC_BAD_STATE && report.sample==123U);\n    CHECK(adc_start(&state,&request,0U)==ADC_PENDING);\n    request.inputUv=0U;\n    CHECK(state.request.inputUv==1650000U && adc_start(&state,NULL,0U)==ADC_BUSY);\n    CHECK(adc_poll(&state,0U,ADC_EVENT_ADVANCE,&report)==ADC_PENDING &&\n        report.phase==ADC_ACQUIRE && state.phase==ADC_CONVERT && !state.hasSample && !report.samplePresent);\n    CHECK(adc_poll(&state,1U,ADC_EVENT_ADVANCE,&report)==ADC_PENDING &&\n        report.phase==ADC_CONVERT && state.phase==ADC_RESULT && state.candidate==2048U && !state.hasSample);\n    CHECK(adc_poll(&state,2U,ADC_EVENT_ADVANCE,&report)==ADC_READY &&\n        report.phase==ADC_RESULT && report.samplePresent && report.sample==2048U && !state.active);\n    CHECK(adc_poll(&state,2U,ADC_EVENT_ADVANCE,&report)==ADC_BAD_STATE && report.samplePresent);\n    CHECK(adc_cancel(&state,&report)==ADC_BAD_STATE && state.committed==2048U);\n    request.bits=11U;CHECK(adc_start(&state,&request,10U)==ADC_INVALID_ARGUMENT && state.committed==2048U);\n    request.bits=12U;CHECK(adc_start(&state,&request,100U)==ADC_PENDING);\n    CHECK(adc_poll(&state,119U,ADC_EVENT_WAIT,&report)==ADC_PENDING && report.elapsedMs==19U && !report.samplePresent);\n    CHECK(adc_poll(&state,119U,ADC_EVENT_ADVANCE,&report)==ADC_PENDING && report.elapsedMs==19U);\n    CHECK(adc_poll(&state,119U,ADC_EVENT_ADVANCE,&report)==ADC_PENDING && state.phase==ADC_RESULT);\n    CHECK(adc_poll(&state,120U,ADC_EVENT_ADVANCE,&report)==ADC_TIMEOUT && !report.samplePresent &&\n        state.committed==2048U && state.hasSample && !state.active && state.candidate==0U);\n    CHECK(adc_start(&state,&request,200U)==ADC_PENDING);\n    CHECK(adc_poll(&state,200U,ADC_EVENT_FAIL,&report)==ADC_BACKEND_ERROR && state.committed==2048U && !state.active);\n    CHECK(adc_cancel(&state,&report)==ADC_BAD_STATE);\n    CHECK(adc_start(&state,&request,300U)==ADC_PENDING);\n    report=(AdcReport){ADC_READY,ADC_RESULT,7U,true,123U};\n    saved=state;savedReport=report;\n    CHECK(adc_poll(&state,301U,(AdcEvent)99,&report)==ADC_INVALID_ARGUMENT && state.lastObserved==300U && report.sample==123U);\n    CHECK(same_state(state,saved) && same_report(report,savedReport));\n    CHECK(adc_poll(&state,UINT32_C(2147483948),ADC_EVENT_ADVANCE,&report)==ADC_TIME_REJECTED &&\n        state.phase==ADC_ACQUIRE && state.lastObserved==300U && state.elapsedMs==0U && report.sample==123U);\n    CHECK(same_state(state,saved) && same_report(report,savedReport));\n    CHECK(adc_poll(&state,301U,ADC_EVENT_WAIT,NULL)==ADC_INVALID_ARGUMENT && state.lastObserved==300U);\n    CHECK(adc_cancel(&state,&report)==ADC_CANCELLED && report.phase==ADC_ACQUIRE &&\n        !report.samplePresent && state.committed==2048U && state.hasSample && !state.active);\n    CHECK(adc_cancel(&state,&report)==ADC_BAD_STATE);\n    CHECK(adc_start(&state,&request,UINT32_C(4294967290))==ADC_PENDING);\n    CHECK(adc_poll(&state,4U,ADC_EVENT_WAIT,&report)==ADC_PENDING && report.elapsedMs==10U);\n    CHECK(adc_poll(&state,14U,ADC_EVENT_ADVANCE,&report)==ADC_TIMEOUT && state.committed==2048U);\n    CHECK(adc_start(&state,&request,0U)==ADC_PENDING);\n    CHECK(adc_poll(&state,0U,ADC_EVENT_ADVANCE,&report)==ADC_PENDING && state.phase==ADC_CONVERT);\n    CHECK(adc_poll(&state,0U,ADC_EVENT_ADVANCE,&report)==ADC_PENDING && state.phase==ADC_RESULT);\n    CHECK(adc_poll(&state,0U,ADC_EVENT_ADVANCE,&report)==ADC_READY && report.sample==0U);\n    state.elapsedMs=21U;\n    CHECK(adc_start(&state,&request,0U)==ADC_BAD_STATE && state.elapsedMs==21U && state.committed==0U);\n    CHECK(adc_init(NULL)==ADC_INVALID_ARGUMENT && adc_cancel(NULL,&report)==ADC_INVALID_ARGUMENT);\n    return 0;\n}\nint main(void)\n{\n    if (arithmetic()!=0 || lifecycle()!=0) {\n        return 1;\n    }\n    if (puts(\"PASS ADC: literal thresholds/rationals/plans/copy/three-phase/deadline/wrap/cancel/preservation\")<0 ||\n        fflush(stdout)!=0) {\n        return 2;\n    }\n    return 0;\n}\n"

const usage='node scripts/test-adc-sampling.mjs [--native --compiler <existing-gcc> --python <python> --router <build_router.py> --output <workspace-.scratch-path>]'
if(process.argv.includes('--help')){console.log(usage);process.exit(0)}
function executable(value) {
 if(isAbsolute(value)||value.includes('/')||value.includes('\\'))return resolve(value)
 const extensions=process.platform==='win32'?['',...(process.env.PATHEXT||'.EXE;.CMD').split(';')]:['']
 for(const directory of (process.env.PATH||'').split(delimiter)){
  for(const extension of extensions){
   const candidate=join(directory,value+extension.toLowerCase())
   if(existsSync(candidate)&&statSync(candidate).isFile())return resolve(candidate)
  }
 }
 return value
}
if(process.argv.includes('--native')){
 const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i++){if(args[i]==='--native')continue;assert.ok(['--compiler','--python','--router','--output'].includes(args[i])&&args[i+1],usage);options[args[i].slice(2)]=args[++i]}
 const requestedTools={compiler:options.compiler||process.env.CC||'cc',python:options.python||process.env.PYTHON||'python'}
 const cc=executable(requestedTools.compiler),python=executable(requestedTools.python),router=options.router||process.env.MCU_BUILD_ROUTER
 assert.ok(router,'Select the existing mcu-build router with --router')
 const base=resolve(root,options.output||'.scratch/protocol-acquisition/native'),rel=relative(root,base).replaceAll('\\','/')
 assert.ok(!isAbsolute(rel)&&rel.startsWith('.scratch/')&&!rel.split('/').includes('..'))
 await mkdir(base,{recursive:true});const output=await mkdtemp(join(base,'run-'))
 const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),meta=p=>existsSync(p)?{path:p,bytes:statSync(p).size,sha256:hash(p)}:null
 const sources=['adc-sampling/adc.c','adc-sampling/adc.h','adc-sampling/README.txt','timer-pwm/time.c','timer-pwm/time.h'].map(p=>join(root,'docs/public/examples',p))
 const receipt={status:'running',output,commands:[],builds:[],executions:[],sources:sources.map(meta),requestedTools,tools:[cc,python,router].map(meta),limitations:'Host only; per-function stack and heuristic are not target maximum-stack or hardware evidence.'}
 function run(command,argv){const env={...process.env,PYTHONIOENCODING:'utf-8'};if(isAbsolute(cc))env.PATH=dirname(cc)+delimiter+(env.PATH||'');const r=spawnSync(command,argv,{cwd:root,env,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024});const rec={command:[command,...argv],status:r.status,stdout:r.stdout||'',stderr:r.stderr||'',error:r.error?.message};receipt.commands.push(rec);assert.ok(!r.error&&r.status===0,JSON.stringify(rec));return rec}
 const consumer=join(output,'consumer.c');await writeFile(consumer,CONSUMER,'utf8');receipt.consumer=meta(consumer)
 async function build(name,args,artifact){assert.equal(existsSync(artifact),false);const profile=join(output,name+'.toml'),q=s=>JSON.stringify(s.replaceAll('\\','/'));await writeFile(profile,'version=1\ndefault_profile="experiment"\n[settings]\nworkspace_root='+q(root)+'\nlog_dir='+q(relative(root,join(output,'logs')))+'\n[environments.existing]\nkind="custom"\n[profiles.experiment]\nenvironment="existing"\nplatform="host-c11"\ncommand=['+[cc,...args].map(q).join(',')+']\nartifacts=['+q(relative(root,artifact))+']\nartifact_policy="all"\n');const b={name,profile:meta(profile),inputs:[...sources,consumer,...args.filter(p=>existsSync(p)&&statSync(p).isFile())].map(meta)};receipt.builds.push(b);run(python,[router,'validate','--config',profile]);run(python,[router,'build','--config',profile,'--dry-run']);const r=run(python,[router,'build','--config',profile]);b.rawReturnCode=Number(r.stdout.match(/Return code: (-?\d+)/)?.[1]);assert.equal(b.rawReturnCode,0);const log=r.stdout.match(/Log: ([^\r\n]+)/)?.[1];assert.ok(log&&existsSync(log));b.log=meta(log);b.diagnostics=readFileSync(log,'utf8');b.artifact={...meta(artifact),fresh:true};assert.ok(b.artifact.bytes>0);return artifact}
 try{
  receipt.identities=[run(cc,['--version']),run(python,['--version'])]
  for(const[variant,flags]of [['normal',[]],['ndebug',['-DNDEBUG']]]){
   const objects=[];for(const[name,source]of [['adc',sources[0]],['time',sources[3]],['consumer',consumer]]){const obj=join(output,name+'-'+variant+'.o');await build(name+'-'+variant,['-std=c11','-Wall','-Wextra','-Werror','-pedantic',...flags,'-fstack-usage','-I',join(root,'docs/public/examples/adc-sampling'),'-I',join(root,'docs/public/examples/timer-pwm'),'-c',source,'-o',obj],obj);objects.push(obj)}
   const exe=join(output,'consumer-'+variant+(process.platform==='win32'?'.exe':''));await build('link-'+variant,[...objects,'-o',exe],exe);const r=run(exe,[]);assert.match(r.stdout,/^PASS ADC:/);receipt.executions.push({variant,artifact:meta(exe),...r})
  }
  assert.equal(receipt.executions[0].stdout,receipt.executions[1].stdout);receipt.status='passed'
 }catch(error){receipt.status='failed';receipt.failure=error.message;process.exitCode=1}finally{receipt.sourcesAfter=sources.map(meta);assert.ok(receipt.sources.every((s,i)=>s.sha256===receipt.sourcesAfter[i].sha256));await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,receipt:join(output,'receipt.json')}))}
}
