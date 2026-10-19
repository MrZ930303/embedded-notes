/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file throughput.c
 * @author embedded-notes contributors
 * @brief Arrival-first/drop-new sample records with finite copied reports.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#include "throughput.h"
#include <string.h>

/** @brief Increment one diagnostic without wrap.
 * @param[in,out] counter Initialized counter.
 * @param[in,out] saturated Sticky shared indication.
 * @return None. */
static void throughput_increment(uint32_t *counter, bool *saturated)
{
    /**
    * Reaching MAX is exact; only an attempted increment beyond it truncates.
    **/
    if (*counter == UINT32_MAX) {
        *saturated = true;
    } else {
        *counter += 1U;
    }
}

/** @brief Check initialized queue metadata in fixed work.
 * @param[in] state Real live initialized object.
 * @return Whether checkable fields are in their declared domain. */
static bool throughput_valid(const ThroughputState *state)
{
    size_t index;
    /**
    * Only occupied records need a live positive source epoch.
    **/
    if (state->head >= TP_CAPACITY || state->count > TP_CAPACITY || state->limit == 0U ||
        state->tick > state->limit || state->historyCount > TP_HISTORY_ROWS) {
        return false;
    }
    for (index = 0U; index < state->count; index++) {
        if (state->slots[(state->head + index) % TP_CAPACITY].epoch == 0U) {
            return false;
        }
    }
    return true;
}

/** @brief Check one complete acquisition input before narrowing.
 * @param[in] input Real live wide input.
 * @return Whether all named input domains hold. */
static bool throughput_input_valid(const ThroughputInput *input)
{
    /**
    * Source ID zero is legitimate and is unrelated to positive DMA identities.
    **/
    return input->value <= UINT16_MAX && input->sourceId <= UINT32_MAX &&
        input->sequence <= UINT16_MAX && input->sourceTime <= UINT32_MAX &&
        input->epoch > 0U && input->epoch <= UINT32_MAX;
}

/** @brief Copy already validated input into independently owned record storage.
 * @param[in] input Checked wide record.
 * @return Complete copied record. */
static ThroughputRecord throughput_record(const ThroughputInput *input)
{
    /**
    * The fictional eleven-byte wire example is not this C object's layout.
    **/
    return (ThroughputRecord){(uint16_t)input->value, (uint32_t)input->sourceId,
        (uint16_t)input->sequence, (uint32_t)input->sourceTime, (uint32_t)input->epoch};
}

/** @brief Append one diagnostic row without controlling execution progress.
 * @param[in,out] state Initialized accepted state.
 * @param[in] report Current accepted copied records.
 * @return None. */
static void throughput_history(ThroughputState *state, const ThroughputReport *report)
{
    size_t index;
    /**
    * A full history loses only the new row; existing rows remain intact.
    **/
    if (state->historyEnabled) {
        if (state->historyCount < TP_HISTORY_ROWS) {
            ThroughputHistoryRow *row = &state->history[state->historyCount];
            *row = (ThroughputHistoryRow){0};
            row->tick = report->tick;
            row->offered = report->offeredCount;
            row->dropped = report->droppedCount;
            row->departed = report->departedCount;
            row->queuedCount = report->queuedCount;
            for (index = 0U; index < report->queuedCount; index++) {
                row->queuedIds[index] = report->queued[index].sourceId;
            }
            state->historyCount += 1U;
        } else {
            throughput_increment(&state->diagnostics.historyDropped, &state->diagnostics.saturated);
        }
    }
}

/** @brief Establish a fresh empty bounded queue with fully initialized storage.
 * @param[out] state Genuinely fresh object.
 * @param[in] limit Wide finite number of accepted steps.
 * @param[in] fixture Public normal/counter seed.
 * @param[in] historyEnabled Enable copied rows.
 * @return TP_OK or preserving argument error. */
ThroughputStatus throughput_init(ThroughputState *state, uint64_t limit,
    ThroughputFixture fixture, bool historyEnabled)
{
    /**
    * Validation precedes writing and never inspects old storage.
    **/
    if (state == NULL || limit == 0U || limit > UINT32_MAX ||
        fixture < TP_FIXTURE_NORMAL || fixture > TP_FIXTURE_COUNTER_EDGE) {
        return TP_INVALID_ARGUMENT;
    }
    memset(state, 0, sizeof(*state));
    state->limit = (uint32_t)limit;
    state->historyEnabled = historyEnabled;
    if (fixture == TP_FIXTURE_COUNTER_EDGE) {
        state->diagnostics = (ThroughputDiagnostics){UINT32_MAX - 1U, UINT32_MAX - 1U,
            UINT32_MAX - 1U, UINT32_MAX - 1U, UINT32_MAX - 1U, false};
    }
    return TP_OK;
}

/** @brief Initialize a fresh last-only observer without inspecting prior storage.
 * @param[out] state Fresh object.
 * @param[in] epoch Wide positive source identity.
 * @param[in] fixture Normal/counter edge seed.
 * @return TP_OK or preserving invalid argument. */
ThroughputStatus throughput_sequence_init(ThroughputSequence *state, uint64_t epoch,
    ThroughputFixture fixture)
{
    /**
    * Source epochs and DMA run identities are independent domains.
    **/
    if (state == NULL || epoch == 0U || epoch > UINT32_MAX ||
        fixture < TP_FIXTURE_NORMAL || fixture > TP_FIXTURE_COUNTER_EDGE) {
        return TP_INVALID_ARGUMENT;
    }
    *state = (ThroughputSequence){0};
    state->epoch = (uint32_t)epoch;
    if (fixture == TP_FIXTURE_COUNTER_EDGE) {
        state->diagnostics = (ThroughputSequenceDiagnostics){UINT32_MAX - 1U, UINT32_MAX - 1U,
            UINT32_MAX - 1U, UINT32_MAX - 1U, UINT32_MAX - 1U, UINT32_MAX - 1U, false};
    }
    return TP_OK;
}

/** @brief Classify a single same-epoch observation with unsigned modulo arithmetic.
 * @param[in,out] state Initialized exclusively owned observer.
 * @param[in] epoch Checked source epoch.
 * @param[in] sequence Wide sequence checked before narrowing.
 * @param[out] report Fully initialized output only on TP_OK.
 * @return TP_OK or preserving argument/state/epoch rejection. */
ThroughputStatus throughput_sequence_observe(ThroughputSequence *state, uint64_t epoch,
    uint64_t sequence, ThroughputSequenceReport *report)
{
    uint16_t received;
    uint16_t delta;
    uint32_t gap;
    /**
    * Checks cannot detect an unseen full wrap or a violated true-window promise.
    **/
    if (state == NULL || report == NULL || epoch == 0U || epoch > UINT32_MAX || sequence > UINT16_MAX) {
        return TP_INVALID_ARGUMENT;
    }
    if (state->epoch == 0U) {
        return TP_BAD_STATE;
    }
    if (epoch != state->epoch) {
        return TP_EPOCH_REJECTED;
    }
    received = (uint16_t)sequence;
    delta = (uint16_t)((uint32_t)received + UINT32_C(65536) - (uint32_t)state->last);
    *report = (ThroughputSequenceReport){0};
    throughput_increment(&state->diagnostics.observations, &state->diagnostics.saturated);
    if (!state->seeded) {
        state->seeded = true;
        state->last = received;
        report->order = TP_SEEDED;
    } else if (delta == 0U) {
        report->order = TP_DUPLICATE;
        throughput_increment(&state->diagnostics.duplicates, &state->diagnostics.saturated);
    } else if (delta < UINT16_C(32768)) {
        report->order = TP_FORWARD;
        report->delta = delta;
        report->gap = (uint16_t)(delta - 1U);
        state->last = received;
        throughput_increment(&state->diagnostics.forward, &state->diagnostics.saturated);
        gap = report->gap;
        /**
        * Add the bounded skipped-position count without a loop over the gap.
        **/
        if (gap > UINT32_MAX - state->diagnostics.gaps) {
            state->diagnostics.gaps = UINT32_MAX;
            state->diagnostics.saturated = true;
        } else {
            state->diagnostics.gaps += gap;
        }
    } else if (delta == UINT16_C(32768)) {
        report->order = TP_AMBIGUOUS;
        report->delta = delta;
        throughput_increment(&state->diagnostics.ambiguous, &state->diagnostics.saturated);
    } else {
        report->order = TP_OLDER;
        report->delta = delta;
        throughput_increment(&state->diagnostics.older, &state->diagnostics.saturated);
    }
    report->last = state->last;
    report->diagnostics = state->diagnostics;
    return TP_OK;
}

/** @brief Perform a checked queue-only reset rather than a fresh lifetime reset.
 * @param[in,out] state Initialized valid queue.
 * @return TP_OK or preserving rejection. */
ThroughputStatus throughput_reset(ThroughputState *state)
{
    uint32_t limit;
    bool historyEnabled;
    /**
    * This explicit action discards queued copies, not any producer ownership.
    **/
    if (state == NULL) {
        return TP_INVALID_ARGUMENT;
    }
    if (!throughput_valid(state)) {
        return TP_BAD_STATE;
    }
    limit = state->limit;
    historyEnabled = state->historyEnabled;
    memset(state, 0, sizeof(*state));
    state->limit = limit;
    state->historyEnabled = historyEnabled;
    return TP_OK;
}

/** @brief Apply at most four ordered arrivals then at most four departures.
 * @param[in,out] state Valid exclusive queue.
 * @param[in] offered Real disjoint array with checked count.
 * @param[in] count Wide number of supplied complete records.
 * @param[in] service Wide current service budget, without credit.
 * @param[out] report Completely initialized copied report only on success.
 * @return TP_OK/TERMINAL or preserving rejection. */
ThroughputStatus throughput_step(ThroughputState *state, const ThroughputInput *offered,
    uint64_t count, uint64_t service, ThroughputReport *report)
{
    size_t index;
    /**
    * Check all inputs before any accepted queue, diagnostic or output mutation.
    **/
    if (state == NULL || report == NULL || count > TP_CAPACITY || service > TP_CAPACITY ||
        (count != 0U && offered == NULL)) {
        return TP_INVALID_ARGUMENT;
    }
    if (!throughput_valid(state)) {
        return TP_BAD_STATE;
    }
    for (index = 0U; index < count; index++) {
        if (!throughput_input_valid(&offered[index])) {
            return TP_INVALID_ARGUMENT;
        }
    }
    if (state->tick == state->limit) {
        return TP_TERMINAL;
    }
    /**
    * Zero fixed scalar/enum/bool fields directly, avoiding a report-sized stack temporary.
    **/
    memset(report, 0, sizeof(*report));
    report->tick = state->tick;
    report->offeredCount = (uint32_t)count;
    for (index = 0U; index < count; index++) {
        ThroughputRecord record = throughput_record(&offered[index]);
        report->offered[index] = record;
        throughput_increment(&state->diagnostics.offered, &state->diagnostics.saturated);
        if (state->count < TP_CAPACITY) {
            state->slots[(state->head + state->count) % TP_CAPACITY] = record;
            state->count += 1U;
            report->admitted[report->admittedCount] = record;
            report->admittedCount += 1U;
            throughput_increment(&state->diagnostics.admitted, &state->diagnostics.saturated);
        } else {
            report->dropped[report->droppedCount] = record;
            report->droppedCount += 1U;
            throughput_increment(&state->diagnostics.dropped, &state->diagnostics.saturated);
        }
    }
    for (index = 0U; index < service && state->count != 0U; index++) {
        report->departed[report->departedCount] = state->slots[state->head];
        report->departedCount += 1U;
        state->head = (state->head + 1U) % TP_CAPACITY;
        state->count -= 1U;
        throughput_increment(&state->diagnostics.departed, &state->diagnostics.saturated);
    }
    report->queuedCount = state->count;
    for (index = 0U; index < state->count; index++) {
        report->queued[index] = state->slots[(state->head + index) % TP_CAPACITY];
    }
    state->tick += 1U;
    report->terminal = state->tick == state->limit;
    throughput_history(state, report);
    report->diagnostics = state->diagnostics;
    return TP_OK;
}
