/******************************************************************************
 * @file memory_budget.h
 * @author Embedded Engineering Notes project
 * @brief Original bounded teaching model; no third-party ownership/license claim.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef MEMORY_BUDGET_H
#define MEMORY_BUDGET_H

#include <stdbool.h>
#include <stddef.h>

#define MEMORY_MAX_BLOCKS 8U
#define MEMORY_MAX_PATHS 8U
#define MEMORY_MAX_FRAMES 16U

typedef enum {
    MEMORY_FITS, MEMORY_EXCEEDS, MEMORY_INVALID, MEMORY_OVERFLOW, MEMORY_UNKNOWN
} MemoryStatus;

typedef struct {
    size_t capacity, dataBytes, bssBytes, heapBytes, stackBytes, guardBytes;
} MemoryLayout;

typedef struct {
    size_t used, remaining, excess;
} MemoryReport;

typedef struct {
    const size_t *frames;
    size_t frameCount, repetitions;
    bool known;
} MemoryPath;

typedef struct {
    size_t offset, span, payload;
    bool live;
} MemoryBlock;

typedef struct {
    size_t capacity, overhead, alignment, peak;
    MemoryBlock blocks[MEMORY_MAX_BLOCKS];
} MemoryHeap;

typedef struct {
    size_t live, peak, totalFree, largestFree;
} MemoryHeapReport;

/* All non-NULL pointers designate live, initialized real objects of the stated
 * extent; outputs/state/inputs must not overlap. No arbitrary pointer validation.
 * Single execution context, non-reentrant. Counts bounded by macros above.
 * FITS/EXCEEDS write numerical reports for envelope/stack; INVALID/OVERFLOW/UNKNOWN
 * preserve the entire output. Heap failures preserve heap AND report; only FITS
 * commits. A report used after failure is old accepted state, not a new result.
 */

/** @brief Check a non-overlapping RAM reservation envelope.
 * @param[in] layout Real initialized layout. @param[out] report Independent output.
 * @return FITS (including equality), EXCEEDS, INVALID or OVERFLOW. */
MemoryStatus memory_envelope(const MemoryLayout *layout, MemoryReport *report);

/** @brief Compute ceil(value*numerator/denominator) with checked intermediate.
 * @param[in] value,numerator,denominator size_t values; denominator must be nonzero.
 * @param[out] result Independent writable size_t. @return FITS/INVALID/OVERFLOW. */
MemoryStatus memory_scale_ceil(size_t value, size_t numerator, size_t denominator, size_t *result);

/** @brief Maximum sibling path plus bounded aggregate interrupt demand.
 * @param[in] paths Real path array; each known path has 1..16 frame costs.
 * repetitions=0 or known=false means UNKNOWN; irqKnown=false means UNKNOWN.
 * Repetitions multiply a whole path (explicit conservative bounded recurrence).
 * irqBytes is the complete per-nesting-level allowance, not a hardware constant.
 * @param[in] pathCount,irqBytes,irqNesting,irqKnown,capacity Declared model bounds.
 * @param[out] report Independent report. @return All five MemoryStatus values. */
MemoryStatus memory_stack(const MemoryPath *paths, size_t pathCount, size_t irqBytes,
                          size_t irqNesting, bool irqKnown, size_t capacity, MemoryReport *report);

/** @brief Initialize an integer first-fit arena without allocating host memory.
 * @param[out] heap Real writable object; old contents are not read.
 * @param[in] capacity,overhead,alignment Bytes; alignment is a power of two.
 * @return FITS/INVALID; INVALID preserves heap. */
MemoryStatus memory_heap_init(MemoryHeap *heap, size_t capacity, size_t overhead, size_t alignment);

/** @brief Allocate/release one of eight named slots with adjacent free-gap coalescing.
 * @param[in,out] heap Initialized only by init/step, no caller corruption.
 * @param[in] allocate true allocates; false releases a live slot.
 * @param[in] slot 0..7; payload positive for allocation, ignored for release.
 * @param[out] report Independent real output. No data pointers are returned.
 * @return FITS commits; EXCEEDS/INVALID/OVERFLOW preserve heap and report. */
MemoryStatus memory_heap_step(MemoryHeap *heap, bool allocate, size_t slot, size_t payload,
                             MemoryHeapReport *report);

#endif
