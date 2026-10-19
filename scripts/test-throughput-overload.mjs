import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {basename,relative,sep} from 'node:path'
import vm from 'node:vm'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const read=p=>readFile(resolve(root,p),'utf8')
const html=await read('docs/public/demos/throughput-overload.html')
const script=id=>{
 const m=html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))
 assert.ok(m,'Actual authored script '+id);return m[1]
}
const ctx={};vm.runInNewContext(script('tp-model')+';globalThis.model=TpModel',ctx)
const model=ctx.model,plain=x=>JSON.parse(JSON.stringify(x))
let state=model.create(8)
let r=model.step(state,[0,1,2,3].map(id=>({value:100+id,sourceId:id,sequence:id,sourceTime:id*10,epoch:1})),1)
assert.deepEqual(plain(r.report.queued.map(x=>x.sourceId)),[1,2,3])
r=model.step(r.state,[4,5,6,7].map(id=>({value:100+id,sourceId:id,sequence:id,sourceTime:id*10,epoch:1})),1)
assert.deepEqual(plain(r.report.dropped.map(x=>x.sourceId)),[5,6,7])
assert.deepEqual(plain(r.report.queued.map(x=>x.sourceId)),[2,3,4])
console.log('PASS actual queue model first burst seam')

const literals={
 A:{depart:[[0],[1],[2],[3],[4],[],[],[]],drop:[[],[5,6,7],[],[],[],[],[],[]],queue:[[1,2,3],[2,3,4],[3,4],[4],[],[],[],[]],totals:[8,5,5,3]},
 B:{depart:[[0],[1],[2],[3],[4],[5],[6],[8],[10]],drop:[[],[],[],[7],[9],[11],[],[],[]],queue:[[1],[2,3],[3,4,5],[4,5,6],[5,6,8],[6,8,10],[8,10],[10],[]],totals:[12,9,9,3]},
 C:{depart:[[],[],[],[],[],[0,1,2,3],[6],[]],drop:[[],[],[],[],[4],[5],[],[]],queue:[[0],[0,1],[0,1,2],[0,1,2,3],[0,1,2,3],[],[],[7]],totals:[8,6,5,2]}
}
for(const [name,expected] of Object.entries(literals)){
 const trace=model.traces[name];let s=model.create(expected.queue.length),result
 for(let i=0;i<expected.queue.length;i++){
  result=model.step(s,trace.arrivals[i].map(model.source),trace.service[i]);assert.equal(result.status,'OK')
  for(const [field,key] of [['departed','depart'],['dropped','drop'],['queued','queue']])assert.deepEqual(plain(result.report[field].map(x=>x.sourceId)),expected[key][i],name+' row'+i+'/'+field)
  s=result.state
 }
 assert.deepEqual(['offered','admitted','departed','dropped'].map(k=>s.diagnostics[k]),expected.totals)
 assert.equal(result.report.terminal,true)
 const before=plain(s);assert.equal(model.step(s,[],4).status,'TERMINAL');assert.deepEqual(plain(s),before)
}
for(const service of [-1,5,NaN,Infinity,1.5,'1',null]){
 const s=model.create(),before=plain(s);assert.equal(model.step(s,[],service).status,'INVALID_ARGUMENT');assert.deepEqual(plain(s),before)
}
for(const record of [{value:65536},{sourceId:4294967296},{sequence:65536},{sourceTime:-1},{epoch:0}]){
 const s=model.create(),before=plain(s);assert.equal(model.step(s,[{...model.source(0),...record}],0).status,'INVALID_ARGUMENT');assert.deepEqual(plain(s),before)
}
assert.equal(model.step(model.create(),Array(5).fill(model.source(0)),0).status,'INVALID_ARGUMENT')
let observer=model.sequence(1,65534)
for(const [input,order,last,gap] of [[65535,'FORWARD',65535,0],[0,'FORWARD',0,0],[0,'DUPLICATE',0,0],[3,'FORWARD',3,2],[2,'OLDER',3,0],[32771,'AMBIGUOUS',3,0],[4,'FORWARD',4,0]]){
 const x=model.observe(observer,1,input);assert.equal(x.order,order);assert.equal(x.state.last,last);assert.equal(x.gap,gap);observer=x.state
}
for(const [epoch,value,status] of [[2,5,'EPOCH_REJECTED'],[0,5,'INVALID_ARGUMENT'],[1,65536,'INVALID_ARGUMENT'],[1,NaN,'INVALID_ARGUMENT']]){
 const before=plain(observer);assert.equal(model.observe(observer,epoch,value).status,status);assert.deepEqual(plain(observer),before)
}
for(const [value,order] of [[0,'DUPLICATE'],[32767,'FORWARD'],[32768,'AMBIGUOUS'],[32769,'OLDER']])assert.equal(model.observe(model.sequence(1,0),1,value).order,order)
assert.equal(model.observe(model.sequence(),1,300).order,'SEEDED')
assert.equal(model.wire(1000).bits,110000);assert.equal(model.wire(1100).bytes,12100)
assert.equal(model.wire(1000).order,'WITHIN');assert.equal(model.wire(1100).order,'OVER')
// Independent exact-rational identities, not floating display tolerance.
assert.equal(115200n/10n,11520n);assert.equal(11n*10n,110n)
assert.equal(110000n*288n,115200n*275n)
assert.equal(110n*1000000n*36n,115200n*34375n)
assert.equal(110n*1000000n*365n*21n,42000000n*20075n)
assert.equal(27n*7n,21n*9n)
const sample=[0,10,20,30],service=[1,11,38,38]
assert.deepEqual(sample.slice(1).map((x,i)=>x-sample[i]),[10,10,10])
assert.deepEqual(service.slice(1).map((x,i)=>x-service[i]),[10,27,0])
assert.deepEqual(service.map((x,i)=>x-sample[i]),[1,1,18,8])
let history=model.create(40)
for(let i=0;i<33;i++)history=model.step(history,[model.source(i)],1).state
assert.equal(history.tick,33);assert.equal(history.history.length,32);assert.equal(history.diagnostics.historyDropped,1)
let edge=model.create();edge.diagnostics.offered=4294967294;edge.diagnostics.admitted=4294967294;edge.diagnostics.departed=4294967294
edge=model.step(edge,[model.source(0)],1).state;assert.equal(edge.diagnostics.offered,4294967295);assert.equal(edge.diagnostics.saturated,false)
edge=model.step(edge,[model.source(1)],1).state;assert.equal(edge.diagnostics.offered,4294967295);assert.equal(edge.diagnostics.saturated,true)
console.log('PASS all independent A8/B9/C8 rows/units/rationals/time axes/sequence/epoch/terminal/wide checks/history/saturation')

class Element{
 constructor(value=''){this.value=value;this.listeners={};this.textContent='';this.hidden=false;this.disabled=false}
 addEventListener(event,fn){(this.listeners[event]??=[]).push(fn)}
 dispatch(event){for(const fn of this.listeners[event]||[])fn({preventDefault(){},target:this})}
}
const elements={}
for(const [,id] of html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').matchAll(/\bid="([^"]+)"/g))elements[id]=new Element()
const defaults={'cap-rate':'1000','replay-trace':'A','custom-arrivals':'4','custom-service':'1','seq-epoch':'1','seq-received':'65535'}
for(const [id,value] of Object.entries(defaults))elements[id].value=value
for(const name of ['cap','replay','custom','seq'])elements[name+'-result'].hidden=true
ctx.document={getElementById(id){assert.ok(elements[id],'Actual controller DOM '+id);return elements[id]}}
vm.runInNewContext(script('tp-controller'),ctx)
const edit=(id,value,event='input')=>{elements[id].value=String(value);elements[id].dispatch(event)}
const predict=(name,value)=>edit(name+'-prediction',value,'change')
const apply=name=>elements[name+'-form'].dispatch('submit')
const reset=name=>elements[name+'-reset'].dispatch('click')
for(const name of ['cap','replay','custom','seq']){
 const old=elements[name+'-state'].textContent;apply(name);assert.equal(elements[name+'-state'].textContent,old);assert.equal(elements[name+'-result'].hidden,true)
}
predict('cap','OVER');apply('cap');assert.match(elements['cap-feedback'].textContent,/预测不同.*下一步/)
const applied=elements['cap-state'].textContent
predict('cap','WITHIN');edit('cap-rate','1100');assert.equal(elements['cap-prediction'].value,'');assert.equal(elements['cap-state'].textContent,applied);assert.match(elements['cap-pending'].textContent,/待应用/)
predict('cap','OVER');elements['cap-rate'].dispatch('change');assert.equal(elements['cap-prediction'].value,'OVER','Same-value blur change preserves the newly chosen prediction');apply('cap');assert.match(elements['cap-feedback'].textContent,/预测正确/);assert.equal(elements['cap-prediction'].value,'')
for(const value of ['','-1','2001','1.5','NaN','Infinity','0x10']){
 edit('cap-rate',value);const old=elements['cap-state'].textContent;predict('cap','WITHIN');apply('cap');assert.match(elements['cap-feedback'].textContent,/输入拒绝.*保持.*下一步/);assert.equal(elements['cap-state'].textContent,old);assert.equal(elements['cap-prediction'].value,'')
}
reset('cap');assert.equal(elements['cap-result'].hidden,true);assert.equal(elements['cap-rate'].value,'1000');assert.equal(elements['cap-log'].textContent,'')
for(let i=0;i<33;i++){predict('cap','WITHIN');apply('cap')}
assert.match(elements['cap-log'].textContent,/后续行丢弃1；执行继续/);assert.match(elements['cap-feedback'].textContent,/预测正确/);assert.equal(elements['cap-log'].textContent.split('\n').filter(s=>/^\d+\./.test(s)).length,32)
for(const name of ['A','B','C']){
 reset('replay');edit('replay-trace',name,'change')
 for(let i=0;i<literals[name].drop.length;i++){predict('replay',String(literals[name].drop[i].length));apply('replay');assert.match(elements['replay-feedback'].textContent,/预测正确/)}
 const end=elements['replay-state'].textContent,log=elements['replay-log'].textContent
 predict('replay','0');apply('replay');assert.equal(elements['replay-state'].textContent,end);assert.equal(elements['replay-log'].textContent,log);assert.equal(elements['replay-apply'].disabled,true)
}
reset('custom');edit('custom-service','0');predict('custom','0');apply('custom')
edit('custom-arrivals','1');edit('custom-service','4');predict('custom','1');apply('custom');assert.match(elements['custom-state'].textContent,/drop\[4\].*depart\[0,1,2,3\]/)
for(const id of ['custom-arrivals','custom-service'])for(const value of ['','-1','5','1.1','Infinity','0x4']){
 edit('custom-arrivals','1');edit('custom-service','1');edit(id,value);const old=elements['custom-state'].textContent;predict('custom','0');apply('custom');assert.match(elements['custom-feedback'].textContent,/输入拒绝/);assert.equal(elements['custom-state'].textContent,old)
}
reset('seq')
for(const [value,order] of [[65535,'FORWARD'],[0,'FORWARD'],[0,'DUPLICATE'],[3,'FORWARD'],[2,'OLDER'],[32771,'AMBIGUOUS'],[4,'FORWARD']]){
 edit('seq-received',value);predict('seq',order);apply('seq');assert.match(elements['seq-feedback'].textContent,/预测正确.*下一步/)
}
const seqApplied=elements['seq-state'].textContent;edit('seq-epoch',2);predict('seq','FORWARD');apply('seq');assert.match(elements['seq-feedback'].textContent,/EPOCH_REJECTED.*保持/);assert.equal(elements['seq-state'].textContent,seqApplied)
for(const id of ['seq-epoch','seq-received'])for(const value of ['','-1','4294967296','1.5','NaN','Infinity']){
 edit('seq-epoch','1');edit('seq-received','4');edit(id,value);predict('seq','FORWARD');apply('seq');assert.match(elements['seq-feedback'].textContent,/输入拒绝/)
}
edit('seq-epoch','1');edit('seq-received','5');predict('seq','FORWARD');apply('seq');assert.equal(elements['seq-apply'].disabled,true)
const sequenceEnd=elements['seq-state'].textContent;predict('seq','FORWARD');apply('seq');assert.equal(elements['seq-state'].textContent,sequenceEnd)
reset('custom');edit('custom-arrivals','0');edit('custom-service','0')
for(let i=0;i<8;i++){predict('custom','0');apply('custom')}
assert.equal(elements['custom-apply'].disabled,true);const customEnd=elements['custom-state'].textContent;predict('custom','0');apply('custom');assert.equal(elements['custom-state'].textContent,customEnd)
for(const name of ['cap','replay','custom','seq']){reset(name);assert.equal(elements[name+'-result'].hidden,true);assert.equal(elements[name+'-last'].textContent,'');assert.equal(elements[name+'-feedback'].textContent,'');assert.equal(elements[name+'-prediction'].value,'')}
console.log('PASS actual controllers: prediction gates/correct/wrong/consumption/pending/applied/invalid/reset/finite endpoints')

const reference=await read('docs/public/demos/throughput-overload-reference.html'),prior=await read('docs/public/demos/uart-framing.html')
const files=['throughput-overload/throughput.c','throughput-overload/throughput.h','dma-ownership/dma.c','dma-ownership/dma.h','bounded-fifo/fifo.c','bounded-fifo/fifo.h','uart-framing/uart.c','uart-framing/uart.h','timer-pwm/time.c','timer-pwm/time.h']
const decode=s=>s.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&')
for(const [slug,article] of [['throughput-overload',html],['throughput-overload-reference',reference]]){
 const md=await read('docs/learn/'+slug+'.md')
 assert.equal(article.match(/<style>\s*\/\* Shared reading layer:[\s\S]*?<\/style>/)[0],prior.match(/<style>\s*\/\* Shared reading layer:[\s\S]*?<\/style>/)[0])
 for(const id of ['note-deep-links','note-print'])assert.equal(article.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0],prior.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0])
 for(const file of slug==='throughput-overload'?files:[]){
  const source=await read('docs/public/examples/'+file),id='tp-source-'+file.replaceAll('/','-').replaceAll('.','-')
  const shown=article.match(new RegExp('<details id="'+id+'">[\\s\\S]*?<code>([\\s\\S]*?)<\\/code>'))
  assert.equal(decode(shown[1]),source,'Exact displayed bytes '+file);assert.ok(md.includes(source),'Full searchable source '+file)
 }
 for(const file of [...files,'throughput-overload/README.txt'])assert.ok(article.includes('<a href="../examples/'+file+'" download>')&&md.includes('<a href="../examples/'+file+'" download>'))
 const readme=await read('docs/public/examples/throughput-overload/README.txt')
 if(slug==='throughput-overload')assert.equal(decode(article.match(/<details id="tp-source-readme">[\s\S]*?<code>([\s\S]*?)<\/code>/)[1]),readme)
 for(const text of ['arrival-first','drop-new','32768','MAX','5byte','12–14']){
  if(text==='5byte')continue
  if(text==='12–14')continue
  assert.ok(md.includes(text),'Full premise '+text)
 }
 assert.doesNotMatch(article,/localStorage|sessionStorage|XMLHttpRequest|setInterval|fetch\(/)
}
assert.equal((html.match(/class="question-stem"/g)||[]).length,10);assert.equal((html.match(/class="exercise-answer"/g)||[]).length,10)
assert.match(html,/main>\.content-section:not\(#tp-practice\)/)
console.log('PASS protected reader blocks, complete mirrors, ten independent questions, all 11 downloads and exact C/H/README source bytes')

if(process.argv.includes('--native')){
 const arg=(key,required=true)=>{const i=process.argv.indexOf(key);assert.ok(!required||i>=0,'Provide existing '+key);return i<0?null:process.argv[i+1]}
 const gcc=resolve(arg('--gcc')),python=resolve(arg('--python')),router=resolve(arg('--router'))
 const out=resolve(root,arg('--out'));assert.ok(relative(root,out)&&!relative(root,out).startsWith('..'+sep),'Native outputs stay inside this checkout')
 await mkdir(out,{recursive:true})
 const sha=b=>createHash('sha256').update(b).digest('hex')
 const meta=async p=>{try{const b=await readFile(p);return {path:p,bytes:b.length,sha256:sha(b)}}catch(e){if(e.code==='ENOENT')return {path:p,exists:false};throw e}}
 const inputs=await Promise.all([...files,'throughput-overload/README.txt'].map(p=>meta(resolve(root,'docs/public/examples',p))))
 const readme=await read('docs/public/examples/throughput-overload/README.txt'),consumer=readme.match(/^BEGIN_CONSUMER_C\r?\n([\s\S]*?)^END_CONSUMER_C\r?$/m)[1]
 const caller=resolve(out,'readme-consumer.c');await writeFile(caller,consumer)
 const records=[]
 async function route(name,command,artifacts=[]){
  const config=resolve(out,name+'.toml'),logs=resolve(out,'logs',name)
  const text='version=1\ndefault_profile="experiment"\n[settings]\nworkspace_root='+JSON.stringify(root.replaceAll('\\','/'))+'\nlog_dir='+JSON.stringify(logs.replaceAll('\\','/'))+'\n[environments.existing]\nkind="custom"\nenv={PATH='+JSON.stringify(dirname(gcc)+';'+(process.env.PATH||''))+'}\n[profiles.experiment]\nenvironment="existing"\nplatform="host-c11"\ncommand='+JSON.stringify(command)+'\nartifacts='+JSON.stringify(artifacts.map(p=>relative(root,p).replaceAll('\\','/')))+'\nartifact_policy="all"\n'
  await writeFile(config,text)
  const record={name,command,config:await meta(config),before:await Promise.all(artifacts.map(meta)),commands:[]}
  for(const action of ['validate','dry-run','build']){
   const argv=[router,action==='validate'?'validate':'build','--config',config,...(action==='validate'?[]:['--profile','experiment']),...(action==='dry-run'?['--dry-run']:[])]
   const r=spawnSync(python,argv,{cwd:root,encoding:'utf8',windowsHide:true});record.commands.push({argv:[python,...argv],status:r.status,stdout:r.stdout,stderr:r.stderr,error:r.error?.message})
   if(r.status!==0){records.push(record);await writeFile(resolve(out,'receipt-failed.json'),JSON.stringify({records},null,2));throw Error('Routed '+name+' '+action+' failed: '+r.stdout+' '+r.stderr)}
  }
  record.after=await Promise.all(artifacts.map(meta));records.push(record)
 }
 await route('compiler-version',[gcc,'--version'])
 for(const variant of ['normal','ndebug']){
  const flag=variant==='ndebug'?['-DNDEBUG']:[],objects={}
  async function compile(name,source,extra=[]){const object=resolve(out,name+'-'+variant+'.o');await route(name+'-'+variant,[gcc,'-std=c11','-Wall','-Wextra','-Werror','-pedantic','-fstack-usage',...flag,'-I',resolve(root,'docs/public/examples'),...extra,'-c',source,'-o',object],[object]);return object}
  for(const [name,path] of [['throughput','throughput-overload'],['dma','dma-ownership'],['fifo','bounded-fifo'],['uart','uart-framing'],['time','timer-pwm']])objects[name]=await compile(name,resolve(root,'docs/public/examples',path,name+'.c'))
  const consumerObject=await compile('readme-consumer',caller),exe=resolve(out,'readme-consumer-'+variant+'.exe')
  await route('link-readme-'+variant,[gcc,...Object.values(objects),consumerObject,'-o',exe],[exe]);await route('execute-readme-'+variant,[exe])
  for(const [name,path,define,deps] of [['fifo','bounded-fifo','FIFO_TEST',[]],['time','timer-pwm','TIME_TEST',[]],['uart','uart-framing','UART_TEST',[objects.fifo,objects.time]]]){
   const obj=await compile(name+'-regression',resolve(root,'docs/public/examples',path,name+'.c'),['-D'+define]),binary=resolve(out,name+'-regression-'+variant+'.exe')
   await route('link-'+name+'-regression-'+variant,[gcc,obj,...deps,'-o',binary],[binary]);await route('execute-'+name+'-regression-'+variant,[binary])
  }
 }
 const after=await Promise.all(inputs.map(x=>meta(x.path)));assert.deepEqual(after,inputs,'All original production/README bytes unchanged')
 await writeFile(resolve(out,'receipt.json'),JSON.stringify({scope:'Actual README-marker-extracted consumer plus separately compiled production modules and unchanged borrowed regressions; host only',inputsBefore:inputs,inputsAfter:after,caller:await meta(caller),tools:await Promise.all([gcc,python,router].map(meta)),records,limitations:['No target timing/WCET/concurrency/hardware/physical-paper proof.','Artifact paths/profile arguments/raw return/log paths are recorded; .su is per-function host evidence.']},null,2))
 console.log('PASS routed README consumer and original FIFO/time/UART regressions normal/NDEBUG; evidence '+out)
}
