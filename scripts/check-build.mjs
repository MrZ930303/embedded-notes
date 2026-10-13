import { readFile, readdir, access } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import MiniSearch from 'minisearch'
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
  if (!/\.(?:html|js|json|css|svg)$/.test(file)) continue
  const text=await readFile(file,'utf8')
  assert.ok(!/https?:\/\/(?:chatgpt|chat)\.com\/(?:share|space)\//i.test(text), 'Private link in output')
  assert.ok(!/page_[a-f0-9]{24,}|creator_account_user_id|owner_workspace_id/.test(text), 'Private metadata in output')
  if(file.endsWith('.html')) ids.set(file,new Set([...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1])))
}
for (const file of pages) {
  const text=await readFile(file,'utf8')
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
assert.ok(html.includes(base+'demos/stack-heap.html'))
assert.ok(html.includes('data-no-router'))
assert.ok(files.some(p=>/hashmap\.json$/.test(p)))
assert.ok(files.some(p=>/localSearchIndex/.test(p)), 'Local search index is missing')
const demo=await readFile(path.join(root,'demos/stack-heap.html'),'utf8')
assert.ok(demo.includes('href="../c-memory/heap-stack.html"'))
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
const search = MiniSearch.loadJSON(generatedIndex, {
  fields: ['title', 'titles', 'text'],
  storeFields: ['title', 'titles'],
  tokenize,
  searchOptions: { fuzzy: 0.2, prefix: true, boost: { title: 4, text: 2, titles: 1 } }
})
for (const query of ['碎片', '任务栈', '历史最小', 'malloc', 'MSP', 'vPortGetHeapStats']) {
  const results = search.search(query)
  assert.ok(results.length > 0, 'Search returned no results: ' + query)
  assert.ok(results.some(r => r.id.startsWith(base + 'c-memory/heap-stack.html')), 'Missing article result: ' + query)
}
assert.equal(search.search('zzzxxyyunknownquery').length, 0)
console.log('PASS: generated Chinese/English/API full-text search, client tokenizer serialization and empty-result query.')

