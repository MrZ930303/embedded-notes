/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file timer.c
 * @author embedded-notes contributors
 * @brief Qualified integer PWM arithmetic and finite host update events.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "timer.h"
#include <stddef.h>
#ifdef TIMER_TEST
#include <stdio.h>
#endif

/**
 * @brief Compute exact integer ratios after validating every external field.
 * @param[in] request Initialized independent input.
 * @param[out] plan Writable independent output; no prior read.
 * @return Named status; rejection preserves every output field.
 */
TimerStatus timer_plan(const TimerRequest *request, TimerPlan *plan)
{
    uint64_t count;
    uint64_t compare;
    TimerPlan next;

    /** Wide operands precede multiplication; maximum divisor is 4294967296. **/
    if (request == NULL || plan == NULL) {
        return TIMER_INVALID_ARGUMENT;
    }
    if (request->sourceHz == 0U || request->sourceHz > 84000000U || request->prescaler > 65535U ||
        request->autoReload == 0U || request->autoReload > 65535U || request->dutyBp > 10000U) {
        return TIMER_INVALID_ARGUMENT;
    }
    count = (uint64_t)request->autoReload + 1U;
    compare = (count * request->dutyBp + 5000U) / 10000U;
    if (compare > 65535U) {
        return TIMER_NOT_REPRESENTABLE;
    }
    next.requested = *request;
    next.compare = (uint32_t)compare;
    next.divisor = ((uint64_t)request->prescaler + 1U) * count;
    next.errorNum = (int64_t)(compare * 10000U) - (int64_t)(count * request->dutyBp);
    next.errorDen = count * 10000U;
    *plan = next;
    return TIMER_OK;
}

/**
 * @brief Validate named plan metadata without reading structure padding.
 * @param[in] plan Initialized plan object.
 * @return True when every derived field matches its qualified request.
 */
static bool valid_plan(const TimerPlan *plan)
{
    TimerPlan expected;

    /** An initialized malformed plan is rejected; arbitrary memory is outside scope. **/
    if (timer_plan(&plan->requested, &expected) != TIMER_OK) {
        return false;
    }
    return plan->compare == expected.compare && plan->divisor == expected.divisor &&
        plan->errorNum == expected.errorNum && plan->errorDen == expected.errorDen;
}

/**
 * @brief Check the finite host trace's initialized invariants.
 * @param[in] trace Initialized state with real object extent.
 * @return True if phase, counter and both complete tuples are consistent.
 */
static bool valid_trace(const TimerTrace *trace)
{
    /** The host model never claims that a register write is physically atomic. **/
    return trace->phase <= 4U && trace->terminal == (trace->phase == 4U) &&
        trace->counter <= trace->active.requested.autoReload &&
        valid_plan(&trace->active) && valid_plan(&trace->preload);
}

/**
 * @brief Seed a fresh trace before any proposed preload or step.
 * @param[out] trace Writable real object; no prior read.
 * @return TIMER_OK or TIMER_INVALID_ARGUMENT.
 */
TimerStatus timer_begin(TimerTrace *trace)
{
    TimerTrace next;
    const TimerRequest seed = {84000000U, 83U, 999U, 2500U};
    TimerStatus status;

    /** Commit only after the seed plan is fully formed. **/
    if (trace == NULL) {
        return TIMER_INVALID_ARGUMENT;
    }
    status = timer_plan(&seed, &next.active);
    if (status != TIMER_OK) {
        return status;
    }
    next.preload = next.active;
    next.phase = 0U;
    next.counter = 500U;
    next.terminal = false;
    *trace = next;
    return TIMER_OK;
}

/**
 * @brief Replace a complete proposed tuple before advancing the finite trace.
 * @param[in,out] trace Initialized phase0 state, disjoint from request.
 * @param[in] request Proposed initialized request.
 * @return Named status; all trace fields preserved on failure.
 */
TimerStatus timer_stage(TimerTrace *trace, const TimerRequest *request)
{
    TimerPlan next;
    TimerStatus status;

    /** Checking the whole tuple prevents partial accepted host plans. **/
    if (trace == NULL || request == NULL) {
        return TIMER_INVALID_ARGUMENT;
    }
    if (!valid_trace(trace) || trace->phase != 0U) {
        return TIMER_BAD_STATE;
    }
    status = timer_plan(request, &next);
    if (status != TIMER_OK) {
        return status;
    }
    trace->preload = next;
    return TIMER_OK;
}

/**
 * @brief Advance one declared host event with no per-counter or waiting loop.
 * @param[in,out] trace Initialized valid trace.
 * @param[out] event Independent writable event output.
 * @return Named status; terminal or invalid calls preserve all named fields.
 */
TimerStatus timer_step(TimerTrace *trace, TimerEvent *event)
{
    TimerTrace next;
    TimerEvent nextEvent;

    /** UDIS suppresses transfer; URS filters request sources, not the UG event. **/
    if (trace == NULL || event == NULL) {
        return TIMER_INVALID_ARGUMENT;
    }
    if (!valid_trace(trace)) {
        return TIMER_BAD_STATE;
    }
    if (trace->terminal) {
        return TIMER_DONE;
    }
    next = *trace;
    nextEvent = (TimerEvent)next.phase;
    if (next.phase == 1U) {
        next.counter = 0U;
    } else if (next.phase >= 2U) {
        next.active = next.preload;
        next.counter = 0U;
    }
    next.phase++;
    next.terminal = next.phase == 4U;
    *trace = next;
    *event = nextEvent;
    return TIMER_OK;
}

#ifdef TIMER_TEST
/**
 * @brief Compare every named field of two initialized plans.
 * @param[in] left First plan.
 * @param[in] right Second plan.
 * @return True on field equality; padding is ignored.
 */
static bool same_plan(TimerPlan left, TimerPlan right)
{
    /** The public preservation guarantee concerns values, not padding bytes. **/
    return left.requested.sourceHz == right.requested.sourceHz &&
        left.requested.prescaler == right.requested.prescaler &&
        left.requested.autoReload == right.requested.autoReload &&
        left.requested.dutyBp == right.requested.dutyBp && left.compare == right.compare &&
        left.divisor == right.divisor && left.errorNum == right.errorNum && left.errorDen == right.errorDen;
}

/**
 * @brief Compare all named fields of initialized finite traces.
 * @param[in] left First trace.
 * @param[in] right Second trace.
 * @return True on complete named-field equality.
 */
static bool same_trace(TimerTrace left, TimerTrace right)
{
    /** No memcmp over indeterminate structure padding is needed. **/
    return same_plan(left.active, right.active) && same_plan(left.preload, right.preload) &&
        left.phase == right.phase && left.counter == right.counter && left.terminal == right.terminal;
}

/**
 * @brief Check hand-derived standard, quantized and widest divisor results.
 * @param[in] None.
 * @return True on every literal result.
 */
static bool test_plans(void)
{
    TimerRequest request = {84000000U, 83U, 999U, 2500U};
    TimerPlan plan;
    const uint32_t duty[] = {5000U, 1000U, 9000U};
    const uint32_t compare[] = {2U, 0U, 3U};
    const int64_t error[] = {5000, -3000, 3000};
    size_t index;

    /** N3 makes a tie and two endpoint-rounding effects visible without floats. **/
    if (timer_plan(&request, &plan) != TIMER_OK || plan.compare != 250U || plan.divisor != 84000U ||
        plan.errorNum != 0 || plan.errorDen != 10000000U) {
        return false;
    }
    request.prescaler = 0U;
    request.autoReload = 2U;
    for (index = 0U; index < 3U; index++) {
        request.dutyBp = duty[index];
        if (timer_plan(&request, &plan) != TIMER_OK || plan.compare != compare[index] ||
            plan.errorNum != error[index] || plan.errorDen != 30000U) {
            return false;
        }
    }
    request.prescaler = 65535U;
    request.autoReload = 65535U;
    request.dutyBp = 0U;
    if (timer_plan(&request, &plan) != TIMER_OK || plan.divisor != UINT64_C(4294967296) ||
        plan.compare != 0U) {
        return false;
    }
    request.autoReload = 65534U;
    request.dutyBp = 10000U;
    if (timer_plan(&request, &plan) != TIMER_OK || plan.compare != 65535U || plan.errorNum != 0) {
        return false;
    }
    request.autoReload = 1U;
    request.dutyBp = 5000U;
    return timer_plan(&request, &plan) == TIMER_OK && plan.compare == 1U;
}

/**
 * @brief Reject independent out-of-domain requests without accepted-output loss.
 * @param[in] None.
 * @return True if every invalid request preserves every named plan field.
 */
static bool test_rejection(void)
{
    const TimerRequest bad[] = {
        {0U, 83U, 999U, 2500U}, {84000001U, 83U, 999U, 2500U},
        {84000000U, 65536U, 999U, 2500U}, {84000000U, 83U, 0U, 2500U},
        {84000000U, 83U, 65536U, 2500U}, {84000000U, 83U, 999U, 10001U},
        {84000000U, 83U, 65535U, 10000U}
    };
    const TimerRequest seed = {84000000U, 83U, 999U, 2500U};
    TimerPlan plan;
    TimerPlan before;
    size_t index;

    /** Full duty at maximum ARR is unencodable, not an arithmetic overflow. **/
    if (timer_plan(&seed, &plan) != TIMER_OK) {
        return false;
    }
    before = plan;
    for (index = 0U; index < 7U; index++) {
        TimerStatus expected = index == 6U ? TIMER_NOT_REPRESENTABLE : TIMER_INVALID_ARGUMENT;
        if (timer_plan(&bad[index], &plan) != expected || !same_plan(plan, before)) {
            return false;
        }
    }
    return timer_plan(NULL, &plan) == TIMER_INVALID_ARGUMENT && same_plan(plan, before) &&
        timer_plan(&seed, NULL) == TIMER_INVALID_ARGUMENT;
}

/**
 * @brief Check finite hold/transfer/terminal and invalid metadata preservation.
 * @param[in] None.
 * @return True on independently declared event and active/preload fixtures.
 */
static bool test_trace(void)
{
    TimerTrace trace;
    TimerTrace before;
    TimerEvent event = TIMER_OVERFLOW_FINISH;
    const TimerRequest pending = {84000000U, 167U, 499U, 5000U};
    const TimerRequest invalid = {84000000U, 167U, 0U, 5000U};
    uint32_t index;

    /** Four events are host policy, not measured timer transitions. **/
    if (timer_begin(&trace) != TIMER_OK || timer_stage(&trace, &pending) != TIMER_OK) {
        return false;
    }
    before = trace;
    if (timer_stage(&trace, &invalid) != TIMER_INVALID_ARGUMENT || !same_trace(trace, before)) {
        return false;
    }
    for (index = 0U; index < 4U; index++) {
        if (timer_step(&trace, &event) != TIMER_OK || (uint32_t)event != index ||
            trace.active.requested.prescaler != (index < 2U ? 83U : 167U) ||
            trace.active.requested.autoReload != (index < 2U ? 999U : 499U) ||
            trace.counter != (index == 0U ? 500U : 0U)) {
            return false;
        }
    }
    before = trace;
    if (!trace.terminal || timer_step(&trace, &event) != TIMER_DONE ||
        event != TIMER_OVERFLOW_FINISH || !same_trace(trace, before)) {
        return false;
    }
    trace.phase = 5U;
    before = trace;
    return timer_step(&trace, &event) == TIMER_BAD_STATE && same_trace(trace, before) &&
        timer_stage(&trace, &pending) == TIMER_BAD_STATE && same_trace(trace, before) &&
        timer_begin(NULL) == TIMER_INVALID_ARGUMENT && timer_step(NULL, &event) == TIMER_INVALID_ARGUMENT &&
        timer_step(&trace, NULL) == TIMER_INVALID_ARGUMENT && timer_stage(NULL, &pending) == TIMER_INVALID_ARGUMENT;
}

/**
 * @brief Execute optional host tests with active errors under NDEBUG.
 * @param[in] None.
 * @return Zero only after all checks and standard output succeed.
 */
int main(void)
{
    /** Reusable compilation excludes this main and all host test helpers. **/
    if (!test_plans() || !test_rejection() || !test_trace()) {
        return 1;
    }
    if (puts("PASS timer: literal PWM, wide bounds, rejection, finite preload trace") < 0 ||
        fflush(stdout) != 0) {
        return 1;
    }
    return 0;
}
#endif
