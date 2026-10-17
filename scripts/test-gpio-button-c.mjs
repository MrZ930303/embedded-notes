import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const options = {}
const args = process.argv.slice(2)
for (let index = 0; index < args.length; index += 2) {
  const key = args[index]?.slice(2)
  if (!args[index]?.startsWith('--') || !['compiler', 'router', 'python', 'source'].includes(key) || !args[index + 1] || args[index + 1].startsWith('--')) {
    throw new Error('Usage: node scripts/test-gpio-button-c.mjs [--compiler <existing-cc>] [--router <build_router.py>] [--python <python>] [--source <button.c>]')
  }
  options[key] = args[index + 1]
}
const compiler = options.compiler || process.env.CC || 'cc'
const router = options.router || process.env.MCU_BUILD_ROUTER || join(homedir(), '.codex/skills/mcu-build/scripts/build_router.py')
const python = options.python || process.env.PYTHON || 'python'
if (!existsSync(router)) throw new Error('mcu-build router required; pass --router <build_router.py>. Compilation is not run without it.')
const evidenceDir = join(root, '.scratch/gpio-textbook/code-evidence')
mkdirSync(evidenceDir, { recursive: true })
const source = resolve(root, options.source || 'docs/public/examples/gpio-button/button.c')
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const metadata = file => existsSync(file) ? { size: statSync(file).size, mtime: statSync(file).mtime.toISOString(), sha256: hash(file) } : null
const log = []
const artifacts = []
function run(command, args, allowFailure = false) {
  const env = { ...process.env }
  if (isAbsolute(compiler)) env.PATH = dirname(compiler) + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH || '')
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env, timeout: 60000 })
  const record = { command: [command, ...args], status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message }
  log.push(record)
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (!allowFailure && (result.status !== 0 || result.error)) throw new Error(`Command failed: ${command}; status ${result.status}`)
  return result
}
function compile(name, input, flags = []) {
  const artifact = join(evidenceDir, name + (flags.includes('-c') ? '.o' : process.platform === 'win32' ? '.exe' : ''))
  const profile = join(evidenceDir, name + '.toml')
  const command = [compiler, '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic', ...flags, input, '-o', artifact]
  const before = metadata(artifact)
  const quote = value => JSON.stringify(value)
  const profileName = name.replaceAll('-', '_')
  writeFileSync(profile, `version = 1\ndefault_profile = "${profileName}"\n[settings]\nworkspace_root = ${quote(root)}\nlog_dir = ".scratch/gpio-textbook/code-evidence/logs"\n[environments.existing_compiler]\nkind = "custom"\n[profiles.${profileName}]\nenvironment = "existing_compiler"\nplatform = "host-c11"\ncommand = [${command.map(quote).join(', ')}]\nartifacts = [${quote(artifact.slice(root.length).replaceAll('\\', '/'))}]\nartifact_policy = "all"\n`)
  run(python, [router, 'validate', '--config', profile])
  run(python, [router, 'build', '--config', profile, '--dry-run'])
  run(python, [router, 'build', '--config', profile])
  const after = metadata(artifact)
  artifacts.push({ profile, artifact, input, command, before, after, changed: !before || before.sha256 !== after.sha256 || before.mtime !== after.mtime })
  return artifact
}
try {
  const originalHash = hash(source)
  run(compiler, ['--version'])
  const artifact = compile('button-test', source, ['-DBUTTON_TEST'])
  run(artifact, [])
  const releaseArtifact = compile('button-test-ndebug', source, ['-DBUTTON_TEST', '-DNDEBUG'])
  run(releaseArtifact, [])
  compile('button-module', source, ['-c'])
  const text = readFileSync(source, 'utf8')
  const correctComparison = '(uint32_t)(nowMs - button->sinceMs) < button->thresholdMs'
  if (text.split(correctComparison).length !== 2) throw new Error('Mutation requires exactly one qualification comparison in the source.')
  const mutant = join(evidenceDir, 'button-mutant.c')
  writeFileSync(mutant, text.replace(correctComparison, '(uint32_t)(nowMs - button->sinceMs) <= button->thresholdMs'))
  const mutantArtifact = compile('button-mutant', mutant, ['-DBUTTON_TEST', '-DNDEBUG'])
  const mutatedRun = run(mutantArtifact, [], true)
  if (mutatedRun.error || mutatedRun.status === 0 || !mutatedRun.stderr.includes('FAIL: fixed waveform event time')) {
    throw new Error('Mutation was not rejected by the actual host waveform test.')
  }
  console.log('PASS mutation sensitivity: delaying acceptance from >= threshold to > threshold fails actual host event tests.')
  if (hash(source) !== originalHash) throw new Error('The downloaded source changed during mutation testing.')
  run(artifact, [])
  writeFileSync(join(evidenceDir, 'result.json'), JSON.stringify({ status: 'passed', scope: 'host C11 tests only; no hardware validation', source, sourceSha256: hash(source), artifacts, mutation: { source: mutant, sha256: hash(mutant), expectedExitStatus: mutatedRun.status, change: 'acceptance >= threshold changed to > threshold' }, commands: log }, null, 2))
  console.log('PASS host C11 lab: strict build, NDEBUG build, module-only build, mutation rejected, clean source passes again; evidence ' + join(evidenceDir, 'result.json'))
} catch (error) {
  writeFileSync(join(evidenceDir, 'result.json'), JSON.stringify({ source, sourceSha256: existsSync(source) ? hash(source) : null, failure: error.message, commands: log }, null, 2))
  throw error
}
