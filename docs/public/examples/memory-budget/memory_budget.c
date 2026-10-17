/******************************************************************************
 * @file memory_budget.c
 * @author Embedded Engineering Notes project
 * @brief Original finite RAM model. LiXin style, truthful project provenance.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "memory_budget.h"
#include <stdint.h>

/** @brief Checked addition. @param[in] left,right Operands. @param[out] result Sum.
 * @return false on overflow, preserving result. */
static bool add_size(size_t left, size_t right, size_t *result)
{
    /** Subtract before addition so wrapping never occurs. **/
    if (right > SIZE_MAX - left) {
        return false;
    }
    *result = left + right;
    return true;
}

/** @brief Classify a representable total. @param[in] total,capacity Bytes.
 * @param[out] report Independent output. @return FITS/EXCEEDS. */
static MemoryStatus classify(size_t total, size_t capacity, MemoryReport *report)
{
    MemoryReport candidate = {total, 0U, 0U};
    /** Subtraction is taken only in its ordered branch. **/
    if (total > capacity) {
        candidate.excess = total - capacity;
        *report = candidate;
        return MEMORY_EXCEEDS;
    }
    candidate.remaining = capacity - total;
    *report = candidate;
    return MEMORY_FITS;
}

/** @brief Check static regions plus arenas plus guard. @param[in] layout Input.
 * @param[out] report Output. @return FITS/EXCEEDS/INVALID/OVERFLOW. */
MemoryStatus memory_envelope(const MemoryLayout *layout, MemoryReport *report)
{
    size_t total = 0U;
    /** Reject NULL before reading fields; caller establishes real object extents. **/
    if (layout == NULL || report == NULL) {
        return MEMORY_INVALID;
    }
    if (!add_size(layout->dataBytes, layout->bssBytes, &total) ||
        !add_size(total, layout->heapBytes, &total) ||
        !add_size(total, layout->stackBytes, &total) ||
        !add_size(total, layout->guardBytes, &total)) {
        return MEMORY_OVERFLOW;
    }
    return classify(total, layout->capacity, report);
}

/** @brief Checked rational ceiling. @param[in] value,numerator,denominator Operands.
 * @param[out] result Output. @return FITS/INVALID/OVERFLOW. */
MemoryStatus memory_scale_ceil(size_t value, size_t numerator, size_t denominator, size_t *result)
{
    size_t product;
    size_t quotient;
    /** This contract rejects even a reducible ratio if its selected product overflows. **/
    if (result == NULL || denominator == 0U) {
        return MEMORY_INVALID;
    }
    if (numerator != 0U && value > SIZE_MAX / numerator) {
        return MEMORY_OVERFLOW;
    }
    product = value * numerator;
    quotient = product / denominator;
    if (product % denominator != 0U && !add_size(quotient, 1U, &quotient)) {
        return MEMORY_OVERFLOW;
    }
    *result = quotient;
    return MEMORY_FITS;
}

/** @brief Bounded maximum path plus IRQ allowance. @param[in] paths Path array.
 * @param[in] pathCount,irqBytes,irqNesting,irqKnown,capacity Declared bounds.
 * @param[out] report Output. @return Named status, preserving invalid/unknown output. */
MemoryStatus memory_stack(const MemoryPath *paths, size_t pathCount, size_t irqBytes,
                          size_t irqNesting, bool irqKnown, size_t capacity, MemoryReport *report)
{
    size_t maximum = 0U;
    size_t interrupts;
    /** Structural validation precedes classification and all numerical work. **/
    if (paths == NULL || report == NULL || pathCount == 0U || pathCount > MEMORY_MAX_PATHS) {
        return MEMORY_INVALID;
    }
    for (size_t index = 0U; index < pathCount; ++index) {
        if (paths[index].frames == NULL || paths[index].frameCount == 0U ||
            paths[index].frameCount > MEMORY_MAX_FRAMES) {
            return MEMORY_INVALID;
        }
    }
    for (size_t index = 0U; index < pathCount; ++index) {
        if (!paths[index].known || paths[index].repetitions == 0U) {
            return MEMORY_UNKNOWN;
        }
    }
    if (!irqKnown) {
        return MEMORY_UNKNOWN;
    }
    for (size_t index = 0U; index < pathCount; ++index) {
        size_t path = 0U;
        for (size_t frame = 0U; frame < paths[index].frameCount; ++frame) {
            if (!add_size(path, paths[index].frames[frame], &path)) {
                return MEMORY_OVERFLOW;
            }
        }
        if (memory_scale_ceil(path, paths[index].repetitions, 1U, &path) != MEMORY_FITS) {
            return MEMORY_OVERFLOW;
        }
        if (path > maximum) {
            maximum = path;
        }
    }
    if (memory_scale_ceil(irqBytes, irqNesting, 1U, &interrupts) != MEMORY_FITS ||
        !add_size(maximum, interrupts, &maximum)) {
        return MEMORY_OVERFLOW;
    }
    return classify(maximum, capacity, report);
}

/** @brief Initialize a metadata-only arena. @param[out] heap State object.
 * @param[in] capacity,overhead,alignment Configuration. @return FITS/INVALID. */
MemoryStatus memory_heap_init(MemoryHeap *heap, size_t capacity, size_t overhead, size_t alignment)
{
    MemoryHeap candidate = {0};
    /** Power-of-two alignment gives aligned spans and starts from offset zero. **/
    if (heap == NULL || alignment == 0U || (alignment & (alignment - 1U)) != 0U) {
        return MEMORY_INVALID;
    }
    candidate.capacity = capacity;
    candidate.overhead = overhead;
    candidate.alignment = alignment;
    *heap = candidate;
    return MEMORY_FITS;
}

/** @brief Find first fitting gap and summarize all gaps. @param[in] heap Valid state.
 * @param[in] wanted Required contiguous span. @param[out] offset First fit or SIZE_MAX.
 * @param[out] report Live and free-space summary. @return None. */
static void heap_gaps(const MemoryHeap *heap, size_t wanted, size_t *offset, MemoryHeapReport *report)
{
    size_t cursor = 0U;
    MemoryHeapReport candidate = {0U, heap->peak, 0U, 0U};
    /** At most eight live blocks; find each next block without host allocation. **/
    *offset = SIZE_MAX;
    for (size_t pass = 0U; pass <= MEMORY_MAX_BLOCKS; ++pass) {
        size_t next = heap->capacity;
        size_t span = 0U;
        for (size_t index = 0U; index < MEMORY_MAX_BLOCKS; ++index) {
            const MemoryBlock *block = &heap->blocks[index];
            if (block->live && block->offset >= cursor && block->offset < next) {
                next = block->offset;
                span = block->span;
            }
        }
        if (next > cursor) {
            size_t gap = next - cursor;
            candidate.totalFree += gap;
            if (gap > candidate.largestFree) {
                candidate.largestFree = gap;
            }
            if (*offset == SIZE_MAX && gap >= wanted) {
                *offset = cursor;
            }
        }
        if (span == 0U) {
            break;
        }
        candidate.live += span;
        cursor = next + span;
    }
    *report = candidate;
}

/** @brief Commit one allocation/lifetime event. @param[in,out] heap Valid initialized state.
 * @param[in] allocate,slot,payload Event. @param[out] report Output. @return Named status. */
MemoryStatus memory_heap_step(MemoryHeap *heap, bool allocate, size_t slot, size_t payload,
                             MemoryHeapReport *report)
{
    MemoryHeap candidate;
    MemoryHeapReport summary;
    size_t offset;
    size_t span;
    /** Valid-state provenance is a caller precondition; NULL is still rejected first. **/
    if (heap == NULL || report == NULL || slot >= MEMORY_MAX_BLOCKS) {
        return MEMORY_INVALID;
    }
    candidate = *heap;
    if (allocate) {
        if (payload == 0U || candidate.blocks[slot].live) {
            return MEMORY_INVALID;
        }
        if (!add_size(payload, candidate.overhead, &span)) {
            return MEMORY_OVERFLOW;
        }
        if (span % candidate.alignment != 0U &&
            !add_size(span, candidate.alignment - span % candidate.alignment, &span)) {
            return MEMORY_OVERFLOW;
        }
        heap_gaps(&candidate, span, &offset, &summary);
        if (offset == SIZE_MAX) {
            return MEMORY_EXCEEDS;
        }
        candidate.blocks[slot] = (MemoryBlock){offset, span, payload, true};
    } else {
        if (!candidate.blocks[slot].live) {
            return MEMORY_INVALID;
        }
        candidate.blocks[slot] = (MemoryBlock){0U, 0U, 0U, false};
    }
    heap_gaps(&candidate, 0U, &offset, &summary);
    if (summary.live > candidate.peak) {
        candidate.peak = summary.live;
        summary.peak = summary.live;
    }
    *heap = candidate;
    *report = summary;
    return MEMORY_FITS;
}

#ifdef MEMORY_BUDGET_TEST
#include <stdio.h>
#include <string.h>

/** @brief Exercise rejection/report boundaries. @return Zero for the fixed expectations. */
static int test_numeric(void)
{
    MemoryLayout layout = {1024U, 128U, 256U, 256U, 256U, 129U};
    MemoryReport report = {777U, 777U, 777U};
    size_t scaled = 777U;
    const size_t frames[] = {80U, 64U, 32U};
    const size_t sibling[] = {80U, 48U};
    const size_t huge[] = {SIZE_MAX, 1U};
    MemoryPath paths[] = {{frames, 3U, 1U, true}, {sibling, 2U, 1U, true}};
    MemoryPath overCount[9] = {{NULL, 0U, 0U, false}};
    /** Literal expected values are independent of the production arithmetic. **/
    if (memory_envelope(&layout, &report) != MEMORY_EXCEEDS || report.used != 1025U ||
        report.excess != 1U || report.remaining != 0U) {
        return 1;
    }
    layout = (MemoryLayout){0U, 0U, 0U, 0U, 0U, 0U};
    if (memory_envelope(&layout, &report) != MEMORY_FITS || report.used != 0U) {
        return 1;
    }
    layout = (MemoryLayout){SIZE_MAX, SIZE_MAX, 0U, 0U, 0U, 0U};
    if (memory_envelope(&layout, &report) != MEMORY_FITS || report.used != SIZE_MAX) {
        return 1;
    }
    layout.guardBytes = 1U;
    if (memory_envelope(&layout, &report) != MEMORY_OVERFLOW || report.used != SIZE_MAX ||
        memory_envelope(NULL, &report) != MEMORY_INVALID || report.used != SIZE_MAX ||
        memory_envelope(&layout, NULL) != MEMORY_INVALID) {
        return 1;
    }
    if (memory_scale_ceil(7U, 3U, 2U, &scaled) != MEMORY_FITS || scaled != 11U ||
        memory_scale_ceil(SIZE_MAX, 1U, 1U, &scaled) != MEMORY_FITS || scaled != SIZE_MAX ||
        memory_scale_ceil(SIZE_MAX, 2U, 2U, &scaled) != MEMORY_OVERFLOW || scaled != SIZE_MAX ||
        memory_scale_ceil(0U, SIZE_MAX, 1U, &scaled) != MEMORY_FITS || scaled != 0U ||
        memory_scale_ceil(1U, 1U, 0U, &scaled) != MEMORY_INVALID || scaled != 0U ||
        memory_scale_ceil(1U, 1U, 1U, NULL) != MEMORY_INVALID) {
        return 1;
    }
    if (memory_stack(paths, 2U, 64U, 1U, true, 256U, &report) != MEMORY_FITS ||
        report.used != 240U || report.remaining != 16U ||
        memory_stack(paths, 2U, 64U, 1U, true, 240U, &report) != MEMORY_FITS ||
        report.remaining != 0U ||
        memory_stack(paths, 2U, 64U, 1U, true, 239U, &report) != MEMORY_EXCEEDS || report.excess != 1U) {
        return 1;
    }
    paths[0].repetitions = 2U;
    if (memory_stack(paths, 2U, 32U, 2U, true, 416U, &report) != MEMORY_FITS || report.used != 416U) {
        return 1;
    }
    paths[0].repetitions = 0U;
    if (memory_stack(paths, 2U, 64U, 1U, true, 256U, &report) != MEMORY_UNKNOWN || report.used != 416U) {
        return 1;
    }
    paths[0].repetitions = 1U;
    paths[1].known = false;
    if (memory_stack(paths, 2U, 64U, 1U, true, 256U, &report) != MEMORY_UNKNOWN || report.used != 416U) {
        return 1;
    }
    paths[1].known = true;
    if (memory_stack(paths, 2U, 64U, 1U, false, 256U, &report) != MEMORY_UNKNOWN || report.used != 416U ||
        memory_stack(NULL, 2U, 0U, 0U, true, 0U, &report) != MEMORY_INVALID ||
        memory_stack(paths, 0U, 0U, 0U, true, 0U, &report) != MEMORY_INVALID ||
        memory_stack(overCount, 9U, 0U, 0U, true, 0U, &report) != MEMORY_INVALID ||
        memory_stack(paths, 2U, 0U, 0U, true, 0U, NULL) != MEMORY_INVALID) {
        return 1;
    }
    paths[0] = (MemoryPath){NULL, 1U, 1U, true};
    if (memory_stack(paths, 2U, 0U, 0U, true, 0U, &report) != MEMORY_INVALID ||
        report.used != 416U || report.remaining != 0U || report.excess != 0U) {
        return 1;
    }
    paths[0].frames = huge;
    paths[0].frameCount = 2U;
    if (memory_stack(paths, 2U, 0U, 0U, true, SIZE_MAX, &report) != MEMORY_OVERFLOW || report.used != 416U) {
        return 1;
    }
    paths[0] = (MemoryPath){frames, 3U, SIZE_MAX, true};
    if (memory_stack(paths, 2U, 0U, 0U, true, SIZE_MAX, &report) != MEMORY_OVERFLOW || report.used != 416U) {
        return 1;
    }
    paths[0].repetitions = 1U;
    if (memory_stack(paths, 2U, SIZE_MAX, 2U, true, SIZE_MAX, &report) != MEMORY_OVERFLOW ||
        memory_stack(paths, 2U, SIZE_MAX, 1U, true, SIZE_MAX, &report) != MEMORY_OVERFLOW ||
        report.used != 416U) {
        return 1;
    }
    return 0;
}

/** @brief Exercise finite real metadata lifetime/fragmentation fixtures. @return Zero on match. */
static int test_heap(void)
{
    MemoryHeap heap;
    MemoryHeap before;
    MemoryHeapReport report = {777U, 777U, 777U, 777U};
    /** A,B,C,D are four disjoint live 32-byte spans in a 128-byte arena. **/
    if (memory_heap_init(&heap, 128U, 0U, 1U) != MEMORY_FITS) {
        return 1;
    }
    for (size_t index = 0U; index < 4U; ++index) {
        if (memory_heap_step(&heap, true, index, 32U, &report) != MEMORY_FITS ||
            heap.blocks[index].offset != index * 32U) {
            return 1;
        }
    }
    if (report.live != 128U || report.peak != 128U || report.totalFree != 0U ||
        memory_heap_step(&heap, false, 0U, 0U, &report) != MEMORY_FITS || report.live != 96U ||
        memory_heap_step(&heap, false, 2U, 0U, &report) != MEMORY_FITS || report.live != 64U ||
        report.totalFree != 64U || report.largestFree != 32U || report.peak != 128U) {
        return 1;
    }
    memcpy(&before, &heap, sizeof heap);
    if (memory_heap_step(&heap, true, 4U, 48U, &report) != MEMORY_EXCEEDS ||
        memcmp(&before, &heap, sizeof heap) != 0 || report.live != 64U || report.largestFree != 32U ||
        memory_heap_step(&heap, false, 0U, 0U, &report) != MEMORY_INVALID ||
        memory_heap_step(&heap, true, 1U, 1U, &report) != MEMORY_INVALID ||
        memory_heap_step(&heap, true, 8U, 1U, &report) != MEMORY_INVALID ||
        memory_heap_step(&heap, true, 4U, 0U, &report) != MEMORY_INVALID ||
        memory_heap_step(NULL, true, 4U, 1U, &report) != MEMORY_INVALID ||
        memory_heap_step(&heap, true, 4U, 1U, NULL) != MEMORY_INVALID ||
        memory_heap_init(&heap, 128U, 0U, 3U) != MEMORY_INVALID ||
        memcmp(&before, &heap, sizeof heap) != 0) {
        return 1;
    }
    if (memory_heap_step(&heap, false, 1U, 0U, &report) != MEMORY_FITS || report.largestFree != 96U ||
        memory_heap_step(&heap, true, 4U, 48U, &report) != MEMORY_FITS ||
        report.live != 80U || report.totalFree != 48U || report.largestFree != 48U || report.peak != 128U) {
        return 1;
    }
    if (memory_heap_init(&heap, 32U, 4U, 8U) != MEMORY_FITS ||
        memory_heap_step(&heap, true, 0U, 5U, &report) != MEMORY_FITS || report.live != 16U ||
        memory_heap_step(&heap, true, 1U, 5U, &report) != MEMORY_FITS || report.live != 32U) {
        return 1;
    }
    if (memory_heap_init(&heap, 127U, 0U, 1U) != MEMORY_FITS) {
        return 1;
    }
    for (size_t index = 0U; index < 3U; ++index) {
        if (memory_heap_step(&heap, true, index, 32U, &report) != MEMORY_FITS) {
            return 1;
        }
    }
    memcpy(&before, &heap, sizeof heap);
    if (memory_heap_step(&heap, true, 3U, 32U, &report) != MEMORY_EXCEEDS ||
        report.live != 96U || report.totalFree != 31U || report.largestFree != 31U ||
        report.peak != 96U || memcmp(&before, &heap, sizeof heap) != 0) {
        return 1;
    }
    if (memory_heap_init(&heap, 32U, 4U, 8U) != MEMORY_FITS ||
        memory_heap_step(&heap, true, 0U, 5U, &report) != MEMORY_FITS ||
        memory_heap_step(&heap, true, 1U, 5U, &report) != MEMORY_FITS) {
        return 1;
    }
    memcpy(&before, &heap, sizeof heap);
    if (memory_heap_step(&heap, true, 2U, 1U, &report) != MEMORY_EXCEEDS || report.live != 32U ||
        memcmp(&before, &heap, sizeof heap) != 0) {
        return 1;
    }
    if (memory_heap_init(&heap, 0U, 0U, 1U) != MEMORY_FITS ||
        memory_heap_step(&heap, true, 0U, 1U, &report) != MEMORY_EXCEEDS ||
        memory_heap_init(NULL, 0U, 0U, 1U) != MEMORY_INVALID ||
        memory_heap_init(&heap, 1U, 0U, 0U) != MEMORY_INVALID ||
        memory_heap_init(&heap, SIZE_MAX, 1U, 8U) != MEMORY_FITS ||
        memory_heap_step(&heap, true, 0U, SIZE_MAX, &report) != MEMORY_OVERFLOW ||
        memory_heap_init(&heap, SIZE_MAX, 0U, 8U) != MEMORY_FITS ||
        memory_heap_step(&heap, true, 0U, SIZE_MAX, &report) != MEMORY_OVERFLOW) {
        return 1;
    }
    return 0;
}

/** @brief Fixed independent equality oracle. @return Nonzero on failure or I/O error. */
int main(void)
{
    MemoryLayout layout = {1024U, 128U, 256U, 256U, 256U, 128U};
    MemoryReport report = {777U, 777U, 777U};
    /** Runtime checks remain active with NDEBUG. **/
    if (memory_envelope(&layout, &report) != MEMORY_FITS || report.used != 1024U ||
        report.remaining != 0U || report.excess != 0U) {
        if (fprintf(stderr, "FAIL envelope equality: expected FITS/1024/0/0\n") < 0) {
            return 2;
        }
        if (fflush(stderr) != 0) {
            return 2;
        }
        return 1;
    }
    if (test_numeric() != 0 || test_heap() != 0) {
        if (fprintf(stderr, "FAIL memory budget: numeric/path/heap boundary\n") < 0) {
            return 2;
        }
        if (fflush(stderr) != 0) {
            return 2;
        }
        return 1;
    }
    if (puts("PASS memory budget: envelope, rational, lifetime, fragmentation, "
             "maximum path, unknown, preservation") == EOF) {
        return 2;
    }
    if (fflush(stdout) != 0) {
        return 2;
    }
    return 0;
}
#endif
