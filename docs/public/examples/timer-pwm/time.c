/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file time.c
 * @author embedded-notes contributors
 * @brief Constant-work periodic release policy; host model, no hardware access.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "time.h"
#include <stddef.h>
#ifdef TIME_TEST
#include <stdio.h>
#endif

/**
 * @brief Initialize a periodic phase at now without reading old storage.
 * @param[in,out] state Writable object, possibly fresh.
 * @param[in] period Positive period below the half range.
 * @param[in] now Initial tick sample.
 * @return Named status; failure leaves state unchanged.
 */
TimeStatus time_init(TimeState *state, uint32_t period, uint32_t now)
{
    /** Validate first; do not inspect indeterminate old contents. **/
    if (state == NULL || period == 0U || period > TIME_MAX_PERIOD) {
        return TIME_INVALID_ARGUMENT;
    }
    state->period = period;
    state->lastObserved = now;
    state->remainder = 0U;
    return TIME_OK;
}

/**
 * @brief Check the observed modulo difference, not the unseen true elapsed time.
 * @param[in] then Last accepted sample.
 * @param[in] now New forward sample under the documented real-gap promise.
 * @param[out] elapsed Writable independent output, preserved on rejection.
 * @return Named status; no side effects on failure.
 */
TimeStatus time_elapsed(uint32_t then, uint32_t now, uint32_t *elapsed)
{
    uint32_t delta;

    /** The conversion also preserves modulo32 semantics after integer promotion. **/
    if (elapsed == NULL) {
        return TIME_INVALID_ARGUMENT;
    }
    delta = (uint32_t)(now - then);
    if (delta >= TIME_HALF_RANGE) {
        return TIME_GAP_REJECTED;
    }
    *elapsed = delta;
    return TIME_OK;
}

/**
 * @brief Cross any number of releases with a single finite arithmetic step.
 * @param[in,out] state Initialized valid state; disjoint from report.
 * @param[in] now Next tick sample under the caller's real-gap promise.
 * @param[out] report Copy-by-value result; one work item at most.
 * @return Named status; all state/report fields preserved on failure.
 */
TimeStatus time_service(TimeState *state, uint32_t now, TimeReport *report)
{
    uint32_t delta;
    uint64_t total;
    TimeReport next;
    TimeStatus status;

    /** Validate every checkable premise before committing accepted phase. **/
    if (state == NULL || report == NULL) {
        return TIME_INVALID_ARGUMENT;
    }
    if (state->period == 0U || state->period > TIME_MAX_PERIOD || state->remainder >= state->period) {
        return TIME_BAD_STATE;
    }
    status = time_elapsed(state->lastObserved, now, &delta);
    if (status != TIME_OK) {
        return status;
    }
    total = (uint64_t)state->remainder + (uint64_t)delta;
    /** total <= 4294967293; releases <= 2147483647 for every valid period. **/
    next.releases = (uint32_t)(total / state->period);
    next.remainder = (uint32_t)(total % state->period);
    next.elapsed = delta;
    next.work = next.releases != 0U;
    next.missed = next.work ? next.releases - 1U : 0U;
    state->lastObserved = now;
    state->remainder = next.remainder;
    *report = next;
    return TIME_OK;
}

#ifdef TIME_TEST
/**
 * @brief Compare every named field instead of reading structure padding.
 * @param[in] left Initialized state.
 * @param[in] right Initialized state.
 * @return True exactly when all named fields agree.
 */
static bool same_state(TimeState left, TimeState right)
{
    /** Padding bytes are not part of the state preservation contract. **/
    return left.period == right.period && left.lastObserved == right.lastObserved &&
        left.remainder == right.remainder;
}

/**
 * @brief Compare all public report values without padding assumptions.
 * @param[in] left Initialized report.
 * @param[in] right Initialized report.
 * @return True when every named report field agrees.
 */
static bool same_report(TimeReport left, TimeReport right)
{
    /** This check stays active when NDEBUG is defined. **/
    return left.work == right.work && left.missed == right.missed && left.releases == right.releases &&
        left.elapsed == right.elapsed && left.remainder == right.remainder;
}

/**
 * @brief Execute literal normal/late/wrap fixtures through public calls.
 * @param[in] None.
 * @return True on all independently specified outcomes.
 */
static bool test_trace(void)
{
    TimeState state;
    TimeReport report;
    const uint32_t now[] = {109U, 110U, 145U, 145U};
    const uint32_t missed[] = {0U, 0U, 2U, 0U};
    const uint32_t remainder[] = {9U, 0U, 5U, 5U};
    const bool work[] = {false, true, true, false};
    size_t index;

    /** Expected rows come from hand-counted period boundaries 110/120/130/140. **/
    if (time_init(&state, 10U, 100U) != TIME_OK) {
        return false;
    }
    for (index = 0U; index < 4U; index++) {
        if (time_service(&state, now[index], &report) != TIME_OK || report.work != work[index] ||
            report.missed != missed[index] || report.remainder != remainder[index]) {
            return false;
        }
    }
    return time_init(&state, 10U, UINT32_C(4294967290)) == TIME_OK &&
        time_service(&state, 4U, &report) == TIME_OK && report.work && report.elapsed == 10U &&
        report.releases == 1U && report.missed == 0U && report.remainder == 0U;
}

/**
 * @brief Execute bounded maximum and half-range equality cases.
 * @param[in] None.
 * @return True on all fixed boundary outcomes.
 */
static bool test_bounds(void)
{
    TimeState state;
    TimeReport report;
    uint32_t elapsed = 77U;

    /** The maximum total is 2147483646 + 2147483647, not uint32_t wrap. **/
    if (time_init(&state, TIME_MAX_PERIOD, 0U) != TIME_OK ||
        time_service(&state, UINT32_C(2147483646), &report) != TIME_OK || report.work ||
        time_service(&state, UINT32_C(4294967293), &report) != TIME_OK || !report.work ||
        report.missed != 0U || report.remainder != UINT32_C(2147483646)) {
        return false;
    }
    if (time_init(&state, 1U, 0U) != TIME_OK ||
        time_service(&state, TIME_MAX_PERIOD, &report) != TIME_OK || !report.work ||
        report.missed != UINT32_C(2147483646) || report.remainder != 0U) {
        return false;
    }
    return time_elapsed(0U, TIME_MAX_PERIOD, &elapsed) == TIME_OK && elapsed == TIME_MAX_PERIOD &&
        time_elapsed(0U, TIME_HALF_RANGE, &elapsed) == TIME_GAP_REJECTED && elapsed == TIME_MAX_PERIOD;
}

/**
 * @brief Exercise only initialized real objects on every checkable rejection.
 * @param[in] None.
 * @return True if failure preserves all named accepted state/report fields.
 */
static bool test_rejection(void)
{
    TimeState state = {10U, 100U, 5U};
    TimeState before = state;
    TimeReport report = {true, 17U, 18U, 19U, 20U};
    TimeReport saved = report;
    const uint32_t badPeriods[] = {0U, TIME_HALF_RANGE, UINT32_MAX};
    size_t index;

    /** Invalid initialized metadata is testable; forged pointers are not. **/
    for (index = 0U; index < 3U; index++) {
        if (time_init(&state, badPeriods[index], 0U) != TIME_INVALID_ARGUMENT || !same_state(state, before)) {
            return false;
        }
    }
    if (time_init(NULL, 10U, 0U) != TIME_INVALID_ARGUMENT ||
        time_elapsed(0U, 1U, NULL) != TIME_INVALID_ARGUMENT ||
        time_service(NULL, 0U, &report) != TIME_INVALID_ARGUMENT || !same_report(report, saved) ||
        time_service(&state, 0U, NULL) != TIME_INVALID_ARGUMENT || !same_state(state, before) ||
        time_service(&state, UINT32_C(2147483748), &report) != TIME_GAP_REJECTED ||
        !same_state(state, before) || !same_report(report, saved)) {
        return false;
    }
    state.remainder = state.period;
    before = state;
    if (time_service(&state, 110U, &report) != TIME_BAD_STATE || !same_state(state, before) ||
        !same_report(report, saved)) {
        return false;
    }
    state.period = 0U;
    before = state;
    return time_service(&state, 110U, &report) == TIME_BAD_STATE && same_state(state, before) &&
        same_report(report, saved);
}

/**
 * @brief Run active host checks and propagate output failure without assert.
 * @param[in] None.
 * @return Zero only when all checks and output complete successfully.
 */
int main(void)
{
    /** This optional main is excluded from reusable module compilation. **/
    if (!test_trace() || !test_bounds() || !test_rejection()) {
        return 1;
    }
    if (puts("PASS time: literal trace, wrap, bounds, rejection preservation") < 0 || fflush(stdout) != 0) {
        return 1;
    }
    return 0;
}
#endif
