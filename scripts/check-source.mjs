import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = path.resolve(import.meta.dirname, '..')
const excluded = new Set(['node_modules', '.git', 'dist', 'cache'])
const patterns = [
  /https?:\/\/(?:chatgpt|chat)\.com\/(?:share|space)\//i,
  /page_[a-f0-9]{24,}/,
  /(?:creator_account_user_id|owner_workspace_id|library_container_id)\s*[":]/,
  /(?:ghp_|github_pat_)[A-Za-z0-9_]{24,}/,
  /\bsk-[A-Za-z0-9_-]{24,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:password|api[_-]?key|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_+\/-]{16,}["']/i
]
let count = 0
export async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) await scan(file)
    else if (/\.(?:md|html|css|[cm]?[jt]s|vue|json|ya?ml|svg)$/.test(entry.name)) {
      const text = await readFile(file, 'utf8')
      for (const pattern of patterns) assert.ok(!pattern.test(text), 'Potential private data or credential: ' + path.relative(root, file))
      if (file.startsWith(path.join(root, 'docs'))) assert.ok(!/\b(?:C51|8051|ML51)\b/i.test(text), 'Excluded architecture content: ' + path.relative(root, file))
      count++
    }
  }
}
await scan(root)
const config = await readFile(path.join(root, 'docs/.vitepress/config.mts'), 'utf8')
assert.match(config, /provider: 'local'/)
assert.match(config, /Intl\.Segmenter/)
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
assert.equal(pkg.devDependencies.vitepress, '1.6.4')
assert.equal(lock.packages['node_modules/vitepress'].version, '1.6.4')
const article = await readFile(path.join(root, 'docs/c-memory/heap-stack.md'), 'utf8')
for (const concept of ['sizeof(StackType_t)', 'vPortGetHeapStats', '不能在 main 中直接覆盖整个栈', 'MSP', 'PSP', 'malloc', 'free(p)']) assert.ok(article.includes(concept), 'Missing required concept: ' + concept)
console.log('PASS: ' + count + ' source files scanned; no known private links/metadata or common secret patterns; stable dependency and core caveats retained.')

