/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file recovery.c
 * @author embedded-notes contributors
 * @brief Closed bounded host recovery; no hardware operation.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "recovery.h"
#include "fake_sensor.h"
#include "../timer-pwm/time.h"

/**
 * @brief valid config: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_config(const RecoveryConfig *config)
{
    /** Respect the finite domain before dispatch or state publication. **/
    return config != NULL && config->backend >= RECOVERY_BACKEND_FAKE &&
        config->backend <= RECOVERY_BACKEND_ADC && config->firstToken != 0U &&
        config->fakeRegister <= RECOVERY_FAKE_MAX_VALUE && config->fakeCounter <= RECOVERY_FAKE_MAX_VALUE &&
        (config->backend != RECOVERY_BACKEND_ADC || (config->fakeRegister == 0U && config->fakeCounter == 0U));
}
/**
 * @brief valid request: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_request(RecoveryBackendKind kind, const RecoveryRequest *request)
{
    /** Respect the finite domain before dispatch or state publication. **/
    AdcPlan plan;
    uint16_t code;
    if (request == NULL || request->operation < RECOVERY_READ || request->operation > RECOVERY_SAMPLE) {
        return false;
    }
    if (kind == RECOVERY_BACKEND_ADC) {
        return request->operation == RECOVERY_SAMPLE && request->value == 0U &&
            adc_plan(&request->adc, &plan) == ADC_OK && adc_quantize(&request->adc, &code) == ADC_OK;
    }
    return request->operation != RECOVERY_SAMPLE &&
        (request->operation == RECOVERY_ASSIGN ? request->value <= RECOVERY_FAKE_MAX_VALUE : request->value == 0U) &&
        request->adc.bits == 0U && request->adc.sampleCycles == 0U && request->adc.divider == 0U &&
        request->adc.referenceUv == 0U && request->adc.inputUv == 0U;
}
/**
 * @brief valid input: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_input(RecoveryBackendKind kind, RecoveryOperation operation, const RecoveryInput *input)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (input == NULL || input->kind < RECOVERY_INPUT_NONE || input->kind > RECOVERY_INPUT_ADC_ADVANCE) {
        return false;
    }
    if (input->kind == RECOVERY_INPUT_NONE) {
        return input->token == 0U && input->cause == RECOVERY_CAUSE_NONE;
    }
    if (input->token == 0U) {
        return false;
    }
    if (input->kind == RECOVERY_INPUT_FAIL) {
        return kind == RECOVERY_BACKEND_ADC ? input->cause == RECOVERY_CAUSE_ADC_BACKEND :
            (input->cause >= RECOVERY_CAUSE_NACK && input->cause <= RECOVERY_CAUSE_LOST_REPLY);
    }
    if (input->cause != RECOVERY_CAUSE_NONE) {
        return false;
    }
    if (kind == RECOVERY_BACKEND_ADC) {
        return input->kind == RECOVERY_INPUT_WAIT || input->kind == RECOVERY_INPUT_ADC_ADVANCE;
    }
    return input->kind != RECOVERY_INPUT_ADC_ADVANCE &&
        (input->kind != RECOVERY_INPUT_COMMIT_LOST_REPLY ||
            operation == RECOVERY_ASSIGN || operation == RECOVERY_INCREMENT);
}
/**
 * @brief valid backend: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_backend(const RecoveryBackend *backend)
{
    /** Respect the finite domain before dispatch or state publication. **/
    AdcPlan plan;
    bool active;
    if (backend->kind < RECOVERY_BACKEND_FAKE || backend->kind > RECOVERY_BACKEND_ADC ||
        backend->phase < RECOVERY_BACKEND_IDLE || backend->phase > RECOVERY_BACKEND_CANCEL_POLL ||
        backend->fakeRegister > RECOVERY_FAKE_MAX_VALUE || backend->fakeCounter > RECOVERY_FAKE_MAX_VALUE ||
        backend->lastAdcStatus < ADC_OK || backend->lastAdcStatus > ADC_CANCELLED ||
        backend->lastAdcPhase < ADC_IDLE || backend->lastAdcPhase > ADC_TERMINAL ||
        (backend->requestOwned && backend->token == 0U) ||
        (backend->cancelAccepted && !backend->requestOwned) ||
        !valid_request(backend->kind, &backend->request)) {
        return false;
    }
    active = backend->adc.phase >= ADC_ACQUIRE && backend->adc.phase <= ADC_RESULT;
    if ((backend->kind == RECOVERY_BACKEND_FAKE && active) ||
        (backend->cancelAccepted && backend->phase != RECOVERY_BACKEND_CANCEL_POLL)) {
        return false;
    }
    return backend->adc.phase >= ADC_IDLE && backend->adc.phase <= ADC_TERMINAL &&
        backend->adc.status >= ADC_OK && backend->adc.status <= ADC_CANCELLED &&
        backend->adc.active == active && (!active || backend->adc.status == ADC_PENDING) &&
        backend->adc.elapsedMs <= ADC_DEADLINE_MS && backend->adc.committed <= 4095U &&
        adc_plan(&backend->adc.request, &plan) == ADC_OK &&
        backend->adc.candidate < (UINT32_C(1) << backend->adc.request.bits);
}

/**
 * @brief increment: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void increment(uint32_t *counter, bool *saturated)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (*counter == UINT32_MAX) {
        *saturated = true;
    } else {
        *counter += 1U;
    }
}
/**
 * @brief valid failure: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_failure(const RecoveryFailure *failure)
{
    /** Respect the finite domain before dispatch or state publication. **/
    return failure->cause >= RECOVERY_CAUSE_NONE && failure->cause <= RECOVERY_CAUSE_CONTRACT_FAULT &&
        failure->phase >= RECOVERY_BACKEND_IDLE && failure->phase <= RECOVERY_BACKEND_CANCEL_POLL &&
        failure->adcStatus >= ADC_OK && failure->adcStatus <= ADC_CANCELLED &&
        failure->adcPhase >= ADC_IDLE && failure->adcPhase <= ADC_TERMINAL && failure->attempt <= 3U &&
        (!failure->present || (failure->cause != RECOVERY_CAUSE_NONE && failure->token != 0U));
}
/**
 * @brief valid state: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_state(const RecoveryState *state)
{
    /** Respect the finite domain before dispatch or state publication. **/
    const RecoverySnapshot *s = &state->snapshot;
    bool ownedPhase = s->phase == RECOVERY_ACTIVE || s->phase == RECOVERY_CANCEL_DUE ||
        s->phase == RECOVERY_CANCELLING || s->category == RECOVERY_CATEGORY_QUARANTINED;
    if (s->category != RECOVERY_CATEGORY_QUARANTINED && state->backend.kind == RECOVERY_BACKEND_ADC &&
        state->backend.requestOwned && state->backend.localReleased == state->backend.adc.active) {
        return false;
    }
    if (s->phase > RECOVERY_IDLE && s->phase < RECOVERY_TERMINAL &&
        (s->category != RECOVERY_CATEGORY_PENDING || s->reason != RECOVERY_REASON_NONE || s->jobAgeMs >= 100U)) {
        return false;
    }
    if ((s->phase == RECOVERY_ACTIVE && (s->attemptAgeMs >= 20U || s->attempt == 0U ||
            state->backend.cancelAccepted || s->cleanup != RECOVERY_CLEANUP_NOT_REQUIRED)) ||
        (s->phase == RECOVERY_CANCELLING && (s->cancelAgeMs >= 20U ||
            s->cleanup != RECOVERY_CLEANUP_REQUESTED)) ||
        (s->phase == RECOVERY_RETRY_WAIT && (s->waitAgeMs >= 5U || s->attempt >= 3U ||
            s->cleanup != RECOVERY_CLEANUP_CONFIRMED)) ||
        (s->phase == RECOVERY_CANCEL_DUE && (!s->lastFailure.present ||
            s->cleanup != RECOVERY_CLEANUP_REQUIRED)) ||
        (s->phase == RECOVERY_TERMINAL && s->reason == RECOVERY_REASON_NONE) ||
        (s->token != 0U && s->token != state->backend.token) ||
        (!state->tokenExhausted && state->nextToken <= state->backend.token)) {
        return false;
    }
    return valid_backend(&state->backend) && state->nextToken != 0U &&
        (!state->tokenExhausted || state->nextToken == UINT32_MAX) &&
        valid_request(state->backend.kind, &state->request) &&
        s->phase >= RECOVERY_IDLE && s->phase <= RECOVERY_TERMINAL &&
        s->category >= RECOVERY_CATEGORY_IDLE && s->category <= RECOVERY_CATEGORY_QUARANTINED &&
        s->reason >= RECOVERY_REASON_NONE && s->reason <= RECOVERY_REASON_CONTRACT_FAULT &&
        state->afterCleanup >= RECOVERY_REASON_NONE && state->afterCleanup <= RECOVERY_REASON_CONTRACT_FAULT &&
        s->resource >= RECOVERY_RELEASED && s->resource <= RECOVERY_UNCONFIRMED &&
        s->cleanup >= RECOVERY_CLEANUP_NOT_REQUIRED && s->cleanup <= RECOVERY_CLEANUP_CONFIRMED &&
        s->committed.kind >= RECOVERY_VALUE_NONE && s->committed.kind <= RECOVERY_VALUE_SAMPLE &&
        s->committed.fakeValue <= RECOVERY_FAKE_MAX_VALUE && s->committed.sample <= 4095U &&
        s->attempt <= RECOVERY_MAX_ATTEMPTS && ownedPhase == state->backend.requestOwned &&
        (s->resource != RECOVERY_RELEASED) == state->backend.requestOwned &&
        (s->phase != RECOVERY_CANCELLING || state->backend.cancelAccepted) &&
        (s->phase != RECOVERY_IDLE || (s->category == RECOVERY_CATEGORY_IDLE && s->attempt == 0U)) &&
        (s->phase != RECOVERY_TERMINAL || s->category >= RECOVERY_CATEGORY_READY) &&
        valid_failure(&s->firstFailure) && valid_failure(&s->lastFailure);
}
/**
 * @brief recovery init: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_init(RecoveryState *state, const RecoveryConfig *config, uint32_t now)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoveryState next = {0};
    RecoveryCall call;
    if (state == NULL || !valid_config(config)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    call = recovery_backend_init(&next.backend, config, now);
    if (call != RECOVERY_OK) {
        return call;
    }
    next.request = next.backend.request;
    next.nextToken = config->firstToken;
    next.lastObserved = now;
    next.snapshot.diagnostics = (RecoveryDiagnostics){config->diagnosticSeed,config->diagnosticSeed,
        config->diagnosticSeed,config->diagnosticSeed,config->diagnosticSeed,config->diagnosticSeed,
        config->diagnosticSeed,false};
    *state = next;
    return RECOVERY_OK;
}
/**
 * @brief recovery submit: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_submit(RecoveryState *state, const RecoveryRequest *request, uint32_t now)
{
    /** Respect the finite domain before dispatch or state publication. **/
    uint32_t delta;
    if (state == NULL || request == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (!valid_state(state)) {
        return RECOVERY_BAD_STATE;
    }
    if (state->snapshot.category == RECOVERY_CATEGORY_QUARANTINED) {
        return RECOVERY_LOCKED;
    }
    if (state->snapshot.phase != RECOVERY_IDLE) {
        return state->snapshot.phase == RECOVERY_TERMINAL ? RECOVERY_BAD_STATE : RECOVERY_BUSY;
    }
    if (!valid_request(state->backend.kind, request)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (time_elapsed(state->lastObserved, now, &delta) != TIME_OK) {
        return RECOVERY_TIME_REJECTED;
    }
    if (state->tokenExhausted) {
        return RECOVERY_TOKEN_EXHAUSTED;
    }
    state->lastObserved = now;
    state->request = *request;
    state->snapshot.phase = RECOVERY_START_DUE;
    state->snapshot.category = RECOVERY_CATEGORY_PENDING;
    increment(&state->snapshot.diagnostics.acceptedJobs, &state->snapshot.diagnostics.saturated);
    return RECOVERY_OK;
}
/**
 * @brief recovery status: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_status(const RecoveryState *state, RecoverySnapshot *snapshot)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (state == NULL || snapshot == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (!valid_state(state)) {
        return RECOVERY_BAD_STATE;
    }
    *snapshot = state->snapshot;
    return RECOVERY_OK;
}
/**
 * @brief recovery reset: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_reset(RecoveryState *state)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoverySnapshot next = {0};
    if (state == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (!valid_state(state)) {
        return RECOVERY_BAD_STATE;
    }
    if (state->snapshot.category == RECOVERY_CATEGORY_QUARANTINED) {
        return RECOVERY_LOCKED;
    }
    if (state->snapshot.phase != RECOVERY_IDLE && state->snapshot.phase != RECOVERY_TERMINAL) {
        return RECOVERY_BUSY;
    }
    if (state->backend.requestOwned || state->snapshot.resource != RECOVERY_RELEASED) {
        return RECOVERY_BAD_STATE;
    }
    next.hasCommitted = state->snapshot.hasCommitted;
    next.committed = state->snapshot.committed;
    next.diagnostics = state->snapshot.diagnostics;
    state->snapshot = next;
    state->afterCleanup = RECOVERY_REASON_NONE;
    return RECOVERY_OK;
}
/**
 * @brief event add: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void event_add(RecoveryReport *report, RecoveryEvent event)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (report->eventCount < RECOVERY_EVENT_CAPACITY) {
        report->events[report->eventCount] = event;
        report->eventCount += 1U;
    }
    /** Every caller has a proved three-event bound; a fourth never writes memory. **/
}
/**
 * @brief finish: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void finish(RecoveryState *state, RecoveryReason reason, RecoveryReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoverySnapshot *s = &state->snapshot;
    s->phase = RECOVERY_TERMINAL;
    s->reason = reason;
    s->category = reason == RECOVERY_REASON_SUCCEEDED ? RECOVERY_CATEGORY_READY :
        (state->backend.requestOwned ? RECOVERY_CATEGORY_QUARANTINED : RECOVERY_CATEGORY_FAILED);
    if (state->backend.requestOwned) {
        s->resource = RECOVERY_UNCONFIRMED;
        increment(&s->diagnostics.quarantines, &s->diagnostics.saturated);
    } else {
        s->resource = RECOVERY_RELEASED;
    }
    increment(&s->diagnostics.completedJobs, &s->diagnostics.saturated);
    event_add(report, RECOVERY_EVENT_TERMINAL);
}
/**
 * @brief record failure: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void record_failure(RecoveryState *state, RecoveryCause cause, RecoveryBackendPhase phase,
    AdcStatus adcStatus, AdcPhase adcPhase, bool uncertain)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoverySnapshot *s = &state->snapshot;
    RecoveryFailure failure = {true,cause,phase,adcStatus,adcPhase,s->token,s->attempt,
        s->jobAgeMs,s->attemptAgeMs,uncertain};
    if (!s->firstFailure.present) {
        s->firstFailure = failure;
    }
    s->lastFailure = failure;
    s->sideEffectUncertain = s->sideEffectUncertain || uncertain;
    s->phase = RECOVERY_CANCEL_DUE;
    s->cleanup = RECOVERY_CLEANUP_REQUIRED;
}
/**
 * @brief replay reason: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static RecoveryReason replay_reason(const RecoveryState *state)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoveryCause cause = state->snapshot.lastFailure.cause;
    RecoveryOperation op = state->request.operation;
    bool replayable = cause == RECOVERY_CAUSE_ATTEMPT_TIMEOUT ||
        (op == RECOVERY_SAMPLE ? cause == RECOVERY_CAUSE_ADC_BACKEND || cause == RECOVERY_CAUSE_ADC_TIMEOUT :
        cause == RECOVERY_CAUSE_NACK || cause == RECOVERY_CAUSE_OVERRUN || cause == RECOVERY_CAUSE_LOST_REPLY);
    if (op == RECOVERY_INCREMENT) {
        return state->snapshot.sideEffectUncertain ? RECOVERY_REASON_UNSAFE_EFFECT : RECOVERY_REASON_NOT_REPLAYABLE;
    }
    if (!replayable) {
        return RECOVERY_REASON_PERMANENT_ERROR;
    }
    if (state->snapshot.attempt >= RECOVERY_MAX_ATTEMPTS) {
        return RECOVERY_REASON_ATTEMPTS_EXHAUSTED;
    }
    return state->tokenExhausted ? RECOVERY_REASON_TOKEN_EXHAUSTED : RECOVERY_REASON_NONE;
}
/**
 * @brief advance: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void advance(RecoveryState *state, uint32_t delta)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoverySnapshot *s = &state->snapshot;
    if (s->phase == RECOVERY_IDLE || s->phase == RECOVERY_TERMINAL) {
        return;
    }
    s->jobAgeMs = (uint32_t)((uint64_t)s->jobAgeMs + delta);
    if (s->phase == RECOVERY_ACTIVE) {
        s->attemptAgeMs = (uint32_t)((uint64_t)s->attemptAgeMs + delta);
    } else if (s->phase == RECOVERY_CANCELLING) {
        s->cancelAgeMs = (uint32_t)((uint64_t)s->cancelAgeMs + delta);
    } else if (s->phase == RECOVERY_RETRY_WAIT) {
        s->waitAgeMs = (uint32_t)((uint64_t)s->waitAgeMs + delta);
    }
}
/**
 * @brief deadline: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool deadline(RecoveryState *state, RecoveryReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoverySnapshot *s = &state->snapshot;
    if (s->phase == RECOVERY_IDLE || s->phase == RECOVERY_TERMINAL) {
        return false;
    }
    if (s->jobAgeMs >= RECOVERY_TOTAL_MS) {
        event_add(report, RECOVERY_EVENT_TOTAL_DEADLINE);
        finish(state, RECOVERY_REASON_TOTAL_TIMEOUT, report);
    } else if (s->phase == RECOVERY_CANCELLING && s->cancelAgeMs >= RECOVERY_CANCEL_MS) {
        event_add(report, RECOVERY_EVENT_CANCEL_DEADLINE);
        finish(state, RECOVERY_REASON_CANCEL_TIMEOUT, report);
    } else if (s->phase == RECOVERY_ACTIVE && s->attemptAgeMs >= RECOVERY_ATTEMPT_MS) {
        bool uncertain = state->request.operation == RECOVERY_ASSIGN || state->request.operation == RECOVERY_INCREMENT;
        record_failure(state, RECOVERY_CAUSE_ATTEMPT_TIMEOUT, state->backend.phase,
            state->backend.lastAdcStatus, state->backend.adc.phase, uncertain);
        event_add(report, RECOVERY_EVENT_ATTEMPT_DEADLINE);
    } else {
        return false;
    }
    return true;
}
/**
 * @brief take action: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void take_action(RecoveryState *state, uint32_t now, const RecoveryInput *input,
    RecoveryReport *report, RecoveryBackendReport *port, RecoveryCall *call)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoverySnapshot *s = &state->snapshot;
    bool matching = input->kind == RECOVERY_INPUT_NONE || input->token == s->token;
    report->backendActions = 1U;
    increment(&s->diagnostics.backendActions, &s->diagnostics.saturated);
    switch (s->phase) {
        case RECOVERY_START_DUE:
            s->token = state->nextToken;
            if (state->nextToken == UINT32_MAX) {
                state->tokenExhausted = true;
            } else {
                state->nextToken += 1U;
            }
            s->attempt += 1U;
            s->attemptAgeMs = 0U;
            s->waitAgeMs = 0U;
            s->cancelAgeMs = 0U;
            s->cleanup = RECOVERY_CLEANUP_NOT_REQUIRED;
            increment(&s->diagnostics.issuedAttempts, &s->diagnostics.saturated);
            event_add(report, RECOVERY_EVENT_STARTED);
            report->producerCalls = state->backend.kind == RECOVERY_BACKEND_ADC ? 1U : 0U;
            *call = recovery_backend_start(&state->backend, &state->request, s->token, now, port);
            s->phase = RECOVERY_ACTIVE;
            break;
        case RECOVERY_ACTIVE:
            event_add(report, RECOVERY_EVENT_POLLED);
            report->inputConsumed = input->kind != RECOVERY_INPUT_NONE;
            report->producerCalls = state->backend.kind == RECOVERY_BACKEND_ADC && matching ? 1U : 0U;
            *call = recovery_backend_poll(&state->backend, now, input, port);
            break;
        case RECOVERY_CANCEL_DUE:
            event_add(report, RECOVERY_EVENT_CANCEL_REQUESTED);
            *call = recovery_backend_cancel_request(&state->backend, s->token, now, port);
            s->phase = RECOVERY_CANCELLING;
            s->cancelAgeMs = 0U;
            s->cleanup = RECOVERY_CLEANUP_REQUESTED;
            break;
        case RECOVERY_CANCELLING:
            event_add(report, RECOVERY_EVENT_CANCEL_POLLED);
            report->inputConsumed = input->kind != RECOVERY_INPUT_NONE;
            report->producerCalls = state->backend.kind == RECOVERY_BACKEND_ADC &&
                matching && !state->backend.localReleased ? 1U : 0U;
            *call = recovery_backend_cancel_poll(&state->backend, now, input, port);
            break;
        default:
            *call = RECOVERY_BAD_STATE;
            break;
    }
}
/**
 * @brief apply port: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void apply_port(RecoveryState *state, const RecoveryBackendReport *port,
    RecoveryReport *report, RecoveryValue *result)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoverySnapshot *s = &state->snapshot;
    s->resource = port->resource;
    if (port->status == RECOVERY_PORT_STALE) {
        increment(&s->diagnostics.staleEvents, &s->diagnostics.saturated);
        event_add(report, RECOVERY_EVENT_STALE);
    } else if (port->status == RECOVERY_PORT_FAILED) {
        record_failure(state, port->cause, port->phase, port->adcStatus, port->adcPhase,
            port->sideEffectUncertain);
        if (port->cause == RECOVERY_CAUSE_CONTRACT_FAULT) {
            finish(state, RECOVERY_REASON_CONTRACT_FAULT, report);
        }
    } else if (port->status == RECOVERY_PORT_READY && port->valuePresent) {
        s->committed = port->value;
        s->hasCommitted = true;
        *result = port->value;
        report->resultPresent = true;
        event_add(report, RECOVERY_EVENT_COMMITTED);
        finish(state, RECOVERY_REASON_SUCCEEDED, report);
    } else if (port->status == RECOVERY_PORT_CLEANUP_CONFIRMED) {
        RecoveryReason reason = replay_reason(state);
        s->cleanup = RECOVERY_CLEANUP_CONFIRMED;
        event_add(report, RECOVERY_EVENT_CLEANUP);
        state->afterCleanup = reason;
        if (reason != RECOVERY_REASON_NONE) {
            finish(state, reason, report);
        } else {
            s->phase = RECOVERY_RETRY_WAIT;
            s->waitAgeMs = 0U;
            event_add(report, RECOVERY_EVENT_RETRY_WAIT);
        }
    }
}
/**
 * @brief recovery service: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_service(RecoveryState *state, uint32_t now, const RecoveryInput *input,
    RecoveryReport *report, RecoveryValue *result)
{
    /** Respect the finite domain before dispatch or state publication. **/
    uint32_t delta;
    RecoveryBackendReport port = {0};
    RecoveryCall call = RECOVERY_OK;
    RecoveryReport next = {0};
    if (state == NULL || input == NULL || report == NULL || result == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (!valid_state(state)) {
        return RECOVERY_BAD_STATE;
    }
    if (!valid_input(state->backend.kind, state->request.operation, input)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (time_elapsed(state->lastObserved, now, &delta) != TIME_OK) {
        return RECOVERY_TIME_REJECTED;
    }
    state->lastObserved = now;
    increment(&state->snapshot.diagnostics.serviceCalls, &state->snapshot.diagnostics.saturated);
    advance(state, delta);
    if (!deadline(state, &next)) {
        if (state->snapshot.phase == RECOVERY_RETRY_WAIT && state->snapshot.waitAgeMs >= RECOVERY_RETRY_MS) {
            if (state->tokenExhausted) {
                event_add(&next, RECOVERY_EVENT_TOKEN_EXHAUSTED);
                finish(state, RECOVERY_REASON_TOKEN_EXHAUSTED, &next);
            } else {
                state->snapshot.phase = RECOVERY_START_DUE;
            }
        }
        if (state->snapshot.phase >= RECOVERY_START_DUE && state->snapshot.phase <= RECOVERY_CANCELLING) {
            take_action(state, now, input, &next, &port, &call);
            if (call != RECOVERY_OK) {
                port.status = RECOVERY_PORT_FAILED;
                port.cause = RECOVERY_CAUSE_CONTRACT_FAULT;
                port.phase = state->backend.phase;
                port.resource = RECOVERY_UNCONFIRMED;
            }
            apply_port(state, &port, &next, result);
        }
    }
    next.snapshot = state->snapshot;
    *report = next;
    return RECOVERY_OK;
}
/**
 * @brief recovery trace init: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_trace_init(RecoveryTrace *trace, uint32_t droppedSeed)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (trace == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    trace->count = 0U;
    trace->dropped = droppedSeed;
    trace->saturated = false;
    for (size_t index = 0U; index < RECOVERY_TRACE_CAPACITY; index += 1U) {
        trace->rows[index] = (RecoveryReport){0};
    }
    return RECOVERY_OK;
}
/**
 * @brief recovery trace append: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_trace_append(RecoveryTrace *trace, const RecoveryReport *report, RecoveryTraceResult *result)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (trace == NULL || report == NULL || result == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (trace->count > RECOVERY_TRACE_CAPACITY || report->eventCount > RECOVERY_EVENT_CAPACITY ||
        report->backendActions > 1U || report->producerCalls > 1U) {
        return RECOVERY_BAD_STATE;
    }
    if (trace->count == RECOVERY_TRACE_CAPACITY) {
        increment(&trace->dropped, &trace->saturated);
        *result = RECOVERY_TRACE_DROPPED;
    } else {
        trace->rows[trace->count] = *report;
        trace->count += 1U;
        *result = RECOVERY_TRACE_STORED;
    }
    return RECOVERY_OK;
}
