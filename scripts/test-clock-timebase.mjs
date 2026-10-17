import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
const read = path => readFile(new URL('../'+path,import.meta.url),'utf8')
const html = await read('docs/public/demos/clock-timebase.html')
const script = id => {
  const match = html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))
  assert.ok(match, 'Actual reader script '+id)
  // Private evidence can fault one real handler in memory; public source stays intact.
  if(process.env.CLOCK_TEST_FAULT==='prediction'&&id==='clock-controller') {
    assert.ok(match[1].includes('if(!prediction)return;'))
    return match[1].replace('if(!prediction)return;','')
  }
  return match[1]
}
const context = {}
vm.runInNewContext(script('clock-model')+';globalThis.model=ClockModel;',context)
const model=context.model
const seed={mode:'crystal',hz:8000000,m:8,n:336,p:2,q:7,ahb:1,apb1:4,apb2:2,mv:3300,scale:1,ws:5,q48:1}
const result=model.plan(seed)
assert.equal(result.status,'OK')
assert.deepEqual(JSON.parse(JSON.stringify(result.clocks)),{input:[1000000,1],vco:[336000000,1],sys:[168000000,1],hclk:[168000000,1],pclk1:[42000000,1],pclk2:[84000000,1],timer1:[84000000,1],timer2:[168000000,1],q:[48000000,1]})
console.log('PASS unit09 literal clock fixture')

const plain=value=>JSON.parse(JSON.stringify(value))
for (const [key,values,expected] of [
  ['ahb',[1,2,4,8,16,64,128,256,512],[168000000,84000000,42000000,21000000,10500000,2625000,1312500,656250,328125]],
  ['p',[2,4,6,8],[168000000,84000000,56000000,42000000]]
]) for(let i=0;i<values.length;i++) {
  const r=model.plan({...seed,[key]:values[i]})
  assert.equal(r.status,'OK')
  assert.deepEqual(plain(r.clocks.hclk),[expected[i],1])
}
for(const [i,value] of [1,2,4,8,16].entries()) {
  const r=model.plan({...seed,ahb:8,apb1:value,apb2:value})
  assert.equal(r.status,'OK')
  assert.deepEqual(plain(r.clocks.pclk1),[[21000000,10500000,5250000,2625000,1312500][i],1])
  assert.deepEqual(plain(r.clocks.timer1),[[21000000,21000000,10500000,5250000,2625000][i],1])
}
for(let q=2;q<=15;q++) assert.equal(model.plan({...seed,q,q48:0}).status,q<5?'DEVICE':'OK')
for(const [key,value,status] of [
  ['m',0,'INVALID'],['m',1,'INVALID'],['m',64,'INVALID'],['n',49,'INVALID'],['n',433,'INVALID'],
  ['n',100,'POLICY'],['p',3,'INVALID'],['q',1,'INVALID'],['q',16,'INVALID'],['ahb',32,'INVALID'],
  ['apb1',3,'INVALID'],['apb2',32,'INVALID'],['apb1',2,'DEVICE'],['apb2',1,'DEVICE'],
  ['scale',2,'DEVICE'],['scale',3,'INVALID'],['ws',4,'FLASH'],['ws',8,'INVALID'],['q48',2,'INVALID'],
  ['mv',2699,'POLICY'],['mv',3601,'POLICY'],['hz',7999999,'POLICY'],['hz',16000001,'POLICY'],
  ['hz',26000001,'DEVICE'],['hz',Number.MAX_SAFE_INTEGER,'OVERFLOW']
]) assert.equal(model.plan({...seed,[key]:value}).status,status,key+'='+value)
for(const mv of [2700,3600]) assert.equal(model.plan({...seed,mv}).status,'OK')
assert.equal(model.plan({...seed,mode:'hsi',hz:16000000,m:16}).status,'OK')
assert.equal(model.plan({...seed,mode:'hsi'}).status,'DEVICE')
assert.equal(model.plan({...seed,mode:'bypass',hz:1000000,m:2,n:384,p:2,q:4}).status,'POLICY','bypass minimum source still fails input policy')
assert.equal(model.plan({...seed,mode:'bypass',hz:50000000,m:25,n:192,p:4,q:8}).status,'OK')
assert.equal(model.plan({...seed,mode:'bypass',hz:50000001}).status,'DEVICE')
for(const [ws,n,p] of [[0,240,8],[1,240,4],[2,360,4],[3,240,2],[4,300,2],[5,336,2]]) {
  assert.equal(model.plan({...seed,n,p,ws,q48:0}).status,'OK')
  assert.equal(model.plan({...seed,n,p,ws,q48:0,hz:8000001}).status,ws===5?'DEVICE':'FLASH')
}
assert.deepEqual(plain(model.tick([168000000,1],1000)),{status:'OK',count:168000,load:167999,achieved:[1000,1]})
for(const [source,rate,status] of [[[1,1],1,'NO_EVENT'],[[1,1],2,'RANGE'],[[16777217,1],1,'RANGE'],
  [[10,1],3,'INEXACT'],[[0,1],1,'INVALID'],[[1,0],1,'INVALID'],[[2,1],0,'INVALID']]) assert.equal(model.tick(source,rate).status,status)
assert.equal(model.tick([2,1],1).load,1)
assert.equal(model.tick([16777216,1],1).load,16777215)
for(const [hz,m,value] of [[4194304,4,16777216],[16777217,16,16777217]]) {
  const p=model.plan({...seed,hz,m,n:256,ahb:8,q48:0})
  assert.equal(p.status,'OK');assert.deepEqual(plain(p.clocks.hclk),[value,1])
  assert.equal(model.tick(p.clocks.hclk,1).status,value===16777216?'OK':'RANGE')
}
assert.deepEqual(plain(model.uart(42000000,115200)),{status:'OK',divisor:365,brr:365,mantissa:22,fraction:13,achieved:[8400000,73],errorNum:-48000,errorDen:42048000})
for(const [clock,baud,divisor] of [[165,10,17],[160,10,16],[65535,1,65535],[319,10,32]]) assert.equal(model.uart(clock,baud).divisor,divisor)
for(const [clock,baud,status] of [[65536,1,'RANGE'],[159,10,'RANGE'],[0,1,'INVALID'],[1,0,'INVALID'],[Infinity,1,'INVALID']]) assert.equal(model.uart(clock,baud).status,status)
console.log('PASS unit09 rational PLL/divider/supply/Flash/Q/tick/UART domains and independent literal boundaries')

const successfulEvents=[
  'HSI_ENABLE_REQUEST','HSIRDY_OBSERVED_AVAILABLE','APB16_REQUEST','APB16_READBACK','SW_HSI_REQUEST','SWS_HSI_OBSERVED','PLL_OFF_REQUEST',
  'PLLRDY_CLEAR_OBSERVATION','PLLRDY_CLEAR_OBSERVATION','HSE_OFF_REQUEST','HSERDY_CLEAR_OBSERVATION','HSERDY_CLEAR_OBSERVATION',
  'HSE_MODE_WRITE_WHILE_OFF','HSE_ENABLE_REQUEST','HSERDY_OBSERVATION','HSERDY_OBSERVATION','PWR_CLOCK_VOS1_REQUEST',
  'F407_VOSRDY_OBSERVATION','F407_VOSRDY_OBSERVATION','FLASH5_REQUEST','FLASH5_READBACK',
  'PLL_CONFIG_M8_N336_P2_OR4_Q7_WHILE_OFF','PLL_ENABLE_REQUEST','PLLRDY_OBSERVATION','PLLRDY_OBSERVATION',
  'HPRE1_READBACK_APB16_HELD','SW_PLL_REQUEST','SWS_PLL_OBSERVATION','SWS_PLL_OBSERVATION','FINAL_APB_REQUEST','FINAL_APB_READBACK',
  'FINAL_FLASH_REQUEST_AFTER_SWS','FINAL_FLASH_READBACK','VOS1_RETAINED','FINAL_F407_VOSRDY_OBSERVATION','SUCCESS_TARGET_CONFIRMED'
]
for(const down of [0,1]) {
  const s=model.begin(down,'none',3), events=[]
  while(!s.terminal) {
    const before={...s};assert.equal(model.step(s),'OK');events.push(s.event)
    assert.ok(s.hclk/s.apb1<=42000000&&s.hclk/s.apb2<=84000000)
    if(before.phase===17) assert.deepEqual([s.pllOn,s.plli2sOn],[0,0])
    if(before.phase===21) assert.equal(s.source,'HSI','SW request is not SWS observation')
    if(before.phase===22&&s.attempt===1) assert.equal(s.hclk,16000000)
    if(s.scale===2&&s.hclk!==16000000) assert.equal(s.hclk,84000000,'downscale after confirmed HCLK')
    assert.ok(s.steps<50)
  }
  const expected=[...successfulEvents];if(down)expected[33]='VOS2_REQUEST_AFTER_HCLK84'
  assert.deepEqual(events,expected)
  assert.deepEqual([s.hclk,s.scale,s.ws,s.apb1,s.apb2],[down?84000000:168000000,down?2:1,down?2:5,down?2:4,down?1:2])
  const snapshot=plain(s);assert.equal(model.step(s),'DONE');assert.deepEqual(plain(s),snapshot)
}
for(const [fault,status,steps] of [['hse','TIMEOUT_HSE',17],['pll','TIMEOUT_PLL',26],['switch','TIMEOUT_SWITCH',30],
  ['readback','READBACK',21],['vos','TIMEOUT_VOS',20],['off','TIMEOUT_OFF',10]]) for(const down of [0,1]) {
  const s=model.begin(down,fault,3)
  while(!s.terminal){const status=model.step(s);assert.ok(['OK',s.status].includes(status));assert.ok(s.steps<50)}
  assert.deepEqual([s.status,s.steps,s.source,s.hclk,s.apb1,s.apb2],[status,steps,'HSI',16000000,16,16])
}
for(const limit of [1,2,3]) {
  const s=model.begin(0,'hse',limit);while(!s.terminal){model.step(s);assert.ok(s.steps<50)}
  assert.ok(s.attempt<=limit);assert.equal(s.status,limit===1?'TIMEOUT_OFF':'TIMEOUT_HSE')
}
console.log('PASS unit09 literal up/down request/observe traces, all bounded failures and terminal preservation')

// Strict stack parser: mismatched tags FAIL; it never silently repairs/pops HTML.
const decode=s=>s.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&#39;',"'").replaceAll('&amp;','&')
class Element {
  constructor(tag,attrs={}) {
    this.tagName=tag;this.attrs=attrs;this.children=[];this.parentElement=null;this.listeners={};this.value=attrs.value??'';
    this.disabled='disabled' in attrs;this.hidden='hidden' in attrs;this.open='open' in attrs;this.data='';this.classes=new Set((attrs.class??'').split(/\s+/));
    this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),contains:c=>this.classes.has(c)}
  }
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
assert.throws(()=>parseTree('<main><div><p>x</div></p></main>'),'Parser must reject HTML repair')
for(const slug of ['clock-timebase','clock-timebase-reference']) {
  const source=await read('docs/public/demos/'+slug+'.html'), tree=parseTree(source)
  assert.equal(tree.root.querySelectorAll('main').length,1)
  const heading=tree.root.querySelectorAll('h1')
  const mirrorHeading=(await read('docs/learn/'+slug+'.md')).match(/^# (.+) \{#([^}]+)\}$/m)
  assert.equal(heading.length,1,'Exactly one actual reader H1: '+slug)
  assert.ok(mirrorHeading,'Explicit mirror H1 anchor: '+slug)
  assert.equal(heading[0].id,mirrorHeading[2],'Actual H1 ID matches searchable mirror anchor: '+slug)
  assert.equal(heading[0].textContent,mirrorHeading[1],'Actual H1 title matches searchable mirror: '+slug)
  for(const h of tree.root.querySelectorAll('h2')) {
    assert.equal(h.parentElement.parentElement.tagName,'main','h2 region direct main child')
    assert.equal(h.parentElement.attrs['aria-labelledby'],h.id)
  }
  for(const a of tree.root.querySelectorAll('a')) if(a.attrs.href?.startsWith('#')) assert.ok(tree.ids[a.attrs.href.slice(1)],'Local href '+slug+a.attrs.href)
  for(const name of ['clock_plan.h','clock_plan.c','README.txt']) {
    const a=tree.root.querySelectorAll('a').find(e=>e.attrs.href==='../examples/clock-timebase/'+name)
    assert.ok(a&&'download' in a.attrs,'native source download '+name)
    assert.ok((await read('docs/learn/'+slug+'.md')).includes('<a href="../examples/clock-timebase/'+name+'" download>'))
  }
  const accepted=await read('docs/public/demos/bounded-fifo.html')
  assert.equal(source.match(/<style>([\s\S]*?)<\/style>/g)[1],accepted.match(/<style>([\s\S]*?)<\/style>/g)[1])
  for(const id of ['note-deep-links','note-print'])assert.equal(source.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0],accepted.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0])
}
const tree=parseTree(html), {ids}=tree
assert.equal(tree.root.querySelectorAll('article').filter(e=>e.classes.has('exercise')).length,10)
for(let i=1;i<=10;i++){
  const id=String(i).padStart(2,'0');assert.equal(ids['clock-answer-'+id].open,false)
  assert.equal(ids['clock-answer-'+id].parentElement,ids['clock-exercise-'+id])
  assert.ok(ids['clock-question-'+id].textContent.length>5)
}
const mirror=await read('docs/learn/clock-timebase.md')
for(const intro of ['反馈核对：','时基反馈核对：']) {
  const prose=html.match(new RegExp('<p>('+intro+'[^<]+)</p>'))
  assert.ok(prose,'Static cause explanation '+intro)
  assert.ok(mirror.includes(decode(prose[1])),'Complete searchable cause explanation '+intro)
}
const blocks=[...html.matchAll(/<code class="language-(?:c|text)">([\s\S]*?)<\/code>/g)].map(m=>decode(m[1]))
for(const [i,name] of ['clock_plan.h','clock_plan.c','README.txt'].entries()) {
  const bytes=await read('docs/public/examples/clock-timebase/'+name)
  assert.equal(blocks[i],bytes,'display/download source byte parity '+name)
  assert.ok(mirror.includes('```text\n'+bytes+'```'),'search source parity '+name)
}
console.log('PASS unit09 strict HTML ownership, all source/mirror downloads, ten folded questions, exact shared layers')

const windowListeners={}
const window={location:{hash:''},addEventListener:(n,f)=>(windowListeners[n]??=[]).push(f),
  dispatchEvent:e=>{for(const f of windowListeners[e.type]??[])f()},print:()=>{}}
const document={body:tree.root.querySelectorAll('body')[0],getElementById:id=>{assert.ok(ids[id],'Real DOM ID '+id);return ids[id]},querySelectorAll:tag=>tree.root.querySelectorAll(tag)}
Object.assign(context,{document,window,requestAnimationFrame:f=>f(),Event:class{constructor(type){this.type=type}}})
vm.runInNewContext(script('clock-controller'),context)
const predict=(prefix,value)=>{ids[prefix+'-prediction'].value=value;ids[prefix+'-prediction'].dispatch('change')}
const submit=prefix=>ids[prefix+'-form'].dispatch('submit')
for(const prefix of ['plan','timing']) {
  assert.equal(ids[prefix+'-apply'].disabled,true);submit(prefix);assert.equal(ids[prefix+'-result'].hidden,true)
  predict(prefix,'OK');submit(prefix);assert.equal(ids[prefix+'-result'].hidden,false)
  assert.match(ids[prefix+'-feedback'].textContent,/预测正确/);assert.equal(ids[prefix+'-prediction'].value,'')
}
assert.match(ids['plan-state'].textContent,/hclk=168000000\/1.*pclk1=42000000\/1/)
assert.match(ids['timing-feedback'].textContent,/count=168000.*LOAD=167999/,'Normal SysTick feedback explains exact count/reload')
const planAccepted=ids['plan-state'].textContent
predict('plan','OK');ids.apb1.value='2';ids.apb1.dispatch('input');assert.equal(ids['plan-prediction'].value,'')
assert.equal(ids['plan-state'].textContent,planAccepted);submit('plan');assert.equal(ids['plan-state'].textContent,planAccepted)
predict('plan','OK');submit('plan');assert.match(ids['plan-feedback'].textContent,/预测不同.*DEVICE/);assert.equal(ids['plan-state'].textContent,planAccepted)
assert.match(ids['plan-feedback'].textContent,/PCLK1=.*84.*42/,'Rejected APB1/2 explains84MHz versus42MHz')
for(const [edits,status,cause] of [
  [{ws:4},'FLASH',/HCLK=.*168.*WS.*5.*当前WS=4/],
  [{apb2:1},'DEVICE',/PCLK2=.*168.*84/],
  [{scale:2},'DEVICE',/HCLK=.*168.*Scale2.*144/],
  [{mv:2699,apb1:2},'POLICY',/VDD=2699mV.*2700.*3600/],
  [{n:100,apb1:2},'POLICY',/N=100.*192.*432/],
  [{hz:16000001},'POLICY',/PLL输入=.*教学.*1000000.*2000000/],
  [{hz:12000000},'POLICY',/VCO=.*504.*192.*432/],
  [{hz:26000001,mv:2699},'DEVICE',/HSE晶体.*26000001.*4000000.*26000000/],
  [{n:432,q48:0},'DEVICE',/SYSCLK=.*216.*24.*168/],
  [{q:2,q48:0},'DEVICE',/Q支路=.*168.*75/],
  [{q:6},'POLICY',/Q支路=.*56.*48/]
]) {
  for(const [key,value] of Object.entries({...seed,...edits})) {ids[key].value=String(value);ids[key].dispatch(key==='mode'?'change':'input')}
  predict('plan','OK');submit('plan')
  assert.match(ids['plan-feedback'].textContent,new RegExp(status));assert.match(ids['plan-feedback'].textContent,cause)
  assert.equal(ids['plan-state'].textContent,planAccepted,'Cause reporting cannot change accepted output')
}
for(const [key,value] of Object.entries(seed)){ids[key].value=String(value);ids[key].dispatch(key==='mode'?'change':'input')}
predict('plan','OK');submit('plan');assert.match(ids['plan-feedback'].textContent,/PLL输入=.*1000000.*FlashWS=5.*5/,'Normal feedback explains met conditions')
for(const invalid of ['', '-1','1.5','NaN','Infinity','0x10','1e2']) {
  ids.hz.value=invalid;ids.hz.dispatch('input');predict('plan','OK');submit('plan')
  assert.equal(ids['plan-state'].textContent,planAccepted);assert.match(ids['plan-feedback'].textContent,/INVALID/)
}
ids['plan-reset'].dispatch('click');assert.equal(ids['plan-result'].hidden,true);assert.equal(ids.hz.value,'8000000');assert.equal(ids.apb1.value,'4')
assert.equal(ids['plan-prediction'].value,'');assert.equal(ids['plan-apply'].disabled,true)
const timingAccepted=ids['timing-state'].textContent
for(const invalid of ['', '-1','1.5','NaN','Infinity','0','4294967296']) {
  ids['timing-kind'].value='uart';ids['timing-kind'].dispatch('change');ids['timing-rate'].value=invalid;ids['timing-rate'].dispatch('input')
  predict('timing','OK');submit('timing');assert.equal(ids['timing-state'].textContent,timingAccepted)
}
ids['timing-clock'].value='42000000';ids['timing-clock'].dispatch('input');ids['timing-rate'].value='115200';ids['timing-rate'].dispatch('input')
predict('timing','INEXACT');submit('timing');assert.match(ids['timing-feedback'].textContent,/预测不同.*OK/);assert.match(ids['timing-state'].textContent,/"divisor":365/)
assert.match(ids['timing-feedback'].textContent,/D=365.*BRR=0x016D/,'Normal UART feedback explains encoding')
const timingGood=ids['timing-state'].textContent
for(const [kind,clock,rate,status,cause] of [
  ['tick','10','3','INEXACT',/10\/3.*不是整数.*不取整/],
  ['tick','1','1','NO_EVENT',/count=1.*LOAD=0.*1→0.*2/],
  ['tick','1','2','RANGE',/count=0.*2/],
  ['tick','16777217','1','RANGE',/count=16777217.*16777216/],
  ['uart','159','10','RANGE',/baud=10.*PCLK\/16=.*159\/16/],
  ['uart','65536','1','RANGE',/D=65536.*65535/],
  ['','42000000','115200','INVALID',/运算类型.*tick.*uart/],
  ['uart','','115200','INVALID',/时钟输入.*正整数/]
]) {
  ids['timing-kind'].value=kind;ids['timing-kind'].dispatch('change')
  ids['timing-clock'].value=clock;ids['timing-clock'].dispatch('input')
  ids['timing-rate'].value=rate;ids['timing-rate'].dispatch('input')
  predict('timing','OK');submit('timing');assert.match(ids['timing-feedback'].textContent,new RegExp(status));assert.match(ids['timing-feedback'].textContent,cause)
  assert.equal(ids['timing-state'].textContent,timingGood,'Timing rejection preserves accepted result')
}
ids['timing-reset'].dispatch('click');assert.equal(ids['timing-result'].hidden,true)
assert.equal(ids['trace-step'].disabled,true);submit('trace');assert.equal(ids['trace-result'].hidden,true)
predict('trace','done');submit('trace');assert.match(ids['trace-feedback'].textContent,/预测不同.*request/)
assert.match(ids['trace-state'].textContent,/HSI_ENABLE_REQUEST.*HCLK=16000000/)
const previousTrace=ids['trace-state'].textContent
predict('trace','observed');ids['trace-direction'].value='1';ids['trace-direction'].dispatch('change')
assert.equal(ids['trace-prediction'].value,'');assert.equal(ids['trace-state'].textContent,previousTrace)
ids['trace-direction'].value='bad';ids['trace-direction'].dispatch('change');predict('trace','request');submit('trace')
assert.equal(ids['trace-state'].textContent,previousTrace);assert.match(ids['trace-feedback'].textContent,/INVALID/)
for(const fault of ['none','hse','pll','switch','readback','vos','off']) {
  ids['trace-reset'].dispatch('click');ids['trace-fault'].value=fault;ids['trace-fault'].dispatch('change')
  let steps=0
  while(!ids['trace-pending'].textContent.includes('已终止')) {
    predict('trace','request');submit('trace');assert.ok(++steps<50)
  }
  assert.match(ids['trace-state'].textContent,fault==='none'?/SUCCESS_TARGET_CONFIRMED.*HCLK=168000000/:/FAIL_SAFE_HSI16_CONFIRMED.*HCLK=16000000/)
  const state=ids['trace-state'].textContent;predict('trace','done');assert.equal(ids['trace-step'].disabled,true);submit('trace');assert.equal(ids['trace-state'].textContent,state)
}
ids['trace-reset'].dispatch('click');assert.equal(ids['trace-result'].hidden,true);assert.equal(ids['trace-prediction'].value,'')
console.log('PASS unit09 actual plan/timing/trace handlers: prediction, wrong feedback, pending, invalid preservation, reset, bounded end')

for(const id of ['clock-reader','clock-worksheet','note-deep-links','note-print']) vm.runInNewContext(script(id),context)
const folds=()=>tree.root.querySelectorAll('details').map(e=>[e,e.open])
window.location.hash='#clock-practice';window.dispatchEvent({type:'hashchange'})
assert.ok(folds().every(([,open])=>!open),'Ordinary section hash does not reveal answers')
window.location.hash='#clock-answer-03';window.dispatchEvent({type:'hashchange'})
assert.equal(ids['clock-answer-03'].open,true);assert.equal(ids['clock-answer-04'].open,false)
window.location.hash='#clock-question-05';window.dispatchEvent({type:'hashchange'});assert.equal(ids['clock-answer-05'].open,false)
const beforePrint=folds();window.dispatchEvent({type:'beforeprint'});assert.ok(folds().every(([,open])=>open))
window.dispatchEvent({type:'afterprint'});assert.deepEqual(folds(),beforePrint)
window.print=()=>{window.dispatchEvent({type:'beforeprint'});throw new Error('injected dispatch failure')}
ids['print-questions'].dispatch('click');assert.equal(document.body.classList.contains('exercise-print'),false);assert.deepEqual(folds(),beforePrint)
window.print=()=>{window.dispatchEvent({type:'beforeprint'});assert.equal(document.body.classList.contains('exercise-print'),true);window.dispatchEvent({type:'afterprint'})}
ids['print-questions'].dispatch('click');assert.deepEqual(folds(),beforePrint);assert.equal(document.body.classList.contains('exercise-print'),false)
ids['collapse-notes'].dispatch('click');assert.ok(folds().every(([,open])=>!open));ids['expand-notes'].dispatch('click');assert.ok(folds().every(([,open])=>open))
console.log('PASS unit09 strict native ancestry and ordinary/worksheet print/failure prior-fold restoration; actual browser remains root gate')
