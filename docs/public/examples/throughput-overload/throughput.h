/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file throughput.h
 * @author embedded-notes contributors
 * @brief Four sample records, finite work and bounded sequence observations.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_THROUGHPUT_H
#define EMBEDDED_NOTES_THROUGHPUT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#if !defined(UINT16_MAX) || !defined(UINT32_MAX) || !defined(UINT64_MAX)
#error Exact-width uint16_t, uint32_t and uint64_t are required.
#endif

#define TP_CAPACITY 4U
#define TP_HISTORY_ROWS 32U

typedef enum {
    TP_OK = 0,
    TP_TERMINAL,
    TP_INVALID_ARGUMENT,
    TP_BAD_STATE,
    TP_EPOCH_REJECTED
} ThroughputStatus;
typedef enum {
    TP_FIXTURE_NORMAL = 0,
    TP_FIXTURE_COUNTER_EDGE
} ThroughputFixture;
typedef struct {
    uint64_t value;
    uint64_t sourceId;
    uint64_t sequence;
    uint64_t sourceTime;
    uint64_t epoch;
} ThroughputInput;
typedef struct {
    uint16_t value;
    uint32_t sourceId;
    uint16_t sequence;
    uint32_t sourceTime;
    uint32_t epoch;
} ThroughputRecord;
typedef struct {
    uint32_t offered;
    uint32_t admitted;
    uint32_t dropped;
    uint32_t departed;
    uint32_t historyDropped;
    bool saturated;
} ThroughputDiagnostics;
typedef struct {
    uint32_t tick;
    uint32_t offered;
    uint32_t dropped;
    uint32_t departed;
    uint32_t queuedCount;
    uint32_t queuedIds[TP_CAPACITY];
} ThroughputHistoryRow;
typedef struct {
    ThroughputRecord slots[TP_CAPACITY];
    uint32_t head;
    uint32_t count;
    uint32_t tick;
    uint32_t limit;
    bool historyEnabled;
    ThroughputDiagnostics diagnostics;
    size_t historyCount;
    ThroughputHistoryRow history[TP_HISTORY_ROWS];
} ThroughputState;
typedef struct {
    uint32_t tick;
    bool terminal;
    uint32_t offeredCount;
    uint32_t admittedCount;
    uint32_t droppedCount;
    uint32_t departedCount;
    uint32_t queuedCount;
    ThroughputRecord offered[TP_CAPACITY];
    ThroughputRecord admitted[TP_CAPACITY];
    ThroughputRecord dropped[TP_CAPACITY];
    ThroughputRecord departed[TP_CAPACITY];
    ThroughputRecord queued[TP_CAPACITY];
    ThroughputDiagnostics diagnostics;
} ThroughputReport;

/*
 * Original single-context, exclusive, non-reentrant host model; no MMIO, heap,
 * callbacks, recursion, sleeps, blocking I/O, concurrent queue or physical time.
 * Every nonnull argument names a real live typed sufficiently sized object.
 * All outputs, state and input arrays are disjoint; no pointer is retained.
 * Callers may inspect fields but must never edit accepted state metadata.
 * Null/domain checks do not validate forged/dangling pointers, aliasing or false
 * extents. Later operations require successful initialization, not arbitrary bytes.
 * Fresh init reads no old storage; it requires no old live owner/events. It must
 * not erase a DMA lifetime/lease/allocator. Checked reset discards ONLY this queue
 * and its diagnostics/history, preserving the declared limit/history setting.
 *
 * Capacity is exactly four SAMPLE RECORDS, independent of the old four-BYTE FIFO.
 * A step first admits 0..4 ordered records (drop-new), then serves up to 0..4
 * oldest records. No hidden in-service slot, carried credit or terminal flush.
 * Inputs are checked in uint64_t before narrowing: value/sequence <=65535;
 * sourceId/sourceTime <=UINT32_MAX (ID zero is valid); epoch 1..UINT32_MAX.
 * limit is 1..UINT32_MAX accepted steps; tick never wraps. On the last TP_OK,
 * report.terminal is true. A later TP_TERMINAL preserves state/output; retain the
 * last committed terminal snapshot, with no fresh report or history action.
 *
 * TP_OK alone refreshes the complete report. Argument/state/epoch rejections
 * preserve ALL named state, counters/history and outputs. Queue drop is accepted
 * progress. Earlier successful calls in another module are never rolled back.
 * Every report list has four initialized slots; unused slots are all zero.
 * Each step offers <=4, departs <=4, copies <=4 current queued records and appends
 * <=1 optional copied row. State owns four records and 32 fixed history rows,
 * even when recording is off. Row33 drops only the diagnostic row; queue work
 * still advances. Counters reach MAX with saturated=false; the next attempted
 * increment at MAX sets sticky saturated=true. Saturated totals are not rates.
 * COUNTER_EDGE is a fresh public fixture seeding each total MAX-1, not permission
 * to edit initialized metadata. Every loop has the fixed 4 or 32 storage bound.
 */

/** @brief Initialize genuinely fresh queue storage after validating wide limit.
 * @param[out] state Fresh disjoint writable object.
 * @param[in] limit Accepted steps 1..UINT32_MAX.
 * @param[in] fixture NORMAL or COUNTER_EDGE.
 * @param[in] historyEnabled Enable optional copied history.
 * @return TP_OK or preserving TP_INVALID_ARGUMENT. */
ThroughputStatus throughput_init(ThroughputState *state, uint64_t limit,
    ThroughputFixture fixture, bool historyEnabled);
/** @brief Explicitly discard/reseed only the initialized queue domain.
 * @param[in,out] state Valid initialized queue; no DMA resource is referenced.
 * @return TP_OK or preserving argument/state rejection. */
ThroughputStatus throughput_reset(ThroughputState *state);
/** @brief Admit first, then remove oldest records under fixed work limits.
 * @param[in,out] state Valid initialized queue.
 * @param[in] offered Real ordered array of count inputs; NULL allowed only at zero.
 * @param[in] count Wide cardinality 0..4.
 * @param[in] service Wide current service opportunity 0..4.
 * @param[out] report Fresh complete copied result only on TP_OK.
 * @return TP_OK/TERMINAL or preserving argument/state rejection. */
ThroughputStatus throughput_step(ThroughputState *state, const ThroughputInput *offered,
    uint64_t count, uint64_t service, ThroughputReport *report);

typedef enum {
    TP_SEEDED = 0,
    TP_FORWARD,
    TP_DUPLICATE,
    TP_OLDER,
    TP_AMBIGUOUS
} ThroughputOrder;
typedef struct {
    uint32_t observations;
    uint32_t forward;
    uint32_t gaps;
    uint32_t duplicates;
    uint32_t older;
    uint32_t ambiguous;
    bool saturated;
} ThroughputSequenceDiagnostics;
typedef struct {
    uint32_t epoch;
    uint16_t last;
    bool seeded;
    ThroughputSequenceDiagnostics diagnostics;
} ThroughputSequence;
typedef struct {
    ThroughputOrder order;
    uint16_t delta;
    uint16_t gap;
    uint16_t last;
    ThroughputSequenceDiagnostics diagnostics;
} ThroughputSequenceReport;

/* Sequence observations share the object/non-overlap/fresh-output contract above.
 * Caller promises same explicit epoch and true forward/window span <32768.
 * A different positive epoch returns preserving TP_EPOCH_REJECTED; a new epoch
 * needs a distinct fresh domain (no old events), not silent comparison/reset.
 * First observation seeds last without earlier loss. Only FORWARD advances last.
 * d0 duplicate-of-last candidate; d1..32767 forward/gap=d-1; d32768 ambiguous;
 * d32769..65535 older/late candidate. No signed conversion or hidden history.
 * Gaps count currently skipped positions, not settled permanent loss. Last-only
 * state cannot detect all past duplicates, tail loss, unseen wraps or restart.
 * Each call has constant work and no history; all diagnostics saturate as above.
 */
/** @brief Initialize one fresh explicit source-epoch observer.
 * @param[out] state Genuinely fresh disjoint object.
 * @param[in] epoch Wide positive uint32 domain.
 * @param[in] fixture Public normal/counter seed.
 * @return TP_OK or preserving TP_INVALID_ARGUMENT. */
ThroughputStatus throughput_sequence_init(ThroughputSequence *state, uint64_t epoch,
    ThroughputFixture fixture);
/** @brief Observe one checked source sequence under the true-span promise.
 * @param[in,out] state Initialized observer, never caller-edited.
 * @param[in] epoch Same positive epoch in wide input.
 * @param[in] sequence Wide value 0..65535.
 * @param[out] report Complete fresh result only on TP_OK.
 * @return TP_OK or preserving argument/state/epoch rejection. */
ThroughputStatus throughput_sequence_observe(ThroughputSequence *state, uint64_t epoch,
    uint64_t sequence, ThroughputSequenceReport *report);

#endif
