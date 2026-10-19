import { readFile, readdir, access, mkdir, writeFile } from 'node:fs/promises'
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
  if (!/\.(?:html|m?js|json|css|svg|c|h|txt|ld)$/.test(file)) continue
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
assert.ok(html.includes('38 篇') && html.includes('5 个主题'), 'Home must describe thirty-eight entries across five active categories')
assert.equal(interactiveNotes.length, 38, 'Exactly thirty-eight complete standalone readers must be registered')
const learningCategory = await readFile(path.join(root, 'learn/index.html'), 'utf8')
const learningReaders = interactiveNotes.filter(note => note.path.startsWith('learn/'))
assert.equal(learningReaders.length, 29, 'The learning center contains twenty-nine complete readers')
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
  for (const filename of [source, ...(folder === 'bounded-fifo' ? ['fifo.h'] : []), 'README.txt']) {
    const original = await readFile(path.resolve(import.meta.dirname, '../docs/public/examples', folder, filename))
    const published = await readFile(path.join(root, 'examples', folder, filename))
    assert.deepEqual(published, original, 'Published C foundation lab must copy exact source bytes: ' + folder + '/' + filename)
    if (filename === 'fifo.h') {
      for (const suffix of ['', '-reference']) {
        const reader = await readFile(path.join(root, 'learn/bounded-fifo' + suffix + '.html'), 'utf8')
        assert.ok(reader.includes('href="../examples/bounded-fifo/fifo.h" download'), 'Existing FIFO reader must expose the newly required native header download')
      }
    }
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

const buildStartupSearchCases = [
  ['build-link-identity', '缺少定义', 'build-real-experiment-title'],
  ['build-link-identity', 'ELF', 'build-artifacts-title'],
  ['build-link-identity', 'STALE_IDENTITY', 'build-identity-title'],
  ['build-link-identity-reference', '4080', 'build-ref-worked-title'],
  ['build-link-identity-reference', 'build-ID', 'build-ref-identity-title'],
  ['build-link-identity-reference', 'ELF', 'build-ref-arm-title'],
  ['reset-runtime', '重叠', 'runtime-contract-title'],
  ['reset-runtime', 'LMA', 'runtime-storage-title'],
  ['reset-runtime', '0x2040', 'runtime-fixture-title'],
  ['reset-runtime-reference', 'mainReady', 'reference-contract-title'],
  ['reset-runtime-reference', '8256', 'reference-fixture-title'],
  ['reset-runtime-reference', 'runtime_image_initialize', 'reference-source-title'],
  ['memory-budget', 'UNKNOWN', 'memory-stack-title'],
  ['memory-budget', '连续', 'memory-lifetimes-title'],
  ['memory-budget', 'fstack', 'memory-evidence-title'],
  ['memory-budget-reference', '1025', 'memory-ref-fixtures-title'],
  ['memory-budget-reference', 'UNKNOWN', 'memory-ref-stack-title'],
  ['memory-budget-reference', 'memory_envelope', 'memory-ref-api-title'],
  ['clock-timebase', 'SysTick', 'clock-tick-title'],
  ['clock-timebase', 'BRR', 'clock-uart-title'],
  ['clock-timebase', 'VOSRDY', 'clock-switch-title'],
  ['clock-timebase-reference', 'NO_EVENT', 'clock-tick-title'],
  ['clock-timebase-reference', '115200', 'clock-uart-title'],
  ['clock-timebase-reference', '超时', 'clock-switch-title']
].map(([name, query, anchor]) => ({ name, query, anchor }))
const missingBuildStartupTargets = buildStartupSearchCases.filter(({ name, query, anchor }) =>
  !search.search(query).some(result => result.id === base + 'learn/' + name + '.html#' + anchor))
assert.deepEqual(missingBuildStartupTargets, [], 'Build/startup search must open every actual normal/boundary/failure section')
const buildStartupDownloads = [
  ['build-link-identity', ['measurement.h', 'measurement.c', 'build_identity.h', 'build_identity.c', 'build.json', 'generate_identity.mjs', 'main.c', 'entry.c', 'lesson.ld', 'README.txt']],
  ['reset-runtime', ['runtime_image.h', 'runtime_image.c', 'README.txt']],
  ['memory-budget', ['memory_budget.h', 'memory_budget.c', 'stack_probe.c', 'README.txt']],
  ['clock-timebase', ['clock_plan.h', 'clock_plan.c', 'README.txt']]
]
for (const [folder, members] of buildStartupDownloads) {
  for (const filename of members) {
    const original = await readFile(path.resolve(import.meta.dirname, '../docs/public/examples', folder, filename))
    const published = await readFile(path.join(root, 'examples', folder, filename))
    assert.deepEqual(published, original, 'Build/startup download bytes must match: ' + folder + '/' + filename)
    for (const suffix of ['', '-reference']) {
      const reader = await readFile(path.join(root, 'learn', folder + suffix + '.html'), 'utf8')
      assert.ok(reader.includes('href="../examples/' + folder + '/' + filename + '" download'), 'Native download missing: ' + folder + suffix + '/' + filename)
    }
  }
  assert.ok(!files.some(file => path.relative(root, file).replaceAll('\\', '/').startsWith('examples/' + folder + '/') && file.endsWith('.html')), 'Download-only lab must not become an extra docs reader: ' + folder)
}
const searchEvidenceDirectory = path.resolve(import.meta.dirname, '../.scratch/build-startup/integration')
await mkdir(searchEvidenceDirectory, { recursive: true })
await writeFile(path.join(searchEvidenceDirectory, 'browser-search-cases.json'), JSON.stringify(buildStartupSearchCases, null, 2) + '\n')
console.log('PASS: eight build/startup readers have24 exact generated search targets and20 byte-identical native source/helper/instruction downloads.')

const timeSerialSearchCases = [
  ['timer-pwm', '阻塞', 'timer-counts-title'],
  ['timer-pwm', '65536', 'timer-counts-title'],
  ['timer-pwm', '5000', 'timer-quantization-title'],
  ['timer-pwm', 'UDIS', 'timer-preload-title'],
  ['timer-pwm', 'missed', 'timer-time-title'],
  ['timer-pwm', 'time_service', 'timer-time-title'],
  ['timer-pwm-reference', '65535', 'timer-ref-plan-title'],
  ['timer-pwm-reference', 'CCR', 'timer-ref-plan-title'],
  ['timer-pwm-reference', 'URS', 'timer-ref-update-title'],
  ['timer-pwm-reference', 'remainder', 'timer-ref-time-title'],
  ['timer-pwm-reference', 'timer.h', 'timer-ref-source-title'],
  ['uart-framing', '8N1', 'uart-wire-title'],
  ['uart-framing', 'A5', 'uart-frame-title'],
  ['uart-framing', '421', 'uart-frame-title'],
  ['uart-framing', 'XOR', 'uart-command-title'],
  ['uart-framing', '20ms', 'uart-timeout-title'],
  ['uart-framing', '丢失', 'uart-loss-title'],
  ['uart-framing-reference', 'LEN', 'uart-ref-grammar-title'],
  ['uart-framing-reference', 'XOR', 'uart-ref-grammar-title'],
  ['uart-framing-reference', '20ms', 'uart-ref-timeout-title'],
  ['uart-framing-reference', 'UART_LOSS', 'uart-ref-loss-title'],
  ['uart-framing-reference', 'uart_poll', 'uart-ref-api-title'],
  ['uart-framing-reference', 'SEEK', 'uart-ref-check-title']
].map(([name, query, anchor]) => ({ name, query, anchor }))
const missingTimeSerialTargets = timeSerialSearchCases.filter(({ name, query, anchor }) =>
  !search.search(query).some(result => result.id === base + 'learn/' + name + '.html#' + anchor))
assert.deepEqual(missingTimeSerialTargets, [], 'Time/serial search must reach actual formula, boundary, service, framing and failure sections')
const timeSerialDownloads = [
  ['timer-pwm', [
    ['timer-pwm', 'timer.c'], ['timer-pwm', 'timer.h'], ['timer-pwm', 'time.c'],
    ['timer-pwm', 'time.h'], ['timer-pwm', 'README.txt']
  ]],
  ['uart-framing', [
    ['uart-framing', 'uart.c'], ['uart-framing', 'uart.h'], ['uart-framing', 'README.txt'],
    ['bounded-fifo', 'fifo.c'], ['bounded-fifo', 'fifo.h'], ['timer-pwm', 'time.c'], ['timer-pwm', 'time.h']
  ]]
]
const timeSerialUniqueDownloads = new Set()
for (const [chapter, members] of timeSerialDownloads) {
  for (const [folder, filename] of members) {
    const name = folder + '/' + filename
    const original = await readFile(path.resolve(import.meta.dirname, '../docs/public/examples', folder, filename))
    const published = await readFile(path.join(root, 'examples', folder, filename))
    assert.deepEqual(published, original, 'Time/serial native dependency download bytes must match: ' + name)
    for (const suffix of ['', '-reference']) {
      const reader = await readFile(path.join(root, 'learn', chapter + suffix + '.html'), 'utf8')
      assert.ok(reader.includes('href="../examples/' + name + '" download'), 'Native complete source/dependency download missing: ' + chapter + suffix + '/' + name)
    }
    timeSerialUniqueDownloads.add(name)
  }
}
for (const folder of ['timer-pwm', 'uart-framing']) {
  assert.ok(!files.some(file => path.relative(root, file).replaceAll('\\', '/').startsWith('examples/' + folder + '/') && file.endsWith('.html')), 'Download-only time/serial example must not become another documentation reader')
}
const timeSerialEvidenceDirectory = path.resolve(import.meta.dirname, '../.scratch/time-serial/integration')
await mkdir(timeSerialEvidenceDirectory, { recursive: true })
await writeFile(path.join(timeSerialEvidenceDirectory, 'browser-search-cases.json'), JSON.stringify(timeSerialSearchCases, null, 2) + '\n')
console.log('PASS: four time/serial readers have' + timeSerialSearchCases.length + ' exact generated search targets and' + timeSerialUniqueDownloads.size + ' unique byte-identical native source/dependency/instruction downloads; FIFO header is included in prior lab checks.')

const protocolAcquisitionSearchCases = [
  ['bus-transactions', '0x18', 'bus-address-title'],
  ['bus-transactions', 'NACK', 'bus-i2c-title'],
  ['bus-transactions', 'CPOL', 'bus-spi-title'],
  ['bus-transactions', 'ARLO', 'bus-ownership-title'],
  ['bus-transactions', '20ms', 'bus-bounded-title'],
  ['bus-transactions-reference', 'address7', 'bus-ref-scope-title'],
  ['bus-transactions-reference', 'dummy', 'bus-ref-wire-title'],
  ['bus-transactions-reference', 'ARLO', 'bus-ref-failure-title'],
  ['bus-transactions-reference', '20ms', 'bus-ref-time-title'],
  ['adc-sampling', '21MHz', 'adc-clock-title'],
  ['adc-sampling', '4096', 'adc-bins-title'],
  ['adc-sampling', '4095', 'adc-reconstruction-title'],
  ['adc-sampling', 'TUE', 'adc-errors-title'],
  ['adc-sampling', '90.1091', 'adc-settling-title'],
  ['adc-sampling', '600', 'adc-alias-title'],
  ['adc-sampling', 'adc_cancel', 'adc-fake-title'],
  ['adc-sampling-reference', 'VREF', 'adc-ref-clock-title'],
  ['adc-sampling-reference', '4095', 'adc-ref-bins-title'],
  ['adc-sampling-reference', '混叠', 'adc-ref-errors-title'],
  ['adc-sampling-reference', 'READY', 'adc-ref-lifecycle-title'],
  ['driver-recovery', 'cause', 'recovery-diagnostics-title'],
  ['driver-recovery', '100', 'recovery-deadlines-title'],
  ['driver-recovery', 'cleanup', 'recovery-cleanup-title'],
  ['driver-recovery', 'counter1', 'recovery-replay-title'],
  ['driver-recovery', 'token', 'recovery-tokens-title'],
  ['driver-recovery', 'UART', 'recovery-terminal-title'],
  ['driver-recovery-reference', 'cause', 'recovery-diagnostics-title'],
  ['driver-recovery-reference', '100', 'recovery-deadlines-title'],
  ['driver-recovery-reference', '隔离', 'recovery-cleanup-title'],
  ['driver-recovery-reference', 'token', 'recovery-tokens-title'],
  ['driver-recovery-reference', 'UART', 'recovery-terminal-title']
].map(([name, query, anchor]) => ({ name, query, anchor }))
for (const { name, query, anchor } of protocolAcquisitionSearchCases) {
  assert.ok(search.search(query).some(result => result.id === base + 'learn/' + name + '.html#' + anchor),
    'Protocol/acquisition generated search must reach the actual substantial section: ' + name + '/' + query + '/' + anchor)
}
const protocolAcquisitionDownloads = new Map()
for (const name of ['bus-transactions', 'adc-sampling', 'driver-recovery']) {
  for (const suffix of ['', '-reference']) {
    const reader = await readFile(path.join(root, 'learn', name + suffix + '.html'), 'utf8')
    const links = [...reader.matchAll(/href="\.\.\/examples\/([^"]+)" download/g)].map(match => match[1])
    assert.ok(links.length >= 5, 'Every reader exposes its actual complete native dependency downloads')
    for (const relative of links) {
      const original = await readFile(path.resolve(import.meta.dirname, '../docs/public/examples', relative))
      const built = await readFile(path.join(root, 'examples', relative))
      assert.deepEqual(built, original, 'Native download bytes differ: ' + relative)
      protocolAcquisitionDownloads.set(relative, original.length)
    }
  }
  assert.ok(!files.some(file => path.relative(root, file).replaceAll('\\', '/').startsWith('examples/' + name + '/') && file.endsWith('.html')),
    'Native examples must not create additional documentation readers: ' + name)
}
const protocolAcquisitionDirectory = path.resolve(import.meta.dirname, '../.scratch/protocol-acquisition/integration')
await mkdir(protocolAcquisitionDirectory, { recursive: true })
await writeFile(path.join(protocolAcquisitionDirectory, 'browser-search-cases.json'), JSON.stringify(protocolAcquisitionSearchCases, null, 2) + '\n')
console.log('PASS: six protocol/acquisition readers have' + protocolAcquisitionSearchCases.length +
  ' exact generated substantial search targets and' + protocolAcquisitionDownloads.size + ' unique byte-identical native dependency/instruction downloads.')
