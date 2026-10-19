/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file fake_sensor.c
 * @author embedded-notes contributors
 * @brief Closed bounded host recovery; no hardware operation.
 * @version V1.0 2026-10-17
 *****************************************************************************/
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
 * @brief adc phase: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static RecoveryBackendPhase adc_phase(AdcPhase phase)
{
    /** Respect the finite domain before dispatch or state publication. **/
    switch (phase) {
        case ADC_ACQUIRE: return RECOVERY_BACKEND_ADC_ACQUIRE;
        case ADC_CONVERT: return RECOVERY_BACKEND_ADC_CONVERT;
        case ADC_RESULT: return RECOVERY_BACKEND_ADC_RESULT;
        default: return RECOVERY_BACKEND_IDLE;
    }
}
/**
 * @brief port report: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void port_report(const RecoveryBackend *backend, RecoveryBackendPhase phase, RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    *report = (RecoveryBackendReport){0};
    report->status = RECOVERY_PORT_PENDING;
    report->token = backend->token;
    report->phase = phase;
    report->adcStatus = backend->lastAdcStatus;
    report->adcPhase = backend->lastAdcPhase;
    report->resource = backend->requestOwned ? RECOVERY_OWNED : RECOVERY_RELEASED;
    report->localReleased = backend->localReleased;
}
/**
 * @brief release port: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void release_port(RecoveryBackend *backend, RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    backend->requestOwned = false;
    backend->cancelAccepted = false;
    backend->localReleased = true;
    backend->phase = RECOVERY_BACKEND_IDLE;
    report->resource = RECOVERY_RELEASED;
    report->localReleased = true;
}
/**
 * @brief contract fault: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void contract_fault(RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    report->status = RECOVERY_PORT_FAILED;
    report->cause = RECOVERY_CAUSE_CONTRACT_FAULT;
    report->resource = RECOVERY_UNCONFIRMED;
    report->localReleased = false;
}
/**
 * @brief recovery backend init: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_backend_init(RecoveryBackend *backend, const RecoveryConfig *config, uint32_t now)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoveryBackend next = {0};
    if (backend == NULL || !valid_config(config)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    next.kind = config->backend;
    next.lastObserved = now;
    next.localReleased = true;
    next.fakeRegister = config->fakeRegister;
    next.fakeCounter = config->fakeCounter;
    next.request.operation = config->backend == RECOVERY_BACKEND_ADC ? RECOVERY_SAMPLE : RECOVERY_READ;
    if (config->backend == RECOVERY_BACKEND_ADC) {
        next.request.adc = (AdcRequest){12U,15U,4U,3300000U,1650000U};
    }
    if (adc_init(&next.adc) != ADC_OK) {
        return RECOVERY_BAD_STATE;
    }
    *backend = next;
    return RECOVERY_OK;
}
/**
 * @brief recovery backend start: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_backend_start(RecoveryBackend *backend, const RecoveryRequest *request,
    RecoveryToken token, uint32_t now, RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    AdcStatus status = ADC_OK;
    if (backend == NULL || report == NULL || token == 0U) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (!valid_backend(backend)) {
        return RECOVERY_BAD_STATE;
    }
    if (backend->requestOwned) {
        return RECOVERY_BUSY;
    }
    if (token <= backend->token || !valid_request(backend->kind, request)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    backend->request = *request;
    backend->token = token;
    backend->lastObserved = now;
    backend->requestOwned = true;
    backend->localReleased = false;
    backend->cancelAccepted = false;
    backend->effectApplied = false;
    backend->phase = RECOVERY_BACKEND_FAKE_EXECUTE;
    if (backend->kind == RECOVERY_BACKEND_ADC) {
        status = adc_start(&backend->adc, &backend->request.adc, now);
        backend->lastAdcStatus = status;
        backend->lastAdcPhase = backend->adc.phase;
        backend->phase = adc_phase(backend->adc.phase);
    }
    port_report(backend, RECOVERY_BACKEND_START, report);
    if (backend->kind == RECOVERY_BACKEND_ADC && status != ADC_PENDING) {
        contract_fault(report);
    }
    return RECOVERY_OK;
}
/**
 * @brief check poll: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static RecoveryCall check_poll(const RecoveryBackend *backend, uint32_t now, const RecoveryInput *input,
    const RecoveryBackendReport *report, bool cancelling)
{
    /** Respect the finite domain before dispatch or state publication. **/
    uint32_t delta;
    if (backend == NULL || report == NULL || input == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (backend->kind == RECOVERY_BACKEND_ADC && backend->requestOwned &&
        backend->localReleased == backend->adc.active) {
        return RECOVERY_BAD_STATE;
    }
    if (!valid_backend(backend) || !backend->requestOwned || backend->cancelAccepted != cancelling) {
        return RECOVERY_BAD_STATE;
    }
    if (!valid_input(backend->kind, backend->request.operation, input)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    return time_elapsed(backend->lastObserved, now, &delta) == TIME_OK ? RECOVERY_OK : RECOVERY_TIME_REJECTED;
}
/**
 * @brief stale: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool stale(const RecoveryBackend *backend, const RecoveryInput *input, RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (input->kind != RECOVERY_INPUT_NONE && input->token != backend->token) {
        report->status = RECOVERY_PORT_STALE;
        return true;
    }
    return false;
}
/**
 * @brief fake poll: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void fake_poll(RecoveryBackend *backend, const RecoveryInput *input, RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (input->kind == RECOVERY_INPUT_FAIL) {
        report->status = RECOVERY_PORT_FAILED;
        report->cause = input->cause;
        report->sideEffectUncertain = backend->request.operation != RECOVERY_READ &&
            (input->cause == RECOVERY_CAUSE_LOST_REPLY || input->cause == RECOVERY_CAUSE_OVERRUN);
        return;
    }
    if (input->kind != RECOVERY_INPUT_READY && input->kind != RECOVERY_INPUT_COMMIT_LOST_REPLY) {
        return;
    }
    if (backend->request.operation == RECOVERY_INCREMENT && backend->fakeCounter == RECOVERY_FAKE_MAX_VALUE) {
        report->status = RECOVERY_PORT_FAILED;
        report->cause = RECOVERY_CAUSE_PERMANENT;
        return;
    }
    if (backend->request.operation == RECOVERY_ASSIGN) {
        backend->fakeRegister = backend->request.value;
    } else if (backend->request.operation == RECOVERY_INCREMENT) {
        backend->fakeCounter += 1U;
    }
    backend->effectApplied = true;
    if (input->kind == RECOVERY_INPUT_COMMIT_LOST_REPLY) {
        report->status = RECOVERY_PORT_FAILED;
        report->cause = RECOVERY_CAUSE_LOST_REPLY;
        report->sideEffectUncertain = true;
        return;
    }
    report->status = RECOVERY_PORT_READY;
    report->valuePresent = true;
    report->value.kind = RECOVERY_VALUE_FAKE;
    report->value.fakeValue = backend->request.operation == RECOVERY_INCREMENT ?
        backend->fakeCounter : backend->fakeRegister;
    release_port(backend, report);
}
/**
 * @brief poll adc: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void poll_adc(RecoveryBackend *backend, uint32_t now, const RecoveryInput *input,
    RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    AdcReport actual;
    AdcEvent event = input->kind == RECOVERY_INPUT_ADC_ADVANCE ? ADC_EVENT_ADVANCE :
        (input->kind == RECOVERY_INPUT_FAIL ? ADC_EVENT_FAIL : ADC_EVENT_WAIT);
    AdcStatus status = adc_poll(&backend->adc, now, event, &actual);
    backend->lastAdcStatus = status;
    if (status != ADC_PENDING && status != ADC_READY && status != ADC_BACKEND_ERROR && status != ADC_TIMEOUT) {
        contract_fault(report);
        return;
    }
    backend->lastAdcPhase = actual.phase;
    report->adcStatus = status;
    report->adcPhase = actual.phase;
    report->phase = adc_phase(actual.phase);
    backend->phase = adc_phase(backend->adc.phase);
    if (status == ADC_PENDING) {
        return;
    }
    backend->localReleased = true;
    report->localReleased = true;
    if (status == ADC_READY && actual.samplePresent) {
        report->status = RECOVERY_PORT_READY;
        report->valuePresent = true;
        report->value.kind = RECOVERY_VALUE_SAMPLE;
        report->value.sample = actual.sample;
        release_port(backend, report);
    } else if (status == ADC_BACKEND_ERROR || status == ADC_TIMEOUT) {
        report->status = RECOVERY_PORT_FAILED;
        report->cause = status == ADC_TIMEOUT ? RECOVERY_CAUSE_ADC_TIMEOUT : RECOVERY_CAUSE_ADC_BACKEND;
    } else {
        contract_fault(report);
    }
}
/**
 * @brief recovery backend poll: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_backend_poll(RecoveryBackend *backend, uint32_t now, const RecoveryInput *input,
    RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoveryCall call = check_poll(backend, now, input, report, false);
    if (call != RECOVERY_OK) {
        return call;
    }
    backend->lastObserved = now;
    port_report(backend, backend->phase, report);
    if (!stale(backend, input, report)) {
        if (backend->kind == RECOVERY_BACKEND_ADC) {
            poll_adc(backend, now, input, report);
        } else {
            fake_poll(backend, input, report);
        }
    }
    return RECOVERY_OK;
}
/**
 * @brief recovery backend cancel request: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_backend_cancel_request(RecoveryBackend *backend, RecoveryToken token,
    uint32_t now, RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    uint32_t delta;
    if (backend == NULL || report == NULL || token == 0U) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (!valid_backend(backend) || !backend->requestOwned || backend->cancelAccepted) {
        return RECOVERY_BAD_STATE;
    }
    if (time_elapsed(backend->lastObserved, now, &delta) != TIME_OK) {
        return RECOVERY_TIME_REJECTED;
    }
    backend->lastObserved = now;
    port_report(backend, RECOVERY_BACKEND_CANCEL_REQUEST, report);
    if (token != backend->token) {
        report->status = RECOVERY_PORT_STALE;
        return RECOVERY_OK;
    }
    backend->cancelAccepted = true;
    backend->phase = RECOVERY_BACKEND_CANCEL_POLL;
    report->status = RECOVERY_PORT_CANCEL_ACCEPTED;
    return RECOVERY_OK;
}
/**
 * @brief recovery backend cancel poll: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_backend_cancel_poll(RecoveryBackend *backend, uint32_t now, const RecoveryInput *input,
    RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    AdcReport actual;
    RecoveryCall call = check_poll(backend, now, input, report, true);
    if (call != RECOVERY_OK) {
        return call;
    }
    backend->lastObserved = now;
    port_report(backend, RECOVERY_BACKEND_CANCEL_POLL, report);
    if (stale(backend, input, report)) {
        return RECOVERY_OK;
    }
    if (backend->kind == RECOVERY_BACKEND_ADC && !backend->localReleased) {
        AdcStatus status = adc_cancel(&backend->adc, &actual);
        backend->lastAdcStatus = status;
        if (status != ADC_CANCELLED) {
            contract_fault(report);
            return RECOVERY_OK;
        }
        backend->lastAdcPhase = actual.phase;
        report->adcStatus = status;
        report->adcPhase = actual.phase;
    }
    if (backend->kind == RECOVERY_BACKEND_ADC || input->kind == RECOVERY_INPUT_CLEANUP_DONE) {
        release_port(backend, report);
        report->status = RECOVERY_PORT_CLEANUP_CONFIRMED;
    }
    return RECOVERY_OK;
}
