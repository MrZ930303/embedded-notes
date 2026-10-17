import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const options = {}
const args = process.argv.slice(2)
for (let index = 0; index < args.length; index += 2) {
  const key = args[index]?.slice(2)
  if (!args[index]?.startsWith('--') || !['compiler', 'router', 'python', 'output'].includes(key) || !args[index + 1] || args[index + 1].startsWith('--')) {
    throw new Error('Usage: node scripts/test-c-foundations-c.mjs [--compiler <existing-cc>] [--router <build_router.py>] [--python <python>] [--output <private-.scratch-directory>]')
  }
  options[key] = args[index + 1]
}
const compiler = options.compiler || process.env.CC || 'cc'
const router = resolve(options.router || process.env.MCU_BUILD_ROUTER || join(homedir(), '.codex/skills/mcu-build/scripts/build_router.py'))
const python = options.python || process.env.PYTHON || 'python'
const requestedOutput = options.output ? resolve(root, options.output) : null
if (requestedOutput) {
  const inside = relative(resolve(root, '.scratch'), requestedOutput)
  if (inside === '..' || inside.startsWith('../') || inside.startsWith('..\\') || isAbsolute(inside)) {
    throw new Error('--output must be a private directory inside this checkout\'s .scratch.')
  }
  mkdirSync(requestedOutput, { recursive: true })
}
const evidenceDir = requestedOutput ? mkdtempSync(join(requestedOutput, 'run-')) : join(root, '.scratch/c-foundations/code-evidence')
mkdirSync(evidenceDir, { recursive: true })
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const metadata = file => existsSync(file) ? { size: statSync(file).size, mtime: statSync(file).mtime.toISOString(), sha256: hash(file) } : null
const sources = [
  { name: 'bits', path: 'docs/public/examples/c-bits-registers/bits.c', macro: 'BITS_TEST', pass: 'PASS bits:' },
  { name: 'objects', path: 'docs/public/examples/c-objects-bounds/objects.c', macro: 'OBJECTS_TEST', pass: 'PASS objects C11:' },
  { name: 'fifo', path: 'docs/public/examples/bounded-fifo/fifo.c', macro: 'FIFO_TEST', pass: 'PASS FIFO:' }
].map(source => ({ ...source, sha256: null, results: {} }))
const dependencies = ['docs/public/examples/bounded-fifo/fifo.h', 'docs/public/examples/bounded-fifo/README.txt']
  .map(path => ({ path, sha256Before: null, sha256After: null }))
const report = {
  status: 'running',
  scope: 'strict host C11 tests only; no target firmware, RTOS, hardware or publication validation',
  startedAt: new Date().toISOString(),
  compiler: { executable: compiler, identity: null },
  router,
  python,
  sources,
  dependencies,
  generatedInputs: [],
  artifacts: [],
  commands: []
}
function run(command, commandArgs) {
  const env = { ...process.env }
  if (isAbsolute(compiler)) env.PATH = dirname(compiler) + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH || '')
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: 'utf8', env, timeout: 60000, maxBuffer: 8 * 1024 * 1024 })
  const record = {
    command: [command, ...commandArgs], status: result.status,
    signal: result.signal, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error?.message
  }
  report.commands.push(record)
  if (record.stdout) process.stdout.write(record.stdout)
  if (record.stderr) process.stderr.write(record.stderr)
  if (result.status !== 0 || result.error) throw new Error(`Command failed: ${command}; status ${result.status}; ${result.error?.message || record.stderr.trim()}`)
  return record
}
function compile(source, variant, flags, inputs = [resolve(root, source.path)]) {
  const name = source.name + '-' + variant
  const artifact = join(evidenceDir, name + (flags.includes('-c') ? '.o' : process.platform === 'win32' ? '.exe' : ''))
  const profile = join(evidenceDir, name + '.toml')
  const command = [compiler, '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic', ...flags, ...inputs, '-o', artifact]
  const before = metadata(artifact)
  const quote = value => JSON.stringify(value)
  const profileName = name.replaceAll('-', '_')
  writeFileSync(profile, `version = 1
default_profile = "${profileName}"
[settings]
workspace_root = ${quote(root)}
log_dir = ${quote(relative(root, join(evidenceDir, 'logs')).replaceAll('\\', '/'))}
[environments.existing_compiler]
kind = "custom"
[profiles.${profileName}]
environment = "existing_compiler"
platform = "host-c11"
command = [${command.map(quote).join(', ')}]
artifacts = [${quote(relative(root, artifact).replaceAll('\\', '/'))}]
artifact_policy = "all"
`)
  const stages = {}
  stages.validate = run(python, [router, 'validate', '--config', profile]).status
  stages.dryRun = run(python, [router, 'build', '--config', profile, '--dry-run']).status
  stages.build = run(python, [router, 'build', '--config', profile]).status
  const after = metadata(artifact)
  if (!after || after.size === 0) throw new Error('Missing or empty declared artifact: ' + artifact)
  const record = { profile, profileSha256: hash(profile), artifact, source: source.path, variant, command, stages, before, after, changed: !before || before.sha256 !== after.sha256 || before.mtime !== after.mtime }
  report.artifacts.push(record)
  source.results[variant] = { status: 'built', stages, artifact, sha256: after.sha256 }
  return artifact
}
function test(source, variant, flags) {
  const artifact = compile(source, variant, flags)
  const result = run(artifact, [])
  if (!result.stdout.startsWith(source.pass)) throw new Error('Expected actual test summary absent: ' + source.path + ' ' + variant)
  source.results[variant] = { ...source.results[variant], status: 'passed', exitStatus: result.status, stdout: result.stdout.trim() }
}
try {
  for (const source of sources) source.sha256 = hash(resolve(root, source.path))
  for (const input of dependencies) input.sha256Before = hash(resolve(root, input.path))
  if (!existsSync(router)) throw new Error('mcu-build router required; pass --router <build_router.py>. Compilation is not run without it.')
  report.routerSha256 = hash(router)
  report.compiler.sha256 = isAbsolute(compiler) && existsSync(compiler) ? hash(compiler) : null
  report.compiler.identity = run(compiler, ['--version']).stdout.trim()
  for (const source of sources) {
    test(source, 'normal', ['-D' + source.macro])
    test(source, 'ndebug', ['-D' + source.macro, '-DNDEBUG'])
    if (source.results.normal.stdout !== source.results.ndebug.stdout) throw new Error('Normal and NDEBUG test summaries differ: ' + source.path)
    compile(source, 'module', ['-c'])
    source.results.module.status = 'passed'
    if (hash(resolve(root, source.path)) !== source.sha256) throw new Error('Source changed while testing: ' + source.path)
    source.status = 'passed'
  }
  const callerText = readFileSync(resolve(root, dependencies[1].path), 'utf8').match(/```c\n([\s\S]*?)```/)
  if (!callerText) throw new Error('Complete independent consumer missing from FIFO README.')
  const callerPath = join(evidenceDir, 'fifo-consumer.c')
  writeFileSync(callerPath, callerText[1])
  report.generatedInputs.push({ path: callerPath, sha256: hash(callerPath), origin: dependencies[1].path })
  const caller = { name: 'fifo_consumer', path: relative(root, callerPath), results: {} }
  const fifoModule = sources.find(source => source.name === 'fifo').results.module.artifact
  report.consumer = caller
  for (const variant of ['normal', 'ndebug']) {
    const callerObject = compile(caller, variant + '_object', ['-I', resolve(root, 'docs/public/examples/bounded-fifo'), ...(variant === 'ndebug' ? ['-DNDEBUG'] : []), '-c'])
    const executable = compile(caller, variant, [], [callerObject, fifoModule])
    const result = run(executable, [])
    if (result.stdout.trim() !== 'PASS FIFO consumer: repeated header, separate module, copy, empty, 0/255') {
      throw new Error('Independent repeated-header caller did not report its actual checks.')
    }
    caller.results[variant] = { ...caller.results[variant], status: 'passed', exitStatus: result.status, stdout: result.stdout.trim() }
  }
  for (const source of sources) {
    source.sha256After = hash(resolve(root, source.path))
    if (source.sha256After !== source.sha256) throw new Error('Source changed while testing: ' + source.path)
  }
  for (const input of dependencies) {
    input.sha256After = hash(resolve(root, input.path))
    if (input.sha256After !== input.sha256Before) throw new Error('Dependency changed while testing: ' + input.path)
  }
  report.status = 'passed'
  console.log('PASS three host C11 labs: strict and NDEBUG tests executed; modules compiled; repeated-header consumer linked separately; source/header bytes unchanged.')
} catch (error) {
  report.status = 'failed'
  report.failure = error.message
  process.exitCode = 1
  console.error(error.message)
} finally {
  for (const source of sources) source.sha256After = existsSync(resolve(root, source.path)) ? hash(resolve(root, source.path)) : null
  for (const input of dependencies) input.sha256After = existsSync(resolve(root, input.path)) ? hash(resolve(root, input.path)) : null
  report.finishedAt = new Date().toISOString()
  writeFileSync(join(evidenceDir, 'result.json'), JSON.stringify(report, null, 2) + '\n')
  console.log('Host-C evidence: ' + join(evidenceDir, 'result.json'))
}
