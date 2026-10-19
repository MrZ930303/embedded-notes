/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file recovery.h
 * @author embedded-notes contributors
 * @brief Fixed-domain recovery manager, diagnostics and optional trace.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_RECOVERY_H
#define EMBEDDED_NOTES_RECOVERY_H
#include "../adc-sampling/adc.h"
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

#define RECOVERY_MAX_ATTEMPTS 3U
#define RECOVERY_ATTEMPT_MS 20U
#define RECOVERY_RETRY_MS 5U
#define RECOVERY_TOTAL_MS 100U
#define RECOVERY_CANCEL_MS 20U
#define RECOVERY_EVENT_CAPACITY 3U
#define RECOVERY_TRACE_CAPACITY 32U
#define RECOVERY_FAKE_MAX_VALUE UINT32_C(1000000)

typedef uint32_t RecoveryToken; /* 1..UINT32_MAX; zero means no token. */
typedef enum {
    RECOVERY_OK = 0, RECOVERY_INVALID_ARGUMENT, RECOVERY_BAD_STATE,
    RECOVERY_BUSY, RECOVERY_TIME_REJECTED, RECOVERY_TOKEN_EXHAUSTED, RECOVERY_LOCKED
} RecoveryCall;
typedef enum { RECOVERY_BACKEND_FAKE = 0, RECOVERY_BACKEND_ADC } RecoveryBackendKind;
typedef enum {
    RECOVERY_READ = 0, RECOVERY_ASSIGN, RECOVERY_INCREMENT, RECOVERY_SAMPLE
} RecoveryOperation;
typedef enum {
    RECOVERY_IDLE = 0, RECOVERY_START_DUE, RECOVERY_ACTIVE, RECOVERY_CANCEL_DUE,
    RECOVERY_CANCELLING, RECOVERY_RETRY_WAIT, RECOVERY_TERMINAL
} RecoveryPhase;
typedef enum {
    RECOVERY_CATEGORY_IDLE = 0, RECOVERY_CATEGORY_PENDING, RECOVERY_CATEGORY_READY,
    RECOVERY_CATEGORY_FAILED, RECOVERY_CATEGORY_QUARANTINED
} RecoveryCategory;
typedef enum {
    RECOVERY_REASON_NONE = 0, RECOVERY_REASON_SUCCEEDED, RECOVERY_REASON_ATTEMPTS_EXHAUSTED,
    RECOVERY_REASON_TOTAL_TIMEOUT, RECOVERY_REASON_CANCEL_TIMEOUT, RECOVERY_REASON_UNSAFE_EFFECT,
    RECOVERY_REASON_NOT_REPLAYABLE, RECOVERY_REASON_PERMANENT_ERROR, RECOVERY_REASON_TOKEN_EXHAUSTED,
    RECOVERY_REASON_CONTRACT_FAULT
} RecoveryReason;
typedef enum { RECOVERY_RELEASED = 0, RECOVERY_OWNED, RECOVERY_UNCONFIRMED } RecoveryResource;
typedef enum {
    RECOVERY_CLEANUP_NOT_REQUIRED = 0, RECOVERY_CLEANUP_REQUIRED,
    RECOVERY_CLEANUP_REQUESTED, RECOVERY_CLEANUP_CONFIRMED
} RecoveryCleanup;
typedef enum {
    RECOVERY_CAUSE_NONE = 0, RECOVERY_CAUSE_ATTEMPT_TIMEOUT, RECOVERY_CAUSE_NACK,
    RECOVERY_CAUSE_ARBITRATION_LOST, RECOVERY_CAUSE_OVERRUN, RECOVERY_CAUSE_PERMANENT,
    RECOVERY_CAUSE_LOST_REPLY, RECOVERY_CAUSE_ADC_BACKEND, RECOVERY_CAUSE_ADC_TIMEOUT,
    RECOVERY_CAUSE_CONTRACT_FAULT
} RecoveryCause;
typedef enum {
    RECOVERY_BACKEND_IDLE = 0, RECOVERY_BACKEND_START, RECOVERY_BACKEND_FAKE_EXECUTE,
    RECOVERY_BACKEND_ADC_ACQUIRE, RECOVERY_BACKEND_ADC_CONVERT, RECOVERY_BACKEND_ADC_RESULT,
    RECOVERY_BACKEND_CANCEL_REQUEST, RECOVERY_BACKEND_CANCEL_POLL
} RecoveryBackendPhase;
typedef enum {
    RECOVERY_INPUT_NONE = 0, RECOVERY_INPUT_WAIT, RECOVERY_INPUT_READY, RECOVERY_INPUT_FAIL,
    RECOVERY_INPUT_COMMIT_LOST_REPLY, RECOVERY_INPUT_CLEANUP_DONE, RECOVERY_INPUT_ADC_ADVANCE
} RecoveryInputKind;
typedef enum {
    RECOVERY_PORT_PENDING = 0, RECOVERY_PORT_READY, RECOVERY_PORT_FAILED,
    RECOVERY_PORT_CANCEL_ACCEPTED, RECOVERY_PORT_CLEANUP_CONFIRMED, RECOVERY_PORT_STALE
} RecoveryPortStatus;
typedef enum { RECOVERY_VALUE_NONE = 0, RECOVERY_VALUE_FAKE, RECOVERY_VALUE_SAMPLE } RecoveryValueKind;
typedef enum {
    RECOVERY_EVENT_STARTED = 0, RECOVERY_EVENT_POLLED, RECOVERY_EVENT_CANCEL_REQUESTED,
    RECOVERY_EVENT_CANCEL_POLLED, RECOVERY_EVENT_STALE, RECOVERY_EVENT_ATTEMPT_DEADLINE,
    RECOVERY_EVENT_TOTAL_DEADLINE, RECOVERY_EVENT_CANCEL_DEADLINE, RECOVERY_EVENT_CLEANUP,
    RECOVERY_EVENT_RETRY_WAIT, RECOVERY_EVENT_COMMITTED, RECOVERY_EVENT_TERMINAL,
    RECOVERY_EVENT_TOKEN_EXHAUSTED
} RecoveryEvent;

typedef struct {
    RecoveryOperation operation;
    uint32_t value;
    AdcRequest adc;
} RecoveryRequest;
typedef struct {
    RecoveryBackendKind backend;
    RecoveryToken firstToken;
    uint32_t diagnosticSeed;
    uint32_t fakeRegister;
    uint32_t fakeCounter;
} RecoveryConfig;
typedef struct {
    RecoveryInputKind kind;
    RecoveryToken token;
    RecoveryCause cause;
} RecoveryInput;
typedef struct {
    RecoveryValueKind kind;
    uint32_t fakeValue;
    uint16_t sample;
} RecoveryValue;
typedef struct {
    bool present;
    RecoveryCause cause;
    RecoveryBackendPhase phase;
    AdcStatus adcStatus;
    AdcPhase adcPhase;
    RecoveryToken token;
    uint32_t attempt;
    uint32_t jobAgeMs;
    uint32_t attemptAgeMs;
    bool sideEffectUncertain;
} RecoveryFailure;
typedef struct {
    uint32_t acceptedJobs;
    uint32_t issuedAttempts;
    uint32_t serviceCalls;
    uint32_t backendActions;
    uint32_t staleEvents;
    uint32_t completedJobs;
    uint32_t quarantines;
    bool saturated;
} RecoveryDiagnostics;
typedef struct {
    RecoveryPortStatus status;
    RecoveryToken token;
    RecoveryBackendPhase phase;
    RecoveryCause cause;
    AdcStatus adcStatus;
    AdcPhase adcPhase;
    RecoveryResource resource;
    bool localReleased;
    bool sideEffectUncertain;
    bool valuePresent;
    RecoveryValue value;
} RecoveryBackendReport;
typedef struct {
    RecoveryBackendKind kind;
    RecoveryRequest request;
    RecoveryToken token;
    RecoveryBackendPhase phase;
    uint32_t lastObserved;
    bool requestOwned;
    bool cancelAccepted;
    bool localReleased;
    bool effectApplied;
    uint32_t fakeRegister;
    uint32_t fakeCounter;
    AdcStatus lastAdcStatus;
    AdcPhase lastAdcPhase;
    AdcState adc;
} RecoveryBackend;
typedef struct {
    RecoveryPhase phase;
    RecoveryCategory category;
    RecoveryReason reason;
    RecoveryToken token;
    uint32_t attempt;
    uint32_t jobAgeMs;
    uint32_t attemptAgeMs;
    uint32_t cancelAgeMs;
    uint32_t waitAgeMs;
    RecoveryResource resource;
    RecoveryCleanup cleanup;
    bool sideEffectUncertain;
    RecoveryFailure firstFailure;
    RecoveryFailure lastFailure;
    bool hasCommitted;
    RecoveryValue committed;
    RecoveryDiagnostics diagnostics;
} RecoverySnapshot;
typedef struct {
    RecoverySnapshot snapshot;
    size_t backendActions; /* 0..1, includes fact-only cancel-poll. */
    size_t producerCalls; /* 0..1 lifecycle-changing adc_* calls. */
    bool inputConsumed;
    size_t eventCount; /* 0..3; unused slots deterministic zero. */
    RecoveryEvent events[RECOVERY_EVENT_CAPACITY];
    bool resultPresent; /* Fresh this call only. */
} RecoveryReport;
typedef struct {
    RecoveryBackend backend;
    RecoveryRequest request;
    RecoverySnapshot snapshot;
    RecoveryReason afterCleanup;
    RecoveryToken nextToken;
    bool tokenExhausted;
    uint32_t lastObserved;
} RecoveryState;
typedef struct {
    RecoveryReport rows[RECOVERY_TRACE_CAPACITY];
    size_t count;
    uint32_t dropped;
    bool saturated;
} RecoveryTrace;
typedef enum { RECOVERY_TRACE_STORED = 0, RECOVERY_TRACE_DROPPED } RecoveryTraceResult;

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
/**
 * @brief recovery_init: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_init(RecoveryState *state, const RecoveryConfig *config, uint32_t now);

/**
 * @brief recovery_submit: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_submit(RecoveryState *state, const RecoveryRequest *request, uint32_t now);

/**
 * @brief recovery_service: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_service(RecoveryState *state, uint32_t now, const RecoveryInput *input,
    RecoveryReport *report, RecoveryValue *result);

/**
 * @brief recovery_status: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_status(const RecoveryState *state, RecoverySnapshot *snapshot);

/**
 * @brief recovery_reset: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_reset(RecoveryState *state);

/**
 * @brief recovery_trace_init: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_trace_init(RecoveryTrace *trace, uint32_t droppedSeed);

/**
 * @brief recovery_trace_append: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_trace_append(RecoveryTrace *trace, const RecoveryReport *report,
    RecoveryTraceResult *result);

#endif
