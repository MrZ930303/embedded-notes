import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const options = {}
const allowed = ['compiler', 'router', 'python', 'output', 'nm', 'objdump', 'arm-compiler', 'arm-nm', 'arm-readelf', 'arm-objcopy', 'arm-objdump']
const usage = 'node scripts/test-build-startup-c.mjs [--compiler <existing-gcc>] [--router <build_router.py>] [--python <python>] [--arm-compiler <existing-arm-gcc>] [--output <workspace-private-directory>] [--nm <nm>] [--objdump <objdump>] [--arm-nm <nm>] [--arm-readelf <readelf>] [--arm-objcopy <objcopy>] [--arm-objdump <objdump>]'
const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--help') { console.log(usage); process.exit(0) }
for (let index = 0; index < args.length; index += 2) {
  const key = args[index]?.slice(2)
  if (!args[index]?.startsWith('--') || !allowed.includes(key) || !args[index + 1] || args[index + 1].startsWith('--') || options[key]) throw new Error(usage)
  options[key] = args[index + 1]
}
function executable(value) {
  if (isAbsolute(value) || value.includes('/') || value.includes('\\')) return resolve(value)
  const extensions = process.platform === 'win32' ? ['', ...(process.env.PATHEXT || '.EXE;.CMD').split(';')] : ['']
  for (const directory of (process.env.PATH || '').split(delimiter)) for (const extension of extensions) {
    const candidate = join(directory, value + extension.toLowerCase())
    if (existsSync(candidate)) return resolve(candidate)
  }
  return value // A missing tool fails explicitly on its first invocation.
}
const compiler = executable(options.compiler || process.env.CC || 'cc')
const armCompiler = options['arm-compiler'] || process.env.ARM_CC ? executable(options['arm-compiler'] || process.env.ARM_CC) : null
const python = executable(options.python || process.env.PYTHON || 'python')
const router = resolve(options.router || process.env.MCU_BUILD_ROUTER || join(homedir(), '.codex/skills/mcu-build/scripts/build_router.py'))
const outputRoot = resolve(root, options.output || '.scratch/build-startup/integration/c-evidence')
assert.ok(relative(root, outputRoot) && !relative(root, outputRoot).startsWith('..') && !isAbsolute(relative(root, outputRoot)), 'Evidence output must be a private directory inside this workspace')
mkdirSync(outputRoot, { recursive: true })
const output = mkdtempSync(join(outputRoot, 'run-'))
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const meta = file => existsSync(file) ? { path: file, bytes: statSync(file).size, mtime: statSync(file).mtime.toISOString(), sha256: hash(file) } : null
const report = {
  status: 'running', startedAt: new Date().toISOString(), output, commands: [], builds: [], artifacts: [], tools: {}, sources: [],
  limits: 'Host models only. Artificial ARM ELF/bin is NOT BOOTABLE and never executed/flashed. Per-function .su is compiler/options evidence, not target execution or whole-program worst-case stack. No hardware, physical paper or publication validation.'
}
const inventory = [
  ['build-link-identity', ['measurement.h', 'measurement.c', 'build_identity.h', 'build_identity.c', 'build.json', 'generate_identity.mjs', 'main.c', 'entry.c', 'lesson.ld', 'README.txt']],
  ['reset-runtime', ['runtime_image.h', 'runtime_image.c', 'README.txt']],
  ['memory-budget', ['memory_budget.h', 'memory_budget.c', 'stack_probe.c', 'README.txt']],
  ['clock-timebase', ['clock_plan.h', 'clock_plan.c', 'README.txt']]
]
const folder = name => join(root, 'docs/public/examples', name)
const sourceFiles = inventory.flatMap(([name, members]) => members.map(member => join(folder(name), member)))
let activeCompiler = compiler
function run(command, argv, expected = 0) {
  const pathParts = [activeCompiler, compiler, armCompiler, command].filter(Boolean).filter(isAbsolute).map(dirname)
  const env = { ...process.env, PATH: [...new Set(pathParts), process.env.PATH || ''].join(delimiter), PYTHONIOENCODING: 'utf-8' }
  const result = spawnSync(command, argv, { cwd: root, encoding: 'utf8', env, timeout: 60000, maxBuffer: 16 * 1024 * 1024 })
  const record = { command: [command, ...argv], status: result.status, signal: result.signal, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error?.message }
  report.commands.push(record)
  writeFileSync(join(output, 'command-' + report.commands.length + '.json'), JSON.stringify(record, null, 2) + '\n')
  assert.ok(!result.error && result.status !== null && (expected === 'nonzero' ? result.status !== 0 : result.status === expected), 'Unexpected command result: ' + JSON.stringify(record))
  return record
}
function identify(name, command) {
  const record = run(command, ['--version'])
  report.tools[name] = { executable: command, file: meta(command), identity: record.stdout.trim(), status: record.status }
}
function sibling(driver, suffix) {
  const tool = driver.replace(/(?:gcc|cc|clang)(?:\.exe)?$/i, suffix + (process.platform === 'win32' ? '.exe' : ''))
  assert.notEqual(tool, driver, 'Cannot derive inspection tool; supply its explicit option')
  return executable(tool)
}
let profileIndex = 0
function build(name, selectedCompiler, compilerArgs, artifacts, expectedFailure = null, absent = [], platform = selectedCompiler === armCompiler ? 'arm-artificial' : 'host-c11') {
  activeCompiler = selectedCompiler
  const command = [selectedCompiler, ...compilerArgs]
  for (const file of [...artifacts, ...absent]) assert.equal(existsSync(file), false, 'Output must be fresh: ' + file)
  const inputs = compilerArgs.filter(value => existsSync(value) && statSync(value).isFile()).map(meta)
  const profile = join(output, String(++profileIndex).padStart(2, '0') + '-' + name + '.toml')
  const quote = value => JSON.stringify(value)
  writeFileSync(profile, `version = 1\ndefault_profile = "experiment"\n[settings]\nworkspace_root = ${quote(root)}\nlog_dir = ${quote(relative(root, join(output, 'logs')).replaceAll('\\', '/'))}\n[environments.existing]\nkind = "custom"\n[profiles.experiment]\nenvironment = "existing"\nplatform = "${platform}"\ncommand = [${command.map(quote).join(', ')}]\nartifacts = [${artifacts.map(file => quote(relative(root, file).replaceAll('\\', '/'))).join(', ')}]\nartifact_policy = "all"\n`)
  const record = { name, platform, profile: meta(profile), command, inputs, expectedFailure: Boolean(expectedFailure), before: artifacts.map(meta), stages: {}, artifacts: [] }
  report.builds.push(record)
  record.stages.validate = run(python, [router, 'validate', '--config', profile]).status
  record.stages.dryRun = run(python, [router, 'build', '--config', profile, '--dry-run']).status
  const actual = run(python, [router, 'build', '--config', profile], expectedFailure ? 'nonzero' : 0)
  record.stages.build = actual.status
  record.rawReturnCode = Number(actual.stdout.match(/Return code: (-?\d+)/)?.[1])
  assert.ok(Number.isInteger(record.rawReturnCode), 'Actual compiler return code must be retained')
  const log = actual.stdout.match(/Log: ([^\r\n]+)/)?.[1]
  assert.ok(log && existsSync(log), 'Router compiler log required')
  record.log = meta(log)
  const diagnostics = readFileSync(log, 'utf8')
  record.diagnosticSummary = diagnostics.split(/\r?\n/).filter(line => /error|warning|undefined reference|multiple definition/i.test(line))
  if (expectedFailure) {
    assert.notEqual(record.rawReturnCode, 0)
    assert.match(diagnostics, expectedFailure)
    for (const file of absent) assert.equal(existsSync(file), false, 'Failed link must leave no selected executable')
    record.absentOutputs = absent
    record.status = 'expected-link-failure'
  } else {
    assert.equal(record.rawReturnCode, 0)
    for (const file of artifacts) { const after = meta(file); assert.ok(after?.bytes > 0, 'Missing/empty artifact: ' + file); record.artifacts.push({ ...after, fresh: true }); report.artifacts.push(after) }
    record.status = 'passed'
  }
  return record
}
const strict = ['-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic']
const hostLinkFlags = process.platform === 'win32' ? ['-Wl,--no-insert-timestamp'] : []
const exeSuffix = process.platform === 'win32' ? '.exe' : ''
function hostBuild(directory, name, extra = []) {
  const destination = join(output, name); mkdirSync(destination)
  const objects = ['main', 'measurement', 'build_identity'].map(member => {
    const object = join(destination, member + '.o')
    build(name + '-' + member, compiler, [...strict, '-O0', ...extra, '-c', join(directory, member + '.c'), '-o', object], [object])
    return object
  })
  const executable = join(destination, 'terminal' + exeSuffix), map = join(destination, 'terminal.map')
  build(name + '-link', compiler, [...objects, ...hostLinkFlags, '-Wl,-Map=' + map, '-o', executable], [executable, map])
  return { objects, executable, map }
}
function stackUsage(file) {
  const text = readFileSync(file, 'utf8')
  const frames = text.trim().split(/\r?\n/).map(line => { const [symbol, bytes, qualifier] = line.split('\t'); return { symbol, bytes: Number(bytes), qualifier } })
  for (const name of ['probe_leaf', 'probe_middle', 'stack_probe']) assert.ok(frames.some(frame => frame.symbol.endsWith(':' + name) && Number.isInteger(frame.bytes) && frame.bytes >= 0 && frame.qualifier), 'Missing actual per-function .su result: ' + name)
  return { file: meta(file), frames, limitation: 'Individual compiler frames only; no automatic whole-path, interrupt, library or target-runtime bound.' }
}
try {
  report.sources = sourceFiles.map(file => { const value = meta(file); assert.ok(value, 'Required source missing: ' + file); return value })
  assert.ok(existsSync(router), 'Existing mcu-build router required; no compiler is invoked without it')
  report.router = meta(router); report.runner = meta(fileURLToPath(import.meta.url))
  identify('hostCompiler', compiler); identify('python', python)
  const nm = executable(options.nm || sibling(compiler, 'nm')), objdump = executable(options.objdump || sibling(compiler, 'objdump'))
  identify('hostNm', nm); identify('hostObjdump', objdump)
  const publicBuildSource = folder('build-link-identity')
  report.identity = JSON.parse(run(process.execPath, [join(publicBuildSource, 'generate_identity.mjs'), publicBuildSource, '--check']).stdout)
  assert.equal(report.identity.version, '1.0.0')
  const pristine = join(output, 'pristine-source'); cpSync(publicBuildSource, pristine, { recursive: true })
  const generated = JSON.parse(run(process.execPath, [join(pristine, 'generate_identity.mjs'), pristine]).stdout)
  assert.equal(generated.generatedSha256, hash(join(publicBuildSource, 'build_identity.c')))
  const normal = hostBuild(pristine, 'normal')
  const normalOutput = run(normal.executable, ['1.0.0']).stdout
  assert.match(normalOutput, /sum=170\r?\nversion=1\.0\.0\r?\n/)
  assert.ok(normalOutput.includes(report.identity.sourceManifestSha256) && normalOutput.includes('PASS measurement:'))
  const ndebug = hostBuild(pristine, 'ndebug', ['-DNDEBUG'])
  assert.equal(run(ndebug.executable, ['1.0.0']).stdout, normalOutput)
  const module = join(output, 'measurement-module.o')
  build('measurement-module', compiler, [...strict, '-c', join(publicBuildSource, 'measurement.c'), '-o', module], [module])
  const preprocessed = join(output, 'main.i'), assembly = join(output, 'measurement.s'), assembled = join(output, 'measurement-assembled.o')
  build('preprocess', compiler, [...strict, '-E', join(pristine, 'main.c'), '-o', preprocessed], [preprocessed])
  build('assembly', compiler, [...strict, '-S', join(pristine, 'measurement.c'), '-o', assembly], [assembly])
  build('assemble-saved-stage', compiler, ['-c', assembly, '-o', assembled], [assembled])
  const symbols = run(nm, ['-A', ...normal.objects]).stdout
  assert.match(symbols, /U _?measurement_sum/); assert.match(symbols, /T _?measurement_sum/)
  report.host = { stdout: normalOutput, symbols, format: run(objdump, ['-f', normal.executable]).stdout, executable: meta(normal.executable), map: meta(normal.map) }
  const missing = join(output, 'missing' + exeSuffix)
  build('missing-link', compiler, [normal.objects[0], normal.objects[2], '-o', missing], [], /undefined reference[\s\S]*measurement_sum/, [missing])
  const second = join(output, 'measurement-second.o'), duplicate = join(output, 'duplicate' + exeSuffix)
  build('duplicate-object', compiler, [...strict, '-c', join(pristine, 'measurement.c'), '-o', second], [second])
  build('duplicate-link', compiler, [...normal.objects, second, '-o', duplicate], [], /multiple definition[\s\S]*measurement_sum/, [duplicate])
  assert.match(run(normal.executable, ['1.0.1'], 1).stderr, /IDENTITY_MISMATCH expected=1\.0\.1 linked=1\.0\.0/)
  const changed = join(output, 'changed-source'); cpSync(pristine, changed, { recursive: true })
  const descriptor = JSON.parse(readFileSync(join(changed, 'build.json'), 'utf8')); descriptor.version = '1.0.1'
  writeFileSync(join(changed, 'build.json'), JSON.stringify(descriptor, null, 2) + '\n')
  assert.match(run(process.execPath, [join(changed, 'generate_identity.mjs'), changed, '--check'], 1).stderr, /STALE_IDENTITY/)
  const changedIdentity = JSON.parse(run(process.execPath, [join(changed, 'generate_identity.mjs'), changed]).stdout)
  assert.notEqual(changedIdentity.sourceManifestSha256, report.identity.sourceManifestSha256)
  const updated = hostBuild(changed, 'updated')
  const changedOutput = run(updated.executable, ['1.0.1']).stdout
  assert.ok(changedOutput.includes('version=1.0.1') && changedOutput.includes(changedIdentity.sourceManifestSha256))
  assert.notEqual(hash(updated.executable), hash(normal.executable))
  report.changedIdentity = { identity: changedIdentity, stdout: changedOutput, artifact: meta(updated.executable) }
  const clean = hostBuild(pristine, 'clean-second')
  assert.equal(run(clean.executable, ['1.0.0']).stdout, normalOutput)
  report.reproducibility = { first: meta(normal.executable), second: meta(clean.executable), identical: hash(normal.executable) === hash(clean.executable), scope: 'Two fresh outputs with the same local compiler, sources and options; no universal byte-reproducibility claim.' }
  report.labs = []
  for (const [name, source, macro, summary, extra] of [
    ['runtime', 'reset-runtime/runtime_image.c', 'RUNTIME_IMAGE_TEST', 'PASS runtime:', ['-Wconversion', '-Wshadow']],
    ['memory', 'memory-budget/memory_budget.c', 'MEMORY_BUDGET_TEST', 'PASS memory budget:', []],
    ['clock', 'clock-timebase/clock_plan.c', 'CLOCK_PLAN_TEST', 'PASS unit09:', ['-Wconversion', '-Wshadow']]
  ]) {
    const sourcePath = join(root, 'docs/public/examples', source), results = {}
    for (const [variant, flags] of [['normal', ['-D' + macro]], ['ndebug', ['-D' + macro, '-DNDEBUG']], ['module', ['-c']]]) {
      const artifact = join(output, name + '-' + variant + (variant === 'module' ? '.o' : exeSuffix))
      build(name + '-' + variant, compiler, [...strict, ...extra, ...flags, sourcePath, '-o', artifact], [artifact])
      results[variant] = { artifact: meta(artifact) }
      if (variant !== 'module') { const result = run(artifact, []); assert.ok(result.stdout.startsWith(summary)); results[variant].stdout = result.stdout }
    }
    assert.equal(results.normal.stdout, results.ndebug.stdout)
    report.labs.push({ name, results, status: 'passed' })
  }
  const probe = join(folder('memory-budget'), 'stack_probe.c')
  const probeFlags = [...strict, '-O0', '-fno-inline', '-fno-optimize-sibling-calls']
  const hostProbe = join(output, 'probe-host.o'), hostSU = join(output, 'probe-host.su')
  build('probe-host', compiler, [...probeFlags, '-fstack-usage', '-c', probe, '-o', hostProbe], [hostProbe, hostSU])
  report.hostStackUsage = stackUsage(hostSU)
  const probeExecutable = join(output, 'probe-test' + exeSuffix)
  build('probe-test', compiler, [...probeFlags, '-DSTACK_PROBE_TEST', probe, '-o', probeExecutable], [probeExecutable])
  assert.match(run(probeExecutable, []).stdout, /PASS bounded stack probe: 32 and 270/)
  report.arm = { status: 'not-requested', limitation: 'Supply an existing --arm-compiler to attempt artificial ARM artifacts and an unlinked stack object.' }
  if (armCompiler) {
    activeCompiler = armCompiler
    identify('armCompiler', armCompiler)
    const armTools = Object.fromEntries(['nm', 'readelf', 'objcopy', 'objdump'].map(name => [name, executable(options['arm-' + name] || sibling(armCompiler, name))]))
    for (const [name, tool] of Object.entries(armTools)) identify('arm' + name, tool)
    const destination = join(output, 'arm'); mkdirSync(destination)
    const objects = ['entry', 'measurement', 'build_identity'].map(member => {
      const object = join(destination, member + '.o')
      build('arm-' + member, armCompiler, [...strict, '-O0', '-mcpu=cortex-m4', '-mthumb', '-ffreestanding', '-fno-builtin', '-c', join(pristine, member + '.c'), '-o', object], [object])
      return object
    })
    const elf = join(destination, 'lesson.elf'), map = join(destination, 'lesson.map'), bin = join(destination, 'lesson.bin')
    build('arm-link', armCompiler, ['-mcpu=cortex-m4', '-mthumb', '-nostdlib', '-T', join(pristine, 'lesson.ld'), ...objects, '-Wl,--build-id=sha1', '-Wl,-Map=' + map, '-o', elf], [elf, map])
    build('arm-raw-binary', armTools.objcopy, ['-O', 'binary', elf, bin], [bin], null, [], 'arm-artificial')
    const headers = run(armTools.readelf, ['-h', '-S', '-l', '-s', '-n', elf]).stdout
    const symbols = run(armTools.nm, ['-A', '-n', elf]).stdout
    assert.match(headers, /Machine:\s+ARM/); assert.match(headers, /Build ID:/); assert.doesNotMatch(headers, /\.isr_vector/)
    assert.match(symbols, /T lesson_entry/); assert.match(symbols, /T measurement_sum/); assert.notEqual(hash(elf), hash(bin))
    const armProbe = join(destination, 'probe-arm.o'), armSU = join(destination, 'probe-arm.su')
    build('probe-arm', armCompiler, [...probeFlags, '-mcpu=cortex-m4', '-mthumb', '-mfloat-abi=soft', '-fstack-usage', '-c', probe, '-o', armProbe], [armProbe, armSU])
    report.arm = { status: 'passed-artifact-inspection-only', bootable: false, executed: false, elf: meta(elf), bin: meta(bin), map: meta(map), headers, symbols, sections: run(armTools.objdump, ['-h', elf]).stdout, stackUsage: stackUsage(armSU) }
  }
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.failure = error.message; process.exitCode = 1; console.error(error.message)
} finally {
  report.sourcesAfter = sourceFiles.map(meta)
  report.sourcesUnchanged = report.sources.length === sourceFiles.length && report.sources.every((source, index) => source.sha256 === report.sourcesAfter[index]?.sha256)
  if (!report.sourcesUnchanged) { report.status = 'failed'; report.failure = (report.failure || '') + '\nPublic source bytes changed or source evidence incomplete'; process.exitCode = 1 }
  report.finishedAt = new Date().toISOString()
  writeFileSync(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ status: report.status, builds: report.builds.length, commands: report.commands.length, sourcesUnchanged: report.sourcesUnchanged, report: join(output, 'result.json') }))
}
