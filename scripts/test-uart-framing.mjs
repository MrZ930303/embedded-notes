import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
const read = path => readFile(new URL('../'+path,import.meta.url),'utf8')
const html = await read('docs/public/demos/uart-framing.html')
const script = id => {
  const match = html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))
  assert.ok(match, 'Actual reader script '+id)
  if(process.env.UART_TEST_FAULT==='prediction'&&id==='uart-controller'){
    const gate="if(!prediction()||(replay&&step>=UartModel.trace.length))return;"
    assert.ok(match[1].includes(gate),'Fault injection must hit the real handler')
    return match[1].replace(gate,"if(replay&&step>=UartModel.trace.length)return;")
  }
  return match[1]
}
const context={}
vm.runInNewContext(script('uart-model')+';globalThis.model=UartModel;',context)
const model=context.model
let state=model.create(100,0)
for(const byte of [165,3,1,100]) state=model.receive(state,byte).state
let result=model.poll(state,1)
assert.equal(result.status,'OK')
assert.equal(result.consumed,4)
assert.equal(result.command,null)
for(const byte of [0,102]) result={state:model.receive(result.state,byte).state}
result=model.poll(result.state,2)
assert.equal(result.command.periodMs,100)
assert.equal(result.state.applicationPeriod,100)
console.log('PASS UART actual model: literal period100 fragmented over real four-byte capacity policy')

const plain=x=>JSON.parse(JSON.stringify(x))
function feed(s,bytes,chunk=4,now=0){
 let r={state:s},commands=[]
 for(let i=0;i<bytes.length;i+=chunk){
  for(const b of bytes.slice(i,i+chunk)){const q=model.receive(r.state,b);assert.equal(q.status,'OK');r=q}
  r=model.poll(r.state,++now);assert.equal(r.status,'OK');assert.ok(r.consumed<=4&&r.events.length<=5)
  if(r.command)commands.push(plain(r.command))
 }
 return {...r,commands,now}
}
for(const chunk of [1,2,3,4]){
 for(const [bytes,period] of [
  [[165,3,1,100,0,102],100],[[165,3,1,165,1,166],421],[[165,3,1,1,0,3],1],
  [[165,3,1,232,3,233],1000],[[165,3,1,101,1,102],357]
 ]){
  const r=feed(model.create(),bytes,chunk)
  assert.deepEqual(r.commands,[{kind:'SET_PERIOD',periodMs:period}])
  assert.equal(r.state.applicationPeriod,period)
 }
}
assert.deepEqual(feed(model.create(),[165,1,2,3,165,1,2,3]).commands,
 [{kind:'GET_STATUS',periodMs:100},{kind:'GET_STATUS',periodMs:100}],
 'A combined stream is serviced in bounded pieces, without a read-call frame delimiter')
for(const bytes of [[165,0],[165,9],[165,255],[165,165],[165,1,2,165],[165,1,164,165],
 [165,1,3,2],[165,1,1,0],[165,3,2,0,0,1],[165,3,1,0,0,2],[165,3,1,233,3,232],
 [165,8,1,2,3,4,5,6,7,8,0]]){
 let r=feed(model.create(),bytes)
 assert.equal(r.command,null);assert.equal(r.state.phase,'SEEK');assert.equal(r.state.applicationPeriod,100)
 assert.equal(r.state.diagnostics.rejected,1)
 r=feed(r.state,[165,1,2,3],4,r.now)
 assert.deepEqual(r.commands,[{kind:'GET_STATUS',periodMs:100}])
}
let r=feed(model.create(),[165,1,2])
r=feed(r.state,[3,0,165,0],4,r.now)
assert.deepEqual(r.command&&plain(r.command),{kind:'GET_STATUS',periodMs:100})
assert.deepEqual(plain(r.events),['COMMAND','NOISE','START','BAD_LENGTH'])
let s=model.receive(model.create(),165).state
s=model.poll(s,0).state
r=model.poll(s,19);assert.equal(r.state.age,19);assert.equal(r.events.length,0)
for(const b of [165,1,2,3])r={state:model.receive(r.state,b).state}
r=model.poll(r.state,20)
assert.deepEqual(plain(r.events),['TIMEOUT','START','LENGTH_ACCEPTED','PAYLOAD_ACCEPTED','COMMAND'])
assert.equal(r.command.kind,'GET_STATUS')
s=feed(model.create(),[165,3,1,100],4).state
for(const b of [0,102])s=model.receive(s,b).state
r=model.poll(s,21)
assert.deepEqual(plain(r.events),['TIMEOUT','NOISE','NOISE'])
assert.equal(r.command,null);assert.equal(r.state.applicationPeriod,100)
s=model.receive(model.create(100,4294967290),165).state
s=model.poll(s,4294967290).state
r=model.poll(s,13);assert.equal(r.state.age,19)
r=model.poll(r.state,14);assert.deepEqual(plain(r.events),['TIMEOUT'])
assert.equal(model.poll(r.state,15).events.length,0)
s=model.receive(model.create(),165).state;s=model.poll(s,0).state
s=model.receive(s,1).state;s=model.poll(s,19).state
assert.equal(s.age,0)
r=model.poll(s,38);assert.equal(r.state.age,19)
const before=plain(s)
r=model.poll(s,2147483667)
assert.equal(r.status,'TIME_REJECTED');assert.deepEqual(plain(r.state),before)
for(const byte of [-1,256,1.5,NaN,Infinity,'1',null,undefined]){
 r=model.receive(s,byte);assert.equal(r.status,'INVALID_ARGUMENT');assert.deepEqual(plain(r.state),before)
}
for(const now of [-1,4294967296,1.5,NaN,Infinity,'1',null,undefined]){
 r=model.poll(s,now);assert.equal(r.status,'INVALID_ARGUMENT');assert.deepEqual(plain(r.state),before)
}
s=model.receive(model.create(),165).state;s=model.poll(s,0).state
for(const b of [1,2,3,4])s=model.receive(s,b).state
const full=plain(s)
r=model.receive(s,165);assert.equal(r.status,'LOSS');assert.equal(r.discarded,4);assert.equal(r.fullPreserved,true)
assert.deepEqual(plain(s),full,'Pure model full rejection input remains unchanged')
assert.equal(r.state.queue.length,0);assert.equal(r.state.phase,'SEEK');assert.equal(r.state.applicationPeriod,100)
assert.deepEqual(plain(model.poll(r.state,1).events),[])
r=feed(r.state,[165,1,2,3],4,1);assert.equal(r.command.kind,'GET_STATUS')
for(const key of ['accepted','rejected','timeouts','losses']){
 let seed=model.create();seed.diagnostics[key]=4294967295
 if(key==='accepted')r=feed(seed,[165,1,2,3])
 if(key==='rejected')r=feed(seed,[165,0])
 if(key==='timeouts'){seed=model.receive(seed,165).state;seed=model.poll(seed,0).state;r=model.poll(seed,20)}
 if(key==='losses'){for(const b of [0,1,2,3])seed=model.receive(seed,b).state;r=model.receive(seed,4)}
 assert.equal(r.state.diagnostics[key],4294967295);assert.equal(r.state.diagnostics.saturated,true)
}
for(const patch of [{phase:'INVALID'},{phase:'PAYLOAD',length:9,received:0},{age:20},{applicationPeriod:0},{queue:[0,1,2,3,4]}]){
 s={...plain(model.create()),...patch};const saved=plain(s)
 assert.equal(model.poll(s,0).status,'BAD_STATE');assert.equal(model.receive(s,0).status,'BAD_STATE')
 assert.deepEqual(plain(s),saved)
}
s=model.create();for(let i=0;i<1000;i++){r=feed(s,[0,1,2,3],4,i);s=r.state;assert.equal(r.command,null);assert.equal(r.consumed,4)}
console.log('PASS UART model: grammar/semantic/loss/timeout/wrap/event/counter/noise literal fixtures')

class Element{
 constructor(value=''){this.value=value;this.disabled=false;this.hidden=false;this.listeners={};this.textContent='';this.innerHTML=''}
 addEventListener(name,fn){this.listeners[name]=fn}
 dispatch(name){this.listeners[name]?.({preventDefault(){},target:this})}
}
const elements={}
for(const [,id] of html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').matchAll(/\bid="([^"]+)"/g))elements[id]=new Element()
for(const prefix of ['uart','uart-trace']){
 elements[prefix+'-result'].hidden=true
 elements[prefix+'-state'].textContent='seed period=100ms'
}
for(const [id,value] of Object.entries({'uart-operation':'receive','uart-byte':'165','uart-now':'0'}))elements[id].value=value
context.document={getElementById(id){assert.ok(elements[id],'Known controller DOM '+id);return elements[id]}}
vm.runInNewContext(script('uart-controller'),context)
const predict=(prefix,status,phase,period)=>{
 elements[prefix+'-status-prediction'].value=status;elements[prefix+'-status-prediction'].dispatch('change')
 elements[prefix+'-phase-prediction'].value=phase;elements[prefix+'-phase-prediction'].dispatch('change')
 elements[prefix+'-period-prediction'].value=String(period);elements[prefix+'-period-prediction'].dispatch('input')
}
const submit=prefix=>elements[prefix+'-form'].dispatch('submit')
const edit=(id,value,event='input')=>{elements[id].value=String(value);elements[id].dispatch(event)}
const original=elements['uart-state'].textContent
submit('uart');assert.equal(elements['uart-state'].textContent,original);assert.equal(elements['uart-result'].hidden,true)
predict('uart','OK','SEEK',100);submit('uart')
assert.match(elements['uart-feedback'].textContent,/预测正确.*入四槽FIFO.*不等于接受命令/)
assert.equal(elements['uart-apply'].disabled,true);assert.equal(elements['uart-status-prediction'].value,'')
const applied=elements['uart-state'].textContent
predict('uart','OK','LENGTH',100);edit('uart-operation','poll','change')
assert.equal(elements['uart-status-prediction'].value,'');assert.match(elements['uart-pending'].textContent,/待应用/)
assert.equal(elements['uart-state'].textContent,applied)
submit('uart');assert.equal(elements['uart-state'].textContent,applied)
predict('uart','OK','SEEK',100);submit('uart')
assert.match(elements['uart-feedback'].textContent,/预测不同.*START.*下一次/)
assert.match(elements['uart-state'].textContent,/phase=LENGTH/)
for(const [id,bads] of [['uart-byte',['','-1','256','1.5','NaN','Infinity','0xA5']],['uart-now',['','-1','4294967296','1.5','NaN','Infinity','0x10']]]){
 for(const value of bads){
  edit('uart-byte',165);edit('uart-now',0);edit(id,value)
  const old=elements['uart-state'].textContent
  predict('uart','OK','SEEK',100);submit('uart')
  assert.equal(elements['uart-state'].textContent,old);assert.match(elements['uart-feedback'].textContent,/输入无效.*保持/)
  assert.equal(elements['uart-status-prediction'].value,'')
 }
}
elements['uart-reset'].dispatch('click')
assert.equal(elements['uart-result'].hidden,true);assert.equal(elements['uart-last'].textContent,'')
assert.equal(elements['uart-byte'].value,'165');assert.equal(elements['uart-now'].value,'0')
for(const p of ['','0','1001','1.5','Infinity']){
 predict('uart','OK','SEEK',p);assert.equal(elements['uart-apply'].disabled,true)
}
for(let i=0;i<5;i++){
 predict('uart',i===4?'LOSS':'OK','SEEK',100);submit('uart')
 assert.match(elements['uart-feedback'].textContent,/预测正确/)
}
assert.match(elements['uart-feedback'].textContent,/失败字节不重试.*应用周期保留/)
elements['uart-reset'].dispatch('click')
edit('uart-operation','poll','change');edit('uart-now',2147483648)
predict('uart','TIME_REJECTED','SEEK',100);submit('uart')
assert.match(elements['uart-feedback'].textContent,/预测正确.*2\^31.*均保持/)
elements['uart-reset'].dispatch('click')
let traceState=model.create()
for(let i=0;i<model.trace.length;i++){
 const input=model.trace[i]
 const old=elements['uart-trace-state'].textContent
 submit('uart-trace');assert.equal(elements['uart-trace-state'].textContent,old)
 const expected=input.op==='receive'?model.receive(traceState,input.byte):model.poll(traceState,input.now)
 // Controller expected transitions are independently fixed by static trace rows below.
 const phases=['SEEK','LENGTH','LENGTH','LENGTH','LENGTH','PAYLOAD','PAYLOAD','PAYLOAD','SEEK','SEEK','LENGTH','LENGTH','LENGTH','LENGTH','LENGTH','LENGTH','SEEK']
 predict('uart-trace','OK',phases[i],100);submit('uart-trace')
 assert.match(elements['uart-trace-feedback'].textContent,/预测正确/)
 assert.equal((elements['uart-trace-log'].innerHTML.match(/<li>/g)||[]).length,i+1)
 traceState=expected.state
}
assert.match(elements['uart-trace-operation'].textContent,/已结束17\/17/)
const ended=elements['uart-trace-state'].textContent
predict('uart-trace','OK','SEEK',100);submit('uart-trace')
assert.equal(elements['uart-trace-state'].textContent,ended)
assert.equal(elements['uart-trace-apply'].disabled,true)
elements['uart-trace-reset'].dispatch('click')
assert.equal(elements['uart-trace-result'].hidden,true);assert.equal(elements['uart-trace-log'].innerHTML,'')
assert.match(elements['uart-trace-operation'].textContent,/下一步1\/17/)
console.log('PASS UART actual controller: prediction gate/wrong/edit/pending/invalid/loss/rejected time/reset/17-step terminal')

class Node{
 constructor(tag,attrs,parent){this.tag=tag;this.attrs=attrs;this.parentElement=parent;this.children=[];this.open=Object.hasOwn(attrs,'open');this.listeners={};this.scrolls=0}
 closest(tag){for(let n=this;n;n=n.parentElement)if(n.tag===tag)return n;return null}
 querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...c.querySelectorAll(tag)])}
 scrollIntoView(){this.scrolls++}
 addEventListener(name,fn){(this.listeners[name]??=[]).push(fn)}
 dispatch(name){for(const fn of this.listeners[name]||[])fn({})}
 getAttribute(name){return this.attrs[name]??null}
 setAttribute(name,value){this.attrs[name]=value}
 removeAttribute(name){delete this.attrs[name]}
}
function readerDom(source){
 const dom=new Node('root',{},null),stack=[dom],nodes={}
 for(const m of source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g,'').matchAll(/<\/?([a-z][\w-]*)([^>]*)>/gi)){
  const [,tag,rest]=m
  if(m[0].startsWith('</')){const at=stack.findLastIndex(n=>n.tag===tag);if(at>0)stack.length=at;continue}
  const attrs={};for(const a of rest.matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??''
  const n=new Node(tag,attrs,stack.at(-1));stack.at(-1).children.push(n)
  if(attrs.id){assert.ok(!nodes[attrs.id],'Unique actual DOM '+attrs.id);nodes[attrs.id]=n}
  if(!['meta','link','input','br','hr','img','path','rect'].includes(tag)&&!m[0].endsWith('/>'))stack.push(n)
 }
 const body=dom.querySelectorAll('body')[0]
 body.classList={add(c){body.attrs.class=[...(body.attrs.class||'').split(' ').filter(Boolean),c].join(' ')},
  remove(c){body.attrs.class=(body.attrs.class||'').split(' ').filter(x=>x!==c).join(' ')}}
 return {dom,nodes,body}
}
for(const source of [html,await read('docs/public/demos/uart-framing-reference.html')]){
 const {dom,nodes,body}=readerDom(source),details=dom.querySelectorAll('details'),handlers={}
 const win={location:{hash:''},addEventListener(n,f){(handlers[n]??=[]).push(f)},
  dispatchEvent(e){for(const f of handlers[e.type]||[])f()},print(){}}
 const doc={getElementById:id=>nodes[id],querySelectorAll:tag=>dom.querySelectorAll(tag),body}
 const ctx={document:doc,window:win,requestAnimationFrame:fn=>fn(),Event:class{constructor(type){this.type=type}}}
 for(const id of ['uart-reader','uart-worksheet','uart-ordinary-print','note-deep-links','note-print']){
  const match=source.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))
  if(match)vm.runInNewContext(match[1],ctx)
 }
 const answers=details.filter(n=>(n.attrs.class||'').split(' ').includes('exercise-answer'))
 if(source===html){
  assert.equal(answers.length,10);assert.ok(answers.every(n=>!n.open&&!n.closest('section')))
  for(const hash of ['#uart-practice','#uart-question-07','#uart-c-title']){
   win.location.hash=hash;win.dispatchEvent({type:'hashchange'});assert.ok(answers.every(n=>!n.open))
  }
  win.location.hash='#uart-answer-07';win.dispatchEvent({type:'hashchange'})
  assert.deepEqual(answers.map(n=>n.open),[false,false,false,false,false,false,true,false,false,false])
  nodes['collapse-notes'].dispatch('click');assert.ok(details.every(n=>!n.open))
  nodes['expand-notes'].dispatch('click');assert.ok(details.every(n=>n.open))
  nodes['collapse-notes'].dispatch('click')
 }
 if(details.length)details[0].open=true
 const folds=details.map(n=>n.open)
 win.dispatchEvent({type:'beforeprint'});assert.ok(details.every(n=>n.open))
 win.dispatchEvent({type:'afterprint'});assert.deepEqual(details.map(n=>n.open),folds)
 for(const before of [true,false]){
  const beforeClass=body.getAttribute('class')
  win.print=()=>{if(before)win.dispatchEvent({type:'beforeprint'});throw Error('print failure')}
  nodes['print-all'].dispatch('click')
  assert.deepEqual(details.map(n=>n.open),folds);assert.equal(body.getAttribute('class'),beforeClass)
  if(nodes['print-questions']){
   nodes['print-questions'].dispatch('click')
   assert.deepEqual(details.map(n=>n.open),folds);assert.equal(body.getAttribute('class'),beforeClass)
  }
 }
 if(nodes['print-questions']){
  body.removeAttribute('class')
  win.print=()=>{win.dispatchEvent({type:'beforeprint'})}
  nodes['print-questions'].dispatch('click');assert.match(body.getAttribute('class'),/exercise-print/)
  win.dispatchEvent({type:'afterprint'})
  assert.equal(body.getAttribute('class'),null,'Preserve class-attribute absence exactly')
  assert.deepEqual(details.map(n=>n.open),folds)
 }
}
assert.match(html,/content-section:not\(#uart-practice\)/)
assert.doesNotMatch(html,/content-section:not\(#fifo-practice\)/)
console.log('PASS UART actual ancestry/hash and ordinary/worksheet print restoration with and without beforeprint')

const prior=await read('docs/public/demos/gpio-led.html')
const reference=await read('docs/public/demos/uart-framing-reference.html')
for(const [name,article] of [['uart-framing',html],['uart-framing-reference',reference]]){
 const md=await read('docs/learn/'+name+'.md')
 assert.equal(article.match(/<style>\s*\/\* Shared reading layer:[\s\S]*?<\/style>/)[0],
  prior.match(/<style>\s*\/\* Shared reading layer:[\s\S]*?<\/style>/)[0])
 for(const id of ['note-deep-links','note-print'])
  assert.equal(article.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0],
   prior.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0])
 for(const [,anchor] of md.matchAll(/\{#([^}]+)\}/g))assert.ok(article.includes('id="'+anchor+'"'),'Real reader search anchor '+anchor)
 for(const p of ['parser/service','20ms','2^31','XOR','357','硬件未验证','不可重入','不重叠','FIFO_FULL','commandPresent'])
  assert.ok(md.includes(p),'Complete mirrored condition '+name+'/'+p)
 for(const file of ['uart-framing/uart.c','uart-framing/uart.h','bounded-fifo/fifo.c','bounded-fifo/fifo.h',
  'timer-pwm/time.c','timer-pwm/time.h','uart-framing/README.txt'])
  assert.ok(article.includes('<a href="../examples/'+file+'" download>')&&md.includes('<a href="../examples/'+file+'" download>'),
   'Native complete dependency download '+file)
}
const decode=s=>s.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&')
for(const [path,name] of [['uart-framing/uart.c','uart.c'],['uart-framing/uart.h','uart.h'],['bounded-fifo/fifo.c','fifo.c'],
 ['bounded-fifo/fifo.h','fifo.h'],['timer-pwm/time.c','time.c'],['timer-pwm/time.h','time.h']]){
 const source=await read('docs/public/examples/'+path),id='uart-source-'+name.replace('.','-')
 const shown=html.match(new RegExp('<details id="'+id+'">[\\s\\S]*?<pre[^>]*><code>([\\s\\S]*?)<\\/code><\\/pre>'))[1]
 assert.equal(decode(shown),source,'Exact complete displayed source '+path)
 assert.ok((await read('docs/learn/uart-framing.md')).includes(source.trim()),'Exact mirror source '+path)
}
assert.equal((html.match(/class="exercise-answer"/g)||[]).length,10)
assert.doesNotMatch(html,/localStorage|sessionStorage|fetch\(|XMLHttpRequest|setInterval/)
console.log('PASS UART protected layers/ten complete questions/source byte parity/search anchors/native dependency downloads/no persistence')
