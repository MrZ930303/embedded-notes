/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file timer.h
 * @author embedded-notes contributors
 * @brief F407 TIM3 qualified arithmetic and finite host preload model.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_TIMER_H
#define EMBEDDED_NOTES_TIMER_H
#include <stdbool.h>
#include <stdint.h>

#if !defined(UINT32_MAX) || !defined(UINT64_MAX) || !defined(INT64_MAX)
#error Exact-width uint32_t, uint64_t and int64_t are required.
#endif

typedef enum {
    TIMER_OK = 0,
    TIMER_INVALID_ARGUMENT,
    TIMER_NOT_REPRESENTABLE,
    TIMER_BAD_STATE,
    TIMER_DONE
} TimerStatus;

typedef struct {
    uint32_t sourceHz;
    uint32_t prescaler;
    uint32_t autoReload;
    uint32_t dutyBp;
} TimerRequest;

typedef struct {
    TimerRequest requested;
    uint32_t compare;
    uint64_t divisor;
    int64_t errorNum;
    uint64_t errorDen;
} TimerPlan;

typedef enum {
    TIMER_PRELOAD_WAIT = 0,
    TIMER_UDIS_UG_HOLD,
    TIMER_URS_UG_TRANSFER,
    TIMER_OVERFLOW_FINISH
} TimerEvent;

typedef struct {
    TimerPlan active;
    TimerPlan preload;
    uint32_t phase;
    uint32_t counter;
    bool terminal;
} TimerTrace;

/*
 * Selected arithmetic only: STM32F407VG TIM3, 16-bit PSC/ARR/CCR, internal
 * edge-up PWM1, active-high OCxREF. Supplied nominal source 1..84000000 Hz
 * presupposes a separately qualified clock plan. PSC 0..65535, ARR 1..65535;
 * ARR0 blocks the selected counter. Duty 0..10000 basis points, nearest/ties-up.
 * Every result is nominal: counter frequency source/(PSC+1), PWM frequency
 * source/divisor, achieved duty compare/(ARR+1), signed duty error errorNum/errorDen.
 * An unencodable compare 65536 is rejected, never clamped and called 100%.
 *
 * Pointers name real, live, correctly typed, initialized inputs and writable
 * independent outputs. All objects in one call are disjoint. begin may receive
 * fresh storage; stage/step require initialized trace metadata. Failure preserves
 * every named field/output. NULL checks do not validate arbitrary pointer values.
 * Single-context exclusive ownership, non-reentrant, fixed storage/constant work.
 * No MMIO, heap, recursion, I/O, callback, busy wait or hardware timing guarantee.
 *
 * The trace stores a complete preload/active tuple as a teaching policy. It
 * does not prove physically atomic register writes/transfers. Four events are
 * finite: preload wait; UDIS1+UG holds shadows while resetting counter; UDIS0,
 * URS1+UG transfers without update IRQ/DMA request; overflow permits that request
 * source and terminates. No actual request, interrupt or waveform is generated.
 */

/**
 * @brief Validate and derive one selected timer plan before output mutation.
 * @param[in] request Initialized complete request within the documented domain.
 * @param[out] plan Writable independent output; unchanged on rejection.
 * @return TIMER_OK, TIMER_INVALID_ARGUMENT or TIMER_NOT_REPRESENTABLE.
 */
TimerStatus timer_plan(const TimerRequest *request, TimerPlan *plan);

/**
 * @brief Initialize a finite trace at84MHz/PSC83/ARR999/CCR250, CNT500.
 * @param[out] trace Real writable object, no prior initialization required.
 * @return TIMER_OK or TIMER_INVALID_ARGUMENT.
 */
TimerStatus timer_begin(TimerTrace *trace);

/**
 * @brief Replace the complete preload plan only before the first trace step.
 * @param[in,out] trace Begun valid phase0 trace, independent from request.
 * @param[in] request Proposed complete plan; validation precedes all mutation.
 * @return TIMER_OK, TIMER_INVALID_ARGUMENT, TIMER_NOT_REPRESENTABLE or TIMER_BAD_STATE.
 */
TimerStatus timer_stage(TimerTrace *trace, const TimerRequest *request);

/**
 * @brief Advance exactly one of four host events; terminal calls preserve outputs.
 * @param[in,out] trace Begun valid state, disjoint from event.
 * @param[out] event Writable event output, unchanged on rejection or TIMER_DONE.
 * @return TIMER_OK, TIMER_INVALID_ARGUMENT, TIMER_BAD_STATE or TIMER_DONE.
 */
TimerStatus timer_step(TimerTrace *trace, TimerEvent *event);
#endif
