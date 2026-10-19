/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file dma.h
 * @author embedded-notes contributors
 * @brief Fixed two-block host ownership model; no physical DMA is accessed.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_DMA_H
#define EMBEDDED_NOTES_DMA_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#if !defined(UINT16_MAX) || !defined(UINT32_MAX) || !defined(UINT64_MAX)
#error Exact-width uint16_t, uint32_t and uint64_t are required.
#endif

#define DMA_BLOCKS 2U
#define DMA_ITEMS 4U
#define DMA_HISTORY_ROWS 32U

typedef enum {
    DMA_OK=0, DMA_EMPTY, DMA_BUSY, DMA_INVALID_ARGUMENT, DMA_BAD_STATE,
    DMA_INVALID_TOKEN, DMA_STALE_TOKEN, DMA_EXHAUSTED, DMA_LATE_REUSE,
    DMA_TRANSFER_ERROR, DMA_NOT_RUNNING, DMA_BAD_REGION, DMA_BAD_ALIGNMENT,
    DMA_BAD_EXTENT
} DmaStatus;
typedef enum {
    DMA_FREE=0,
    DMA_WRITER,
    DMA_READY,
    DMA_CONSUMER,
    DMA_INVALID
} DmaOwner;
typedef enum {
    DMA_IDLE=0,
    DMA_RUNNING,
    DMA_BOUNDARY,
    DMA_STOP_REQUESTED,
    DMA_STOP_CONFIRMED
} DmaPhase;
typedef enum {
    DMA_CAUSE_NONE=0,
    DMA_CAUSE_USER,
    DMA_CAUSE_LATE,
    DMA_CAUSE_TRANSFER
} DmaCause;
typedef enum {
    DMA_FIXTURE_NORMAL=0, DMA_FIXTURE_LAST_BLOCK, DMA_FIXTURE_LAST_RUN, DMA_FIXTURE_COUNTER_EDGE
} DmaFixture;

typedef struct {
    uint64_t address;
    uint64_t allocatedBytes;
    uint32_t count;
    uint32_t widthBytes;
} DmaPlacement;
typedef struct {
    uint32_t run;
    uint32_t block;
    uint32_t slot;
} DmaToken;
typedef struct {
    DmaOwner owner;
    uint32_t valid;
    DmaToken token;
} DmaDescriptor;
typedef struct {
    DmaDescriptor descriptor;
    uint16_t items[DMA_ITEMS];
} DmaBlock;
typedef struct {
    uint32_t completed;
    uint32_t observedTc;
    uint32_t copiedItems;
    uint32_t released;
    uint32_t lateReuse;
    uint32_t transferErrors;
    uint32_t discardedReady;
    uint32_t historyDropped;
    bool saturated;
} DmaDiagnostics;
typedef struct {
    DmaStatus status;
    DmaPhase phase;
    uint32_t run;
    uint32_t slot;
    uint32_t valid;
} DmaHistoryRow;
typedef struct {
    DmaPhase phase;
    DmaCause cause;
    uint32_t run;
    uint32_t nextRun;
    uint32_t nextBlock;
    uint32_t current;
    uint32_t ndtr;
    uint32_t stopValid;
    bool runExhausted;
    bool blockExhausted;
    bool ht;
    bool tc;
    bool leasePresent;
    bool historyEnabled;
    DmaToken lease;
    DmaBlock blocks[DMA_BLOCKS];
    DmaDiagnostics diagnostics;
    size_t historyCount;
    DmaHistoryRow history[DMA_HISTORY_ROWS];
} DmaState;
typedef struct {
    DmaPhase phase;
    DmaCause cause;
    uint32_t run;
    uint32_t current;
    uint32_t ndtr;
    uint32_t stopValid;
    bool stopConfirmed;
    bool ht;
    bool tc;
    bool leasePresent;
    DmaToken lease;
    DmaDescriptor descriptors[DMA_BLOCKS];
    DmaDiagnostics diagnostics;
} DmaReport;
typedef struct {
    uint16_t items[DMA_BLOCKS][DMA_ITEMS];
    uint32_t current;
    uint32_t ndtr;
    uint32_t completed;
    uint32_t observedTc;
    bool ht;
    bool tc;
    bool held[DMA_BLOCKS];
    bool ownershipViolation;
    bool saturated;
} DmaRawState;

/*
 * All objects are real live initialized typed objects in one exclusive,
 * non-reentrant context. Outputs and input tokens/requests are disjoint from
 * state and each other. Never edit state metadata; fields are inspectable only.
 * No pointer is retained. Null checks cannot validate forged/dangling pointers,
 * false allocation extents, arbitrary corruption, or aliasing. No heap, MMIO,
 * callbacks, main, busy waiting, physical addresses or concurrency is executed.
 *
 * Fresh dma_init/dma_raw_init require fresh storage, no old live owner/events.
 * They do not inspect previous bytes and are not checked reset shortcuts.
 * All later calls require successfully initialized objects. Rejected arguments,
 * states, BUSY/EMPTY/EXHAUSTED and invalid/stale tokens preserve all state and
 * outputs, including history/diagnostics. Valid stop/errors intentionally change
 * state. DMA_OK and DMA_LATE_REUSE/DMA_TRANSFER_ERROR return a fresh report when
 * that call has a report argument; only successful claim/read refresh their
 * separate token/sample outputs. A retained old output is never a fresh result.
 *
 * SAFE_STOP_ON_REUSE is an original host policy. start allocates block A;
 * push writes exactly one item; after four pushes NDTR=0 but owner remains
 * WRITER and TC is not newly asserted. complete(token) is the distinct supplied
 * completion phase: it publishes READY and flips CT/NDTR. begin_next separately
 * checks reuse and allocates the next block, or requests stop before any write.
 * Hardware DBM does not execute this software-owner handshake.
 *
 * Identity domains are separate uint32_t positive run and block IDs, each
 * 1..UINT32_MAX, never wrapping/reused in this object's lifetime. init allocates
 * run1 (normal), leaves nextRun2/nextBlock1. start/begin_next allocate one block
 * ID; recover allocates one run ID, never rewinds block allocation. The last ID
 * is usable, sets its exhausted flag, and later allocation rejects preserving.
 * LAST_BLOCK starts nextBlock=UINT32_MAX, LAST_RUN starts run=MAX-1/nextRun=MAX.
 * COUNTER_EDGE initializes diagnostic totals MAX-1 with saturated=false.
 * These public fresh fixtures avoid editing live metadata to test limits.
 *
 * Token(run,block,slot) with run=0 or block=0 is INVALID_TOKEN. Slot>=2 is
 * INVALID_ARGUMENT. Positive wrong identities are STALE_TOKEN. No token from
 * another initialized domain may be supplied: fresh objects have distinct
 * caller-owned lifetime domains and do not promise globally unique IDs.
 * At most one lease: oldest READY block ID is claimed; read copies one uint16_t
 * at index<valid; release frees only that lease. Reads/releases remain available
 * during stop. complete old identity never publishes. Stop confirmation is a
 * supplied backend fact, independent of request, with no inferred physical stop.
 * recover requires confirmed stop and no lease, discards READY, clears all
 * lengths/flags/cause, establishes a new idle run; start is separate.
 *
 * Fixed resources: two arrays x4 uint16_t, two descriptors, one lease, optional
 * 32 copied history rows. At most one history row per successful mutating call;
 * row33 increments saturating historyDropped and never blocks progress. All
 * unused fields/slots initialize deterministically to zero/enum zero. Counters
 * reach MAX without setting saturation; an attempted increment at MAX sets it.
 * Read/status calls append no history; read increments copiedItems only.
 */

/** @brief Check numeric SRAM placement only; preserve bytes on rejection.
 * @param[in] request Count1..65535, width1/2/4, 32-bit address/extent.
 * @param[out] bytes Checked count*width; not host allocation/ownership proof.
 * @return DMA_OK or explicit argument/region/alignment/extent error. */
DmaStatus dma_check_placement(const DmaPlacement *request, uint32_t *bytes);
/** @brief Initialize fresh state using a public fixture.
 * @param[out] state Fresh writable object, no live old domain.
 * @param[in] fixture Named normal/last-ID/counter fixture.
 * @param[in] historyEnabled Enable optional fixed history.
 * @return DMA_OK or preserving DMA_INVALID_ARGUMENT. */
DmaStatus dma_init(DmaState *state, DmaFixture fixture, bool historyEnabled);
/** @brief Start idle run by allocating A; no item is written.
 * @param[in,out] state Initialized idle state.
 * @param[out] report Fresh copied metadata on success.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_start(DmaState *state, DmaReport *report);
/** @brief Write one checked 16-bit item into the current WRITER.
 * @param[in,out] state Running state with remaining items.
 * @param[in] sample Wide input validated before conversion.
 * @param[out] report Fresh metadata on success.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_push(DmaState *state, uint32_t sample, DmaReport *report);
/** @brief Supply completion for exactly the current full transfer token.
 * @param[in,out] state Full WRITER in running state.
 * @param[in] token Matching run/block/slot identity.
 * @param[out] report READY metadata, CT switched, NDTR4 on success.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_complete(DmaState *state, const DmaToken *token, DmaReport *report);
/** @brief At the fake reuse boundary allocate a FREE next block or request stop.
 * @param[in,out] state Boundary state; no data write occurs.
 * @param[out] report Fresh metadata for OK/LATE_REUSE.
 * @return DMA_OK/DMA_LATE_REUSE or preserving rejection. */
DmaStatus dma_begin_next(DmaState *state, DmaReport *report);
/** @brief Claim oldest READY, with at most one outstanding consumer.
 * @param[in,out] state Initialized state in any lifecycle phase.
 * @param[out] lease Copied identity refreshed only on DMA_OK.
 * @return DMA_OK/EMPTY/BUSY or preserving argument/state error. */
DmaStatus dma_claim(DmaState *state, DmaToken *lease);
/** @brief Copy one item through the matching lease; no retained pointer.
 * @param[in,out] state Initialized state; copiedItems diagnostic advances.
 * @param[in] lease Matching live token.
 * @param[in] index Index0..valid-1 checked in wide type.
 * @param[out] sample Refreshed only on DMA_OK.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_read(DmaState *state, const DmaToken *lease, uint32_t index, uint16_t *sample);
/** @brief Release only the matching outstanding lease, including during stop.
 * @param[in,out] state Initialized state.
 * @param[in] lease Matching live identity.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_release(DmaState *state, const DmaToken *lease);
/** @brief Supply user-stop or transfer-error cause; partial WRITER is INVALID.
 * @param[in,out] state Running/boundary state.
 * @param[in] cause USER or TRANSFER only.
 * @param[out] report Fresh initiating cause/partial length.
 * @return DMA_OK/DMA_TRANSFER_ERROR or preserving rejection. */
DmaStatus dma_request_stop(DmaState *state, DmaCause cause, DmaReport *report);
/** @brief Supply independent backend stop confirmation, without waiting.
 * @param[in,out] state Stop-requested state; lease is retained.
 * @param[out] report Fresh metadata on success.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_confirm_stop(DmaState *state, DmaReport *report);
/** @brief Recover confirmed stopped state only after matching lease release.
 * @param[in,out] state No outstanding consumer; allocators never rewind.
 * @param[out] report Fresh idle/new-run state, no automatic start.
 * @return DMA_OK/BUSY/EXHAUSTED or preserving rejection. */
DmaStatus dma_recover(DmaState *state, DmaReport *report);
/** @brief Observe current latches once and optionally clear both.
 * @param[in,out] state Initialized state; observedTc counts observations only.
 * @param[in] clear Clear latches after snapshot.
 * @param[out] report Fresh pre-clear flags and post-increment diagnostics.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_observe(DmaState *state, bool clear, DmaReport *report);
/** @brief Copy status in every valid phase; no mutation/history.
 * @param[in] state Initialized state.
 * @param[out] report Fresh metadata on success.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_status(const DmaState *state, DmaReport *report);
/** @brief Initialize fresh raw DBM counterexample; no safe ownership API.
 * @param[out] state Fresh raw storage.
 * @return DMA_OK or DMA_INVALID_ARGUMENT. */
DmaStatus dma_raw_init(DmaRawState *state);
/** @brief Write one raw item, automatically complete/switch after item4.
 * @param[in,out] state Initialized raw model, independent of safe producer.
 * @param[in] sample Wide checked16-bit value.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_raw_push(DmaRawState *state, uint32_t sample);
/** @brief Illustratively hold one completed raw block; raw writing still proceeds.
 * @param[in,out] state Initialized raw model.
 * @param[in] slot Completed non-current slot0/1.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_raw_hold(DmaRawState *state, uint32_t slot);
/** @brief Observe raw TC latch and optionally clear flags; no lap reconstruction.
 * @param[in,out] state Initialized raw model.
 * @param[in] clear Clear HT/TC after observation.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_raw_observe(DmaRawState *state, bool clear);

#endif
