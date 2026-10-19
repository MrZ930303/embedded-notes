Unit17 original host teaching module and complete independent native caller

Scope: single-context exclusive non-reentrant host C11, not MMIO/ISR/DMA/UART hardware.
All objects and outputs are real live sufficiently sized and disjoint. Never edit module metadata.
Fresh initialization requires no old owner, lease or events; do not reinitialize a live lifetime domain.
Every fixture below owns separate storage. Queue reset discards copied queue state only.
Normal copying is available in any valid producer phase, including stopped READY.
The held-A fixture deliberately withholds this normal consumer policy; it is diagnostic.
Fake source labels commit only after successful dma_push, keyed by actual run/block/slot/index.
Actual dma_read values populate copied records; release precedes queue offer; no lease/pointer is retained.
Each component commits independently: later rejecting UART/time does not rewind successful producer/ingress.
No wire sampling protocol is added. The 11B/110bit record is accounting only, not sizeof or parser grammar.

Layout to preserve (every C/H is downloadable beside the chapter):
examples/
  throughput-overload/throughput.c throughput.h README.txt
  dma-ownership/dma.c dma.h
  bounded-fifo/fifo.c fifo.h
  uart-framing/uart.c uart.h
  timer-pwm/time.c time.h

The complete caller starts at BEGIN_CONSUMER_C and ends before END_CONSUMER_C below.
Save that exact text as consumer.c next to examples/. No omitted helper or terminal module is required.
For a generic local reproduction, use an existing C11 compiler; do not install tools for this example.
Compile each of throughput.c, dma.c, fifo.c, uart.c, time.c and consumer.c separately with:
  gcc -std=c11 -Wall -Wextra -Werror -pedantic -fstack-usage -I examples -c <source> -o <unique-object>
Link those six objects, then execute the resulting host program. Repeat every compile with -DNDEBUG.
All acceptance checks use ordinary nonzero failure propagation; no assert depends on debug mode.
This project routes every compiler/link/run command through its existing mcu-build custom profiles:
  python <mcu-build>/scripts/build_router.py validate --config <profile.toml>
  python <mcu-build>/scripts/build_router.py build --config <profile.toml> --profile <name> --dry-run
  python <mcu-build>/scripts/build_router.py build --config <profile.toml> --profile <name>
Profile command is a structured argv array; artifacts are workspace-relative paths. Keep raw returns/logs,
input/profile/tool hashes, before/after and fresh artifact size/SHA. Use a process-local compiler PATH only.
The repository runner supports --native with --gcc --python --router --out (existing tools only).
It extracts this exact complete caller and separately builds actual production modules in normal/NDEBUG.

Expected finite evidence: N1 2 blocks/8 copied samples/16B sample payload; queue8/5/3/5/q0.
N2 late/no30write, unconfirmed BUSY, confirmed-held BUSY, matching release/recoverrun2, stale old tokens.
N3 stopped READY copying and actual status; N4 FULL4+failed5th/timeout5events/time110/145/non-atomic commits.
N5 all A8/B9/C8 literal rows (IDs start0), terminal/reset, wide rejection, sequence65534/epoch/half,
counter saturation MAX-1 -> MAX/false -> next attempt MAX/true and history row33 drop/progress.
Per turn <=1 producer phase, <=1 claim, <=4 actual reads, <=1 release, <=1 observe, <=2 status,
<=1 queue step/4 offers/4 service, <=4 sequence observations, <=5 receive, <=1 poll/4byte/5event/1command,
<=1 time_service/work1. Setup and independent single-module capability fixtures are explicitly separate.
Host stack scan/.su and fixed loops do not prove target ABI, call-chain stack, WCET or hardware timing.
Original RM/current-source/errata/electrical/concurrency/physical-paper limitations remain in the chapter.

BEGIN_CONSUMER_C
/******************************************************************************
 * Original embedded-notes teaching caller, 2026; no third-party ownership claim.
 * @file consumer.c
 * @author embedded-notes contributors
 * @brief Independent finite composition, not a hardware terminal driver.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#include "throughput-overload/throughput.h"
#include "throughput-overload/throughput.h"
#include "dma-ownership/dma.h"
#include "dma-ownership/dma.h"
#include "uart-framing/uart.h"
#include "uart-framing/uart.h"
#include "bounded-fifo/fifo.h"
#include "bounded-fifo/fifo.h"
#include "timer-pwm/time.h"
#include "timer-pwm/time.h"
#include <stdio.h>
#include <string.h>

static unsigned int g_failures;

/** @brief Keep every acceptance check active with NDEBUG.
 * @param[in] condition Required observable behavior.
 * @param[in] line Caller's source line, for diagnosis.
 * @return None. */
static void check(bool condition, int line)
{
    /**
    * Output errors also make the executable fail.
    **/
    if (!condition) {
        g_failures += 1U;
        if (fprintf(stderr, "FAIL consumer line %d\n", line) < 0) {
            g_failures += 1U;
        }
    }
}
#define CHECK(condition) check((condition), __LINE__)

/** @brief Compare complete copied acquisition records, ignoring padding.
 * @param[in] a First initialized record.
 * @param[in] b Second initialized record.
 * @return Whether every named member agrees. */
static bool same_record(ThroughputRecord a, ThroughputRecord b)
{
    /**
    * Wire arithmetic is independent of native object padding.
    **/
    return a.value == b.value && a.sourceId == b.sourceId && a.sequence == b.sequence &&
        a.sourceTime == b.sourceTime && a.epoch == b.epoch;
}

/** @brief Compare queue diagnostics including the sticky boundary indicator.
 * @param[in] a First initialized diagnostics.
 * @param[in] b Second initialized diagnostics.
 * @return Named-member equality. */
static bool same_diagnostics(ThroughputDiagnostics a, ThroughputDiagnostics b)
{
    /**
    * Counters that have saturated cannot be used for exact rates.
    **/
    return a.offered == b.offered && a.admitted == b.admitted && a.dropped == b.dropped &&
        a.departed == b.departed && a.historyDropped == b.historyDropped && a.saturated == b.saturated;
}

/** @brief Compare every named initialized queue member, including unused rows.
 * @param[in] a Live snapshot.
 * @param[in] b Live snapshot.
 * @return Named-member equality without padding access. */
static bool same_queue(const ThroughputState *a, const ThroughputState *b)
{
    size_t index;
    size_t item;
    /**
    * Preservation includes initialized stale slots and unused history fields.
    **/
    if (a->head != b->head || a->count != b->count || a->tick != b->tick || a->limit != b->limit ||
        a->historyEnabled != b->historyEnabled || a->historyCount != b->historyCount ||
        !same_diagnostics(a->diagnostics, b->diagnostics)) {
        return false;
    }
    for (index = 0U; index < TP_CAPACITY; index++) {
        if (!same_record(a->slots[index], b->slots[index])) {
            return false;
        }
    }
    for (index = 0U; index < TP_HISTORY_ROWS; index++) {
        const ThroughputHistoryRow *x = &a->history[index];
        const ThroughputHistoryRow *y = &b->history[index];
        if (x->tick != y->tick || x->offered != y->offered || x->dropped != y->dropped ||
            x->departed != y->departed || x->queuedCount != y->queuedCount) {
            return false;
        }
        for (item = 0U; item < TP_CAPACITY; item++) {
            if (x->queuedIds[item] != y->queuedIds[item]) {
                return false;
            }
        }
    }
    return true;
}

/** @brief Compare all report fields and all five fixed record lists.
 * @param[in] a Initialized result.
 * @param[in] b Initialized result.
 * @return Named-member equality. */
static bool same_report(const ThroughputReport *a, const ThroughputReport *b)
{
    size_t index;
    /**
    * All unused slots are part of the deterministic report contract.
    **/
    if (a->tick != b->tick || a->terminal != b->terminal || a->offeredCount != b->offeredCount ||
        a->admittedCount != b->admittedCount || a->droppedCount != b->droppedCount ||
        a->departedCount != b->departedCount || a->queuedCount != b->queuedCount ||
        !same_diagnostics(a->diagnostics, b->diagnostics)) {
        return false;
    }
    for (index = 0U; index < TP_CAPACITY; index++) {
        if (!same_record(a->offered[index], b->offered[index]) ||
            !same_record(a->admitted[index], b->admitted[index]) ||
            !same_record(a->dropped[index], b->dropped[index]) ||
            !same_record(a->departed[index], b->departed[index]) ||
            !same_record(a->queued[index], b->queued[index])) {
            return false;
        }
    }
    return true;
}

/** @brief Compare sequence diagnostics without comparing structure padding.
 * @param[in] a Initialized diagnostics.
 * @param[in] b Initialized diagnostics.
 * @return Named-member equality. */
static bool same_sequence_diagnostics(ThroughputSequenceDiagnostics a, ThroughputSequenceDiagnostics b)
{
    /**
    * Observed gaps and permanent loss have different meanings.
    **/
    return a.observations == b.observations && a.forward == b.forward && a.gaps == b.gaps &&
        a.duplicates == b.duplicates && a.older == b.older && a.ambiguous == b.ambiguous &&
        a.saturated == b.saturated;
}

/** @brief Compare a complete last-only observer snapshot.
 * @param[in] a Initialized observer.
 * @param[in] b Initialized observer.
 * @return Named-member equality. */
static bool same_sequence(ThroughputSequence a, ThroughputSequence b)
{
    /**
    * Last and epoch remain unchanged on a rejected observation.
    **/
    return a.epoch == b.epoch && a.last == b.last && a.seeded == b.seeded &&
        same_sequence_diagnostics(a.diagnostics, b.diagnostics);
}

/** @brief Compare the complete sequence output sentinel.
 * @param[in] a Initialized report.
 * @param[in] b Initialized report.
 * @return Named-member equality. */
static bool same_sequence_report(ThroughputSequenceReport a, ThroughputSequenceReport b)
{
    /**
    * Output freshness follows TP_OK, never a retained classification.
    **/
    return a.order == b.order && a.delta == b.delta && a.gap == b.gap && a.last == b.last &&
        same_sequence_diagnostics(a.diagnostics, b.diagnostics);
}

/** @brief Compare producer identities as three named scalar fields.
 * @param[in] a Initialized token.
 * @param[in] b Initialized token.
 * @return Exact identity equality. */
static bool same_token(DmaToken a, DmaToken b)
{
    /**
    * A slot alone cannot identify an instance.
    **/
    return a.run == b.run && a.block == b.block && a.slot == b.slot;
}

/** @brief Compare complete producer diagnostic snapshots.
 * @param[in] a Initialized diagnostics.
 * @param[in] b Initialized diagnostics.
 * @return Named-member equality. */
static bool same_dma_diagnostics(DmaDiagnostics a, DmaDiagnostics b)
{
    /**
    * Observed latches, copied items and releases stay distinct.
    **/
    return a.completed == b.completed && a.observedTc == b.observedTc && a.copiedItems == b.copiedItems &&
        a.released == b.released && a.lateReuse == b.lateReuse && a.transferErrors == b.transferErrors &&
        a.discardedReady == b.discardedReady && a.historyDropped == b.historyDropped && a.saturated == b.saturated;
}

/** @brief Compare every named producer report member.
 * @param[in] a Initialized report.
 * @param[in] b Initialized report.
 * @return Named-member equality. */
static bool same_dma_report(const DmaReport *a, const DmaReport *b)
{
    size_t index;
    /**
    * Reports carry no payload pointers or sample arrays.
    **/
    if (a->phase != b->phase || a->cause != b->cause || a->run != b->run || a->current != b->current ||
        a->ndtr != b->ndtr || a->stopValid != b->stopValid || a->stopConfirmed != b->stopConfirmed ||
        a->ht != b->ht || a->tc != b->tc || a->leasePresent != b->leasePresent ||
        !same_token(a->lease, b->lease) || !same_dma_diagnostics(a->diagnostics, b->diagnostics)) {
        return false;
    }
    for (index = 0U; index < DMA_BLOCKS; index++) {
        if (a->descriptors[index].owner != b->descriptors[index].owner ||
            a->descriptors[index].valid != b->descriptors[index].valid ||
            !same_token(a->descriptors[index].token, b->descriptors[index].token)) {
            return false;
        }
    }
    return true;
}

/** @brief Compare all initialized producer state members after rejection.
 * @param[in] a Initialized state.
 * @param[in] b Saved state.
 * @return Named-member equality, no padding comparison. */
static bool same_dma(const DmaState *a, const DmaState *b)
{
    size_t index;
    size_t item;
    /**
    * State copies are diagnostic snapshots; they are never reinitialized or run.
    **/
    if (a->phase != b->phase || a->cause != b->cause || a->run != b->run || a->nextRun != b->nextRun ||
        a->nextBlock != b->nextBlock || a->current != b->current || a->ndtr != b->ndtr ||
        a->stopValid != b->stopValid || a->runExhausted != b->runExhausted ||
        a->blockExhausted != b->blockExhausted || a->ht != b->ht || a->tc != b->tc ||
        a->leasePresent != b->leasePresent || a->historyEnabled != b->historyEnabled ||
        !same_token(a->lease, b->lease) || !same_dma_diagnostics(a->diagnostics, b->diagnostics) ||
        a->historyCount != b->historyCount) {
        return false;
    }
    for (index = 0U; index < DMA_BLOCKS; index++) {
        const DmaDescriptor *x = &a->blocks[index].descriptor;
        const DmaDescriptor *y = &b->blocks[index].descriptor;
        if (x->owner != y->owner || x->valid != y->valid || !same_token(x->token, y->token)) {
            return false;
        }
        for (item = 0U; item < DMA_ITEMS; item++) {
            if (a->blocks[index].items[item] != b->blocks[index].items[item]) {
                return false;
            }
        }
    }
    for (index = 0U; index < DMA_HISTORY_ROWS; index++) {
        const DmaHistoryRow *x = &a->history[index];
        const DmaHistoryRow *y = &b->history[index];
        if (x->status != y->status || x->phase != y->phase || x->run != y->run ||
            x->slot != y->slot || x->valid != y->valid) {
            return false;
        }
    }
    return true;
}

typedef struct {
    bool reserved;
    DmaToken token;
    bool present[DMA_ITEMS];
    ThroughputInput labels[DMA_ITEMS];
} LabelBank;
typedef struct {
    DmaState dma;
    ThroughputState queue;
    ThroughputSequence sequence;
    UartState uart;
    TimeState time;
    LabelBank banks[DMA_BLOCKS];
    DmaReport snapshot;
    ThroughputReport queueReport;
    DmaToken held;
    bool hasHeld;
    uint64_t nextSource;
    uint32_t acquired;
    uint32_t copied;
    uint32_t releases;
} Application;
typedef enum {
    PH_NONE = 0, PH_START, PH_PUSH, PH_COMPLETE, PH_BEGIN, PH_STOP, PH_CONFIRM, PH_RECOVER
} ProducerPhase;
typedef enum {
    COPY_NORMAL = 0, COPY_DEFER, COPY_HOLD, COPY_INSPECT_RELEASE
} CopyPolicy;
typedef struct {
    ProducerPhase phase;
    uint32_t sample;
    uint32_t sourceTime;
    uint32_t now;
    uint32_t service;
    CopyPolicy copy;
    DmaStatus expected;
    bool statusCommand;
    bool observe;
} Turn;
typedef struct {
    uint32_t producer;
    uint32_t claim;
    uint32_t reads;
    uint32_t release;
    uint32_t observe;
    uint32_t snapshots;
    uint32_t offers;
    uint32_t departed;
    uint32_t sequence;
    uint32_t receives;
    uint32_t polls;
    uint32_t timeCalls;
} Work;

/** @brief Initialize one fresh separate application lifetime domain exactly once.
 * @param[out] app Fresh static object, not an old fixture reused as reset.
 * @return Whether every real module accepted initialization. */
static bool app_init(Application *app)
{
    /**
    * Banks contain only copied fake acquisition labels, never producer storage.
    **/
    memset(app, 0, sizeof(*app));
    app->nextSource = 1U;
    return dma_init(&app->dma, DMA_FIXTURE_NORMAL, true) == DMA_OK &&
        throughput_init(&app->queue, 128U, TP_FIXTURE_NORMAL, true) == TP_OK &&
        throughput_sequence_init(&app->sequence, 1U, TP_FIXTURE_NORMAL) == TP_OK &&
        uart_init(&app->uart, 100U, 0U) == UART_OK && time_init(&app->time, 10U, 0U) == TIME_OK &&
        dma_status(&app->dma, &app->snapshot) == DMA_OK;
}

/** @brief Reserve a physical bank only after successful start/begin allocation.
 * @param[in,out] app Initialized application.
 * @return Whether the returned actual writer token can own its empty bank. */
static bool reserve_bank(Application *app)
{
    uint32_t slot = app->snapshot.current;
    LabelBank *bank = &app->banks[slot];
    const DmaDescriptor *descriptor = &app->snapshot.descriptors[slot];
    /**
    * A live READY/CONSUMER bank can never be replaced to hide a mismatch.
    **/
    if (bank->reserved || descriptor->owner != DMA_WRITER || descriptor->valid != 0U) {
        return false;
    }
    *bank = (LabelBank){0};
    bank->reserved = true;
    bank->token = descriptor->token;
    return true;
}

/** @brief Supply at most one explicit actual producer phase this turn.
 * @param[in,out] app Initialized application and previous real snapshot.
 * @param[in] turn One fixed scripted event.
 * @param[in,out] work Per-turn logical-call accounting.
 * @return Whether actual status, metadata capture and allocation match the script. */
static bool producer_phase(Application *app, const Turn *turn, Work *work)
{
    DmaStatus status = DMA_OK;
    DmaReport report = app->snapshot;
    DmaToken token = app->snapshot.descriptors[app->snapshot.current].token;
    uint32_t slot = app->snapshot.current;
    uint32_t index = app->snapshot.descriptors[slot].valid;
    ThroughputInput staged = {turn->sample, app->nextSource,
        (app->nextSource - 1U) % UINT64_C(65536), turn->sourceTime, 1U};
    bool stagePresent = false;
    /**
    * Labels are staged before push; only OK commits exactly one acquisition.
    **/
    if (turn->phase == PH_NONE) {
        return true;
    }
    work->producer += 1U;
    if (turn->phase == PH_PUSH && turn->sample <= UINT16_MAX &&
        app->snapshot.phase == DMA_RUNNING && index < DMA_ITEMS) {
        LabelBank *bank = &app->banks[slot];
        if (!bank->reserved || !same_token(bank->token, token) || bank->present[index] ||
            app->nextSource > UINT32_MAX) {
            return false;
        }
        stagePresent = true;
    }
    switch (turn->phase) {
        case PH_START:
            status = dma_start(&app->dma, &report);
            break;
        case PH_PUSH:
            status = dma_push(&app->dma, turn->sample, &report);
            break;
        case PH_COMPLETE:
            status = dma_complete(&app->dma, &token, &report);
            break;
        case PH_BEGIN:
            status = dma_begin_next(&app->dma, &report);
            break;
        case PH_STOP:
            status = dma_request_stop(&app->dma, DMA_CAUSE_USER, &report);
            break;
        case PH_CONFIRM:
            status = dma_confirm_stop(&app->dma, &report);
            break;
        case PH_RECOVER:
            status = dma_recover(&app->dma, &report);
            break;
        default:
            return false;
    }
    if (status != turn->expected) {
        return false;
    }
    if (status == DMA_OK || status == DMA_LATE_REUSE || status == DMA_TRANSFER_ERROR) {
        app->snapshot = report;
    }
    if (turn->phase == PH_PUSH && status == DMA_OK) {
        if (!stagePresent) {
            return false;
        }
        app->banks[slot].labels[index] = staged;
        app->banks[slot].present[index] = true;
        app->nextSource += 1U;
        app->acquired += 1U;
    }
    if ((turn->phase == PH_START || turn->phase == PH_BEGIN) && status == DMA_OK) {
        return reserve_bank(app);
    }
    if (turn->phase == PH_RECOVER && status == DMA_OK) {
        memset(app->banks, 0, sizeof(app->banks));
    }
    return true;
}

/** @brief Copy actual read values with matching acquisition-event labels.
 * @param[in,out] app Initialized application.
 * @param[in] token Matching newly claimed full block.
 * @param[out] offered Four disjoint staged records owned by this turn.
 * @param[in,out] work Current turn budgets.
 * @return Whether all actual reads and the matching release succeeded. */
static bool copy_block(Application *app, const DmaToken *token, ThroughputInput offered[TP_CAPACITY], Work *work)
{
    size_t index;
    LabelBank *bank = &app->banks[token->slot];
    /**
    * No sample comes from state.items or a canned block; release follows four reads.
    **/
    if (!bank->reserved || !same_token(bank->token, *token)) {
        return false;
    }
    for (index = 0U; index < DMA_ITEMS; index++) {
        uint16_t value = 0U;
        if (!bank->present[index]) {
            return false;
        }
        work->reads += 1U;
        if (dma_read(&app->dma, token, (uint32_t)index, &value) != DMA_OK) {
            return false;
        }
        offered[index] = bank->labels[index];
        offered[index].value = value;
        app->copied += 1U;
    }
    work->release += 1U;
    if (dma_release(&app->dma, token) != DMA_OK) {
        return false;
    }
    app->releases += 1U;
    *bank = (LabelBank){0};
    work->offers = DMA_ITEMS;
    return true;
}

/** @brief Apply normal READY copying or the explicitly named held-A diagnostic.
 * @param[in,out] app Initialized application.
 * @param[in] policy Fixed normal/defer/hold/inspect choice.
 * @param[out] offered Turn-owned copied list.
 * @param[in,out] work Current turn budgets.
 * @return Whether every attempted actual consumer operation succeeded. */
static bool consume(Application *app, CopyPolicy policy, ThroughputInput offered[TP_CAPACITY], Work *work)
{
    DmaToken token = {0};
    bool ready = false;
    size_t slot;
    /**
    * Ordinary READY eligibility does not depend on RUNNING versus stopped phase.
    **/
    if (policy == COPY_INSPECT_RELEASE) {
        uint16_t value = 0U;
        work->reads += 1U;
        if (!app->hasHeld || dma_read(&app->dma, &app->held, 1U, &value) != DMA_OK || value != 11U) {
            return false;
        }
        work->release += 1U;
        if (dma_release(&app->dma, &app->held) != DMA_OK) {
            return false;
        }
        app->banks[app->held.slot] = (LabelBank){0};
        app->hasHeld = false;
        app->releases += 1U;
        return true;
    }
    if (policy == COPY_DEFER || app->hasHeld) {
        return true;
    }
    for (slot = 0U; slot < DMA_BLOCKS; slot++) {
        ready = ready || app->snapshot.descriptors[slot].owner == DMA_READY;
    }
    if (!ready || app->snapshot.leasePresent) {
        return true;
    }
    work->claim += 1U;
    if (dma_claim(&app->dma, &token) != DMA_OK) {
        return false;
    }
    if (policy == COPY_HOLD) {
        app->held = token;
        app->hasHeld = true;
        return true;
    }
    return copy_block(app, &token, offered, work);
}

/** @brief Parse a real bounded status command and service real periodic time.
 * @param[in,out] app Initialized modules.
 * @param[in] turn Current monotonic service label and optional status bytes.
 * @param[in,out] work Current turn budgets.
 * @return Whether actual parsed command/work limits match expectations. */
static bool service_terminal(Application *app, const Turn *turn, Work *work)
{
    static const uint16_t bytes[4] = {0xA5U, 1U, 2U, 3U};
    UartReport report;
    UartCommand command = {UART_SET_PERIOD, 555U};
    TimeReport timeReport;
    size_t index;
    /**
    * The existing parser accepts these bytes; no command is preaccepted by the caller.
    **/
    if (turn->statusCommand) {
        for (index = 0U; index < 4U; index++) {
            UartIngress ingress;
            work->receives += 1U;
            if (uart_receive(&app->uart, bytes[index], &ingress) != UART_OK) {
                return false;
            }
        }
    }
    work->polls += 1U;
    if (uart_poll(&app->uart, turn->now, &report, &command) != UART_OK ||
        report.consumed > 4U || report.eventCount > 5U || report.commandPresent != turn->statusCommand) {
        return false;
    }
    if (report.commandPresent && (command.kind != UART_GET_STATUS || command.periodMs != 100U)) {
        return false;
    }
    work->timeCalls += 1U;
    if (time_service(&app->time, turn->now, &timeReport) != TIME_OK ||
        (timeReport.work && timeReport.releases == 0U)) {
        return false;
    }
    return true;
}

/** @brief Execute one bounded non-atomic caller turn using real module calls.
 * @param[in,out] app Initialized exclusive application.
 * @param[in] turn Fixed scripted event/service choice.
 * @return Whether all module outcomes and budgets hold. */
static bool app_turn(Application *app, Turn turn)
{
    Work work = {0};
    ThroughputInput offered[TP_CAPACITY] = {{0}};
    size_t index;
    /**
    * Each component commits independently; failure here never invents rollback.
    **/
    if (!producer_phase(app, &turn, &work)) {
        return false;
    }
    if (turn.observe) {
        work.observe += 1U;
        if (dma_observe(&app->dma, true, &app->snapshot) != DMA_OK) {
            return false;
        }
    }
    work.snapshots += 1U;
    if (dma_status(&app->dma, &app->snapshot) != DMA_OK || !consume(app, turn.copy, offered, &work)) {
        return false;
    }
    if (throughput_step(&app->queue, offered, work.offers, turn.service, &app->queueReport) != TP_OK) {
        return false;
    }
    work.departed = app->queueReport.departedCount;
    for (index = 0U; index < work.departed; index++) {
        ThroughputSequenceReport observed;
        const ThroughputRecord *record = &app->queueReport.departed[index];
        work.sequence += 1U;
        if (throughput_sequence_observe(&app->sequence, record->epoch, record->sequence, &observed) != TP_OK) {
            return false;
        }
    }
    if (!service_terminal(app, &turn, &work)) {
        return false;
    }
    work.snapshots += 1U;
    if (dma_status(&app->dma, &app->snapshot) != DMA_OK) {
        return false;
    }
    return work.producer <= 1U && work.observe <= 1U && work.snapshots <= 2U && work.claim <= 1U &&
        work.reads <= 4U && work.release <= 1U && work.offers <= 4U && turn.service <= 4U &&
        work.departed <= 4U && work.sequence <= 4U && work.receives <= 5U &&
        work.polls <= 1U && work.timeCalls <= 1U;
}

/** @brief Run actual two-block handoff, queue backlog/drop and status while active/stopped.
 * @return None. */
static void normal_composition(void)
{
    static Application app;
    static const Turn turns[] = {
        {PH_START,0U,0U,0U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_PUSH,10U,0U,0U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_PUSH,11U,10U,10U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_PUSH,12U,20U,20U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_PUSH,13U,30U,30U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_COMPLETE,0U,0U,31U,1U,COPY_NORMAL,DMA_OK,false,true},
        {PH_BEGIN,0U,0U,32U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_PUSH,20U,40U,40U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_PUSH,21U,50U,50U,0U,COPY_NORMAL,DMA_OK,true,false},
        {PH_PUSH,22U,60U,60U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_PUSH,23U,70U,70U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_COMPLETE,0U,0U,71U,1U,COPY_NORMAL,DMA_OK,true,false},
        {PH_STOP,0U,0U,72U,1U,COPY_NORMAL,DMA_OK,true,false},
        {PH_CONFIRM,0U,0U,73U,1U,COPY_NORMAL,DMA_OK,true,false},
        {PH_NONE,0U,0U,74U,1U,COPY_NORMAL,DMA_OK,true,false}
    };
    size_t index;
    /**
    * Every source time is supplied at push, independent of later claim/service.
    **/
    CHECK(app_init(&app));
    for (index = 0U; index < sizeof turns / sizeof turns[0]; index++) {
        CHECK(app_turn(&app, turns[index]));
        if (index == 4U) {
            CHECK(app.snapshot.ndtr == 0U && app.snapshot.descriptors[0].owner == DMA_WRITER &&
                app.snapshot.descriptors[0].valid == 4U && !app.snapshot.tc);
        }
        if (index == 5U) {
            CHECK(app.queueReport.departed[0].value == 10U && app.queueReport.queuedCount == 3U &&
                app.queueReport.queued[0].value == 11U && app.queueReport.queued[2].value == 13U &&
                app.snapshot.phase == DMA_BOUNDARY && app.snapshot.ndtr == 4U);
        }
        if (index == 8U) {
            CHECK(app.snapshot.phase == DMA_RUNNING && app.queueReport.queuedCount == 3U &&
                app.queueReport.queued[0].sourceTime == 10U);
        }
        if (index == 11U) {
            CHECK(app.snapshot.phase == DMA_BOUNDARY && app.queueReport.droppedCount == 3U &&
                app.queueReport.dropped[0].sourceId == 6U && app.queueReport.dropped[2].sourceId == 8U &&
                app.queueReport.dropped[0].value == 21U && app.queueReport.dropped[2].sourceTime == 70U &&
                app.queueReport.departed[0].value == 11U && app.queueReport.queued[2].value == 20U);
        }
    }
    CHECK(app.acquired == 8U && app.nextSource == 9U && app.copied == 8U && app.releases == 2U &&
        app.snapshot.diagnostics.completed == 2U && app.snapshot.diagnostics.copiedItems == 8U &&
        app.queueReport.diagnostics.offered == 8U && app.queueReport.diagnostics.admitted == 5U &&
        app.queueReport.diagnostics.dropped == 3U && app.queueReport.diagnostics.departed == 5U &&
        app.queueReport.queuedCount == 0U && app.snapshot.phase == DMA_STOP_CONFIRMED);
}

/** @brief Hold A deliberately, reject unsafe recovery, then release/recover/start.
 * @return None. */
static void late_composition(void)
{
    static Application app;
    static const Turn setup[] = {
        {PH_START,0U,0U,0U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,10U,0U,1U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,11U,10U,2U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,12U,20U,3U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,13U,30U,4U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_COMPLETE,0U,0U,5U,0U,COPY_HOLD,DMA_OK,true,false},
        {PH_BEGIN,0U,0U,6U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,20U,40U,7U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,21U,50U,8U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,22U,60U,9U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,23U,70U,10U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_COMPLETE,0U,0U,11U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_BEGIN,0U,0U,12U,0U,COPY_DEFER,DMA_LATE_REUSE,true,false}
    };
    DmaState before;
    DmaReport output;
    DmaReport saved;
    DmaToken oldA;
    DmaToken oldB;
    uint16_t sample = 555U;
    size_t index;
    /**
    * This diagnostic deliberately disables ordinary consumption for named turns.
    **/
    CHECK(app_init(&app));
    for (index = 0U; index < sizeof setup / sizeof setup[0]; index++) {
        CHECK(app_turn(&app, setup[index]));
    }
    oldA = app.held;
    oldB = app.snapshot.descriptors[1].token;
    CHECK(app.snapshot.phase == DMA_STOP_REQUESTED && app.snapshot.cause == DMA_CAUSE_LATE &&
        app.snapshot.stopValid == 0U && app.snapshot.diagnostics.lateReuse == 1U &&
        app.snapshot.diagnostics.transferErrors == 0U && app.snapshot.diagnostics.completed == 2U &&
        app.snapshot.descriptors[0].owner == DMA_CONSUMER && app.snapshot.descriptors[1].owner == DMA_READY &&
        app.snapshot.diagnostics.copiedItems == 0U && app.snapshot.diagnostics.released == 0U);
    before = app.dma;
    CHECK(app_turn(&app, (Turn){PH_PUSH,30U,80U,13U,0U,COPY_DEFER,DMA_NOT_RUNNING,true,false}));
    CHECK(same_dma(&app.dma, &before) && app.acquired == 8U && app.nextSource == 9U &&
        app.banks[0].labels[0].value == 10U && app.dma.blocks[0].items[0] == 10U);
    CHECK(app_turn(&app, (Turn){PH_RECOVER,0U,0U,14U,0U,COPY_DEFER,DMA_BUSY,true,false}));
    CHECK(same_dma(&app.dma, &before));
    CHECK(app_turn(&app, (Turn){PH_CONFIRM,0U,0U,15U,0U,COPY_DEFER,DMA_OK,true,false}));
    before = app.dma;
    CHECK(app_turn(&app, (Turn){PH_RECOVER,0U,0U,16U,0U,COPY_DEFER,DMA_BUSY,true,false}));
    CHECK(same_dma(&app.dma, &before));
    CHECK(app_turn(&app, (Turn){PH_NONE,0U,0U,17U,0U,COPY_INSPECT_RELEASE,DMA_OK,true,false}));
    CHECK(app.snapshot.phase == DMA_STOP_CONFIRMED && app.snapshot.descriptors[0].owner == DMA_FREE &&
        app.snapshot.descriptors[1].owner == DMA_READY && app.queueReport.diagnostics.offered == 0U);
    CHECK(app_turn(&app, (Turn){PH_RECOVER,0U,0U,18U,0U,COPY_DEFER,DMA_OK,true,false}));
    CHECK(app.snapshot.run == 2U && app.snapshot.phase == DMA_IDLE && app.snapshot.current == 0U &&
        app.snapshot.ndtr == 4U && !app.snapshot.ht && !app.snapshot.tc && app.snapshot.stopValid == 0U &&
        app.snapshot.diagnostics.discardedReady == 1U && app.dma.nextBlock == 3U &&
        !app.banks[0].reserved && !app.banks[1].reserved && app.acquired == 8U);
    before = app.dma;
    output = app.snapshot;
    saved = output;
    CHECK(dma_complete(&app.dma, &oldB, &output) == DMA_STALE_TOKEN &&
        same_dma(&app.dma, &before) && same_dma_report(&output, &saved));
    CHECK(dma_read(&app.dma, &oldA, 0U, &sample) == DMA_STALE_TOKEN && sample == 555U &&
        dma_release(&app.dma, &oldA) == DMA_STALE_TOKEN && same_dma(&app.dma, &before));
    CHECK(app_turn(&app, (Turn){PH_START,0U,0U,19U,0U,COPY_NORMAL,DMA_OK,true,false}));
    CHECK(app.snapshot.descriptors[0].token.run == 2U && app.snapshot.descriptors[0].token.block == 3U &&
        app.snapshot.descriptors[0].valid == 0U && app.acquired == 8U);
    CHECK(app_turn(&app, (Turn){PH_STOP,0U,0U,20U,0U,COPY_NORMAL,DMA_OK,false,false}));
    CHECK(app_turn(&app, (Turn){PH_CONFIRM,0U,0U,21U,0U,COPY_NORMAL,DMA_OK,false,false}));
}

/** @brief Demonstrate ordinary copying from READY in either stopped phase.
 * @param[in,out] app Distinct fresh fixture domain.
 * @param[in] confirmed Whether setup includes independent stop confirmation.
 * @return None. */
static void stopped_ready(Application *app, bool confirmed)
{
    uint32_t index;
    /**
    * Only these explicitly listed setup turns defer ordinary READY consumption.
    **/
    CHECK(app_init(app));
    CHECK(app_turn(app, (Turn){PH_START,0U,0U,0U,0U,COPY_DEFER,DMA_OK,false,false}));
    for (index = 0U; index < 4U; index++) {
        CHECK(app_turn(app, (Turn){PH_PUSH,10U + index,index * 10U,index + 1U,0U,
            COPY_DEFER,DMA_OK,false,false}));
    }
    CHECK(app_turn(app, (Turn){PH_COMPLETE,0U,0U,5U,0U,COPY_DEFER,DMA_OK,false,false}));
    CHECK(app_turn(app, (Turn){PH_STOP,0U,0U,6U,0U,COPY_DEFER,DMA_OK,true,false}));
    if (confirmed) {
        CHECK(app_turn(app, (Turn){PH_CONFIRM,0U,0U,7U,0U,COPY_DEFER,DMA_OK,true,false}));
    }
    CHECK(app_turn(app, (Turn){PH_NONE,0U,0U,8U,4U,COPY_NORMAL,DMA_OK,true,false}));
    CHECK(app->copied == 4U && app->releases == 1U && app->queueReport.departedCount == 4U &&
        app->queueReport.departed[0].value == 10U && app->queueReport.departed[3].value == 13U &&
        app->snapshot.phase == (confirmed ? DMA_STOP_CONFIRMED : DMA_STOP_REQUESTED));
    if (!confirmed) {
        CHECK(app_turn(app, (Turn){PH_CONFIRM,0U,0U,9U,0U,COPY_NORMAL,DMA_OK,false,false}));
    }
}

typedef struct {
    uint32_t count;
    uint32_t arrivals[4];
    uint32_t service;
    uint32_t departures;
    uint32_t departed[4];
    uint32_t drops;
    uint32_t dropped[4];
    uint32_t queued;
    uint32_t queue[4];
} LiteralRow;
static const LiteralRow g_a[8] = {
    {4,{0,1,2,3},1,1,{0},0,{0},3,{1,2,3}},
    {4,{4,5,6,7},1,1,{1},3,{5,6,7},3,{2,3,4}},
    {0,{0},1,1,{2},0,{0},2,{3,4}},
    {0,{0},1,1,{3},0,{0},1,{4}},
    {0,{0},1,1,{4},0,{0},0,{0}},
    {0,{0},1,0,{0},0,{0},0,{0}},
    {0,{0},1,0,{0},0,{0},0,{0}},
    {0,{0},1,0,{0},0,{0},0,{0}}
};
static const LiteralRow g_b[9] = {
    {2,{0,1},1,1,{0},0,{0},1,{1}},
    {2,{2,3},1,1,{1},0,{0},2,{2,3}},
    {2,{4,5},1,1,{2},0,{0},3,{3,4,5}},
    {2,{6,7},1,1,{3},1,{7},3,{4,5,6}},
    {2,{8,9},1,1,{4},1,{9},3,{5,6,8}},
    {2,{10,11},1,1,{5},1,{11},3,{6,8,10}},
    {0,{0},1,1,{6},0,{0},2,{8,10}},
    {0,{0},1,1,{8},0,{0},1,{10}},
    {0,{0},1,1,{10},0,{0},0,{0}}
};
static const LiteralRow g_c[8] = {
    {1,{0},0,0,{0},0,{0},1,{0}},
    {1,{1},0,0,{0},0,{0},2,{0,1}},
    {1,{2},0,0,{0},0,{0},3,{0,1,2}},
    {1,{3},0,0,{0},0,{0},4,{0,1,2,3}},
    {1,{4},0,0,{0},1,{4},4,{0,1,2,3}},
    {1,{5},4,4,{0,1,2,3},1,{5},0,{0}},
    {1,{6},4,1,{6},0,{0},0,{0}},
    {1,{7},0,0,{0},0,{0},1,{7}}
};

/** @brief Verify every mathematical literal row through the actual public queue.
 * @param[in] rows Independent frozen handwritten row list.
 * @param[in] count Exact finite trace endpoint.
 * @param[in] offered Literal total.
 * @param[in] admitted Literal total.
 * @param[in] departed Literal total.
 * @param[in] dropped Literal total.
 * @return None. */
static void literal_trace(const LiteralRow *rows, size_t count, uint32_t offered,
    uint32_t admitted, uint32_t departed, uint32_t dropped)
{
    ThroughputState state;
    ThroughputState before;
    ThroughputReport report;
    ThroughputReport saved;
    size_t index;
    size_t item;
    const ThroughputRecord zero = {0};
    /**
    * A/B/C are independent mathematical schedules, not the one-item DMA schedule.
    **/
    CHECK(throughput_init(&state, count, TP_FIXTURE_NORMAL, true) == TP_OK);
    for (index = 0U; index < count; index++) {
        const LiteralRow *row = &rows[index];
        ThroughputInput input[4] = {{0}};
        for (item = 0U; item < row->count; item++) {
            uint32_t id = row->arrivals[item];
            input[item] = (ThroughputInput){100U + id,id,id,id * 10U,1U};
        }
        CHECK(throughput_step(&state, input, row->count, row->service, &report) == TP_OK);
        CHECK(report.tick == index && report.offeredCount == row->count && report.droppedCount == row->drops &&
            report.departedCount == row->departures && report.queuedCount == row->queued);
        for (item = 0U; item < TP_CAPACITY; item++) {
            CHECK(item < row->departures ? report.departed[item].sourceId == row->departed[item] :
                same_record(report.departed[item], zero));
            CHECK(item < row->drops ? report.dropped[item].sourceId == row->dropped[item] :
                same_record(report.dropped[item], zero));
            CHECK(item < row->queued ? report.queued[item].sourceId == row->queue[item] :
                same_record(report.queued[item], zero));
            if (item >= report.offeredCount) {
                CHECK(same_record(report.offered[item], zero));
            }
            if (item >= report.admittedCount) {
                CHECK(same_record(report.admitted[item], zero));
            }
        }
    }
    CHECK(report.terminal && report.diagnostics.offered == offered && report.diagnostics.admitted == admitted &&
        report.diagnostics.departed == departed && report.diagnostics.dropped == dropped &&
        offered == departed + dropped + report.queuedCount);
    before = state;
    saved = report;
    CHECK(throughput_step(&state, NULL, 0U, 4U, &report) == TP_TERMINAL &&
        same_queue(&state, &before) && same_report(&report, &saved));
    CHECK(throughput_reset(&state) == TP_OK && state.count == 0U && state.tick == 0U &&
        state.diagnostics.offered == 0U && state.historyCount == 0U);
}

/** @brief Verify all checked wide inputs preserve queue and output snapshots.
 * @return None. */
static void queue_rejections(void)
{
    ThroughputState state;
    ThroughputState before;
    ThroughputReport report = {.tick=777U,.terminal=true};
    ThroughputReport saved = report;
    ThroughputInput input = {65535U,0U,65535U,UINT32_MAX,1U};
    ThroughputInput invalid[5] = {
        {65536U,0U,0U,0U,1U}, {1U,UINT64_C(4294967296),0U,0U,1U},
        {1U,0U,65536U,0U,1U}, {1U,0U,0U,UINT64_C(4294967296),1U}, {1U,0U,0U,0U,0U}
    };
    size_t index;
    /**
    * No invalid input is narrowed into an accidentally accepted value.
    **/
    CHECK(throughput_init(&state, 8U, TP_FIXTURE_NORMAL, true) == TP_OK);
    before = state;
    CHECK(throughput_init(&state, 0U, TP_FIXTURE_NORMAL, true) == TP_INVALID_ARGUMENT &&
        throughput_init(&state, UINT64_C(4294967296), TP_FIXTURE_NORMAL, true) == TP_INVALID_ARGUMENT &&
        throughput_init(&state, 8U, (ThroughputFixture)99, true) == TP_INVALID_ARGUMENT);
    for (index = 0U; index < 5U; index++) {
        CHECK(throughput_step(&state, &invalid[index], 1U, 1U, &report) == TP_INVALID_ARGUMENT &&
            same_queue(&state, &before) && same_report(&report, &saved));
    }
    CHECK(throughput_step(&state, &input, 5U, 0U, &report) == TP_INVALID_ARGUMENT &&
        throughput_step(&state, &input, 1U, 5U, &report) == TP_INVALID_ARGUMENT &&
        throughput_step(&state, NULL, 1U, 0U, &report) == TP_INVALID_ARGUMENT &&
        throughput_step(&state, &input, 1U, 0U, NULL) == TP_INVALID_ARGUMENT &&
        throughput_step(NULL, &input, 1U, 0U, &report) == TP_INVALID_ARGUMENT &&
        same_queue(&state, &before) && same_report(&report, &saved));
    CHECK(throughput_step(&state, &input, 1U, 1U, &report) == TP_OK &&
        report.departed[0].value == 65535U && report.departed[0].sourceId == 0U &&
        report.departed[0].sourceTime == UINT32_MAX);
}

/** @brief Verify finite history and exact counter saturation through fresh fixtures.
 * @return None. */
static void queue_limits(void)
{
    static ThroughputState counter;
    static ThroughputState history;
    ThroughputReport report;
    ThroughputInput input = {1U,0U,0U,0U,1U};
    ThroughputHistoryRow first;
    size_t index;
    /**
    * Counter and history are separate fresh lifetime domains, never reinitialized.
    **/
    CHECK(throughput_init(&counter, 4U, TP_FIXTURE_COUNTER_EDGE, false) == TP_OK &&
        throughput_step(&counter, &input, 1U, 1U, &report) == TP_OK &&
        report.diagnostics.offered == UINT32_MAX && report.diagnostics.admitted == UINT32_MAX &&
        report.diagnostics.departed == UINT32_MAX && !report.diagnostics.saturated);
    CHECK(throughput_step(&counter, &input, 1U, 1U, &report) == TP_OK && report.diagnostics.saturated &&
        report.diagnostics.offered == UINT32_MAX);
    CHECK(throughput_init(&history, 40U, TP_FIXTURE_NORMAL, true) == TP_OK);
    for (index = 0U; index < 32U; index++) {
        CHECK(throughput_step(&history, NULL, 0U, 0U, &report) == TP_OK);
    }
    first = history.history[0];
    CHECK(throughput_step(&history, &input, 1U, 1U, &report) == TP_OK && history.historyCount == 32U &&
        report.departedCount == 1U && history.tick == 33U && history.diagnostics.historyDropped == 1U &&
        history.history[0].tick == first.tick && history.history[0].queuedIds[0] == first.queuedIds[0]);
}

/** @brief Verify fixed sequence classifications, epoch rejection and edge deltas.
 * @return None. */
static void sequence_cases(void)
{
    static ThroughputSequence state;
    static ThroughputSequence edge;
    static ThroughputSequence saturation;
    ThroughputSequence before;
    ThroughputSequenceReport report;
    ThroughputSequenceReport saved;
    static const uint32_t input[7] = {65535U,0U,0U,3U,2U,32771U,4U};
    static const ThroughputOrder order[7] = {TP_FORWARD,TP_FORWARD,TP_DUPLICATE,TP_FORWARD,
        TP_OLDER,TP_AMBIGUOUS,TP_FORWARD};
    static const uint32_t last[7] = {65535U,0U,0U,3U,3U,3U,4U};
    size_t index;
    /**
    * The literal last65534 table is independent of the comparison implementation.
    **/
    CHECK(throughput_sequence_init(&state, 1U, TP_FIXTURE_NORMAL) == TP_OK &&
        throughput_sequence_observe(&state, 1U, 65534U, &report) == TP_OK && report.order == TP_SEEDED);
    for (index = 0U; index < 7U; index++) {
        CHECK(throughput_sequence_observe(&state, 1U, input[index], &report) == TP_OK &&
            report.order == order[index] && report.last == last[index]);
        if (index == 3U) {
            CHECK(report.gap == 2U && report.delta == 3U);
        }
    }
    before = state;
    saved = report;
    CHECK(throughput_sequence_observe(&state, 2U, 5U, &report) == TP_EPOCH_REJECTED &&
        throughput_sequence_observe(&state, 0U, 5U, &report) == TP_INVALID_ARGUMENT &&
        throughput_sequence_observe(&state, 1U, 65536U, &report) == TP_INVALID_ARGUMENT &&
        same_sequence(state, before) && same_sequence_report(report, saved));
    CHECK(throughput_sequence_init(&edge, 1U, TP_FIXTURE_NORMAL) == TP_OK &&
        throughput_sequence_observe(&edge, 1U, 0U, &report) == TP_OK && report.order == TP_SEEDED &&
        throughput_sequence_observe(&edge, 1U, 32768U, &report) == TP_OK && report.order == TP_AMBIGUOUS &&
        throughput_sequence_observe(&edge, 1U, 32769U, &report) == TP_OK && report.order == TP_OLDER &&
        throughput_sequence_observe(&edge, 1U, 32767U, &report) == TP_OK &&
        report.order == TP_FORWARD && report.gap == 32766U);
    CHECK(throughput_sequence_init(&saturation, 1U, TP_FIXTURE_COUNTER_EDGE) == TP_OK &&
        throughput_sequence_observe(&saturation, 1U, 0U, &report) == TP_OK &&
        report.diagnostics.observations == UINT32_MAX && !report.diagnostics.saturated &&
        throughput_sequence_observe(&saturation, 1U, 0U, &report) == TP_OK &&
        report.diagnostics.observations == UINT32_MAX && report.diagnostics.saturated &&
        report.diagnostics.duplicates == UINT32_MAX);
}

/** @brief Verify original UART FULL/flush, command freshness, timeout and time policy.
 * @return None. */
static void uart_time_cases(void)
{
    UartState uart;
    UartState timeout;
    UartIngress ingress;
    UartReport report;
    UartCommand command = {UART_SET_PERIOD,555U};
    TimeState time;
    TimeState wrap;
    TimeReport timeReport;
    uint32_t elapsed = 777U;
    static const uint16_t bytes[4] = {0xA5U,1U,2U,3U};
    size_t index;
    /**
    * Four queued status bytes were never accepted before the fifth caused loss.
    **/
    CHECK(uart_init(&uart, 100U, 0U) == UART_OK);
    for (index = 0U; index < 4U; index++) {
        CHECK(uart_receive(&uart, bytes[index], &ingress) == UART_OK);
    }
    CHECK(uart_receive(&uart, 0xA5U, &ingress) == UART_LOSS && ingress.fifoStatus == FIFO_FULL &&
        ingress.queuedBeforeLoss == 4U && ingress.fullPreservedBeforeDiscard &&
        uart.queue.count == 0U && uart.phase == UART_SEEK && uart.diagnostics.losses == 1U &&
        uart.applicationPeriod == 100U && command.periodMs == 555U);
    CHECK(uart_poll(&uart, 1U, &report, &command) == UART_OK && report.consumed == 0U &&
        report.eventCount == 0U && !report.commandPresent && command.kind == UART_SET_PERIOD &&
        command.periodMs == 555U);
    for (index = 0U; index < 4U; index++) {
        CHECK(uart_receive(&uart, bytes[index], &ingress) == UART_OK);
    }
    CHECK(uart_poll(&uart, 2U, &report, &command) == UART_OK && report.consumed == 4U &&
        report.eventCount == 4U && report.commandPresent && command.kind == UART_GET_STATUS &&
        command.periodMs == 100U);
    CHECK(uart_receive(&uart, 256U, &ingress) == UART_INVALID_ARGUMENT);
    CHECK(uart_init(&timeout, 100U, 0U) == UART_OK && uart_receive(&timeout, 0xA5U, &ingress) == UART_OK &&
        uart_poll(&timeout, 0U, &report, &command) == UART_OK);
    for (index = 0U; index < 4U; index++) {
        CHECK(uart_receive(&timeout, bytes[index], &ingress) == UART_OK);
    }
    CHECK(uart_poll(&timeout, 20U, &report, &command) == UART_OK && report.eventCount == 5U &&
        report.events[0] == UART_TIMEOUT && report.commandPresent && report.consumed == 4U);
    CHECK(time_init(&time, 10U, 100U) == TIME_OK && time_service(&time, 110U, &timeReport) == TIME_OK &&
        timeReport.releases == 1U && timeReport.work && timeReport.missed == 0U && timeReport.remainder == 0U);
    CHECK(time_service(&time, 145U, &timeReport) == TIME_OK && timeReport.releases == 3U &&
        timeReport.work && timeReport.missed == 2U && timeReport.remainder == 5U);
    CHECK(time_service(&time, 145U, &timeReport) == TIME_OK && !timeReport.work && timeReport.releases == 0U);
    CHECK(time_init(&wrap, 10U, UINT32_C(4294967290)) == TIME_OK &&
        time_service(&wrap, 4U, &timeReport) == TIME_OK && timeReport.elapsed == 10U && timeReport.work);
    CHECK(time_elapsed(0U, TIME_HALF_RANGE, &elapsed) == TIME_GAP_REJECTED && elapsed == 777U);
}

/** @brief Demonstrate per-component preserving failure without whole-turn rollback.
 * @return None. */
static void component_failures(void)
{
    static Application app;
    UartIngress ingress;
    UartReport report = {0};
    UartCommand command = {UART_SET_PERIOD,555U};
    DmaState before;
    DmaReport output;
    DmaReport saved;
    DmaToken zero = {0};
    uint16_t sample = 777U;
    /**
    * A successful real producer phase remains committed after a rejected poll.
    **/
    CHECK(app_init(&app));
    CHECK(app_turn(&app, (Turn){PH_START,0U,0U,0U,0U,COPY_NORMAL,DMA_OK,false,false}));
    CHECK(app_turn(&app, (Turn){PH_PUSH,10U,0U,1U,0U,COPY_NORMAL,DMA_OK,false,false}));
    before = app.dma;
    CHECK(uart_receive(&app.uart, 0xA5U, &ingress) == UART_OK);
    CHECK(uart_poll(&app.uart, UINT32_C(2147483649), &report, &command) == UART_TIME_REJECTED &&
        app.uart.queue.count == 1U && same_dma(&app.dma, &before) && app.acquired == 1U &&
        app.banks[0].present[0] && app.banks[0].labels[0].sourceTime == 0U);
    output = app.snapshot;
    saved = output;
    CHECK(dma_push(&app.dma, 65536U, &output) == DMA_INVALID_ARGUMENT &&
        same_dma(&app.dma, &before) && same_dma_report(&output, &saved));
    CHECK(dma_read(&app.dma, &zero, 0U, &sample) == DMA_INVALID_TOKEN && sample == 777U &&
        same_dma(&app.dma, &before));
    CHECK(app_turn(&app, (Turn){PH_STOP,0U,0U,2U,0U,COPY_NORMAL,DMA_OK,false,false}));
    CHECK(app_turn(&app, (Turn){PH_CONFIRM,0U,0U,3U,0U,COPY_NORMAL,DMA_OK,false,false}));
}

/** @brief Exercise real producer exhaustion and matching read/index/BUSY behavior.
 * @return None. */
static void producer_limits(void)
{
    static DmaState lastBlock;
    static DmaState lastRun;
    static DmaState counter;
    DmaReport report;
    DmaReport saved;
    DmaState before;
    DmaToken token = {99U,99U,1U};
    DmaToken sentinel;
    uint16_t sample = 777U;
    uint32_t index;
    /**
    * One fresh LAST_BLOCK domain reaches MAX without editing producer fields.
    **/
    CHECK(dma_init(&lastBlock, DMA_FIXTURE_LAST_BLOCK, true) == DMA_OK &&
        dma_claim(&lastBlock, &token) == DMA_EMPTY && token.run == 99U &&
        dma_start(&lastBlock, &report) == DMA_OK && report.descriptors[0].token.block == UINT32_MAX);
    token = report.descriptors[0].token;
    for (index = 0U; index < 4U; index++) {
        CHECK(dma_push(&lastBlock, 10U + index, &report) == DMA_OK);
    }
    CHECK(dma_complete(&lastBlock, &token, &report) == DMA_OK && dma_claim(&lastBlock, &token) == DMA_OK);
    before = lastBlock;
    sentinel = (DmaToken){99U,99U,1U};
    CHECK(dma_claim(&lastBlock, &sentinel) == DMA_BUSY && sentinel.run == 99U &&
        dma_read(&lastBlock, &token, 4U, &sample) == DMA_INVALID_ARGUMENT && sample == 777U &&
        same_dma(&lastBlock, &before));
    CHECK(dma_read(&lastBlock, &token, 0U, &sample) == DMA_OK && sample == 10U &&
        dma_release(&lastBlock, &token) == DMA_OK);
    before = lastBlock;
    saved = report;
    CHECK(dma_begin_next(&lastBlock, &report) == DMA_EXHAUSTED && same_dma(&lastBlock, &before) &&
        same_dma_report(&report, &saved));
    CHECK(dma_request_stop(&lastBlock, DMA_CAUSE_USER, &report) == DMA_OK &&
        dma_confirm_stop(&lastBlock, &report) == DMA_OK && dma_recover(&lastBlock, &report) == DMA_OK);
    before = lastBlock;
    saved = report;
    CHECK(dma_start(&lastBlock, &report) == DMA_EXHAUSTED && same_dma(&lastBlock, &before) &&
        same_dma_report(&report, &saved));
    /**
    * Independent domains preserve allocator/lease history for every fresh fixture.
    **/
    CHECK(dma_init(&lastRun, DMA_FIXTURE_LAST_RUN, true) == DMA_OK &&
        dma_start(&lastRun, &report) == DMA_OK &&
        dma_request_stop(&lastRun, DMA_CAUSE_USER, &report) == DMA_OK &&
        dma_confirm_stop(&lastRun, &report) == DMA_OK && dma_recover(&lastRun, &report) == DMA_OK &&
        report.run == UINT32_MAX && dma_start(&lastRun, &report) == DMA_OK &&
        dma_request_stop(&lastRun, DMA_CAUSE_USER, &report) == DMA_OK &&
        dma_confirm_stop(&lastRun, &report) == DMA_OK);
    before = lastRun;
    saved = report;
    CHECK(dma_recover(&lastRun, &report) == DMA_EXHAUSTED && same_dma(&lastRun, &before) &&
        same_dma_report(&report, &saved));
    CHECK(dma_init(&counter, DMA_FIXTURE_COUNTER_EDGE, false) == DMA_OK &&
        dma_start(&counter, &report) == DMA_OK);
    token = report.descriptors[0].token;
    for (index = 0U; index < 4U; index++) {
        CHECK(dma_push(&counter, index, &report) == DMA_OK);
    }
    CHECK(dma_complete(&counter, &token, &report) == DMA_OK &&
        report.diagnostics.completed == UINT32_MAX && !report.diagnostics.saturated &&
        dma_claim(&counter, &token) == DMA_OK && dma_read(&counter, &token, 0U, &sample) == DMA_OK &&
        counter.diagnostics.copiedItems == UINT32_MAX && !counter.diagnostics.saturated &&
        dma_read(&counter, &token, 1U, &sample) == DMA_OK && counter.diagnostics.saturated &&
        dma_release(&counter, &token) == DMA_OK &&
        dma_request_stop(&counter, DMA_CAUSE_USER, &report) == DMA_OK &&
        dma_confirm_stop(&counter, &report) == DMA_OK);
}

/** @brief Run the complete finite independent consumer with meaningful exit status.
 * @return Zero only when every active check and output operation succeeds. */
int main(void)
{
    static Application stoppedRequested;
    static Application stoppedConfirmed;
    /**
    * Separate static lifetime domains prevent fresh initializers wiping old leases.
    **/
    normal_composition();
    late_composition();
    stopped_ready(&stoppedRequested, false);
    stopped_ready(&stoppedConfirmed, true);
    literal_trace(g_a, 8U, 8U, 5U, 5U, 3U);
    literal_trace(g_b, 9U, 12U, 9U, 9U, 3U);
    literal_trace(g_c, 8U, 8U, 6U, 5U, 2U);
    queue_rejections();
    queue_limits();
    sequence_cases();
    uart_time_cases();
    component_failures();
    producer_limits();
    if (g_failures != 0U) {
        return 1;
    }
    if (puts("PASS N1 actual read/copy/release: 2 blocks / 8 samples / 16 payload bytes; queue 8/5/3/5/0") < 0 ||
        puts("PASS N2 held-A late/no30write/unconfirmed BUSY/confirmed-held BUSY/release/recover run2/stale/start")
            < 0 ||
        puts("PASS N3 READY copy while stop-requested and stop-confirmed; actual bounded UART status usable") < 0 ||
        puts("PASS N4 real UART FULL4+failed5th/timeout5events/time110,145/equal,wrap/non-atomic commits") < 0 ||
        puts("PASS N5 A8/B9/C8 rows/terminal/reset/wide rejection/sequence65534/epoch/half/saturation/history33") < 0 ||
        printf("Host sizeof only: queue=%zu report=%zu sequence=%zu app=%zu label-bank=%zu\n",
            sizeof(ThroughputState), sizeof(ThroughputReport), sizeof(ThroughputSequence),
            sizeof(Application), sizeof(LabelBank)) < 0 || fflush(stdout) != 0) {
        return 1;
    }
    return 0;
}
END_CONSUMER_C
