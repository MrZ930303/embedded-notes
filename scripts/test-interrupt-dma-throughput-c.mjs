import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const usage = 'node scripts/test-interrupt-dma-throughput-c.mjs [--compiler <existing-gcc>] [--router <build_router.py>] [--python <python>] [--output <workspace-.scratch-directory>]'
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
const outputRoot = resolve(root, options.output || '.scratch/interrupt-dma-throughput/integration/c-evidence')
const privateRelative = relative(root, outputRoot).replaceAll('\\', '/')
assert.ok(!isAbsolute(privateRelative) && privateRelative.startsWith('.scratch/') && !privateRelative.split('/').includes('..'))
mkdirSync(outputRoot, { recursive: true })
const output = mkdtempSync(join(outputRoot, 'run-'))
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const meta = file => existsSync(file) && statSync(file).isFile()
  ? { path: file, bytes: statSync(file).size, mtime: statSync(file).mtime.toISOString(), sha256: hash(file) } : null
const examples = join(root, 'docs/public/examples')
const modules = [
  ['irq', 'interrupt-shared-data/irq'], ['dma', 'dma-ownership/dma'],
  ['throughput', 'throughput-overload/throughput'], ['fifo', 'bounded-fifo/fifo'],
  ['uart', 'uart-framing/uart'], ['time', 'timer-pwm/time']
]
const sourceFiles = [...modules.flatMap(([, file]) => ['.c', '.h'].map(suffix => join(examples, file + suffix))),
  ...['interrupt-shared-data', 'dma-ownership', 'throughput-overload', 'bounded-fifo', 'uart-framing', 'timer-pwm']
    .map(folder => join(examples, folder, 'README.txt')), join(examples, 'gpio-button/button.c')]
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
function route(name, command, artifacts = []) {
  for (const file of artifacts) assert.equal(existsSync(file), false, 'Destination must be fresh: ' + file)
  const profile = join(output, name + '.toml'), q = JSON.stringify
  writeFileSync(profile, `version=1\ndefault_profile="experiment"\n[settings]\nworkspace_root=${q(root)}\nlog_dir=${q(relative(root, join(output, 'logs')).replaceAll('\\', '/'))}\n[environments.existing]\nkind="custom"\n[profiles.experiment]\nenvironment="existing"\nplatform="host-c11"\ncommand=[${command.map(q).join(',')}]\nartifacts=[${artifacts.map(file => q(relative(root, file).replaceAll('\\', '/'))).join(',')}]\nartifact_policy="all"\n`)
  const record = { name, command, profile: meta(profile), inputs: [...new Set([...sourceFiles, report.consumer.path,
    ...command.filter(file => existsSync(file) && statSync(file).isFile())])].map(meta),
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
  return record
}
const consumerSource = String.raw`/******************************************************************************
 * Original embedded-notes integration caller; no third-party ownership claim.
 * @file combined-consumer.c
 * @author embedded-notes contributors
 * @brief Independent literal fixtures over six separately linked host modules.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#include "interrupt-shared-data/irq.h"
#include "interrupt-shared-data/irq.h"
#include "dma-ownership/dma.h"
#include "dma-ownership/dma.h"
#include "throughput-overload/throughput.h"
#include "throughput-overload/throughput.h"
#include "bounded-fifo/fifo.h"
#include "bounded-fifo/fifo.h"
#include "uart-framing/uart.h"
#include "uart-framing/uart.h"
#include "timer-pwm/time.h"
#include "timer-pwm/time.h"
#include <stdio.h>

#define CHECK(x) do { if (!(x)) { return __LINE__; } } while (0)

typedef struct {
    DmaToken token;
    bool live;
    ThroughputInput labels[DMA_ITEMS];
    uint32_t count;
} LabelBank;
static DmaState g_dma;
static DmaState g_late;
static DmaState g_nonatomic;
static ThroughputState g_queue;
static ThroughputReport g_result;
static LabelBank g_labels[DMA_BLOCKS];
static UartState g_uart;
static TimeState g_time;
static uint32_t g_sourceId;

/** @brief Apply one explicit IRQ event and check runtime status.
 * @param[in,out] model Initialized exclusive object.
 * @param[in] operation/irq/value/extra One event.
 * @param[out] report Fresh copied public output.
 * @return Zero or the failed fixture line. */
static int irq_event(IrqModel *model, IrqOperation operation, uint32_t irq,
    uint32_t value, uint32_t extra, IrqReport *report)
{
    IrqCommand command = {operation, irq, value, extra};
    /** One call never hides a pending-drain loop. **/
    CHECK(irq_apply(model, &command, report, NULL) == IRQ_OK);
    return 0;
}

/** @brief Check independent priority, pending, RMW and saved-mask literals.
 * @param[in] None. @param[out] None. @return Zero or failing line. */
static int check_irq(void)
{
    const IrqPriority priorities[3] = {{2U, 0U}, {1U, 3U}, {2U, 3U}};
    IrqModel model;
    IrqEncoding encoding = {77U, 78U, 79U, 80U};
    IrqReport report;
    RmwModel lost;
    RmwModel serial;
    RmwReport result;
    IrqMaskRoundtrip mask;
    uint32_t counter = UINT32_MAX - 1U;
    bool saturated = false;
    /** These expected numbers come from the frozen g5 and lost-update examples. **/
    CHECK(irq_encode(5U, 4U, 0U, &encoding) == IRQ_INVALID_PRIORITY);
    CHECK(encoding.preemptBits == 77U && encoding.logical == 79U && encoding.registerByte == 80U);
    CHECK(irq_encode(5U, 2U, 1U, &encoding) == IRQ_OK);
    CHECK(encoding.preemptBits == 2U && encoding.subBits == 2U && encoding.logical == 9U);
    CHECK(encoding.registerByte == 0x90U);
    CHECK(irq_init(&model, 5U, priorities) == IRQ_OK);
    CHECK(irq_event(&model, IRQ_PULSE, 38U, 0U, 0U, &report) == 0);
    CHECK(irq_event(&model, IRQ_SELECT, 0U, 0U, 0U, &report) == 0 && report.irq == 38U);
    CHECK(irq_event(&model, IRQ_PULSE, 6U, 0U, 0U, &report) == 0);
    CHECK(irq_event(&model, IRQ_SELECT, 0U, 0U, 0U, &report) == 0 && report.event == IRQ_NO_ENTRY);
    CHECK(irq_event(&model, IRQ_PULSE, 29U, 0U, 0U, &report) == 0);
    CHECK(irq_event(&model, IRQ_SELECT, 0U, 0U, 0U, &report) == 0 && report.irq == 29U);
    CHECK(report.depth == 2U && report.activeBits == 6U && report.pendingBits == 1U);
    CHECK(irq_event(&model, IRQ_RETURN, 0U, 0U, 0U, &report) == 0 && report.depth == 1U);
    CHECK(irq_event(&model, IRQ_RETURN, 0U, 0U, 0U, &report) == 0 && report.depth == 0U);
    CHECK(irq_event(&model, IRQ_SELECT, 0U, 0U, 0U, &report) == 0 && report.irq == 6U);
    CHECK(rmw_init(&lost) == IRQ_OK && rmw_init(&serial) == IRQ_OK);
    CHECK(rmw_step(&lost, 0U, RMW_READ, &result) == IRQ_OK);
    CHECK(rmw_step(&lost, 1U, RMW_READ, &result) == IRQ_OK);
    CHECK(rmw_step(&lost, 1U, RMW_COMPUTE, &result) == IRQ_OK);
    CHECK(rmw_step(&lost, 1U, RMW_WRITE, &result) == IRQ_OK);
    CHECK(rmw_step(&lost, 0U, RMW_COMPUTE, &result) == IRQ_OK);
    CHECK(rmw_step(&lost, 0U, RMW_WRITE, &result) == IRQ_OK);
    CHECK(result.value == 1U && result.lost == 1U && result.terminal);
    CHECK(rmw_step(&serial, 0U, RMW_READ, &result) == IRQ_OK);
    CHECK(rmw_step(&serial, 0U, RMW_COMPUTE, &result) == IRQ_OK);
    CHECK(rmw_step(&serial, 0U, RMW_WRITE, &result) == IRQ_OK);
    CHECK(rmw_step(&serial, 1U, RMW_READ, &result) == IRQ_OK);
    CHECK(rmw_step(&serial, 1U, RMW_COMPUTE, &result) == IRQ_OK);
    CHECK(rmw_step(&serial, 1U, RMW_WRITE, &result) == IRQ_OK && result.value == 2U);
    CHECK(irq_mask_roundtrip(1U, &mask) == IRQ_OK && mask.restored == 1U);
    CHECK(irq_diagnostic_increment(&counter, &saturated) == IRQ_OK && !saturated);
    CHECK(irq_diagnostic_increment(&counter, &saturated) == IRQ_OK && saturated && counter == UINT32_MAX);
    return 0;
}

/** @brief Supply real status bytes and consume only fresh command output.
 * @param[in] now Supplied service observation.
 * @param[out] None. @return Zero or failing line. */
static int status_frame(uint32_t now)
{
    const uint16_t bytes[4] = {0xA5U, 1U, 2U, 3U};
    UartIngress ingress;
    UartReport report;
    UartCommand command = {UART_SET_PERIOD, 555U};
    TimeReport timeReport;
    size_t index;
    /** Exactly four ingress calls, one poll and one time service. **/
    for (index = 0U; index < 4U; index++) {
        CHECK(uart_receive(&g_uart, bytes[index], &ingress) == UART_OK);
    }
    CHECK(uart_poll(&g_uart, now, &report, &command) == UART_OK);
    CHECK(report.commandPresent && command.kind == UART_GET_STATUS && command.periodMs == 100U);
    CHECK(report.consumed == 4U && report.eventCount <= 5U);
    CHECK(time_service(&g_time, now, &timeReport) == TIME_OK && timeReport.releases <= 100U);
    return 0;
}

/** @brief Reserve labels only for the actual returned WRITER instance.
 * @param[in] report Fresh start/begin output. @param[out] None.
 * @return Zero or failing line. */
static int reserve_labels(const DmaReport *report)
{
    LabelBank *bank = &g_labels[report->current];
    /** Metadata is separate from producer storage and fixed at two by four. **/
    CHECK(report->phase == DMA_RUNNING && !bank->live);
    bank->token = report->descriptors[report->current].token;
    bank->live = true;
    bank->count = 0U;
    return 0;
}

/** @brief Commit one supplied acquisition and its matching private label.
 * @param[in] value/time One fake source event. @param[out] report Fresh output.
 * @return Zero or failing line. */
static int acquire(uint32_t value, uint32_t sourceTime, DmaReport *report)
{
    LabelBank *bank = &g_labels[g_dma.current];
    uint32_t item = bank->count;
    /** One call/turn supplies one item; numbering advances only on successful push. **/
    CHECK(bank->live && item < 4U && bank->token.run == g_dma.run);
    CHECK(bank->token.block == g_dma.blocks[g_dma.current].descriptor.token.block);
    CHECK(dma_push(&g_dma, value, report) == DMA_OK);
    bank->labels[item] = (ThroughputInput){0U, g_sourceId, g_sourceId - 1U, sourceTime, 1U};
    bank->count++;
    g_sourceId++;
    return 0;
}

/** @brief Copy four actual reads, end the lease, then offer independent records.
 * @param[in] service This turn's queue budget0..4. @param[out] None.
 * @return Zero or failing line. */
static int copy_offer(uint32_t service)
{
    DmaToken lease;
    ThroughputInput copied[4];
    uint16_t sample = 777U;
    size_t index;
    LabelBank *bank;
    /** Every value comes from the public lease read, never direct block payload. **/
    CHECK(dma_claim(&g_dma, &lease) == DMA_OK);
    bank = &g_labels[lease.slot];
    CHECK(bank->live && bank->count == 4U && bank->token.run == lease.run);
    CHECK(bank->token.block == lease.block && bank->token.slot == lease.slot);
    CHECK(dma_read(&g_dma, &lease, 4U, &sample) == DMA_INVALID_ARGUMENT && sample == 777U);
    for (index = 0U; index < 4U; index++) {
        CHECK(dma_read(&g_dma, &lease, (uint32_t)index, &sample) == DMA_OK);
        copied[index] = bank->labels[index];
        copied[index].value = sample;
    }
    CHECK(dma_release(&g_dma, &lease) == DMA_OK && !g_dma.leasePresent);
    bank->live = false;
    CHECK(throughput_step(&g_queue, copied, 4U, service, &g_result) == TP_OK);
    return 0;
}

/** @brief Observe actual values/backlog under the independent N1 literals.
 * @param[in] None. @param[out] None. @return Zero or failing line. */
static int check_composition(void)
{
    DmaReport report;
    DmaToken token;
    static const uint32_t samples[8] = {10U, 11U, 12U, 13U, 20U, 21U, 22U, 23U};
    size_t index;
    /** All initialized domains are fresh once, never reused to wipe live ownership. **/
    CHECK(dma_init(&g_dma, DMA_FIXTURE_NORMAL, true) == DMA_OK);
    CHECK(throughput_init(&g_queue, 40U, TP_FIXTURE_NORMAL, true) == TP_OK);
    CHECK(uart_init(&g_uart, 100U, 0U) == UART_OK && time_init(&g_time, 10U, 0U) == TIME_OK);
    g_sourceId = 1U;
    CHECK(dma_start(&g_dma, &report) == DMA_OK && reserve_labels(&report) == 0);
    token = report.descriptors[0].token;
    for (index = 0U; index < 4U; index++) {
        CHECK(acquire(samples[index], (uint32_t)index * 10U, &report) == 0);
    }
    CHECK(report.ndtr == 0U && report.descriptors[0].owner == DMA_WRITER && !report.tc);
    CHECK(dma_complete(&g_dma, &token, &report) == DMA_OK && copy_offer(1U) == 0);
    CHECK(g_result.departed[0].value == 10U && g_result.departed[0].sourceTime == 0U);
    CHECK(g_result.queuedCount == 3U && g_result.queued[2].value == 13U);
    CHECK(dma_begin_next(&g_dma, &report) == DMA_OK && reserve_labels(&report) == 0);
    token = report.descriptors[1].token;
    for (index = 4U; index < 8U; index++) {
        CHECK(acquire(samples[index], (uint32_t)index * 10U, &report) == 0);
    }
    CHECK(status_frame(70U) == 0 && g_dma.phase == DMA_RUNNING);
    CHECK(dma_complete(&g_dma, &token, &report) == DMA_OK && copy_offer(1U) == 0);
    CHECK(g_result.droppedCount == 3U && g_result.dropped[0].sourceId == 6U);
    CHECK(g_result.dropped[2].sourceId == 8U && g_result.departed[0].value == 11U);
    CHECK(g_result.queued[0].value == 12U && g_result.queued[2].value == 20U);
    CHECK(g_result.queued[2].sourceTime == 40U && g_sourceId == 9U);
    CHECK(dma_request_stop(&g_dma, DMA_CAUSE_USER, &report) == DMA_OK);
    CHECK(dma_confirm_stop(&g_dma, &report) == DMA_OK && status_frame(71U) == 0);
    for (index = 0U; index < 3U; index++) {
        CHECK(throughput_step(&g_queue, NULL, 0U, 1U, &g_result) == TP_OK);
    }
    CHECK(g_result.queuedCount == 0U && g_result.diagnostics.offered == 8U);
    CHECK(g_result.diagnostics.admitted == 5U && g_result.diagnostics.dropped == 3U);
    CHECK(g_result.diagnostics.departed == 5U && g_dma.diagnostics.copiedItems == 8U);
    CHECK(g_dma.diagnostics.completed == 2U && g_dma.diagnostics.released == 2U);
    CHECK(dma_recover(&g_dma, &report) == DMA_OK && report.run == 2U);
    return 0;
}

/** @brief Check independent held lease and component commit rejection cases.
 * @param[in] None. @param[out] None. @return Zero or failing line. */
static int check_failures(void)
{
    DmaReport report;
    DmaToken tokenA;
    DmaToken tokenB;
    DmaToken lease;
    DmaToken zero = {0U, 0U, 0U};
    uint16_t sample = 777U;
    size_t index;
    UartState uart;
    UartIngress ingress;
    UartReport uartReport = {0};
    UartCommand command = {UART_SET_PERIOD, 555U};
    TimeState time;
    TimeReport timeReport;
    ThroughputInput invalid = {1U, 0U, 0U, 0U, 0U};
    uint32_t tick = g_queue.tick;
    /** Diagnostic fixture intentionally withholds ordinary copying of A. **/
    CHECK(dma_init(&g_late, DMA_FIXTURE_NORMAL, true) == DMA_OK);
    CHECK(dma_start(&g_late, &report) == DMA_OK);
    tokenA = report.descriptors[0].token;
    for (index = 0U; index < 4U; index++) {
        CHECK(dma_push(&g_late, 10U + (uint32_t)index, &report) == DMA_OK);
    }
    CHECK(dma_complete(&g_late, &tokenA, &report) == DMA_OK);
    CHECK(dma_claim(&g_late, &lease) == DMA_OK);
    CHECK(dma_begin_next(&g_late, &report) == DMA_OK);
    tokenB = report.descriptors[1].token;
    for (index = 0U; index < 4U; index++) {
        CHECK(dma_push(&g_late, 20U + (uint32_t)index, &report) == DMA_OK);
    }
    CHECK(dma_complete(&g_late, &tokenB, &report) == DMA_OK);
    CHECK(dma_begin_next(&g_late, &report) == DMA_LATE_REUSE);
    CHECK(dma_push(&g_late, 30U, &report) == DMA_NOT_RUNNING && g_late.blocks[0].items[0] == 10U);
    CHECK(dma_recover(&g_late, &report) == DMA_BUSY);
    CHECK(dma_confirm_stop(&g_late, &report) == DMA_OK && g_late.leasePresent);
    CHECK(dma_recover(&g_late, &report) == DMA_BUSY);
    CHECK(dma_read(&g_late, &zero, 0U, &sample) == DMA_INVALID_TOKEN && sample == 777U);
    CHECK(dma_read(&g_late, &lease, 1U, &sample) == DMA_OK && sample == 11U);
    CHECK(dma_release(&g_late, &lease) == DMA_OK);
    CHECK(dma_recover(&g_late, &report) == DMA_OK && report.run == 2U);
    CHECK(report.diagnostics.discardedReady == 1U && report.ndtr == 4U);
    CHECK(dma_complete(&g_late, &tokenB, &report) == DMA_STALE_TOKEN);
    CHECK(dma_release(&g_late, &lease) == DMA_STALE_TOKEN && g_late.run == 2U);
    CHECK(throughput_step(&g_queue, &invalid, 1U, 0U, &g_result) == TP_INVALID_ARGUMENT);
    CHECK(g_queue.tick == tick && g_queue.count == 0U && g_result.diagnostics.offered == 8U);
    /** A later UART time rejection does not undo an accepted acquisition or ingress. **/
    CHECK(dma_init(&g_nonatomic, DMA_FIXTURE_NORMAL, false) == DMA_OK);
    CHECK(dma_start(&g_nonatomic, &report) == DMA_OK);
    CHECK(uart_init(&uart, 100U, 0U) == UART_OK);
    CHECK(dma_push(&g_nonatomic, 99U, &report) == DMA_OK);
    CHECK(uart_receive(&uart, 0xA5U, &ingress) == UART_OK);
    CHECK(uart_poll(&uart, UINT32_C(2147483648), &uartReport, &command) == UART_TIME_REJECTED);
    CHECK(g_nonatomic.blocks[0].descriptor.valid == 1U && uart.queue.count == 1U);
    CHECK(command.kind == UART_SET_PERIOD && command.periodMs == 555U && uart.lastObserved == 0U);
    CHECK(dma_push(&g_nonatomic, 65536U, &report) == DMA_INVALID_ARGUMENT);
    CHECK(g_nonatomic.blocks[0].descriptor.valid == 1U && report.ndtr == 3U);
    CHECK(dma_request_stop(&g_nonatomic, DMA_CAUSE_USER, &report) == DMA_OK);
    CHECK(dma_confirm_stop(&g_nonatomic, &report) == DMA_OK);
    CHECK(time_init(&time, 10U, 100U) == TIME_OK);
    CHECK(time_service(&time, 110U, &timeReport) == TIME_OK && timeReport.releases == 1U);
    CHECK(time_service(&time, 145U, &timeReport) == TIME_OK);
    CHECK(timeReport.work && timeReport.releases == 3U && timeReport.missed == 2U && timeReport.remainder == 5U);
    return 0;
}

/** @brief Retain live checks under NDEBUG; report failures through process status.
 * @param[in] None. @param[out] stdout/stderr. @return Zero only on all fixtures. */
int main(void)
{
    int failure = check_irq();
    /** Every independently expected fixture is executed, with finite failure propagation. **/
    if (failure == 0) {
        failure = check_composition();
    }
    if (failure == 0) {
        failure = check_failures();
    }
    if (failure != 0) {
        if (fprintf(stderr, "FAIL unified fixture line %d\n", failure) < 0) {
            return 2;
        }
        return 1;
    }
    if (printf("PASS unified: six modules; IRQ9/0x90/RMW1/2; actual8DMAreads/2leases/16B; queue8/5/3/5; UART/time/late/stale/non-atomic\n") < 0 || fflush(stdout) != 0) {
        return 2;
    }
    return 0;
}
`

function compile(variant, name, source, defines = []) {
  const object = join(output, variant + '-' + name + '.o')
  const usageFile = object.slice(0, -2) + '.su'
  route(variant + '-' + name, [compiler, '-std=c11', '-Wall', '-Wextra', '-Werror',
    '-pedantic', '-O0', '-fstack-usage', '-I', examples, ...defines, '-c', source, '-o', object], [object, usageFile])
  for (const line of readFileSync(usageFile, 'utf8').trim().split(/\r?\n/)) {
    const fields = line.split('\t')
    report.stackUsage.push({ variant, name, declaration: fields[0], bytes: Number(fields[1]), qualifier: fields[2], file: meta(usageFile) })
  }
  return object
}
function execute(variant, name, objects, expected) {
  const binary = join(output, variant + '-' + name + (process.platform === 'win32' ? '.exe' : ''))
  route(variant + '-' + name + '-link', [compiler, ...objects, '-o', binary], [binary])
  const actual = route(variant + '-' + name + '-execute', [binary])
  assert.match(actual.diagnostics, expected, name + ' actual stdout')
  report.executions.push({ variant, name, binary: meta(binary), rawReturnCode: actual.rawReturnCode, log: actual.log })
}
try {
  for (const file of [...sourceFiles, compiler, python, router]) assert.ok(meta(file), 'Existing input required: ' + file)
  report.sources = sourceFiles.map(meta)
  const consumer = join(output, 'consumer.c')
  writeFileSync(consumer, consumerSource)
  report.consumer = meta(consumer)
  report.tools = { compiler: meta(compiler), python: meta(python), router: meta(router), node: meta(process.execPath) }
  const identity = route('compiler-version', [compiler, '--version'])
  report.tools.compilerVersion = identity.diagnostics
  successful(run(python, ['--version']))
  const readme = join(examples, 'throughput-overload/README.txt')
  const match = readFileSync(readme, 'utf8').match(/^BEGIN_CONSUMER_C\r?\n([\s\S]*?)^END_CONSUMER_C\r?$/m)
  assert.ok(match, 'Exact documented independent consumer delimiters')
  const documented = join(output, 'readme-consumer.c')
  writeFileSync(documented, match[1])
  report.documentedConsumer = { ...meta(documented), readme: meta(readme), extraction: 'Literal bytes between BEGIN_CONSUMER_C and END_CONSUMER_C' }
  for (const variant of ['normal', 'ndebug']) {
    const defines = variant === 'ndebug' ? ['-DNDEBUG'] : []
    const objects = modules.map(([name, file]) => compile(variant, name, join(examples, file + '.c'), defines))
    const caller = compile(variant, 'consumer', consumer, defines)
    execute(variant, 'unified', [...objects, caller], /PASS unified:/)
    const readmeCaller = compile(variant, 'readme-consumer', documented, defines)
    execute(variant, 'readme', [...objects, readmeCaller], /PASS|passed|consumer: OK|consumer OK/)
    const button = compile(variant, 'button', join(examples, 'gpio-button/button.c'), [...defines, '-DBUTTON_TEST'])
    execute(variant, 'button', [button], /PASS|passed|tests? OK|tests? passed/)
  }
  const legacy = [
    ['foundations', 'test-c-foundations-c.mjs', []],
    ['startup', 'test-build-startup-c.mjs', []],
    ['time-serial', 'test-time-serial-c.mjs', []],
    ['protocol-acquisition', 'test-protocol-acquisition-c.mjs', []],
    ['bus', 'test-bus-transactions.mjs', ['--c']],
    ['adc', 'test-adc-sampling.mjs', ['--native']],
    ['recovery', 'test-driver-recovery.mjs', ['--native']]
  ]
  report.legacyRunners = []
  for (const [name, script, flags] of legacy) {
    const file = join(root, 'scripts', script)
    const before = meta(file)
    const actual = route('legacy-' + name, [process.execPath, file, ...flags, '--compiler', compiler,
      '--python', python, '--router', router, '--output', join(output, 'legacy-' + name)])
    assert.equal(hash(file), before.sha256)
    report.legacyRunners.push({ name, runner: before, rawReturnCode: actual.rawReturnCode, log: actual.log })
  }
  report.sourcesAfter = sourceFiles.map(meta)
  assert.deepEqual(report.sourcesAfter, report.sources, 'Production/download source bytes remain immutable')
  report.runnerAfter = meta(fileURLToPath(import.meta.url))
  assert.equal(report.runnerAfter.sha256, report.runner.sha256, 'Running runner identity remains current')
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  report.failure = error.stack || String(error)
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  writeFileSync(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ status: report.status, output, commands: report.commands.length,
    builds: report.builds.length, executions: report.executions.length, failure: report.failure || null }, null, 2))
}
