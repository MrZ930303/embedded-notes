/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file adc.c
 * @author embedded-notes contributors
 * @brief Checked floor bins and finite host conversion, no hardware access.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "adc.h"
#include "time.h"
#include <stddef.h>

/**
 * @brief Validate the quantizer's finite arithmetic domain before shifting.
 * @param[in] request Real request.
 * @return True for supported bits and reference/input values.
 */
static bool valid_values(const AdcRequest *request)
{
    /** A small arithmetic voltage is not a hardware reference qualification. **/
    return request != NULL &&
        (request->bits == 6U || request->bits == 8U || request->bits == 10U || request->bits == 12U) &&
        request->referenceUv > 0U && request->referenceUv <= ADC_MAX_REFERENCE_UV &&
        request->inputUv <= request->referenceUv;
}

/**
 * @brief Quantize exact floor bins with top-end clipping.
 * @param[in] request Finite values.
 * @param[out] code Disjoint preserved-on-rejection result.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_quantize(const AdcRequest *request, uint16_t *code)
{
    uint32_t levels;
    uint64_t raw;

    /** Maximum product is 14745600000, so widen before multiplying. **/
    if (!valid_values(request) || code == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    levels = UINT32_C(1) << request->bits;
    raw = (uint64_t)request->inputUv * levels / request->referenceUv;
    if (raw >= levels) {
        raw = levels - 1U;
    }
    *code = (uint16_t)raw;
    return ADC_OK;
}

/**
 * @brief Validate supported fixed-clock timing and arithmetic request values.
 * @param[in] request Real request.
 * @param[out] plan Disjoint writable output.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_plan(const AdcRequest *request, AdcPlan *plan)
{
    uint32_t cycles;
    uint32_t divider;

    /** Divisor two is supported by hardware but exceeds this selected bound. **/
    if (!valid_values(request) || plan == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    cycles = request->sampleCycles;
    divider = request->divider;
    if ((divider != 2U && divider != 4U && divider != 6U && divider != 8U) ||
        (cycles != 3U && cycles != 15U && cycles != 28U && cycles != 56U && cycles != 84U &&
        cycles != 112U && cycles != 144U && cycles != 480U)) {
        return ADC_INVALID_ARGUMENT;
    }
    if (ADC_PCLK2_HZ / divider > UINT32_C(36000000)) {
        return ADC_INVALID_ARGUMENT;
    }
    plan->adcHz = ADC_PCLK2_HZ / divider;
    plan->totalCycles = cycles + request->bits;
    return ADC_OK;
}

/**
 * @brief Return an exact fraction for one named reconstruction convention.
 * @param[in] request Real request.
 * @param[in] code Validated code.
 * @param[in] endpoint Use endpoint interpolation when true.
 * @param[out] value Disjoint result.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_reconstruct(const AdcRequest *request, uint32_t code, bool endpoint, AdcRational *value)
{
    uint32_t levels;

    /** Input is irrelevant to reconstruction; only its declared domain is checked. **/
    if (!valid_values(request) || value == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    levels = UINT32_C(1) << request->bits;
    if (code >= levels) {
        return ADC_INVALID_ARGUMENT;
    }
    value->numeratorUv = (uint64_t)code * request->referenceUv;
    value->denominator = endpoint ? levels - 1U : levels;
    return ADC_OK;
}

/**
 * @brief Initialize every named field without reading fresh storage.
 * @param[out] state Real fresh writable object.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_init(AdcState *state)
{
    const AdcState empty = {{12U, 15U, 4U, 3300000U, 0U}, ADC_IDLE, ADC_OK, 0U, 0U, 0U, 0U, false, false};

    /** Fresh means no previous operation may still be live in this storage. **/
    if (state == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    *state = empty;
    return ADC_OK;
}

/**
 * @brief Check initialized metadata without claiming arbitrary memory validation.
 * @param[in] state Real initialized object.
 * @return True for the module's finite state invariants.
 */
static bool valid_state(const AdcState *state)
{
    AdcPlan plan;
    bool phaseActive;

    /** Public structs aid teaching; callers must not manufacture arbitrary states. **/
    if (state->phase < ADC_IDLE || state->phase > ADC_TERMINAL || state->status < ADC_OK ||
        state->status > ADC_CANCELLED || state->elapsedMs > ADC_DEADLINE_MS || state->committed > 4095U) {
        return false;
    }
    phaseActive = state->phase == ADC_ACQUIRE || state->phase == ADC_CONVERT || state->phase == ADC_RESULT;
    if (state->active != phaseActive || (state->active && state->status != ADC_PENDING)) {
        return false;
    }
    return adc_plan(&state->request, &plan) == ADC_OK &&
        state->candidate < (UINT32_C(1) << state->request.bits);
}

/**
 * @brief Admit one validated copied request without changing the committed sample.
 * @param[in,out] state Initialized object.
 * @param[in] request Request to copy.
 * @param[in] now Start tick.
 * @return ADC_PENDING or a preserving rejection.
 */
AdcStatus adc_start(AdcState *state, const AdcRequest *request, uint32_t now)
{
    AdcPlan plan;

    /** Busy precedes inspection of the proposed request, and start establishes time. **/
    if (state == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    if (!valid_state(state)) {
        return ADC_BAD_STATE;
    }
    if (state->active) {
        return ADC_BUSY;
    }
    if (adc_plan(request, &plan) != ADC_OK) {
        return ADC_INVALID_ARGUMENT;
    }
    state->request = *request;
    state->phase = ADC_ACQUIRE;
    state->status = ADC_PENDING;
    state->lastObserved = now;
    state->elapsedMs = 0U;
    state->candidate = 0U;
    state->active = true;
    return ADC_PENDING;
}

/**
 * @brief Return a bounded terminal report and release pure-host candidate state.
 * @param[in,out] state Valid initialized operation.
 * @param[in] status Terminal category.
 * @param[in] phase Serviced or failed phase.
 * @param[out] report Disjoint writable report.
 * @return The terminal category.
 */
static AdcStatus finish(AdcState *state, AdcStatus status, AdcPhase phase, AdcReport *report)
{
    /** Only READY may replace the last committed sample. **/
    if (status == ADC_READY) {
        state->committed = state->candidate;
        state->hasSample = true;
    }
    state->candidate = 0U;
    state->active = false;
    state->phase = ADC_TERMINAL;
    state->status = status;
    report->status = status;
    report->phase = phase;
    report->elapsedMs = state->elapsedMs;
    report->samplePresent = status == ADC_READY;
    report->sample = state->committed;
    return status;
}

/**
 * @brief Advance one phase after validated time, preserving old sample until READY.
 * @param[in,out] state Initialized active object.
 * @param[in] now Next time observation.
 * @param[in] event Supplied finite backend event.
 * @param[out] report Disjoint report, unchanged for rejected calls.
 * @return Named category, at most one phase of work.
 */
AdcStatus adc_poll(AdcState *state, uint32_t now, AdcEvent event, AdcReport *report)
{
    uint32_t delta;
    AdcPhase phase;
    uint16_t code;

    /** Check every rejection before observing or changing the active operation. **/
    if (state == NULL || report == NULL ||
        (event != ADC_EVENT_WAIT && event != ADC_EVENT_ADVANCE && event != ADC_EVENT_FAIL)) {
        return ADC_INVALID_ARGUMENT;
    }
    if (!valid_state(state) || !state->active) {
        return ADC_BAD_STATE;
    }
    if (time_elapsed(state->lastObserved, now, &delta) != TIME_OK) {
        return ADC_TIME_REJECTED;
    }
    phase = state->phase;
    state->lastObserved = now;
    if (delta >= ADC_DEADLINE_MS - state->elapsedMs) {
        state->elapsedMs = ADC_DEADLINE_MS;
        return finish(state, ADC_TIMEOUT, phase, report);
    }
    state->elapsedMs += delta;
    if (event == ADC_EVENT_FAIL) {
        return finish(state, ADC_BACKEND_ERROR, phase, report);
    }
    if (event == ADC_EVENT_ADVANCE) {
        if (phase == ADC_RESULT) {
            return finish(state, ADC_READY, phase, report);
        }
        if (phase == ADC_CONVERT) {
            if (adc_quantize(&state->request, &code) != ADC_OK) {
                return finish(state, ADC_BACKEND_ERROR, phase, report);
            }
            state->candidate = code;
        }
        state->phase = phase == ADC_ACQUIRE ? ADC_CONVERT : ADC_RESULT;
    }
    *report = (AdcReport){ADC_PENDING, phase, state->elapsedMs, false, state->committed};
    return ADC_PENDING;
}

/**
 * @brief Synchronously cancel only the active value-only host operation.
 * @param[in,out] state Real initialized active state.
 * @param[out] report Disjoint writable result.
 * @return ADC_CANCELLED, ADC_INVALID_ARGUMENT or ADC_BAD_STATE.
 */
AdcStatus adc_cancel(AdcState *state, AdcReport *report)
{
    /** No hardware or external buffer exists in this fake cleanup contract. **/
    if (state == NULL || report == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    if (!valid_state(state) || !state->active) {
        return ADC_BAD_STATE;
    }
    return finish(state, ADC_CANCELLED, state->phase, report);
}
