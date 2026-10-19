/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file bus.c
 * @author embedded-notes contributors
 * @brief Finite supplied-event transaction; reusable module has no test main.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "bus.h"
#include "time.h"
#include <stddef.h>

/** @brief Check named initialized metadata. @param[in] state Live object. @return Validity. */
static bool valid_state(const BusState *state)
{
    /** This is not arbitrary memory-corruption detection. **/
    return state->initialized == UINT32_C(0x42555331) &&
        state->status >= BUS_IDLE && state->status <= BUS_FAILED &&
        state->phase >= BUS_WAIT_FREE && state->phase <= BUS_DONE &&
        state->resource >= BUS_RELEASED && state->resource <= BUS_UNKNOWN &&
        state->elapsed <= BUS_DEADLINE_MS;
}

/** @brief Copy a public observation. @param[in] state Accepted state.
 * @param[in] phase Observed phase. @param[out] report Fresh report. @return None. */
static void snapshot(const BusState *state, BusPhase phase, BusReport *report)
{
    /** No old output fields are read. **/
    *report = (BusReport){0};
    report->status = state->status;
    report->phase = phase;
    report->nextPhase = state->phase;
    report->cause = state->cause;
    report->policyCause = state->policyCause;
    report->failurePhase = state->failurePhase;
    report->resource = state->resource;
    report->elapsed = state->elapsed;
    report->candidatePresent = state->candidatePresent;
    report->candidate = state->candidate;
    report->resultPresent = state->resultPresent;
    report->result = state->result;
    report->identityMatches = state->resultPresent && state->result == 0x33U;
}

/** @brief Initialize fresh storage. @param[out] state Fresh object. @return Status. */
BusCallStatus bus_init(BusState *state)
{
    /** Never inspect old storage. **/
    if (state == NULL) {
        return BUS_INVALID_ARGUMENT;
    }
    *state = (BusState){0};
    state->initialized = UINT32_C(0x42555331);
    state->status = BUS_IDLE;
    state->phase = BUS_DONE;
    return BUS_OK;
}

/** @brief Admit copied metadata. @param[in,out] state Initialized. @param[in] request Metadata.
 * @param[in] now Tick. @return Status. */
BusCallStatus bus_start(BusState *state, const BusRequest *request, uint32_t now)
{
    uint32_t delta;

    /** Numeric 0x30 is a legal generic address, but not this fixed fixture. **/
    if (state == NULL || request == NULL ||
        (request->protocol != BUS_I2C && request->protocol != BUS_SPI) ||
        request->address7 != 0x18U || request->reg != 0x0FU) {
        return BUS_INVALID_ARGUMENT;
    }
    if (!valid_state(state)) {
        return BUS_BAD_STATE;
    }
    if (state->status == BUS_PENDING || state->resource == BUS_UNKNOWN || state->resource == BUS_OWNED) {
        return BUS_BUSY;
    }
    if (state->status != BUS_IDLE && time_elapsed(state->lastObserved, now, &delta) != TIME_OK) {
        return BUS_TIME_REJECTED;
    }
    state->request = *request;
    state->lastObserved = now;
    state->elapsed = 0U;
    state->status = BUS_PENDING;
    state->phase = request->protocol == BUS_I2C ? BUS_WAIT_FREE : BUS_SELECT;
    state->cause = BUS_CAUSE_NONE;
    state->policyCause = BUS_CAUSE_NONE;
    state->failurePhase = BUS_DONE;
    state->resource = BUS_RELEASED;
    state->candidatePresent = false;
    state->candidate = 0U;
    return BUS_OK;
}

/** @brief Execute one successful logical phase. @param[in,out] state Accepted.
 * @param[in] event Event. @param[out] report Output. @return None. */
static void advance_phase(BusState *state, const BusEvent *event, BusReport *report)
{
    /** The two finite paths have no loop, callback or hidden hardware wait. **/
    switch (state->phase) {
        case BUS_WAIT_FREE:
            state->phase = BUS_START;
            break;
        case BUS_START:
            state->resource = BUS_OWNED;
            state->phase = BUS_ADDRESS_WRITE;
            break;
        case BUS_ADDRESS_WRITE:
            report->transmitted = true;
            report->tx = 0x30U;
            state->phase = BUS_SUBADDRESS;
            break;
        case BUS_SUBADDRESS:
            report->transmitted = true;
            report->tx = 0x0FU;
            state->phase = BUS_RESTART;
            break;
        case BUS_RESTART:
            state->phase = BUS_ADDRESS_READ;
            break;
        case BUS_ADDRESS_READ:
            report->transmitted = true;
            report->tx = 0x31U;
            state->phase = BUS_DATA;
            break;
        case BUS_DATA:
            state->candidatePresent = true;
            state->candidate = event->received;
            state->phase = BUS_FINAL_NACK;
            break;
        case BUS_FINAL_NACK:
            state->phase = BUS_STOP;
            break;
        case BUS_SELECT:
            state->resource = BUS_OWNED;
            state->phase = BUS_COMMAND;
            break;
        case BUS_COMMAND:
            report->transmitted = true;
            report->tx = 0x8FU;
            report->discarded = true;
            state->phase = BUS_SPI_DATA;
            break;
        case BUS_SPI_DATA:
            report->transmitted = true;
            report->tx = 0U;
            state->candidatePresent = true;
            state->candidate = event->received;
            state->phase = BUS_DESELECT;
            break;
        case BUS_STOP:
        case BUS_DESELECT:
            state->result = state->candidate;
            state->resultPresent = true;
            state->resource = BUS_RELEASED;
            state->status = BUS_READY;
            state->phase = BUS_DONE;
            report->newResult = true;
            break;
        case BUS_ERROR_STOP:
            state->resource = BUS_RELEASED;
            state->status = BUS_FAILED;
            state->phase = BUS_DONE;
            break;
        default:
            break;
    }
}

/** @brief Poll one phase. @param[in,out] state Initialized. @param[in] now Tick.
 * @param[in] event Event. @param[out] report Report. @return Status. */
BusCallStatus bus_poll(BusState *state, uint32_t now, const BusEvent *event, BusReport *report)
{
    BusState next;
    BusReport output;
    BusPhase phase;
    uint32_t delta;

    /** All rejection checks precede accepted state and output writes. **/
    if (state == NULL || event == NULL || report == NULL ||
        event->kind < BUS_EVENT_OK || event->kind > BUS_EVENT_STUCK) {
        return BUS_INVALID_ARGUMENT;
    }
    if (!valid_state(state)) {
        return BUS_BAD_STATE;
    }
    if (time_elapsed(state->lastObserved, now, &delta) != TIME_OK) {
        return BUS_TIME_REJECTED;
    }
    if (state->status == BUS_PENDING &&
        ((event->kind == BUS_EVENT_NACK && (state->request.protocol != BUS_I2C ||
          (state->phase != BUS_ADDRESS_WRITE && state->phase != BUS_ADDRESS_READ &&
           state->phase != BUS_SUBADDRESS))) ||
         (event->kind == BUS_EVENT_ARLO &&
          (state->request.protocol != BUS_I2C || state->resource != BUS_OWNED)))) {
        return BUS_INVALID_ARGUMENT;
    }
    next = *state;
    phase = next.phase;
    snapshot(&next, phase, &output);
    if (next.status == BUS_PENDING) {
        next.lastObserved = now;
        next.elapsed = delta >= BUS_DEADLINE_MS - next.elapsed ? BUS_DEADLINE_MS : next.elapsed + delta;
        if (next.elapsed >= BUS_DEADLINE_MS) {
            next.policyCause = BUS_TIMEOUT;
            if (next.cause == BUS_CAUSE_NONE) {
                next.cause = BUS_TIMEOUT;
                next.failurePhase = phase;
            }
            next.status = BUS_FAILED;
            next.resource = BUS_UNKNOWN;
            next.phase = BUS_DONE;
        } else if (event->kind == BUS_EVENT_OK) {
            advance_phase(&next, event, &output);
            output.action = true;
        } else if (event->kind != BUS_EVENT_WAIT) {
            output.action = true;
            if (next.cause == BUS_CAUSE_NONE) {
                next.failurePhase = phase;
            }
            if (event->kind == BUS_EVENT_NACK) {
                next.cause = phase == BUS_SUBADDRESS ? BUS_DATA_NACK : BUS_ADDRESS_NACK;
                next.phase = BUS_ERROR_STOP;
            } else {
                if (next.cause == BUS_CAUSE_NONE) {
                    next.cause = event->kind == BUS_EVENT_ARLO ? BUS_ARLO :
                        event->kind == BUS_EVENT_STUCK ? BUS_STUCK : BUS_BACKEND;
                }
                next.resource = event->kind == BUS_EVENT_ARLO ? BUS_LOST : BUS_UNKNOWN;
                next.status = BUS_FAILED;
                next.phase = BUS_DONE;
            }
        }
    }
    {
        BusReport fields;
        snapshot(&next, phase, &fields);
        fields.action = output.action;
        fields.transmitted = output.transmitted;
        fields.tx = output.tx;
        fields.discarded = output.discarded;
        fields.newResult = output.newResult;
        *report = fields;
    }
    *state = next;
    return BUS_OK;
}
