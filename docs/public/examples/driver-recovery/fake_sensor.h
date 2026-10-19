/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file fake_sensor.h
 * @author embedded-notes contributors
 * @brief Closed FAKE / actual ADC backend port; no callback injection.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_FAKE_SENSOR_H
#define EMBEDDED_NOTES_FAKE_SENSOR_H
#include "recovery.h"
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
/* Direct backend tests use a separate fresh fixture, never a manager-owned port.
 * Each call is one port action even when it only reports a saved local-release
 * fact. Start requires a strictly greater token after release and starts a new
 * time domain. Poll/cancel calls check time; stale events make zero ADC calls.
 * Fake seeds/value 0..1000000; ADC configuration requires zero fake seeds.
 * FAKE READ/INCREMENT value=0; fake ADC fields all zero. ADC accepts only SAMPLE
 * validated by actual adc_plan/adc_quantize. NONE token0/causeNONE maps to WAIT.
 * Other input tokens positive; only FAIL supplies the mode-appropriate cause.
 */
/**
 * @brief recovery_backend_init: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_backend_init(RecoveryBackend *backend, const RecoveryConfig *config, uint32_t now);

/**
 * @brief recovery_backend_start: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_backend_start(RecoveryBackend *backend, const RecoveryRequest *request,
    RecoveryToken token, uint32_t now, RecoveryBackendReport *report);

/**
 * @brief recovery_backend_poll: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_backend_poll(RecoveryBackend *backend, uint32_t now,
    const RecoveryInput *input, RecoveryBackendReport *report);

/**
 * @brief recovery_backend_cancel_request: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_backend_cancel_request(RecoveryBackend *backend, RecoveryToken token,
    uint32_t now, RecoveryBackendReport *report);

/**
 * @brief recovery_backend_cancel_poll: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_backend_cancel_poll(RecoveryBackend *backend, uint32_t now,
    const RecoveryInput *input, RecoveryBackendReport *report);

#endif
