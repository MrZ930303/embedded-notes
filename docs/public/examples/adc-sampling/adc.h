/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file adc.h
 * @author embedded-notes contributors
 * @brief Checked floor bins and finite value-only host ADC transaction.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_ADC_H
#define EMBEDDED_NOTES_ADC_H

#include <stdbool.h>
#include <stdint.h>

#if !defined(UINT32_MAX) || !defined(UINT64_MAX)
#error Exact-width uint32_t and uint64_t are required.
#endif

#define ADC_DEADLINE_MS UINT32_C(20)
#define ADC_PCLK2_HZ UINT32_C(84000000)
#define ADC_MAX_REFERENCE_UV UINT32_C(3600000)

typedef enum {
    ADC_OK = 0, ADC_PENDING, ADC_READY, ADC_BUSY, ADC_INVALID_ARGUMENT,
    ADC_BAD_STATE, ADC_TIME_REJECTED, ADC_BACKEND_ERROR, ADC_TIMEOUT, ADC_CANCELLED
} AdcStatus;

typedef enum {
    ADC_IDLE = 0, ADC_ACQUIRE, ADC_CONVERT, ADC_RESULT, ADC_TERMINAL
} AdcPhase;

typedef enum {
    ADC_EVENT_WAIT = 0, ADC_EVENT_ADVANCE, ADC_EVENT_FAIL
} AdcEvent;

typedef struct {
    uint32_t bits;
    uint32_t sampleCycles;
    uint32_t divider;
    uint32_t referenceUv;
    uint32_t inputUv;
} AdcRequest;

typedef struct {
    uint32_t adcHz;
    uint32_t totalCycles;
} AdcPlan;

typedef struct {
    uint64_t numeratorUv;
    uint32_t denominator;
} AdcRational;

typedef struct {
    AdcStatus status;
    AdcPhase phase;
    uint32_t elapsedMs;
    bool samplePresent;
    uint16_t sample;
} AdcReport;

typedef struct {
    AdcRequest request;
    AdcPhase phase;
    AdcStatus status;
    uint32_t lastObserved;
    uint32_t elapsedMs;
    uint16_t candidate;
    uint16_t committed;
    bool hasSample;
    bool active;
} AdcState;

/*
 * Value-only original host model, no MMIO/HAL/IRQ/DMA, caller buffer retention,
 * callbacks, allocation, recursion, sleep or blocking loops. Single exclusive
 * non-reentrant context. Every nonnull pointer names a real live correctly typed
 * object; outputs are writable and disjoint from every other call object.
 * Fresh init never reads old storage; all other state calls require an object
 * initialized by adc_init. Never initialize over a live operation. Named-field
 * checks cannot validate forged/dangling pointers or arbitrary corruption.
 *
 * Quantizer domain: bits 6/8/10/12; reference 1..3600000 uV; input 0..reference.
 * This arithmetic domain is not a legal hardware voltage specification.
 * Plan: fixed PCLK2=84MHz, assumed F407VG/LQFP100 wired VDDA=VREF+=3.3V,
 * selected 36MHz ADC bound; dividers 2/4/6/8, but 2 is rejected at this PCLK2.
 * Sample cycles 3/15/28/56/84/112/144/480. Total cycles = sample + bits.
 *
 * Time uses separately linked unit10 time_elapsed: 1 tick=1ms, caller promises
 * true forward inter-observation gaps <2^31 ticks. Observed delta >=2^31 rejects
 * before mutation. Equal observations are valid; unseen whole wraps undetectable.
 * Poll rejects invalid args/time before transitions, then expires age >=20 before
 * event acceptance. Age is only stored below20 or set to20 on timeout, so no
 * cumulative overflow. Advancing observations and service scheduling are required
 * for eventual timeout. Three ADVANCE polls do ACQUIRE/CONVERT/RESULT, at most one
 * phase each; WAIT immediately returns PENDING. report.phase names the serviced
 * or failed phase; state.phase is the next phase. Only READY sets samplePresent.
 * READY, backend error and timeout all synchronously release the fake operation.
 * committed/hasSample survive admission rejects, pending, failures and cancel.
 * Terminal polls reject BAD_STATE and preserve report; new start is allowed.
 *
 * adc_cancel is synchronous pure-host cleanup: active=false, candidate=0,
 * phase=TERMINAL and status=CANCELLED on return. No event or external pointer can
 * still own this fake operation. It is not asynchronous acceptance, a physical
 * ADC abort, remote-effect undo, generation protection or hardware recovery.
 * Cancel requires active state; idle/terminal cancel rejects BAD_STATE.
 */

/**
 * @brief Validate the conditional fixed-clock plan; preserve output on failure.
 * @param[in] request Real finite request.
 * @param[out] plan Disjoint writable result.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_plan(const AdcRequest *request, AdcPlan *plan);

/**
 * @brief Quantize original floor bins with inclusive top-end saturation.
 * @param[in] request Real request; only bits/reference/input are used.
 * @param[out] code Disjoint writable code, unchanged on failure.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_quantize(const AdcRequest *request, uint16_t *code);

/**
 * @brief Reconstruct a validated code as exact lower-edge or endpoint fraction.
 * @param[in] request Real request; bits/reference define the code domain.
 * @param[in] code Code strictly below 2^bits.
 * @param[in] endpoint False uses 2^bits; true uses 2^bits-1 denominator.
 * @param[out] value Disjoint writable fraction, unchanged on failure.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_reconstruct(const AdcRequest *request, uint32_t code, bool endpoint, AdcRational *value);

/**
 * @brief Initialize genuinely fresh storage without reading prior fields.
 * @param[out] state Real writable fresh object; no old operation may be live.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_init(AdcState *state);

/**
 * @brief Copy a valid request; busy has precedence over request/time inspection.
 * @param[in,out] state Initialized object; committed sample is preserved.
 * @param[in] request Disjoint request; no pointer is retained after return.
 * @param[in] now Start tick, any uint32_t; starts a new observation domain.
 * @return ADC_PENDING, ADC_BUSY, ADC_INVALID_ARGUMENT or ADC_BAD_STATE.
 */
AdcStatus adc_start(AdcState *state, const AdcRequest *request, uint32_t now);

/**
 * @brief Perform at most one fake phase, checking deadline before supplied event.
 * @param[in,out] state Initialized active object.
 * @param[in] now Next checked observation.
 * @param[in] event WAIT, ADVANCE or FAIL; invalid events preserve all fields.
 * @param[out] report Disjoint result; only READY indicates a fresh sample.
 * @return PENDING/READY/BACKEND_ERROR/TIMEOUT or preserving rejection status.
 */
AdcStatus adc_poll(AdcState *state, uint32_t now, AdcEvent event, AdcReport *report);

/**
 * @brief Synchronously cancel this pure-host active operation and release it.
 * @param[in,out] state Initialized active object; committed value survives.
 * @param[out] report Disjoint result; samplePresent is false.
 * @return ADC_CANCELLED or preserving INVALID_ARGUMENT/BAD_STATE rejection.
 */
AdcStatus adc_cancel(AdcState *state, AdcReport *report);

#endif
