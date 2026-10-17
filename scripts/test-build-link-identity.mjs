import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, cpSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = join(root, 'docs/public/examples/build-link-identity');
const evidence = join(root, '.scratch/build-startup');
mkdirSync(evidence, { recursive: true });
const copy = mkdtempSync(join(evidence, 'generator-'));
cpSync(source, copy, { recursive: true });
const generated = spawnSync(process.execPath, [join(copy, 'generate_identity.mjs'), copy], { encoding: 'utf8' });
assert.equal(generated.status, 0, generated.stderr);
assert.match(readFileSync(join(copy, 'build_identity.c'), 'utf8'), /const char build_version\[\] = "1\.0\.0";/);
console.log('PASS generated version follows descriptor');
const html = readFileSync(join(root, 'docs/public/demos/build-link-identity.html'), 'utf8');
const script = id => {
  const match = html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'));
  assert.ok(match, 'Actual reader script '+id);
  return match[1];
};
const context={};
vm.runInNewContext(script('build-model')+';globalThis.model=BuildIdentityModel;',context);
assert.equal(context.model.plan('valid',0,'yes').status,'READY');
console.log('PASS valid modeled build reaches a runnable artifact');
class Element {
  constructor(value='') {this.value=value;this.disabled=false;this.hidden=false;this.textContent='';this.innerHTML='';this.listeners={};}
  addEventListener(name,fn) {(this.listeners[name]??=[]).push(fn);}
  dispatch(name) {for(const fn of this.listeners[name]||[]) fn({preventDefault(){},target:this});}
}
const elements={};
for(const [,id] of html.matchAll(/\bid="([^"]+)"/g)) elements[id]=new Element();
for(const [id,value] of Object.entries({'build-scenario':'valid','build-patch':'0','build-regenerate':'yes','build-prediction':'','identity-prediction':'','trace-prediction':''})) elements[id].value=value;
context.document={getElementById(id){assert.ok(elements[id],'Known actual DOM id '+id);return elements[id];}};
vm.runInNewContext(script('build-controller'),context);
assert.equal(elements['build-apply'].disabled,true,'Controller requires an actual prediction');
console.log('PASS controller starts with prediction required');

const model=context.model;
for(const [scenario,status,objects,runnable] of [['valid','READY',3,true],['missing','MISSING',2,false],['duplicate','DUPLICATE',4,false]]) {
  const result=model.plan(scenario,1,'no');
  assert.deepEqual([result.status,result.objects,result.runnable,result.version,result.identity],[status,objects,runnable,'1.0.0','STALE']);
  assert.deepEqual([0,1,2,3].map(i=>model.step(result,i).output),['preprocessed','assembly','object',runnable?'executable':'failure']);
  assert.equal(model.step(result,4),null);assert.equal(model.step(result,-1),null);
}
assert.equal(model.plan('valid',0,'no').identity,'MATCH');
assert.equal(model.plan('valid',9999,'yes').version,'1.0.9999');
for(const bad of [-1,10000,0.5,NaN,Infinity,'1',null]) assert.equal(model.plan('valid',bad,'yes').status,'INVALID');
assert.equal(model.plan('imaginary',0,'yes').status,'INVALID');
assert.equal(model.plan('valid',0,'maybe').status,'INVALID');
console.log('PASS independent three-build fixtures, identity staleness and bounded four-stage model');

const predict=(status='READY',identity='MATCH')=>{
  elements['build-prediction'].value=status;elements['build-prediction'].dispatch('change');
  elements['identity-prediction'].value=identity;elements['identity-prediction'].dispatch('change');
};
const submit=()=>elements['build-form'].dispatch('submit');
const edit=(id,value,event='change')=>{elements[id].value=value;elements[id].dispatch(event);};
const step=(output)=>{edit('trace-prediction',output);elements['trace-form'].dispatch('submit');};
submit();assert.equal(elements['build-result'].hidden,true);assert.match(elements['build-feedback'].textContent,/先完成/);
predict();submit();
assert.equal(elements['build-result'].hidden,false);assert.match(elements['build-result'].textContent,/scenario=valid.*descriptor=1\.0\.0.*结果=READY/);
assert.match(elements['build-feedback'].textContent,/预测正确.*唯一measurement_sum.*下一项检查/);
assert.equal(elements['build-prediction'].value,'');assert.equal(elements['identity-prediction'].value,'');
assert.equal(elements['build-apply'].disabled,true);assert.equal(elements['trace-step'].disabled,true);
const firstApplied=elements['build-result'].textContent;
predict('MISSING','STALE');edit('build-patch','1','input');
assert.equal(elements['build-prediction'].value,'');assert.equal(elements['identity-prediction'].value,'');
assert.equal(elements['build-result'].textContent,firstApplied);assert.match(elements['build-pending'].textContent,/待应用/);
predict('MISSING','MATCH');edit('build-regenerate','no');predict('READY','MATCH');submit();
assert.match(elements['build-result'].textContent,/descriptor=1\.0\.1.*身份候选=1\.0\.0.*STALE/);
assert.match(elements['build-feedback'].textContent,/预测不同.*旧生成源.*下一项检查/);
assert.equal(elements['trace-log'].innerHTML,'');
for(const bad of ['', '-1','1.5','NaN','Infinity','10000','00',' 1','0x1','1e1']) {
  const before=elements['build-result'].textContent;
  edit('build-patch',bad,'input');predict();submit();
  assert.equal(elements['build-result'].textContent,before,'Invalid UI preserves accepted result: '+bad);
  assert.match(elements['build-feedback'].textContent,/输入无效/);assert.equal(elements['build-prediction'].value,'');
}
edit('build-patch','1','input');edit('build-scenario','alien');predict();submit();
assert.match(elements['build-feedback'].textContent,/输入无效/);
elements['build-reset'].dispatch('click');
assert.deepEqual(['build-scenario','build-patch','build-regenerate'].map(id=>elements[id].value),['valid','0','yes']);
assert.equal(elements['build-result'].hidden,true);assert.equal(elements['build-result'].textContent,'');
assert.equal(elements['trace-log'].innerHTML,'');assert.match(elements['trace-position'].textContent,/尚无轨迹/);

for(const [scenario,prediction,last] of [['valid','READY','executable'],['missing','MISSING','failure'],['duplicate','DUPLICATE','failure']]) {
  edit('build-scenario',scenario);predict(prediction);submit();
  const expected=['preprocessed','assembly','object',last];
  for(const [i,output] of expected.entries()) {
    const before=elements['trace-log'].innerHTML;
    elements['trace-form'].dispatch('submit');assert.equal(elements['trace-log'].innerHTML,before,'No unpredicted advance');
    step(output);assert.match(elements['trace-feedback'].textContent,/预测正确.*下一项检查/);
    assert.equal((elements['trace-log'].innerHTML.match(/<li>/g)||[]).length,i+1);
    assert.equal(elements['trace-prediction'].value,'');
  }
  assert.match(elements['trace-position'].textContent,/已结束4\/4/);assert.equal(elements['trace-step'].disabled,true);
  const ended=elements['trace-log'].innerHTML;step('object');assert.equal(elements['trace-log'].innerHTML,ended);
}
elements['build-reset'].dispatch('click');predict();submit();step('failure');
assert.match(elements['trace-feedback'].textContent,/预测不同.*预处理.*\.i.*下一项检查/);
edit('trace-prediction','assembly');edit('build-patch','2','input');
assert.equal(elements['trace-prediction'].value,'');assert.equal(elements['trace-step'].disabled,true);
const paused=elements['trace-log'].innerHTML;step('assembly');assert.equal(elements['trace-log'].innerHTML,paused);
elements['build-reset'].dispatch('click');assert.equal(elements['trace-log'].innerHTML,'');assert.equal(elements['build-result'].hidden,true);
console.log('PASS actual submit/change/input/reset handlers: predictions, wrong causes, pending, invalid, preserved accepted state, concealed reset, bounded trace');

const {generateIdentity,manifestMembers}=await import(new URL('../docs/public/examples/build-link-identity/generate_identity.mjs',import.meta.url));
const beforeSource=readFileSync(join(source,'build_identity.c'));
const once=readFileSync(join(copy,'build_identity.c'));
assert.equal(spawnSync(process.execPath,[join(copy,'generate_identity.mjs'),copy,'--check'],{encoding:'utf8'}).status,0);
assert.equal(spawnSync(process.execPath,[join(copy,'generate_identity.mjs'),copy],{encoding:'utf8'}).status,0);
assert.deepEqual(readFileSync(join(copy,'build_identity.c')),once,'Deterministic re-generation bytes');
assert.equal(generateIdentity(source).source,beforeSource.toString(),'Final sample re-generates identically');
const descriptor=JSON.parse(readFileSync(join(copy,'build.json'),'utf8'));
for(const value of ['1.0.0"; int injected;','01.0.0','1.0','-1.0.0','10000.0.0',null]) {
  writeFileSync(join(copy,'build.json'),JSON.stringify({...descriptor,version:value}));
  const rejected=spawnSync(process.execPath,[join(copy,'generate_identity.mjs'),copy],{encoding:'utf8'});
  assert.equal(rejected.status,1);assert.match(rejected.stderr,/INVALID_DESCRIPTOR/);
  assert.deepEqual(readFileSync(join(copy,'build_identity.c')),once,'Rejected descriptor cannot partially write C');
}
for(const bad of [{...descriptor,unknown:1},{...descriptor,sourceManifest:['../outside']},{...descriptor,sourceManifest:[...descriptor.sourceManifest].reverse()}]) {
  writeFileSync(join(copy,'build.json'),JSON.stringify(bad));assert.throws(()=>generateIdentity(copy),/INVALID_DESCRIPTOR/);
}
writeFileSync(join(copy,'build.json'),JSON.stringify({...descriptor,version:'1.0.1'})+'\n');
assert.match(spawnSync(process.execPath,[join(copy,'generate_identity.mjs'),copy,'--check'],{encoding:'utf8'}).stderr,/STALE_IDENTITY/);
const updated=generateIdentity(copy);assert.equal(updated.version,'1.0.1');assert.notEqual(updated.manifestSha256,generateIdentity(source).manifestSha256);
const fixture=mkdtempSync(join(evidence,'oracle-'));
// This literal oracle was fixed independently with Python hashlib from the stated bytes.
const fixtureDescriptor='{"schema":1,"product":"acquisition-terminal","version":"1.2.3","sourceManifest":["build.json","build_identity.h","entry.c","generate_identity.mjs","lesson.ld","main.c","measurement.c","measurement.h"]}\n';
for(const name of manifestMembers) writeFileSync(join(fixture,name),name==='build.json'?fixtureDescriptor:'fixture\n');
assert.equal(generateIdentity(fixture).manifestSha256,'38e4387832cd8461e8f3e2048c278671f98e2ceb8d64394b7ceffeabdb2af93c');
assert.deepEqual(readFileSync(join(source,'build_identity.c')),beforeSource,'Tests never alter published sample');
console.log('PASS generator deterministic bytes, independent fixed hash oracle, bounded-safe C literals, exact membership and stale descriptor rejection');

// Strict stack parser: a mismatched end tag FAILS; no browser-like repair/pop.
class Node {
  constructor(tag,attrs,parent){this.tag=tag;this.attrs=attrs;this.parentElement=parent;this.children=[];this.open=Object.hasOwn(attrs,'open');this.listeners={};}
  closest(tag){for(let n=this;n;n=n.parentElement) if(n.tag===tag)return n;return null;}
  querySelectorAll(tag){return this.children.flatMap(n=>[...(n.tag===tag?[n]:[]),...n.querySelectorAll(tag)]);}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  dispatch(name){for(const fn of this.listeners[name]||[])fn({});}
  scrollIntoView(){}
}
function strictTree(article) {
  const tree=new Node('root',{},null),stack=[tree],ids={};
  const stripped=article.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g,'').replace(/<!--[\s\S]*?-->/g,'');
  const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for(const token of stripped.matchAll(/<\/?([a-z][\w-]*)([^>]*)>/gi)) {
    const tag=token[1].toLowerCase(),closing=token[0].startsWith('</');
    if(closing){assert.equal(stack.at(-1).tag,tag,'Strict end tag '+token[0]);stack.pop();continue;}
    const attrs={};for(const a of token[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]]=a[2]??'';
    const node=new Node(tag,attrs,stack.at(-1));stack.at(-1).children.push(node);
    if(attrs.id){assert.ok(!ids[attrs.id],'Unique ID '+attrs.id);ids[attrs.id]=node;}
    if(!voidTags.has(tag)&&!token[0].endsWith('/>'))stack.push(node);
  }
  assert.equal(stack.length,1,'All structural tags close without repair');return {tree,ids};
}
assert.throws(()=>strictTree('<main><div></main></div>'),/Strict end tag/,'Parser rejects invalid ownership fixture');
const reference=readFileSync(join(root,'docs/public/demos/build-link-identity-reference.html'),'utf8');
const old=readFileSync(join(root,'docs/public/demos/bounded-fifo.html'),'utf8');
const files=['measurement.h','measurement.c','build_identity.h','build_identity.c','build.json','generate_identity.mjs','main.c','entry.c','lesson.ld','README.txt'];
const decode=text=>text.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&amp;','&');
for(const [slug,article] of [['build-link-identity',html],['build-link-identity-reference',reference]]) {
  const {tree,ids}=strictTree(article),md=readFileSync(join(root,'docs/learn/'+slug+'.md'),'utf8');
  assert.equal(tree.querySelectorAll('main').length,1);assert.equal(tree.querySelectorAll('h1').length,1);
  assert.equal((article.match(/class="notes-article"/g)||[]).length,1);
  for(const h of tree.querySelectorAll('h2')) {
    const region=h.parentElement;assert.equal(region.parentElement.tag,'main','h2 region owned directly by main');
    assert.equal(region.attrs.role,'region');assert.equal(region.attrs['aria-labelledby'],h.attrs.id);
  }
  for(const pre of tree.querySelectorAll('pre')){assert.equal(pre.attrs.tabindex,'0');assert.ok(pre.attrs['aria-label']);}
  for(const table of tree.querySelectorAll('table')){assert.equal(table.parentElement.attrs.tabindex,'0');assert.ok(table.parentElement.attrs['aria-label']);}
  assert.equal(article.match(/<style>\s*\/\* Shared reading layer:[\s\S]*?<\/style>/)[0],old.match(/<style>\s*\/\* Shared reading layer:[\s\S]*?<\/style>/)[0]);
  for(const id of ['note-deep-links','note-print']) assert.equal(article.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0],old.match(new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>'))[0]);
  const nav=article.match(/<header class="topbar">[\s\S]*?<nav[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual([...nav.matchAll(/<a href="[^"]+">([^<]+)<\/a>/g)].map(m=>m[1]),['返回分类','交互实验','完整笔记','搜索笔记']);
  for(const file of files)for(const content of [article,md])assert.ok(content.includes('<a href="../examples/build-link-identity/'+file+'" download>'),'Native download '+slug+'/'+file);
  for(const [,id] of md.matchAll(/\{#([^}]+)\}/g))assert.ok(ids[id],'Search heading exists '+id);
  assert.ok(article.includes('../learn/engineering-map.html#stage-02'));assert.ok(md.includes('../learn/engineering-map.html#stage-02'));
  assert.doesNotMatch(article,/localStorage|sessionStorage|fetch\(|XMLHttpRequest|setInterval|https?:\/\/[^"<>]+\.js/);
  if(slug==='build-link-identity') {
    for(const file of files) {
      const id='build-source-'+file.replaceAll('.','-');
      const shown=article.match(new RegExp('<details class="source-disclosure" id="'+id+'">[\\s\\S]*?<pre[^>]*><code>([\\s\\S]*?)<\\/code><\\/pre>'))[1];
      const sourceText=readFileSync(join(source,file),'utf8');assert.equal(decode(shown),sourceText,'Full displayed source '+file);assert.ok(md.includes(sourceText.trim()),'Search mirror source '+file);
    }
  }
}
console.log('PASS strict tree/h2 ownership, exact shared blocks, labelled scroll regions, native downloads, complete ten-file source/search parity');

const {tree,ids}=strictTree(html),details=tree.querySelectorAll('details');
const answers=details.filter(n=>n.attrs.class==='exercise-answer');
assert.equal(answers.length,10);assert.ok(answers.every(n=>!n.open&&!n.closest('section')));
for(let i=1;i<=10;i++)assert.ok(ids['build-question-'+String(i).padStart(2,'0')]);
const handlers={},classes=new Set();
const window={location:{hash:''},addEventListener(name,fn){(handlers[name]??=[]).push(fn);},dispatchEvent(event){for(const fn of handlers[event.type]||[])fn();},print(){}};
const doc={getElementById:id=>ids[id],querySelectorAll:tag=>tree.querySelectorAll(tag),body:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}}};
const reading={document:doc,window,requestAnimationFrame:fn=>fn(),Event:class{constructor(type){this.type=type;}}};
vm.runInNewContext(script('note-deep-links')+script('note-print')+script('build-reader')+script('build-worksheet'),reading);
for(const hash of ['#build-practice','#build-practice-title','#build-question-07','#build-c-lab-title','#build-link-identity']) {
  window.location.hash=hash;window.dispatchEvent({type:'hashchange'});assert.ok(answers.every(n=>!n.open),'Normal section keeps answers folded '+hash);
}
window.location.hash='#build-answer-07';window.dispatchEvent({type:'hashchange'});
assert.deepEqual(answers.map(n=>n.open),[false,false,false,false,false,false,true,false,false,false]);
window.location.hash='#build-question-02';window.dispatchEvent({type:'pageshow'});assert.equal(answers.filter(n=>n.open).length,1);
ids['expand-notes'].dispatch('click');assert.ok(details.every(n=>n.open));ids['collapse-notes'].dispatch('click');assert.ok(details.every(n=>!n.open));
answers[2].open=true;details[0].open=true;const original=details.map(n=>n.open);
window.dispatchEvent({type:'beforeprint'});assert.ok(details.every(n=>n.open));window.dispatchEvent({type:'beforeprint'});window.dispatchEvent({type:'afterprint'});assert.deepEqual(details.map(n=>n.open),original);
window.print=()=>{assert.equal(classes.has('exercise-print'),true);window.dispatchEvent({type:'beforeprint'});};
ids['print-questions'].dispatch('click');assert.equal(classes.has('exercise-print'),true);window.dispatchEvent({type:'afterprint'});assert.equal(classes.has('exercise-print'),false);assert.deepEqual(details.map(n=>n.open),original);
window.print=()=>{window.dispatchEvent({type:'beforeprint'});throw new Error('controlled print dispatch failure');};
ids['print-questions'].dispatch('click');assert.equal(classes.has('exercise-print'),false);assert.deepEqual(details.map(n=>n.open),original);
window.dispatchEvent({type:'beforeprint'});window.dispatchEvent({type:'afterprint'});assert.deepEqual(details.map(n=>n.open),original,'Shared snapshot cleared after failed dispatch');
assert.match(html,/body\.exercise-print \.exercise-answer\{display:none!important\}/);
assert.match(html,/body\.exercise-print main>\.content-section:not\(#build-practice\)/);
for(const id of ['build-prediction','identity-prediction','trace-prediction']) {
  const labels=[...html.match(new RegExp('<select id="'+id+'">([\\s\\S]*?)<\\/select>'))[1].matchAll(/<option value="[^"]+">([^<]+)<\/option>/g)].map(m=>[...m[1]].length);
  assert.equal(new Set(labels).size,1,'Comparable prediction label lengths '+id);
}
console.log('PASS ten native self-contained exercises; direct/section/history ancestry, ordinary/worksheet print and failed-dispatch fold restoration');
console.log('PASS unit06 reader/controller/generator suite (no compilation, target execution, browser or hardware claim)');
