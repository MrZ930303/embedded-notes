/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file time.h
 * @author embedded-notes contributors
 * @brief Checked modulo32 observations and bounded periodic host policy.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_TIME_H
#define EMBEDDED_NOTES_TIME_H

#include <stdbool.h>
#include <stdint.h>

#if !defined(UINT32_MAX) || !defined(UINT64_MAX)
#error Exact-width uint32_t and uint64_t are required.
#endif

#define TIME_MAX_PERIOD UINT32_C(2147483647)
#define TIME_HALF_RANGE UINT32_C(2147483648)

typedef enum {
    TIME_OK = 0,
    TIME_INVALID_ARGUMENT,
    TIME_BAD_STATE,
    TIME_GAP_REJECTED
} TimeStatus;

typedef struct {
    uint32_t period;
    uint32_t lastObserved;
    uint32_t remainder;
} TimeState;

typedef struct {
    bool work;
    uint32_t missed;
    uint32_t releases;
    uint32_t elapsed;
    uint32_t remainder;
} TimeReport;

/*
 * Unit fixture: one tick = one millisecond. The caller promises a true forward
 * gap < 2^31 ticks between accepted observations. Equal samples cannot reveal
 * unseen complete wraps. Rejection of observed delta >= 2^31 is not a detector
 * of every violated real-gap promise. No signed-cast time ordering is used.
 *
 * All nonnull pointers must name real, live, correctly typed objects. Output
 * objects must be writable and disjoint from all other objects in the call.
 * init may receive fresh storage; other state calls require initialized fields.
 * Nonnull checking cannot validate dangling/forged pointers or false extents.
 * Single execution context, exclusive ownership, non-reentrant. No MMIO, heap,
 * callbacks, recursion, sleeps, retry or catch-up loops. Every operation has
 * constant work/storage. Failure preserves all named state and output fields.
 */

/**
 * @brief Initialize fresh storage without reading its prior contents.
 * @param[in,out] state Real writable object; no old initialization required.
 * @param[in] period Period 1..TIME_MAX_PERIOD ticks.
 * @param[in] now Initial observation, any uint32_t value.
 * @return TIME_OK or TIME_INVALID_ARGUMENT; failure preserves named fields.
 */
TimeStatus time_init(TimeState *state, uint32_t period, uint32_t now);

/**
 * @brief Return checked modulo32 difference under the caller's true-gap promise.
 * @param[in] then Last accepted observation.
 * @param[in] now Next forward observation.
 * @param[out] elapsed Real writable uint32_t; unchanged on failure.
 * @return TIME_OK, TIME_INVALID_ARGUMENT or TIME_GAP_REJECTED.
 */
TimeStatus time_elapsed(uint32_t then, uint32_t now, uint32_t *elapsed);

/**
 * @brief Advance phase once; report at most one work item and exact missed count.
 * @param[in,out] state Initialized period in range, remainder strictly < period.
 * @param[in] now Next observation under the true-gap promise.
 * @param[out] report Real writable object disjoint from state; no old read.
 * @return TIME_OK, TIME_INVALID_ARGUMENT, TIME_BAD_STATE or TIME_GAP_REJECTED.
 */
TimeStatus time_service(TimeState *state, uint32_t now, TimeReport *report);

#endif
