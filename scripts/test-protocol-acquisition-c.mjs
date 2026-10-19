import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const usage = 'node scripts/test-protocol-acquisition-c.mjs [--compiler <existing-gcc>] [--router <build_router.py>] [--python <python>] [--output <workspace-.scratch-directory>]'
const options = {}, args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--help') { console.log(usage); process.exit(0) }
for (let index = 0; index < args.length; index += 2) {
  const key = args[index]?.slice(2)
  if (!args[index]?.startsWith('--') || !['compiler', 'router', 'python', 'output'].includes(key) ||
      !args[index + 1] || args[index + 1].startsWith('--') || options[key]) throw Error(usage)
  options[key] = args[index + 1]
}
function executable(value) {
  if (isAbsolute(value) || value.includes('/') || value.includes('\\')) return resolve(value)
  const extensions = process.platform === 'win32' ? ['', ...(process.env.PATHEXT || '.EXE;.CMD').split(';')] : ['']
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    for (const extension of extensions) {
      const candidate = join(directory, value + extension.toLowerCase())
      if (existsSync(candidate) && statSync(candidate).isFile()) return resolve(candidate)
    }
  }
  return value
}
const compiler = executable(options.compiler || process.env.CC || 'cc')
const python = executable(options.python || process.env.PYTHON || 'python')
const router = resolve(options.router || process.env.MCU_BUILD_ROUTER || join(homedir(), '.codex/skills/mcu-build/scripts/build_router.py'))
const outputRoot = resolve(root, options.output || '.scratch/protocol-acquisition/integration/c-evidence')
const privateRelative = relative(root, outputRoot).replaceAll('\\', '/')
assert.ok(!isAbsolute(privateRelative) && privateRelative.startsWith('.scratch/') && !privateRelative.split('/').includes('..'))
mkdirSync(outputRoot, { recursive: true })
const output = mkdtempSync(join(outputRoot, 'run-'))
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const meta = file => existsSync(file) && statSync(file).isFile()
  ? { path: file, bytes: statSync(file).size, mtime: statSync(file).mtime.toISOString(), sha256: hash(file) } : null
const examples = join(root, 'docs/public/examples')
const modules = [
  ['fifo', 'bounded-fifo/fifo'], ['time', 'timer-pwm/time'], ['uart', 'uart-framing/uart'],
  ['bus', 'bus-transactions/bus'], ['adc', 'adc-sampling/adc'],
  ['recovery', 'driver-recovery/recovery'], ['backend', 'driver-recovery/fake_sensor'],
  ['terminal', 'driver-recovery/terminal']
]
const sourceFiles = [...modules.flatMap(([, file]) => ['.c', '.h'].map(suffix => join(examples, file + suffix))),
  ...['bounded-fifo', 'timer-pwm', 'uart-framing', 'bus-transactions', 'adc-sampling', 'driver-recovery']
    .map(folder => join(examples, folder, 'README.txt'))]
const report = { status: 'running', startedAt: new Date().toISOString(), output, runner: meta(fileURLToPath(import.meta.url)),
  selection: { compiler: options.compiler || process.env.CC || 'cc', python: options.python || process.env.PYTHON || 'python' },
  sources: [], tools: {}, commands: [], builds: [], executions: [], artifacts: [], stackUsage: [],
  limits: 'Actual separately linked host C11 models. No target/hardware/physical recovery, timing, maximum stack, paper or publication evidence.' }
function run(command, argv) {
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8' }
  if (isAbsolute(compiler)) env.PATH = dirname(compiler) + delimiter + (process.env.PATH || '')
  const result = spawnSync(command, argv, { cwd: root, env, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 })
  const record = { command: [command, ...argv], status: result.status, signal: result.signal,
    stdout: result.stdout || '', stderr: result.stderr || '', error: result.error?.message || null }
  report.commands.push(record)
  writeFileSync(join(output, 'command-' + report.commands.length + '.json'), JSON.stringify(record, null, 2) + '\n')
  return record
}
function successful(record) { assert.ok(record.status === 0 && !record.error && !record.signal, JSON.stringify(record)) }
function build(name, compilerArgs, artifacts) {
  for (const file of artifacts) assert.equal(existsSync(file), false, 'Destination must be fresh: ' + file)
  const command = [compiler, ...compilerArgs], profile = join(output, name + '.toml'), q = JSON.stringify
  writeFileSync(profile, `version=1\ndefault_profile="experiment"\n[settings]\nworkspace_root=${q(root)}\nlog_dir=${q(relative(root, join(output, 'logs')).replaceAll('\\', '/'))}\n[environments.existing]\nkind="custom"\n[profiles.experiment]\nenvironment="existing"\nplatform="host-c11"\ncommand=[${command.map(q).join(',')}]\nartifacts=[${artifacts.map(file => q(relative(root, file).replaceAll('\\', '/'))).join(',')}]\nartifact_policy="all"\n`)
  const record = { name, command, profile: meta(profile), inputs: [...new Set([...sourceFiles, report.consumer.path,
    ...compilerArgs.filter(file => existsSync(file) && statSync(file).isFile())])].map(meta),
    before: artifacts.map(meta), stages: {}, artifacts: [], status: 'running' }
  report.builds.push(record)
  for (const [stage, argv] of [['validate', [router, 'validate', '--config', profile]],
    ['dryRun', [router, 'build', '--config', profile, '--dry-run']], ['build', [router, 'build', '--config', profile]]]) {
    const actual = run(python, argv); record.stages[stage] = actual
    if (stage === 'build') {
      const match = actual.stdout.match(/Return code: (-?\d+)/)
      record.rawReturnCode = match ? Number(match[1]) : null
      const log = actual.stdout.match(/Log: ([^\r\n]+)/)?.[1]
      record.log = log ? meta(log) : null
      record.diagnostics = record.log ? readFileSync(log, 'utf8') : null
    }
    successful(actual)
  }
  assert.equal(record.rawReturnCode, 0, 'Raw compiler status must be present and zero')
  assert.ok(record.log, 'Actual compiler log required')
  for (const file of artifacts) {
    const actual = meta(file); assert.ok(actual?.bytes > 0, 'Fresh artifact missing: ' + file)
    const artifact = { ...actual, fresh: true }; record.artifacts.push(artifact); report.artifacts.push(artifact)
  }
  record.status = 'passed'
}
const consumerSource = String.raw`/******************************************************************************
 * Original embedded-notes integration tests, 2026. No third-party ownership claimed.
 * @file consumer.c
 * @author embedded-notes contributors
 * @brief Independent literal fixtures across eight real public modules.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "bounded-fifo/fifo.h"
#include "bounded-fifo/fifo.h"
#include "timer-pwm/time.h"
#include "timer-pwm/time.h"
#include "uart-framing/uart.h"
#include "uart-framing/uart.h"
#include "bus-transactions/bus.h"
#include "bus-transactions/bus.h"
#include "adc-sampling/adc.h"
#include "adc-sampling/adc.h"
#include "driver-recovery/recovery.h"
#include "driver-recovery/recovery.h"
#include "driver-recovery/fake_sensor.h"
#include "driver-recovery/fake_sensor.h"
#include "driver-recovery/terminal.h"
#include "driver-recovery/terminal.h"
#include <stdio.h>

#define CHECK(condition) do { if (!(condition)) { return __LINE__; } } while (0)

/** @brief Check independent address, phase, commit and ownership literals.
 * @param[in] None
 * @return Zero on success, otherwise the failing fixture line. */
static int check_bus(void)
{
    BusState state;
    BusRequest request = {BUS_I2C, 0x18U, 0x0FU};
    BusEvent event = {BUS_EVENT_OK, 0x33U};
    BusReport report;
    size_t index;
    /** Nine supplied phases commit only after STOP at tick8. **/
    CHECK(bus_init(&state) == BUS_OK && bus_start(&state, &request, 0U) == BUS_OK);
    for (index = 0U; index < 9U; index++) {
        CHECK(bus_poll(&state, (uint32_t)index, &event, &report) == BUS_OK);
        CHECK(report.action && report.newResult == (index == 8U));
    }
    CHECK(report.status == BUS_READY && report.result == 0x33U && report.resource == BUS_RELEASED);
    request.protocol = BUS_SPI;
    CHECK(bus_start(&state, &request, 10U) == BUS_OK);
    for (index = 0U; index < 4U; index++) {
        event.received = index == 1U ? 0x7EU : 0x33U;
        CHECK(bus_poll(&state, 10U + (uint32_t)index, &event, &report) == BUS_OK);
        if (index == 1U) { CHECK(report.discarded && !report.newResult); }
    }
    CHECK(report.newResult && report.result == 0x33U);
    request.protocol = BUS_I2C;
    CHECK(bus_start(&state, &request, 50U) == BUS_OK);
    CHECK(bus_poll(&state, 50U, &event, &report) == BUS_OK);
    CHECK(bus_poll(&state, 51U, &event, &report) == BUS_OK);
    event.kind = BUS_EVENT_ARLO;
    CHECK(bus_poll(&state, 52U, &event, &report) == BUS_OK);
    CHECK(report.cause == BUS_ARLO && report.resource == BUS_LOST && report.nextPhase != BUS_ERROR_STOP);
    CHECK(!report.newResult && report.result == 0x33U);
    CHECK(bus_start(&state, &request, 100U) == BUS_OK);
    event.kind = BUS_EVENT_OK;
    CHECK(bus_poll(&state, 120U, &event, &report) == BUS_OK);
    CHECK(report.cause == BUS_TIMEOUT && !report.action && !report.newResult && report.result == 0x33U);
    return 0;
}

/** @brief Check exact spec thresholds and conditional clock arithmetic.
 * @param[in] None
 * @return Zero on success, otherwise fixture line. */
static int check_adc(void)
{
    AdcRequest request = {12U, 15U, 4U, 3300000U, 1649999U};
    AdcPlan plan;
    AdcRational value;
    uint16_t code = 77U;
    /** Literal adjacent thresholds do not call a second quantizer oracle. **/
    CHECK(adc_plan(&request, &plan) == ADC_OK && plan.adcHz == 21000000U && plan.totalCycles == 27U);
    CHECK(adc_quantize(&request, &code) == ADC_OK && code == 2047U);
    request.inputUv = 1650000U;
    CHECK(adc_quantize(&request, &code) == ADC_OK && code == 2048U);
    CHECK(adc_reconstruct(&request, code, false, &value) == ADC_OK);
    CHECK(value.numeratorUv == UINT64_C(6758400000) && value.denominator == 4096U);
    request.inputUv = 3300000U;
    CHECK(adc_quantize(&request, &code) == ADC_OK && code == 4095U);
    request.divider = 2U;
    CHECK(adc_plan(&request, &plan) == ADC_INVALID_ARGUMENT && plan.adcHz == 21000000U);
    return 0;
}

/** @brief Enqueue the original status frame through actual transport calls.
 * @param[in,out] terminal Initialized exclusive terminal.
 * @return Zero on success, otherwise fixture line. */
static int status_frame(RecoveryTerminal *terminal)
{
    const uint8_t bytes[4] = {0xA5U, 0x01U, 0x02U, 0x03U};
    UartIngress ingress;
    size_t index;
    /** Fixed four-value ingress fits the actual FIFO capacity. **/
    for (index = 0U; index < 4U; index++) {
        CHECK(recovery_terminal_receive(terminal, bytes[index], &ingress) == UART_OK);
    }
    return 0;
}

/** @brief Observe actual ADC/UART/manager cooperation and separate response ownership.
 * @param[in] None
 * @return Zero on success, otherwise fixture line. */
static int check_terminal(void)
{
    RecoveryTerminal terminal;
    RecoveryConfig config = {RECOVERY_BACKEND_ADC, 1U, 0U, 0U, 0U};
    RecoveryRequest request = {RECOVERY_SAMPLE, 0U, {12U, 15U, 4U, 3300000U, 1650000U}};
    RecoveryInput input = {RECOVERY_INPUT_NONE, 0U, RECOVERY_CAUSE_NONE};
    RecoveryTurnReport report;
    RecoveryValue result = {RECOVERY_VALUE_SAMPLE, 0U, 777U};
    RecoveryStatusResponse response;
    /** Start and each producer phase are separate bounded turns. **/
    CHECK(recovery_terminal_init(&terminal, &config, 100U, 0U) == RECOVERY_OK);
    CHECK(recovery_submit(&terminal.job, &request, 0U) == RECOVERY_OK);
    CHECK(recovery_terminal_turn(&terminal, 0U, &input, &report, &result, &response) == RECOVERY_OK);
    CHECK(report.job.backendActions == 1U && report.job.producerCalls == 1U && result.sample == 777U);
    CHECK(status_frame(&terminal) == 0);
    input.kind = RECOVERY_INPUT_ADC_ADVANCE; input.token = 1U;
    CHECK(recovery_terminal_turn(&terminal, 0U, &input, &report, &result, &response) == RECOVERY_OK);
    CHECK(report.uartReportValid && report.uart.consumed == 4U && report.uart.commandPresent);
    CHECK(report.responsePresent && response.periodMs == 100U && terminal.uart.applicationPeriod == 100U);
    CHECK(response.job.category == RECOVERY_CATEGORY_PENDING && !report.job.resultPresent);
    CHECK(report.job.backendActions == 1U && report.job.producerCalls == 1U);
    CHECK(recovery_terminal_turn(&terminal, 1U, &input, &report, &result, &response) == RECOVERY_OK);
    CHECK(recovery_terminal_turn(&terminal, 2U, &input, &report, &result, &response) == RECOVERY_OK);
    CHECK(report.job.resultPresent && result.kind == RECOVERY_VALUE_SAMPLE && result.sample == 2048U);
    CHECK(terminal.job.backend.adc.committed == 2048U);
    CHECK(recovery_reset(&terminal.job) == RECOVERY_OK);
    CHECK(recovery_submit(&terminal.job, &request, 3U) == RECOVERY_OK);
    input.kind = RECOVERY_INPUT_NONE; input.token = 0U;
    CHECK(recovery_terminal_turn(&terminal, 3U, &input, &report, &result, &response) == RECOVERY_OK);
    CHECK(recovery_terminal_turn(&terminal, 23U, &input, &report, &result, &response) == RECOVERY_OK);
    CHECK(report.job.snapshot.phase == RECOVERY_CANCEL_DUE && report.job.backendActions == 0U);
    CHECK(recovery_terminal_turn(&terminal, 24U, &input, &report, &result, &response) == RECOVERY_OK);
    CHECK(report.job.snapshot.cleanup == RECOVERY_CLEANUP_REQUESTED && report.job.producerCalls == 0U);
    CHECK(status_frame(&terminal) == 0);
    CHECK(recovery_terminal_turn(&terminal, 25U, &input, &report, &result, &response) == RECOVERY_OK);
    CHECK(report.responsePresent && response.periodMs == 100U && report.uart.consumed == 4U);
    CHECK(report.job.snapshot.phase == RECOVERY_RETRY_WAIT && report.job.producerCalls == 1U);
    CHECK(result.sample == 2048U && terminal.job.backend.adc.committed == 2048U);
    return 0;
}

/** @brief Check independent retry rows and no fourth start through public reports.
 * @param[in] None
 * @return Zero on success, otherwise fixture line. */
static int check_budgets(void)
{
    typedef struct { uint32_t now; RecoveryPhase phase; uint32_t attempt; size_t actions; } Row;
    const Row rows[14] = {
        {0U, RECOVERY_ACTIVE, 1U, 1U}, {20U, RECOVERY_CANCEL_DUE, 1U, 0U},
        {21U, RECOVERY_CANCELLING, 1U, 1U}, {22U, RECOVERY_RETRY_WAIT, 1U, 1U},
        {26U, RECOVERY_RETRY_WAIT, 1U, 0U}, {27U, RECOVERY_ACTIVE, 2U, 1U},
        {47U, RECOVERY_CANCEL_DUE, 2U, 0U}, {48U, RECOVERY_CANCELLING, 2U, 1U},
        {49U, RECOVERY_RETRY_WAIT, 2U, 1U}, {54U, RECOVERY_ACTIVE, 3U, 1U},
        {74U, RECOVERY_CANCEL_DUE, 3U, 0U}, {75U, RECOVERY_CANCELLING, 3U, 1U},
        {76U, RECOVERY_TERMINAL, 3U, 1U}, {77U, RECOVERY_TERMINAL, 3U, 0U}
    };
    RecoveryConfig config = {RECOVERY_BACKEND_FAKE, 1U, 0U, 42U, 0U};
    RecoveryRequest request = {RECOVERY_READ, 0U, {0U, 0U, 0U, 0U, 0U}};
    RecoveryState state;
    RecoveryInput input;
    RecoveryReport report;
    RecoveryValue result = {RECOVERY_VALUE_FAKE, 777U, 0U};
    size_t index;
    /** Cleanup rows supply matching external observations, never automatic success. **/
    CHECK(recovery_init(&state, &config, 0U) == RECOVERY_OK);
    CHECK(recovery_submit(&state, &request, 0U) == RECOVERY_OK);
    for (index = 0U; index < 14U; index++) {
        input.kind = RECOVERY_INPUT_NONE; input.token = 0U; input.cause = RECOVERY_CAUSE_NONE;
        if (index == 3U || index == 8U || index == 12U) {
            input.kind = RECOVERY_INPUT_CLEANUP_DONE; input.token = rows[index].attempt;
        }
        CHECK(recovery_service(&state, rows[index].now, &input, &report, &result) == RECOVERY_OK);
        CHECK(report.snapshot.phase == rows[index].phase && report.snapshot.attempt == rows[index].attempt);
        CHECK(report.backendActions == rows[index].actions && report.producerCalls == 0U);
        CHECK(report.eventCount <= 3U && !report.resultPresent && result.fakeValue == 777U);
    }
    CHECK(report.snapshot.reason == RECOVERY_REASON_ATTEMPTS_EXHAUSTED);
    CHECK(report.snapshot.firstFailure.jobAgeMs == 20U && report.snapshot.lastFailure.jobAgeMs == 74U);
    return 0;
}

/** @brief Prove live quarantine cannot erase ownership while real UART still answers.
 * @param[in] None
 * @return Zero on success, otherwise fixture line. */
static int check_quarantine(void)
{
    RecoveryTerminal terminal;
    RecoveryConfig config = {RECOVERY_BACKEND_FAKE, 1U, 0U, 0U, 0U};
    RecoveryRequest request = {RECOVERY_READ, 0U, {0U, 0U, 0U, 0U, 0U}};
    RecoveryInput input = {RECOVERY_INPUT_NONE, 0U, RECOVERY_CAUSE_NONE};
    RecoveryTurnReport report;
    RecoveryValue result = {RECOVERY_VALUE_FAKE, 99U, 0U};
    RecoveryStatusResponse response;
    /** At41, deadline wins over a matching same-tick cleanup event. **/
    CHECK(recovery_terminal_init(&terminal, &config, 100U, 0U) == RECOVERY_OK);
    CHECK(recovery_submit(&terminal.job, &request, 0U) == RECOVERY_OK);
    CHECK(recovery_terminal_turn(&terminal, 0U, &input, &report, &result, &response) == RECOVERY_OK);
    CHECK(recovery_terminal_turn(&terminal, 20U, &input, &report, &result, &response) == RECOVERY_OK);
    CHECK(recovery_terminal_turn(&terminal, 21U, &input, &report, &result, &response) == RECOVERY_OK);
    input.kind = RECOVERY_INPUT_CLEANUP_DONE; input.token = 1U;
    CHECK(recovery_terminal_turn(&terminal, 41U, &input, &report, &result, &response) == RECOVERY_OK);
    CHECK(report.job.snapshot.category == RECOVERY_CATEGORY_QUARANTINED && report.job.backendActions == 0U);
    CHECK(recovery_reset(&terminal.job) == RECOVERY_LOCKED);
    CHECK(recovery_submit(&terminal.job, &request, 41U) == RECOVERY_LOCKED);
    CHECK(status_frame(&terminal) == 0);
    CHECK(recovery_terminal_turn(&terminal, 42U, &input, &report, &result, &response) == RECOVERY_OK);
    CHECK(report.responsePresent && response.periodMs == 100U && report.uart.commandPresent);
    CHECK(response.job.category == RECOVERY_CATEGORY_QUARANTINED && report.job.backendActions == 0U);
    CHECK(result.fakeValue == 99U && terminal.uart.applicationPeriod == 100U);
    return 0;
}

/** @brief Return live failures with or without NDEBUG and report actual object sizes.
 * @param[in] None
 * @return Zero only for every independently expected public behavior. */
int main(void)
{
    int failure;
    /** Test failures are runtime branches, not assertions removed by NDEBUG. **/
    failure = check_bus();
    if (failure == 0) { failure = check_adc(); }
    if (failure == 0) { failure = check_terminal(); }
    if (failure == 0) { failure = check_budgets(); }
    if (failure == 0) { failure = check_quarantine(); }
    if (failure != 0) {
        if (fprintf(stderr, "FAIL combined literal fixture line %d\n", failure) < 0) { return 2; }
        return 1;
    }
    if (printf("PASS protocol acquisition: eight headers/modules, bus/ADC literals, actualUART+ADC+manager, "
        "retry/quarantine/status; sizes manager=%zu terminal=%zu report=%zu\n",
        sizeof(RecoveryState), sizeof(RecoveryTerminal), sizeof(RecoveryReport)) < 0 || fflush(stdout) != 0) {
        return 2;
    }
    return 0;
}
`
try {
  report.sources = sourceFiles.map(file => { const value = meta(file); assert.ok(value, 'Missing input: ' + file); return value })
  assert.ok(existsSync(router), 'Existing mcu-build router required; no compiler operation can bypass it')
  report.router = meta(router)
  for (const [name, command] of [['compiler', compiler], ['python', python]]) {
    const identity = run(command, ['--version']); report.tools[name] = { executable: command, file: meta(command), ...identity }
    successful(identity); assert.ok(report.tools[name].file, 'Resolved existing tool identity required')
  }
  const consumer = join(output, 'consumer.c'); writeFileSync(consumer, consumerSource)
  report.consumer = meta(consumer)
  const strict = ['-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic', '-O0'], summaries = []
  for (const [variant, flags] of [['normal', []], ['ndebug', ['-DNDEBUG']]]) {
    const objects = []
    for (const [name, file] of [...modules.map(([name, file]) => [name, join(examples, file + '.c')]), ['consumer', consumer]]) {
      const object = join(output, name + '-' + variant + '.o'), usage = join(output, name + '-' + variant + '.su')
      build(name + '-' + variant, [...strict, ...flags, '-fstack-usage', '-I', examples,
        '-I', join(examples, 'timer-pwm'), '-c', file, '-o', object], [object, usage])
      const frames = readFileSync(usage, 'utf8').trim().split(/\r?\n/).map(line => {
        const [symbol, bytes, qualifier] = line.split('\t'); return { symbol, bytes: Number(bytes), qualifier }
      })
      assert.ok(frames.length && frames.every(frame => Number.isInteger(frame.bytes) && frame.bytes >= 0 && frame.qualifier))
      report.stackUsage.push({ name, variant, file: meta(usage), frames,
        limit: 'Compiler/options-specific individual host frames, not whole-path/target maximum stack.' })
      objects.push(object)
    }
    const artifact = join(output, 'consumer-' + variant + (process.platform === 'win32' ? '.exe' : ''))
    build('link-' + variant, [...objects, '-o', artifact], [artifact])
    assert.ok(report.artifacts.some(item => item.path === artifact && item.fresh && item.sha256 === hash(artifact)))
    const execution = run(artifact, []); report.executions.push({ variant, artifact: meta(artifact), ...execution })
    successful(execution); assert.match(execution.stdout, /^PASS protocol acquisition:/); summaries.push(execution.stdout)
  }
  assert.equal(summaries[0], summaries[1], 'NDEBUG must retain identical live checks')
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.failure = error.message; process.exitCode = 1
} finally {
  report.sourcesAfter = sourceFiles.map(meta)
  report.sourcesUnchanged = report.sources.length === sourceFiles.length && report.sources.every((before, i) => before.sha256 === report.sourcesAfter[i]?.sha256)
  report.toolsAfter = { compiler: meta(compiler), python: meta(python), router: meta(router) }
  report.toolsUnchanged = report.tools.compiler?.file?.sha256 === report.toolsAfter.compiler?.sha256 &&
    report.tools.python?.file?.sha256 === report.toolsAfter.python?.sha256 && report.router?.sha256 === report.toolsAfter.router?.sha256
  report.consumerAfter = report.consumer ? meta(report.consumer.path) : null
  report.consumerUnchanged = Boolean(report.consumer && report.consumer.sha256 === report.consumerAfter?.sha256)
  if (!report.sourcesUnchanged || !report.toolsUnchanged || !report.consumerUnchanged) {
    report.status = 'failed'; report.failure = (report.failure || '') + '\nIncomplete or changed source/header/tool/consumer evidence'; process.exitCode = 1
  }
  report.finishedAt = new Date().toISOString()
  writeFileSync(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ status: report.status, builds: report.builds.length, executions: report.executions.length,
    sourcesUnchanged: report.sourcesUnchanged, toolsUnchanged: report.toolsUnchanged, consumerUnchanged: report.consumerUnchanged,
    failure: report.failure || null, report: join(output, 'result.json') }))
}
