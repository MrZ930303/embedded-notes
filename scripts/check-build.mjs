import { readFile, readdir, access } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import MiniSearch from 'minisearch'
import { interactiveNotes } from './interactive-note.mjs'
const root = path.resolve(import.meta.dirname, '../docs/.vitepress/dist')
const requestedBase = process.env.SITE_BASE || '/embedded-notes/'
const base = '/' + requestedBase.split('/').filter(Boolean).join('/') + (requestedBase === '/' ? '' : '/')
const origin = 'https://local.invalid'
const files = []
async function list(dir) {
  for (const e of await readdir(dir, {withFileTypes:true})) {
    const p=path.join(dir,e.name)
    if(e.isDirectory()) await list(p); else files.push(p)
  }
}
await list(root)
const ids = new Map()
let checked = 0
const pages = files.filter(p=>p.endsWith('.html'))
for (const file of files) {
  if (!/\.(?:html|js|json|css|svg|c|h|txt)$/.test(file)) continue
  const text=await readFile(file,'utf8')
  assert.ok(!/\b(?:C51|8051|ML51)\b/i.test(text), 'Excluded architecture content in public output: ' + file)
  assert.ok(!/https?:\/\/(?:chatgpt|chat)\.com\/(?:share|space)\//i.test(text), 'Private link in output')
  assert.ok(!/page_[a-f0-9]{24,}|creator_account_user_id|owner_workspace_id/.test(text), 'Private metadata in output')
  if(file.endsWith('.html')) ids.set(file,new Set([...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1])))
}
for (const file of pages) {
  const text=await readFile(file,'utf8')
  assert.ok(!/\b(?:C51|8051|ML51)\b/i.test(text), 'Excluded architecture content in public output: ' + file)
  const current=new URL(base+path.relative(root,file).split(path.sep).join('/'),origin)
  for(const [,attr,raw] of text.matchAll(/\b(href|src)="([^"]+)"/g)) {
    if(!raw||raw.startsWith('data:')||raw.startsWith('mailto:')||raw.startsWith('javascript:')) continue
    const url=new URL(raw.replace(/&amp;/g,'&'),current)
    if(url.origin!==origin) continue
    assert.ok(url.pathname.startsWith(base), 'Unbased link: '+raw+' in '+path.relative(root,file))
    let rel=decodeURIComponent(url.pathname.slice(base.length))
    if(!rel||rel.endsWith('/')) rel+='index.html'
    const target=path.join(root,rel)
    await access(target).catch(()=>{throw new Error('Broken '+attr+': '+raw+' in '+path.relative(root,file))})
    if(url.hash && ids.has(target)) {
      const id=decodeURIComponent(url.hash.slice(1))
      assert.ok(ids.get(target).has(id), 'Broken anchor '+raw+' in '+path.relative(root,file))
    }
    checked++
  }
}
const html=await readFile(path.join(root,'index.html'),'utf8')
assert.ok(html.includes('嵌入式技术笔记'))
assert.ok(html.includes(base+'c-memory/heap-stack.html'))
assert.ok(html.includes('data-no-router'))
assert.ok(html.includes('20 篇') && html.includes('5 个主题'), 'Home must describe twenty entries across five active categories')
assert.equal(interactiveNotes.length, 20, 'Exactly twenty complete standalone readers must be registered')
const learningCategory = await readFile(path.join(root, 'learn/index.html'), 'utf8')
const learningReaders = interactiveNotes.filter(note => note.path.startsWith('learn/'))
assert.equal(learningReaders.length, 11, 'The learning center contains eleven complete readers')
for (const note of learningReaders) assert.ok(learningCategory.includes(base + note.path), 'Learning center must reach each actual reader: ' + note.path)
const debugCategory = await readFile(path.join(root, 'debug/index.html'), 'utf8')
assert.ok(debugCategory.includes(base + 'debug/easylogger.html'), 'Debug category must link to the full EasyLogger reader')
assert.ok(!debugCategory.includes('这个分类尚未发布独立文章'), 'Debug must be an active category')
assert.ok(files.some(p=>/hashmap\.json$/.test(p)))
assert.ok(files.some(p=>/localSearchIndex/.test(p)), 'Local search index is missing')
for (const note of interactiveNotes) {
  const demo = await readFile(path.join(root, 'demos', note.source), 'utf8')
  assert.ok(demo.includes('href="../?search=1"'))
  const article = await readFile(path.join(root, note.path), 'utf8')
  assert.equal(article, demo, 'Canonical note must be the complete standalone interactive HTML: ' + note.path)
  assert.ok(!article.includes('__VP_SITE_DATA__'), 'Canonical note must not hydrate the docs page: ' + note.path)
  assert.ok(html.includes(base + note.path), 'Missing home article link: ' + note.path)
}
console.log('PASS: '+pages.length+' HTML pages, '+checked+' internal asset/page/anchor links, public output scan, '+base+' base path and local search index.')

// Test the actual generated index with the exact tokenizer serialized for browsers.
const siteDataMatch = html.match(/window\.__VP_SITE_DATA__=deserializeFunctions\(JSON\.parse\(("(?:[^"\\]|\\.)*")\)\)/)
assert.ok(siteDataMatch, 'Serialized client site data missing')
const siteData = JSON.parse(JSON.parse(siteDataMatch[1]))
const serializedTokenizer = siteData.themeConfig.search.options.miniSearch.options.tokenize
assert.ok(serializedTokenizer.startsWith('_vp-fn_'))
const tokenize = new Function('return ' + serializedTokenizer.slice(7))()
const indexFile = files.find(p => /@localSearchIndexroot\..*\.js$/.test(p))
const generatedIndex = (await import(pathToFileURL(indexFile).href)).default
for (const id of Object.values(JSON.parse(generatedIndex).documentIds)) {
  const note = interactiveNotes.find(note => id.startsWith(base + note.path + '#'))
  if (!note) continue
  const anchor = decodeURIComponent(id.split('#')[1])
  assert.ok(ids.get(path.join(root, note.path)).has(anchor), 'Search anchor missing from interactive note: ' + note.path + '#' + anchor)
}
const search = MiniSearch.loadJSON(generatedIndex, {
  fields: ['title', 'titles', 'text'],
  storeFields: ['title', 'titles'],
  tokenize,
  searchOptions: { fuzzy: 0.2, prefix: true, boost: { title: 4, text: 2, titles: 1 } }
})
const queries = {
  'c-memory/heap-stack.html': ['碎片', '任务栈', '历史最小', 'malloc', 'MSP', 'vPortGetHeapStats'],
  'tools/beads.html': ['Beads', '依赖', '就绪', 'Dolt', 'claim', '认领'],
  'tools/plane.html': ['Plane', '周期', '模块', '工作空间', 'AGPL', 'Cancelled'],
  'tools/matt-pocock-skills.html': ['Matt', 'Skills', 'tdd', 'GLOSSARY', '技能', '规格'],
  'mcu/crystal-pll-clock.html': ['晶体', '晶振', 'PLL', 'VCO', 'HSE', 'SYSCLK', '等待周期', '168'],
  'mcu/cortex-m-cpu-registers.html': ['R13', 'BASEPRI', 'CONTROL', 'EXC_RETURN'],
  'mcu/hardfault-stack-trace.html': ['HardFault', 'EXC_RETURN', 'CFSR', 'MMFAR', 'BFAR', 'LSPACT', 'STKERR', 'Fault Reports'],
  'learn/engineering-map.html': ['先修', 'F103', 'F407', '数据采集', '建设中'],
  'learn/gpio-button.html': ['GPIO', '上拉', '悬空', '抖动', '11', '高阻', 'VIH', 'VIL', '启动', 'maxGapMs'],
  'learn/gpio-button-reference.html': ['GPIO', '速查', '稳定', '11', '高阻', 'VIH', 'VIL', '启动', 'maxGapMs'],
  'learn/gpio-led.html': ['LED', '推挽', '开漏', 'Rmin', 'PRESSED', 'VFmin', 'PC13', 'VGS'],
  'learn/gpio-led-reference.html': ['LED', '速查', '开漏', 'Rmin', 'PRESSED', 'VFmin', 'PC13', 'VGS'],
  'learn/c-bits-registers.html': ['掩码', '整数提升', 'W1C', 'bits_apply', 'bits_field', 'BITS_INVALID'],
  'learn/c-bits-registers-reference.html': ['掩码', '移位', 'W1C', 'bits_apply', 'bits_field', 'BITS_INVALID'],
  'learn/c-objects-bounds.html': ['对象', '生命周期', 'one-past', 'read_le16', 'SIZE_MAX', '零长度'],
  'learn/c-objects-bounds-reference.html': ['对象', '生命周期', 'one-past', 'read_le16', 'SIZE_MAX', '零长度'],
  'learn/bounded-fifo.html': ['FIFO', '回绕', '单执行上下文', 'fifo_push', 'FIFO_FULL', 'FIFO_BAD_STATE'],
  'learn/bounded-fifo-reference.html': ['FIFO', '回绕', '单执行上下文', 'fifo_pop', 'FIFO_EMPTY', 'FIFO_BAD_STATE'],
  'mcu/mcu-ota.html': ['OTA', 'Bootloader', '暂存', 'Swap', 'A/B', '回滚', 'KiB', 'CRC'],
  'debug/easylogger.html': ['EasyLogger', 'Mutex', 'SEGGER_RTT_SetFlagsUpBuffer', 'NOINIT', 'MicroLIB', 'pendingWrite', 'LeakSanitizer']
}
for (const [article, terms] of Object.entries(queries)) {
  for (const query of terms) {
    const results = search.search(query)
    assert.ok(results.length > 0, 'Search returned no results: ' + query)
    assert.ok(results.some(r => r.id.startsWith(base + article)), 'Missing article result: ' + article + ': ' + query)
  }
}
const registerSearchTargets = {
  R13: 'stack-link-pc-title',
  BASEPRI: 'mask-registers-title',
  CONTROL: 'control-register-title',
  EXC_RETURN: 'stack-link-pc-title'
}
for (const [query, anchor] of Object.entries(registerSearchTargets)) {
  const results = search.search(query)
  assert.ok(results.some(result => result.id.startsWith(base + 'mcu/cortex-m-cpu-registers.html#' + anchor)), 'Search result must open the matching register section: ' + query + ' -> ' + anchor)
}
const hardFaultSearchTargets = {
  HardFault: 'overview',
  EXC_RETURN: 'decode-exc-return',
  CFSR: 'fault-status-masks',
  MMFAR: 'fault-status-masks',
  BFAR: 'fault-status-masks',
  LSPACT: 'case-b',
  STKERR: 'case-d',
  'Fault Reports': 'match-the-firmware-build'
}
for (const [query, anchor] of Object.entries(hardFaultSearchTargets)) {
  const results = search.search(query)
  assert.ok(results.some(result => result.id.startsWith(base + 'mcu/hardfault-stack-trace.html#' + anchor)), 'Search result must open the matching HardFault section: ' + query + ' -> ' + anchor)
}
assert.equal(search.search('zzzxxyyunknownquery').length, 0)
for (const [query, anchor] of [
  ['1.2', 'voltage-exercise'],
  ['启动', 'scenario-boot'],
  ['释放', 'scenario-short-release'],
  ['maxGapMs', 'scenario-gap'],
  ['0.2', 'scenario-glitch'],
  ['打印', 'recall-questions']
]) {
  assert.ok(search.search(query).some(result => result.id.startsWith(base + 'learn/gpio-button.html#' + anchor)), 'GPIO search must reach the corresponding exercise: ' + query + ' -> ' + anchor)
}
assert.ok(!files.some(file => /[\\/]public[\\/]examples[\\/]gpio-button[\\/]README\.html$/.test(file)), 'Download-only GPIO README must not become an extra documentation page')
for (const [article, targets] of [
  ['learn/gpio-led.html', {
    '推挽': 'driver-modes',
    'Rpu': 'path-truth-table',
    'PRESSED': 'event-contract',
    'Rmin': 'worst-case-bounds',
    '646': 'budget-static-answer',
    'PC13': 'exercise-08',
    'VGS': 'mosfet-driver',
    '打印': 'ten-exercises'
  }],
  ['learn/gpio-led-reference.html', {
    '开漏': 'reference-modes',
    'PRESSED': 'reference-events',
    'Rmin': 'reference-budget',
    'PC13': 'reference-parts',
    'VGS': 'reference-driver',
    '故障': 'reference-diagnosis'
  }]
]) {
  for (const [query, anchor] of Object.entries(targets)) {
    assert.ok(search.search(query).some(result => result.id.startsWith(base + article + '#' + anchor)), 'LED search must reach the matching section: ' + article + ': ' + query + ' -> ' + anchor)
  }
}
for (const filename of ['button.c', 'README.txt']) {
  const original = await readFile(path.resolve(import.meta.dirname, '../docs/public/examples/gpio-button', filename))
  const published = await readFile(path.join(root, 'examples/gpio-button', filename))
  assert.deepEqual(published, original, 'Published GPIO lab must copy source bytes exactly: ' + filename)
}
const foundationSearchTargets = [
  ['learn/c-bits-registers.html', [
    ['掩码', 'mask-rules'], ['移位', 'width-promotions'], ['W1C', 'w1c-or-assignment'], ['bits_apply', 'c-source']
  ]],
  ['learn/c-bits-registers-reference.html', [
    ['0xA5', 'reference-masks'], ['count', 'reference-width'], ['W1C', 'reference-rmw'], ['BITS_INVALID', 'reference-c-contract']
  ]],
  ['learn/c-objects-bounds.html', [
    ['read_le16', 'decode-contract-title'], ['零长度', 'zero-and-size'], ['one-past', 'invalid-operation-table']
  ]],
  ['learn/c-objects-bounds-reference.html', [
    ['read_le16', 'reference-decoder-title'], ['one-past', 'reference-endpoint'], ['SIZE_MAX', 'reference-fixtures']
  ]],
  ['learn/bounded-fifo.html', [
    ['fifo_push', 'fifo-c-lab-title'], ['满', 'fifo-rejection'], ['SPSC', 'fifo-single-context-title']
  ]],
  ['learn/bounded-fifo-reference.html', [
    ['fifo_pop', 'fifo-ref-api-title'], ['count', 'fifo-ref-state-title'], ['SPSC', 'fifo-ref-contract-title']
  ]]
]
for (const [article, targets] of foundationSearchTargets) {
  for (const [query, anchor] of targets) {
    assert.ok(search.search(query).some(result => result.id === base + article + '#' + anchor), 'C foundations search must open the actual normal/boundary/failure section: ' + article + ': ' + query + ' -> ' + anchor)
  }
}
for (const [folder, source] of [['c-bits-registers', 'bits.c'], ['c-objects-bounds', 'objects.c'], ['bounded-fifo', 'fifo.c']]) {
  for (const filename of [source, 'README.txt']) {
    const original = await readFile(path.resolve(import.meta.dirname, '../docs/public/examples', folder, filename))
    const published = await readFile(path.join(root, 'examples', folder, filename))
    assert.deepEqual(published, original, 'Published C foundation lab must copy exact source bytes: ' + folder + '/' + filename)
  }
  assert.ok(!files.some(file => path.relative(root, file).replaceAll('\\', '/').startsWith('examples/' + folder + '/') && file.endsWith('.html')), 'Download-only lab must not become an extra documentation reader: ' + folder)
}
console.log('PASS: six C foundation readers have exact generated normal/boundary/failure search targets and byte-identical downloadable sources/instructions.')
for (const [query, anchor] of Object.entries({
  'KiB': 'capacity',
  'CRC': 'image-trust',
  '防降级': 'image-trust',
  '差分': 'package-formats',
  'RAM-load': 'terminology'
})) {
  assert.ok(search.search(query).some(result => result.id.startsWith(base + 'mcu/mcu-ota.html#' + anchor)), 'OTA search must open the matching section: ' + query)
}
const easyLoggerSearchTargets = {
  '编译删除': 'filter-lab',
  'LOG_LVL': 'filter-lab',
  'Existing Session': 'keil-port',
  'elog_port_output_lock': 'task-mutex',
  'portYIELD_FROM_ISR': 'isr-events',
  'HAL_UART_Transmit_DMA': 'dma-lifetime',
  pendingWrite: 'rtt-lab',
  '173.6': 'uart-lab',
  'frame_valid': 'fault-record',
  'SEGGER_RTT_SetFlagsUpBuffer': 'corrections',
  LeakSanitizer: 'validation-limits'
}
for (const [query, anchor] of Object.entries(easyLoggerSearchTargets)) {
  assert.ok(search.search(query).some(result => result.id.startsWith(base + 'debug/easylogger.html#' + anchor)), 'Search must open the matching EasyLogger section: ' + query + ' -> ' + anchor)
}
// Topic absence is exact: fuzzy C51 matches legitimate C11 prose. Strict source/output scans above remain in force.
for (const excluded of ['C51', '8051', 'ML51']) assert.equal(search.search(excluded, { fuzzy: false, prefix: false }).length, 0, 'Excluded architecture exact search result: ' + excluded)
assert.ok(search.search('C11', { fuzzy: false, prefix: false }).some(result => result.id.startsWith(base + 'learn/gpio-button.html#')), 'Exact C11 search must reach the GPIO chapter')
console.log('PASS: generated Chinese/English/API full-text search, client tokenizer serialization and empty-result query.')
