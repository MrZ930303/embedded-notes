/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file terminal.h
 * @author embedded-notes contributors
 * @brief Actual UART plus recovery application status composition.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_RECOVERY_TERMINAL_H
#define EMBEDDED_NOTES_RECOVERY_TERMINAL_H
#include "recovery.h"
#include "../uart-framing/uart.h"
typedef struct {
    UartState uart;
    RecoveryState job;
} RecoveryTerminal;
typedef struct {
    uint16_t periodMs;
    RecoverySnapshot job;
} RecoveryStatusResponse;
typedef struct {
    UartStatus uartStatus;
    RecoveryCall jobStatus;
    bool uartReportValid;
    bool jobReportValid;
    UartReport uart;
    RecoveryReport job;
    bool responsePresent;
} RecoveryTurnReport;

/* Value-only C11 host model; no hardware, callbacks, heap, recursion or waits.
 * Single exclusive non-reentrant context. All nonnull pointers name real live
 * correctly typed objects. Outputs are writable and disjoint from every other
 * call object, including nested members. Ordinary callers never edit metadata
 * or copy a live owner into another executable owner. Named checks cannot detect
 * forged pointers, dishonest extents, overlap or arbitrary memory corruption.
 * Fresh init requires fresh storage AND a fresh token domain without outstanding
 * operations/events. It never authorizes overwriting a live quarantine. Later
 * calls require initialized consistent objects. Rejections preserve every named
 * state/output field. Backend failures are valid OK transitions with typed cause.
 * 1 tick=1ms; true forward observation gaps <2^31 ticks are a caller promise.
 * Observed delta>=2^31 rejects before mutation; equal observations are valid;
 * unseen whole wraps cannot be detected. Scheduling/time progress is required.
 * Admission copies values with zero actions. Service <=1 port action and <=1 ADC
 * lifecycle call. Cancel accepted retains ownership; separate matching cleanup
 * releases. Quarantine halts all actions and rejects submit/reset with LOCKED.
 * Only report.resultPresent permits consuming the separate new result; otherwise
 * that output remains unchanged. Snapshot committed is explicitly historical.
 * Token domain 1..UINT32_MAX never wraps/reuses, including across checked reset.
 * backend/report phase is serviced work; backend/ADC state phase is next work.
 * Terminal ages freeze. status is action-free and does not advance observations.
 */
/* Supply at most four receive calls between turns. A turn polls UART once,
 * then manager once. Independent component rejections do not roll back work
 * already completed by the other component. Only responsePresent permits reading
 * the response output: an application copy, not a transmitted wire packet. */
/**
 * @brief Checked terminal composition under the contracts above.
 * @param[in,out] Named disjoint real initialized objects; init requires fresh storage.
 * @return Typed status; turn captures independent component statuses.
 */
RecoveryCall recovery_terminal_init(RecoveryTerminal *terminal, const RecoveryConfig *config,
    uint16_t initialPeriod, uint32_t now);
/**
 * @brief Checked terminal composition under the contracts above.
 * @param[in,out] Named disjoint real initialized objects; init requires fresh storage.
 * @return Typed status; turn captures independent component statuses.
 */
UartStatus recovery_terminal_receive(RecoveryTerminal *terminal, uint16_t byte, UartIngress *report);
/**
 * @brief Checked terminal composition under the contracts above.
 * @param[in,out] Named disjoint real initialized objects; init requires fresh storage.
 * @return Typed status; turn captures independent component statuses.
 */
RecoveryCall recovery_terminal_turn(RecoveryTerminal *terminal, uint32_t now,
    const RecoveryInput *input, RecoveryTurnReport *report, RecoveryValue *result,
    RecoveryStatusResponse *response);

#endif
