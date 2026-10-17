/******************************************************************************
 * Original embedded-notes teaching project, 2026. No third-party authorship claimed.
 * @file clock_plan.h
 * @author embedded-notes project
 * @brief Nominal F407 teaching subdomain and finite fake clock switch; no MMIO.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef CLOCK_PLAN_H
#define CLOCK_PLAN_H
#include <stdint.h>

typedef enum {
    CLOCK_OK, CLOCK_INVALID, CLOCK_OVERFLOW, CLOCK_POLICY, CLOCK_DEVICE,
    CLOCK_FLASH, CLOCK_INEXACT, CLOCK_RANGE, CLOCK_NO_EVENT, CLOCK_DONE,
    CLOCK_TIMEOUT_HSE, CLOCK_TIMEOUT_PLL, CLOCK_TIMEOUT_SWITCH,
    CLOCK_READBACK, CLOCK_TIMEOUT_VOS, CLOCK_TIMEOUT_OFF
} ClockStatus;
typedef enum { CLOCK_HSI, CLOCK_CRYSTAL, CLOCK_BYPASS } ClockSource;
typedef struct { uint64_t num; uint64_t den; } ClockRatio;
typedef struct {
    uint64_t hz;
    uint32_t m, n, p, q, ahb, apb1, apb2, mv, scale, ws, q48;
    ClockSource mode;
} ClockRequest;
typedef struct {
    ClockRatio input, vco, sys, hclk, pclk1, pclk2, timer1, timer2, q;
    uint32_t minimumWs;
} ClockPlan;
typedef struct { uint32_t count, load; ClockRatio achieved; } ClockTick;
typedef struct {
    uint32_t divisor, mantissa, fraction, brr;
    ClockRatio achieved;
    int64_t errorNum;
    uint64_t errorDen;
} ClockUart;
typedef enum {
    CLOCK_FAULT_NONE, CLOCK_FAULT_HSE, CLOCK_FAULT_PLL, CLOCK_FAULT_SWITCH,
    CLOCK_FAULT_READBACK, CLOCK_FAULT_VOS, CLOCK_FAULT_OFF
} ClockFault;
typedef struct {
    uint32_t phase, attempt, limit, steps, down, terminal;
    uint32_t hclk, scale, ws, apb1, apb2, pllOn, plli2sOn, hseOn;
    ClockStatus status;
    ClockFault fault;
    const char *event;
    const char *source;
} ClockSwitch;

/* All non-NULL pointers must refer to live objects of the declared type.
 * Calculate inputs must be initialized; outputs are complete writable storage.
 * Step requires state established by begin; begin does not read old storage.
 * Writable outputs must not overlap inputs. Single context, non-reentrant.
 * No arbitrary/dangling pointer or dishonest object extent can be validated.
 * Calculate calls commit only on CLOCK_OK; otherwise output fields are preserved.
 * Policy: 2.7..3.6 V, input 1..2 MHz, N192..432, VCO192..432 MHz;
 * this conservative shared-evidence subdomain is narrower than DS Rev12/HAL.
 */
/** @brief Validate nominal plan. @param[in] request Live input. @param[out] output Live output. @return Status. */
ClockStatus clock_plan(const ClockRequest *request, ClockPlan *output);
/**
 * @brief Exact periodic SysTick; count1 returns NO_EVENT.
 * @param[in] source Frequency ratio, rateHz >0.
 * @param[out] output Live output.
 * @return Status.
 */
ClockStatus clock_tick(ClockRatio source, uint32_t rateHz, ClockTick *output);
/**
 * @brief OVER8=0 nearest divisor, ties upward.
 * @param[in] clockHz Bus Hz, baud >0.
 * @param[out] output Live output.
 * @return Status.
 */
ClockStatus clock_uart(uint32_t clockHz, uint32_t baud, ClockUart *output);
/**
 * @brief Initialize fixed up16->168 or down168->84 fake fixture.
 * @param[in] down 0/1, fault, limit1..3.
 * @param[out] output Live storage.
 * @return Status.
 */
ClockStatus clock_switch_begin(uint32_t down, ClockFault fault, uint32_t limit, ClockSwitch *output);
/**
 * @brief Execute one bounded fake request/observation.
 * @param[in,out] state Previously begun state.
 * @return Status; DONE does not advance.
 */
ClockStatus clock_switch_step(ClockSwitch *state);
/** @brief Stable status name. @param[in] status Any enum value. @return Static string. */
const char *clock_status_name(ClockStatus status);
#endif
