import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const usage = 'node scripts/test-time-serial-c.mjs [--compiler <existing-gcc>] [--router <build_router.py>] [--python <python>] [--output <workspace-.scratch-directory>]'
const options = {}
const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--help') { console.log(usage); process.exit(0) }
for (let index = 0; index < args.length; index += 2) {
  const key = args[index]?.slice(2)
  if (!args[index]?.startsWith('--') || !['compiler', 'router', 'python', 'output'].includes(key) || !args[index + 1] || args[index + 1].startsWith('--') || options[key]) throw new Error(usage)
  options[key] = args[index + 1]
}
function executable(value) {
  if (isAbsolute(value) || value.includes('/') || value.includes('\\')) return resolve(value)
  const extensions = process.platform === 'win32' ? ['', ...(process.env.PATHEXT || '.EXE;.CMD').split(';')] : ['']
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    for (const extension of extensions) {
      const candidate = join(directory, value + extension.toLowerCase())
      if (existsSync(candidate)) return resolve(candidate)
    }
  }
  return value
}
const compiler = executable(options.compiler || process.env.CC || 'cc')
const python = executable(options.python || process.env.PYTHON || 'python')
const router = resolve(options.router || process.env.MCU_BUILD_ROUTER || join(homedir(), '.codex/skills/mcu-build/scripts/build_router.py'))
const outputRoot = resolve(root, options.output || '.scratch/time-serial/integration/c-evidence')
const privateRelative = relative(root, outputRoot).split('\\').join('/')
assert.ok(!isAbsolute(privateRelative) && privateRelative.startsWith('.scratch/') && !privateRelative.split('/').includes('..'), 'Evidence output must be inside this workspace .scratch directory')
mkdirSync(outputRoot, { recursive: true })
const output = mkdtempSync(join(outputRoot, 'run-'))
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const meta = file => existsSync(file) ? { path: file, bytes: statSync(file).size, mtime: statSync(file).mtime.toISOString(), sha256: hash(file) } : null
const inventory = [
  ['bounded-fifo', ['fifo.c', 'fifo.h', 'README.txt']],
  ['timer-pwm', ['timer.c', 'timer.h', 'time.c', 'time.h', 'README.txt']],
  ['uart-framing', ['uart.c', 'uart.h', 'README.txt']]
]
const examples = join(root, 'docs/public/examples')
const sourceFiles = inventory.flatMap(([folder, members]) => members.map(name => join(examples, folder, name)))
const codeFiles = sourceFiles.filter(file => /\.[ch]$/.test(file))
const report = {
  status: 'running', startedAt: new Date().toISOString(), output,
  commands: [], builds: [], executions: [], artifacts: [], tools: {}, sources: [],
  limits: 'Strict host C11 models and original separately linked dependencies only. No UART/timer hardware, target execution, physical timing, concurrency, target maximum stack, paper or publication validation.'
}
function run(command, argv) {
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8' }
  if (isAbsolute(compiler)) env.PATH = dirname(compiler) + delimiter + (process.env.PATH || '')
  const result = spawnSync(command, argv, { cwd: root, encoding: 'utf8', env, timeout: 60000, maxBuffer: 16 * 1024 * 1024 })
  const record = { command: [command, ...argv], status: result.status, signal: result.signal, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error?.message || null }
  report.commands.push(record)
  writeFileSync(join(output, 'command-' + report.commands.length + '.json'), JSON.stringify(record, null, 2) + '\n')
  assert.ok(!result.error && result.status === 0, 'Command failed: ' + JSON.stringify(record))
  return record
}
function identify(name, command) {
  const result = run(command, ['--version'])
  report.tools[name] = { executable: command, file: meta(command), identity: result.stdout.trim(), status: result.status }
}
function build(name, compilerArgs, artifacts) {
  for (const file of artifacts) assert.equal(existsSync(file), false, 'Artifact destination must be fresh: ' + file)
  const command = [compiler, ...compilerArgs]
  const profile = join(output, String(report.builds.length + 1).padStart(2, '0') + '-' + name + '.toml')
  const quote = value => JSON.stringify(value)
  writeFileSync(profile, `version = 1\ndefault_profile = "experiment"\n[settings]\nworkspace_root = ${quote(root)}\nlog_dir = ${quote(relative(root, join(output, 'logs')).replaceAll('\\', '/'))}\n[environments.existing]\nkind = "custom"\n[profiles.experiment]\nenvironment = "existing"\nplatform = "host-c11"\ncommand = [${command.map(quote).join(', ')}]\nartifacts = [${artifacts.map(file => quote(relative(root, file).replaceAll('\\', '/'))).join(', ')}]\nartifact_policy = "all"\n`)
  const inputs = [...codeFiles, ...compilerArgs.filter(value => existsSync(value) && statSync(value).isFile())]
  const record = { name, command, profile: meta(profile), inputs: [...new Set(inputs)].map(meta), before: artifacts.map(meta), stages: {}, artifacts: [], status: 'running' }
  report.builds.push(record)
  record.stages.validate = run(python, [router, 'validate', '--config', profile]).status
  record.stages.dryRun = run(python, [router, 'build', '--config', profile, '--dry-run']).status
  const actual = run(python, [router, 'build', '--config', profile])
  record.stages.build = actual.status
  record.rawReturnCode = Number(actual.stdout.match(/Return code: (-?\d+)/)?.[1])
  assert.equal(record.rawReturnCode, 0, 'Raw compiler/linker status must be retained and zero')
  const log = actual.stdout.match(/Log: ([^\r\n]+)/)?.[1]
  assert.ok(log && existsSync(log), 'Actual compiler/linker log required')
  record.log = meta(log)
  record.diagnosticSummary = readFileSync(log, 'utf8').split(/\r?\n/).filter(line => /error|warning/i.test(line))
  for (const file of artifacts) {
    const after = meta(file)
    assert.ok(after?.bytes > 0, 'Missing/empty artifact: ' + file)
    const artifact = { ...after, fresh: true }
    record.artifacts.push(artifact); report.artifacts.push(artifact)
  }
  record.status = 'passed'
  return record
}
function execute(name, artifact, summary) {
  assert.ok(report.artifacts.some(item => item.path === artifact && item.fresh && item.sha256 === hash(artifact)), 'Only a successful fresh selected artifact may execute')
  const result = run(artifact, [])
  assert.ok(result.stdout.startsWith(summary), 'Actual test summary missing: ' + name)
  report.executions.push({ name, artifact: meta(artifact), status: result.status, stdout: result.stdout, stderr: result.stderr })
  return result.stdout
}
const strict = ['-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic']
const exeSuffix = process.platform === 'win32' ? '.exe' : ''
const source = (folder, file) => join(examples, folder, file)
const consumerSource = `/******************************************************************************
 * Original embedded-notes integration test, 2026. No third-party ownership claimed.
 * @file consumer.c
 * @author embedded-notes contributors
 * @brief Independent repeated-header caller with literal expected outcomes.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "bounded-fifo/fifo.h"
#include "bounded-fifo/fifo.h"
#include "timer-pwm/timer.h"
#include "timer-pwm/timer.h"
#include "timer-pwm/time.h"
#include "timer-pwm/time.h"
#include "uart-framing/uart.h"
#include "uart-framing/uart.h"
#include <stdio.h>

/**
 * @brief Check original FIFO through its public interface.
 * @param[in] None
 * @param[out] None
 * @return Zero on success.
 */
static int check_fifo(void)
{
    Fifo queue;
    uint8_t byte = 99U;
    /** Real initialized independent output; no implementation text is included. **/
    if (fifo_reset(&queue) != FIFO_OK || fifo_push(&queue, 0U) != FIFO_OK ||
        fifo_push(&queue, 255U) != FIFO_OK || fifo_pop(&queue, &byte) != FIFO_OK || byte != 0U ||
        fifo_pop(&queue, &byte) != FIFO_OK || byte != 255U || fifo_pop(&queue, &byte) != FIFO_EMPTY) {
        return 1;
    }
    return 0;
}

/**
 * @brief Check manually derived PWM values and rejection preservation.
 * @param[in] None
 * @param[out] None
 * @return Zero on success.
 */
static int check_timer(void)
{
    TimerRequest request = {84000000U, 83U, 999U, 2500U};
    TimerPlan plan;
    /** Literal 1kHz/25% fixture, then the genuine wide divisor boundary. **/
    if (timer_plan(&request, &plan) != TIMER_OK || plan.compare != 250U ||
        plan.divisor != UINT64_C(84000) || plan.errorNum != 0) {
        return 1;
    }
    request.prescaler = 65535U;
    request.autoReload = 65535U;
    request.dutyBp = 0U;
    if (timer_plan(&request, &plan) != TIMER_OK || plan.divisor != UINT64_C(4294967296)) {
        return 1;
    }
    request.dutyBp = 10000U;
    if (timer_plan(&request, &plan) != TIMER_NOT_REPRESENTABLE || plan.compare != 0U ||
        plan.divisor != UINT64_C(4294967296)) {
        return 1;
    }
    return 0;
}

/**
 * @brief Check independent period10 observations and rejected gap.
 * @param[in] None
 * @param[out] None
 * @return Zero on success.
 */
static int check_time(void)
{
    TimeState state;
    TimeReport report;
    uint32_t delta = 77U;
    /** Expected values are the contract's hand-derived109/110/145 rows. **/
    if (time_init(&state, 10U, 100U) != TIME_OK || time_service(&state, 109U, &report) != TIME_OK ||
        report.work || report.missed != 0U || report.remainder != 9U) {
        return 1;
    }
    if (time_service(&state, 110U, &report) != TIME_OK || !report.work || report.missed != 0U ||
        report.remainder != 0U || time_service(&state, 145U, &report) != TIME_OK ||
        !report.work || report.missed != 2U || report.remainder != 5U) {
        return 1;
    }
    if (time_elapsed(0U, UINT32_C(2147483648), &delta) != TIME_GAP_REJECTED || delta != 77U) {
        return 1;
    }
    return 0;
}

/**
 * @brief Stream one six-byte literal through the real four-byte queue.
 * @param[in] None
 * @param[out] None
 * @return Zero on success.
 */
static int check_uart(void)
{
    const uint8_t frame[6] = {0xA5U, 0x03U, 0x01U, 0x64U, 0x00U, 0x66U};
    UartState state;
    UartIngress ingress;
    UartReport report;
    UartCommand command = {UART_GET_STATUS, 777U};
    size_t index;
    /** Service after four ingress values; a frame need not fit the queue. **/
    if (uart_init(&state, 200U, 0U) != UART_OK) {
        return 1;
    }
    for (index = 0U; index < 4U; index++) {
        if (uart_receive(&state, frame[index], &ingress) != UART_OK) {
            return 1;
        }
    }
    if (uart_poll(&state, 0U, &report, &command) != UART_OK || report.consumed != 4U ||
        report.commandPresent || command.periodMs != 777U) {
        return 1;
    }
    for (index = 4U; index < 6U; index++) {
        if (uart_receive(&state, frame[index], &ingress) != UART_OK) {
            return 1;
        }
    }
    if (uart_poll(&state, 1U, &report, &command) != UART_OK || !report.commandPresent ||
        command.kind != UART_SET_PERIOD || command.periodMs != 100U || state.applicationPeriod != 100U) {
        return 1;
    }
    if (uart_receive(&state, 0xA5U, &ingress) != UART_OK ||
        uart_poll(&state, 2U, &report, &command) != UART_OK ||
        uart_poll(&state, 22U, &report, &command) != UART_OK || report.commandPresent ||
        report.eventCount != 1U || report.events[0] != UART_TIMEOUT || state.phase != UART_SEEK ||
        command.periodMs != 100U || state.applicationPeriod != 100U) {
        return 1;
    }
    return 0;
}

/**
 * @brief Return live failures even with NDEBUG.
 * @param[in] None
 * @param[out] None
 * @return Zero only for all real checks.
 */
int main(void)
{
    /** Compile and link this caller separately from all four original modules. **/
    if (check_fifo() != 0 || check_timer() != 0 || check_time() != 0 || check_uart() != 0) {
        return 1;
    }
    if (puts("PASS combined consumer: repeated headers, original FIFO/time/timer/UART, literal phase and frame") < 0 ||
        fflush(stdout) != 0) {
        return 1;
    }
    return 0;
}
`
try {
  report.sources = sourceFiles.map(file => { const value = meta(file); assert.ok(value, 'Required source/header/instruction missing: ' + file); return value })
  assert.ok(existsSync(router), 'Existing mcu-build router required; no compiler operation is allowed without it')
  report.router = meta(router); report.runner = meta(fileURLToPath(import.meta.url))
  identify('compiler', compiler); identify('python', python)
  for (const [name, path, macro, summary, dependencies] of [
    ['timer', source('timer-pwm', 'timer.c'), 'TIMER_TEST', 'PASS timer:', []],
    ['time', source('timer-pwm', 'time.c'), 'TIME_TEST', 'PASS time:', []],
    ['uart', source('uart-framing', 'uart.c'), 'UART_TEST', 'PASS UART:', [source('bounded-fifo', 'fifo.c'), source('timer-pwm', 'time.c')]]
  ]) {
    const stdout = {}
    for (const [variant, flags] of [['normal', []], ['ndebug', ['-DNDEBUG']]]) {
      const artifact = join(output, name + '-' + variant + exeSuffix)
      build(name + '-' + variant, [...strict, '-D' + macro, ...flags, path, ...dependencies, '-o', artifact], [artifact])
      stdout[variant] = execute(name + '-' + variant, artifact, summary)
    }
    assert.equal(stdout.normal, stdout.ndebug, 'NDEBUG must not disable checks: ' + name)
  }
  const modules = []
  report.stackUsage = []
  for (const [name, path] of [['fifo', source('bounded-fifo', 'fifo.c')], ['timer', source('timer-pwm', 'timer.c')], ['time', source('timer-pwm', 'time.c')], ['uart', source('uart-framing', 'uart.c')]]) {
    const object = join(output, name + '-module.o'), usage = join(output, name + '-module.su')
    build(name + '-module', [...strict, '-O0', '-fstack-usage', '-c', path, '-o', object], [object, usage])
    const frames = readFileSync(usage, 'utf8').trim().split(/\r?\n/).map(line => { const [symbol, bytes, qualifier] = line.split('\t'); return { symbol, bytes: Number(bytes), qualifier } })
    assert.ok(frames.length > 0 && frames.every(frame => Number.isInteger(frame.bytes) && frame.bytes >= 0 && frame.qualifier), 'Actual per-function stack records required')
    report.stackUsage.push({ name, file: meta(usage), frames, limit: 'Compiler/options-specific individual host frames; not whole-path or target maximum stack.' })
    modules.push(object)
  }
  const consumer = join(output, 'consumer.c')
  writeFileSync(consumer, consumerSource)
  report.consumer = meta(consumer)
  const consumerOutput = {}
  for (const [variant, flags] of [['normal', []], ['ndebug', ['-DNDEBUG']]]) {
    const object = join(output, 'consumer-' + variant + '.o'), artifact = join(output, 'consumer-' + variant + exeSuffix)
    build('consumer-' + variant + '-compile', [...strict, ...flags, '-I', examples, '-c', consumer, '-o', object], [object])
    build('consumer-' + variant + '-link', [...modules, object, '-o', artifact], [artifact])
    consumerOutput[variant] = execute('consumer-' + variant, artifact, 'PASS combined consumer:')
  }
  assert.equal(consumerOutput.normal, consumerOutput.ndebug)
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.failure = error.message; process.exitCode = 1; console.error(error.message)
} finally {
  report.sourcesAfter = sourceFiles.map(meta)
  report.sourcesUnchanged = report.sources.length === sourceFiles.length && report.sources.every((before, index) => before.sha256 === report.sourcesAfter[index]?.sha256)
  report.toolsAfter = { compiler: meta(compiler), python: meta(python), router: meta(router) }
  report.toolsUnchanged = report.tools.compiler?.file?.sha256 === report.toolsAfter.compiler?.sha256 && report.tools.python?.file?.sha256 === report.toolsAfter.python?.sha256 && report.router?.sha256 === report.toolsAfter.router?.sha256
  report.consumerAfter = report.consumer ? meta(report.consumer.path) : null
  report.consumerUnchanged = Boolean(report.consumer && report.consumer.sha256 === report.consumerAfter?.sha256)
  if (!report.sourcesUnchanged || !report.toolsUnchanged || !report.consumerUnchanged) {
    report.status = 'failed'
    report.failure = (report.failure || '') + '\nSource/header/instruction/tool/consumer changed or input evidence incomplete'
    process.exitCode = 1
  }
  report.finishedAt = new Date().toISOString()
  writeFileSync(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ status: report.status, builds: report.builds.length, executions: report.executions.length, commands: report.commands.length, sources: report.sources.length, headers: report.sources.filter(item => item.path.endsWith('.h')).length, sourcesUnchanged: report.sourcesUnchanged, toolsUnchanged: report.toolsUnchanged, consumerUnchanged: report.consumerUnchanged, report: join(output, 'result.json') }))
}
