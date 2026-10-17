import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const html = await readFile(new URL('../docs/public/demos/mcu-ota.html', import.meta.url), 'utf8')
const script = html.match(/<script id="ota-controller">([\s\S]*?)<\/script>/)[1]
class Element {
  constructor(value = '') { this.value=value; this.dataset={}; this.listeners={}; this.attributes={}; this.style={}; this.disabled=false; this.children=[]; this._text=''; this._html=''; this.classList={contains:name=>(this.className||'').split(' ').includes(name)} }
  set textContent(value) { this._text=String(value); this._html=''; this.children=[] }
  get textContent() { return this._text }
  set innerHTML(value) {
    this._html=value; this._text=''; this.children=[]
    for(const [,attrs,label] of value.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)) {
      const button=new Element(); button.textContent=label.replace(/<[^>]+>/g,'')
      button.className=attrs.match(/class="([^"]+)"/)?.[1]||''
      for(const [,key,v] of attrs.matchAll(/data-([\w-]+)="([^"]*)"/g)) button.dataset[key]=v
      for(const [,key,v] of attrs.matchAll(/(aria-[\w-]+)="([^"]*)"/g)) button.attributes[key]=v
      this.children.push(button)
    }
  }
  get innerHTML() { return this._html }
  querySelectorAll(selector) { assert.equal(selector,'button'); return this.children }
  setAttribute(name,value) { this.attributes[name]=String(value) }
  addEventListener(event,callback) { this.listeners[event]=callback }
  dispatch(event) { this.listeners[event]?.({target:this}) }
  focus() { document.activeElement=this }
}
const elements={}
for(const [,id,attrs] of html.matchAll(/<[a-z][^>]*?\bid="([^"]+)"([^>]*)>/g)) elements[id]=new Element(attrs.match(/value="([^"]*)"/)?.[1] || '')
elements['c-scheme'].value='ab'
const group=new Element()
const document={
  getElementById(id) { assert.ok(elements[id], 'Unknown OTA control: '+id); return elements[id] },
  querySelector(selector) { assert.equal(selector,'.schemes'); return group },
  querySelectorAll(selector) {
    if(selector==='.scheme') return group.children
    assert.equal(selector,'.fields input,.fields select')
    return Object.entries(elements).filter(([id])=>id.startsWith('c-')).map(([,element])=>element)
  }
}
vm.runInNewContext(script,{document},{timeout:1000})
assert.equal(group.children.length,6)
const expectedNames=['单槽覆盖','内部暂存复制','外部暂存复制','交换式双槽','A/B 直接执行','独立恢复镜像']
const installPower=[/重新验证 V2/,/恢复的是安装/,/恢复的是安装/,/两槽在中途可能都不是完整/,/元数据撕裂/,/恢复路径/]
const failure=[/没有完整 V1 副本/,/没有完整 V1 副本/,/没有完整 V1 副本/,/反向交换，恢复 V1/,/选择仍完整且允许执行的槽 A/,/进入 R/]
for(let scheme=0;scheme<6;scheme++) {
  group.children[scheme].onclick()
  assert.equal(elements['scheme-title'].textContent,expectedNames[scheme])
  assert.equal(group.children[scheme].attributes['aria-pressed'],'true')
  for(let phase=0;phase<6;phase++) {
    elements.steps.children[phase].onclick()
    assert.equal(elements.steps.children[phase].attributes['aria-pressed'],'true')
    assert.equal(elements.next.disabled,phase===5)
    assert.equal(elements.fail.disabled,phase!==4)
    assert.match(elements.memory.innerHTML,/Bootloader/)
    assert.match(elements.memory.innerHTML,/持久化状态/)
    elements.power.onclick()
    assert.match(elements.result.textContent,/断电 → 重启/)
    if(phase===3) assert.match(elements.result.textContent,installPower[scheme])
    if(phase===4) { elements.fail.onclick(); assert.match(elements.result.textContent,failure[scheme]) }
  }
  elements.reset.onclick()
  assert.equal(elements['phase-title'].textContent,'准备')
  for(let i=0;i<5;i++) elements.next.onclick()
  assert.equal(elements['phase-title'].textContent,'确认')
}
assert.match(elements.assumptions.textContent,/受保护的恢复镜像/)
elements.steps.children[2].focus()
elements.steps.children[2].onclick()
assert.equal(document.activeElement,elements.steps.children[2], 'Activating a phase must retain keyboard focus after rendering')
assert.equal(document.activeElement.dataset.phase,'2')
document.activeElement=undefined
console.log('PASS OTA: six architectures, all 36 phases, actual next/reset/selection handlers, install power loss and trial failure boundaries.')

const defaultNeeds={single:432,internal:760,external:432,swap:776,ab:760,recovery:528}
for(const [id,expected] of Object.entries(defaultNeeds)) {
  elements['c-scheme'].value=id; elements['c-scheme'].dispatch('input')
  assert.equal(elements.need.textContent,String(expected),id+' independent capacity fixture')
  if(id==='external') assert.match(elements['calc-detail'].innerHTML,/328 KiB/)
}
elements['c-total'].value='400'; elements['c-total'].dispatch('input')
assert.equal(elements.left.textContent,'−128')
assert.match(elements.fit.textContent,/容量不足/)
for(const [field,value] of [['total',''],['image','0'],['erase','0'],['boot','-1'],['meta','NaN'],['state','Infinity']]) {
  const previous=elements['c-'+field].value
  elements['c-'+field].value=value; elements['c-'+field].dispatch('input')
  assert.equal(elements.need.textContent,'—')
  assert.equal(elements['calc-detail'].innerHTML,'')
  elements['c-'+field].value=previous
}
elements['c-image'].value='1.7e308'; elements['c-scheme'].value='ab'; elements['c-image'].dispatch('input')
assert.equal(elements.need.textContent,'—')
assert.match(elements.fit.textContent,/数值过大/)
elements['c-image'].value='321'; elements['c-meta'].value='1'; elements['c-boot'].value='65'; elements['c-data'].value='0'; elements['c-state'].value='1'; elements['c-total'].value='1024'; elements['c-total'].dispatch('input')
assert.equal(elements.need.textContent,'736','Regions align independently: fixed 80 + two slots of 328')
console.log('PASS OTA: independent six-scheme KiB fixtures, external storage, exact deficit, empty/zero/negative/non-finite/overflow rejection and non-aligned inputs.')

const markdown=await readFile(new URL('../docs/mcu/mcu-ota.md',import.meta.url),'utf8')
for(const phrase of ['双槽不等于可回滚','外部暂存不等于保留旧版','双 Bank 不等于 A/B','单槽必须保留独立','VTOR','防降级','参数','CRC','最大 trailer']) assert.ok(markdown.includes(phrase), 'OTA search caveat missing: '+phrase)
const sourceLinks=[...html.matchAll(/<a href="(https:[^"]+)" target="_blank"/g)].map(m=>m[1])
assert.equal(sourceLinks.length,10)
for(const url of sourceLinks) assert.ok(markdown.includes(url),'Official reference missing from search input')
console.log('PASS OTA: all ten official references and rollback/recovery/security/layout caveats remain searchable.')
