/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file uart.c
 * @author embedded-notes contributors
 * @brief Bounded host parser for an original teaching frame; no wire driver.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "uart.h"
#ifdef UART_TEST
#include <stdio.h>
#endif

/**
 * @brief Discard framing continuity, retaining application and diagnostics.
 * @param[in,out] state Initialized private candidate.
 * @return None.
 */
static void uart_clear(UartState *state)
{
    /** Stale payload remains initialized scratch, never an accepted command. **/
    state->phase = UART_SEEK;
    state->length = 0U;
    state->received = 0U;
    state->checksum = 0U;
    state->age = 0U;
}

/**
 * @brief Validate named metadata using the original FIFO on a private copy.
 * @param[in] state Live fully initialized object.
 * @return True if checkable invariants hold.
 */
static bool uart_valid(const UartState *state)
{
    Fifo probe = state->queue;
    uint8_t ignored;
    FifoStatus status = fifo_pop(&probe, &ignored);

    /** No actual queued byte is consumed during validation. **/
    if ((status != FIFO_OK && status != FIFO_EMPTY) || state->applicationPeriod == 0U ||
        state->applicationPeriod > 1000U || state->age >= UART_TIMEOUT_MS) {
        return false;
    }
    switch (state->phase) {
        case UART_SEEK:
            return state->length == 0U && state->received == 0U && state->age == 0U;
        case UART_LENGTH:
            return state->length == 0U && state->received == 0U;
        case UART_PAYLOAD:
            return state->length >= 1U && state->length <= UART_PAYLOAD_CAPACITY &&
                state->received < state->length;
        case UART_CHECKSUM:
            return state->length >= 1U && state->length <= UART_PAYLOAD_CAPACITY &&
                state->received == state->length;
        default:
            return false;
    }
}

/**
 * @brief Saturate one diagnostic and expose attempted overflow.
 * @param[in,out] counter Private counter.
 * @param[in,out] saturated Private overflow indicator.
 * @return None.
 */
static void uart_increment(uint32_t *counter, bool *saturated)
{
    /** Diagnostic counts never silently wrap. **/
    if (*counter == UINT32_MAX) {
        *saturated = true;
    } else {
        *counter += 1U;
    }
}

/**
 * @brief Append one event inside the proven fixed bound.
 * @param[in,out] report Fresh private result with count below five.
 * @param[in] event One timeout or one event for one consumed byte.
 * @return None.
 */
static void uart_record(UartReport *report, UartEvent event)
{
    /** One initial timeout plus four byte events fits five slots. **/
    report->events[report->eventCount] = event;
    report->eventCount += 1U;
}

/**
 * @brief Validate command-specific length before optional fields.
 * @param[in] state Complete checksum-valid private frame.
 * @param[out] command Independent private command.
 * @return Whether a supported command was copied.
 */
static bool uart_decode(const UartState *state, UartCommand *command)
{
    uint16_t period;

    /** A correct checksum never bypasses application validation. **/
    if (state->length == 1U && state->payload[0] == 2U) {
        *command = (UartCommand){UART_GET_STATUS, state->applicationPeriod};
        return true;
    }
    if (state->length != 3U || state->payload[0] != 1U) {
        return false;
    }
    period = (uint16_t)((uint16_t)state->payload[1] | ((uint16_t)state->payload[2] << 8U));
    if (period == 0U || period > 1000U) {
        return false;
    }
    *command = (UartCommand){UART_SET_PERIOD, period};
    return true;
}

/**
 * @brief Consume a checksum once, including a checksum equal to A5.
 * @param[in,out] state Private candidate.
 * @param[in] byte Consumed checksum.
 * @param[in,out] report Private bounded report.
 * @param[out] command Copied command on acceptance.
 * @return None.
 */
static void uart_finish(UartState *state, uint8_t byte, UartReport *report, UartCommand *command)
{
    UartEvent event;

    /** Reject framing first, then reject unsupported application semantics. **/
    if (byte != state->checksum) {
        event = UART_BAD_CHECKSUM;
    } else if (!uart_decode(state, command)) {
        event = UART_BAD_COMMAND;
    } else {
        event = UART_COMMAND;
        report->commandPresent = true;
        if (command->kind == UART_SET_PERIOD) {
            state->applicationPeriod = command->periodMs;
        }
    }
    if (event == UART_COMMAND) {
        uart_increment(&state->diagnostics.accepted, &state->diagnostics.saturated);
    } else {
        uart_increment(&state->diagnostics.rejected, &state->diagnostics.saturated);
    }
    uart_record(report, event);
    uart_clear(state);
}

/**
 * @brief Consume one byte according to one current framing phase.
 * @param[in,out] state Private initialized candidate.
 * @param[in] byte One copied FIFO value.
 * @param[in,out] report Private bounded result.
 * @param[out] command Private output.
 * @return None.
 */
static void uart_byte(UartState *state, uint8_t byte, UartReport *report, UartCommand *command)
{
    /** Payload follows length, without marker rescans or backtracking. **/
    switch (state->phase) {
        case UART_SEEK:
            if (byte == 0xA5U) {
                state->phase = UART_LENGTH;
                uart_record(report, UART_START);
            } else {
                uart_record(report, UART_NOISE);
            }
            break;
        case UART_LENGTH:
            if (byte == 0U || byte > UART_PAYLOAD_CAPACITY) {
                uart_increment(&state->diagnostics.rejected, &state->diagnostics.saturated);
                uart_clear(state);
                uart_record(report, UART_BAD_LENGTH);
            } else {
                state->length = byte;
                state->checksum = byte;
                state->phase = UART_PAYLOAD;
                uart_record(report, UART_LENGTH_ACCEPTED);
            }
            break;
        case UART_PAYLOAD:
            state->payload[state->received] = byte;
            state->received += 1U;
            state->checksum ^= byte;
            state->phase = state->received == state->length ? UART_CHECKSUM : UART_PAYLOAD;
            uart_record(report, UART_PAYLOAD_ACCEPTED);
            break;
        case UART_CHECKSUM:
            uart_finish(state, byte, report, command);
            break;
        default:
            break;
    }
    state->age = 0U;
}

/**
 * @brief Advance a validated observation and expire before any byte drain.
 * @param[in,out] state Private initialized candidate.
 * @param[in] now Already validated observation.
 * @param[in] elapsed Checked delta below 2^31.
 * @param[in,out] report Fresh bounded private report.
 * @return None.
 */
static void uart_advance(UartState *state, uint32_t now, uint32_t elapsed, UartReport *report)
{
    /** Only the candidate changes; age sum <= 19 + 2147483647 fits uint64_t. **/
    state->lastObserved = now;
    if (state->phase != UART_SEEK) {
        uint64_t age = (uint64_t)state->age + (uint64_t)elapsed;
        if (age >= UART_TIMEOUT_MS) {
            uart_clear(state);
            uart_increment(&state->diagnostics.timeouts, &state->diagnostics.saturated);
            uart_record(report, UART_TIMEOUT);
        } else {
            state->age = (uint32_t)age;
        }
    }
}

/**
 * @brief Initialize deterministic fresh storage without reading old contents.
 * @param[in,out] state Writable real object, possibly fresh.
 * @param[in] initialPeriod Initial application period 1..1000 ms.
 * @param[in] now Initial observation.
 * @return Named status; invalid input preserves state.
 */
UartStatus uart_init(UartState *state, uint16_t initialPeriod, uint32_t now)
{
    UartState next = {0};
    FifoStatus status;

    /** Initialize the borrowed FIFO through its actual public interface. **/
    if (state == NULL || initialPeriod == 0U || initialPeriod > 1000U) {
        return UART_INVALID_ARGUMENT;
    }
    status = fifo_reset(&next.queue);
    if (status != FIFO_OK) {
        return UART_BAD_STATE;
    }
    next.applicationPeriod = initialPeriod;
    next.lastObserved = now;
    *state = next;
    return UART_OK;
}

#ifdef UART_TEST
/**
 * @brief Compare all diagnostics without padding assumptions.
 * @param[in] a Initialized diagnostics.
 * @param[in] b Initialized diagnostics.
 * @return True for equal named fields.
 */
static bool test_diagnostics(UartDiagnostics a, UartDiagnostics b)
{
    /** Saturation belongs to the externally observable diagnostic state. **/
    return a.accepted == b.accepted && a.rejected == b.rejected &&
        a.timeouts == b.timeouts && a.losses == b.losses && a.saturated == b.saturated;
}

/**
 * @brief Compare every named state field, including stale initialized bytes.
 * @param[in] a Real initialized state.
 * @param[in] b Real initialized state.
 * @return True for equality without reading padding.
 */
static bool test_state(const UartState *a, const UartState *b)
{
    size_t index;

    /** Failure preservation includes queue slots and parser scratch. **/
    if (a->phase != b->phase || a->length != b->length || a->received != b->received ||
        a->checksum != b->checksum || a->lastObserved != b->lastObserved || a->age != b->age ||
        a->applicationPeriod != b->applicationPeriod || a->queue.head != b->queue.head ||
        a->queue.tail != b->queue.tail || a->queue.count != b->queue.count ||
        !test_diagnostics(a->diagnostics, b->diagnostics)) {
        return false;
    }
    for (index = 0U; index < UART_PAYLOAD_CAPACITY; index += 1U) {
        if (a->payload[index] != b->payload[index]) {
            return false;
        }
    }
    for (index = 0U; index < FIFO_CAPACITY; index += 1U) {
        if (a->queue.slots[index] != b->queue.slots[index]) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Compare report fields and the entire initialized event array.
 * @param[in] a Initialized report.
 * @param[in] b Initialized report.
 * @return Named-field equality.
 */
static bool test_report(UartReport a, UartReport b)
{
    size_t index;

    /** Unused event slots remain part of the rejection snapshot. **/
    if (a.consumed != b.consumed || a.eventCount != b.eventCount ||
        a.commandPresent != b.commandPresent || !test_diagnostics(a.diagnostics, b.diagnostics)) {
        return false;
    }
    for (index = 0U; index < UART_EVENT_CAPACITY; index += 1U) {
        if (a.events[index] != b.events[index]) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Feed bounded chunks, using only public UART operations.
 * @param[in,out] state Initialized state.
 * @param[in] bytes Fixed independent literal input.
 * @param[in] count Number of real input bytes.
 * @param[in] chunk Chunk size 1..4.
 * @param[in,out] now Accepted service observation.
 * @param[out] report Last report.
 * @param[in,out] command Caller-owned copied result.
 * @return Whether every call succeeded and obeyed resource bounds.
 */
static bool test_feed(UartState *state, const uint8_t *bytes, size_t count, size_t chunk,
    uint32_t *now, UartReport *report, UartCommand *command)
{
    size_t at = 0U;

    /** This helper interleaves ingress and service; it never enqueues a whole long frame. **/
    while (at < count) {
        size_t taken = 0U;
        UartIngress ingress;
        while (taken < chunk && at < count) {
            if (uart_receive(state, bytes[at], &ingress) != UART_OK) {
                return false;
            }
            taken += 1U;
            at += 1U;
        }
        *now += 1U;
        if (uart_poll(state, *now, report, command) != UART_OK || report->consumed > 4U ||
            report->eventCount > 5U || state->queue.count != 0U) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Exercise hand-calculated complete command fixtures.
 * @param[in] None.
 * @return True for fixed period/status/marker/checksum-weakness outcomes.
 */
static bool test_commands(void)
{
    static const uint8_t frames[][6] = {
        {0xA5U, 3U, 1U, 0x64U, 0U, 0x66U},
        {0xA5U, 3U, 1U, 0xA5U, 1U, 0xA6U},
        {0xA5U, 3U, 1U, 1U, 0U, 3U},
        {0xA5U, 3U, 1U, 0xE8U, 3U, 0xE9U},
        {0xA5U, 3U, 1U, 0x65U, 1U, 0x66U}
    };
    static const uint16_t periods[] = {100U, 421U, 1U, 1000U, 357U};
    static const uint8_t status[] = {0xA5U, 1U, 2U, 3U};
    static const uint8_t coalesced[] = {0xA5U, 1U, 2U, 3U, 0xA5U, 1U, 2U, 3U};
    UartState state;
    UartReport report;
    UartCommand command = {UART_GET_STATUS, 777U};
    uint32_t now = 0U;
    size_t chunk;
    size_t frame;

    /** Expected checksums/periods are fixed worked literals, not parser-generated. **/
    for (chunk = 1U; chunk <= 4U; chunk += 1U) {
        if (uart_init(&state, 10U, now) != UART_OK) {
            return false;
        }
        for (frame = 0U; frame < 5U; frame += 1U) {
            if (!test_feed(&state, frames[frame], 6U, chunk, &now, &report, &command) ||
                !report.commandPresent || command.kind != UART_SET_PERIOD ||
                command.periodMs != periods[frame] || state.applicationPeriod != periods[frame]) {
                return false;
            }
        }
        if (!test_feed(&state, status, 4U, chunk, &now, &report, &command) ||
            !report.commandPresent || command.kind != UART_GET_STATUS ||
            command.periodMs != 357U || state.applicationPeriod != 357U) {
            return false;
        }
        if (!test_feed(&state, coalesced, 8U, 4U, &now, &report, &command) ||
            !report.commandPresent || state.diagnostics.accepted != 8U) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Reject literal grammar/checksum/application failures and recover later.
 * @param[in] None.
 * @return True on rejection preservation and fresh-frame acceptance.
 */
static bool test_invalid_frames(void)
{
    static const struct { uint8_t bytes[11]; size_t count; } rows[] = {
        {{0xA5U, 0U}, 2U}, {{0xA5U, 9U}, 2U}, {{0xA5U, 255U}, 2U},
        {{0xA5U, 0xA5U}, 2U},
        {{0xA5U, 1U, 2U, 0xA5U}, 4U},
        {{0xA5U, 1U, 0xA4U, 0xA5U}, 4U},
        {{0xA5U, 1U, 3U, 2U}, 4U},
        {{0xA5U, 1U, 1U, 0U}, 4U},
        {{0xA5U, 3U, 2U, 0U, 0U, 1U}, 6U},
        {{0xA5U, 3U, 1U, 0U, 0U, 2U}, 6U},
        {{0xA5U, 3U, 1U, 0xE9U, 3U, 0xE8U}, 6U},
        {{0xA5U, 3U, 1U, 0xFFU, 0xFFU, 2U}, 6U},
        {{0xA5U, 8U, 1U, 2U, 3U, 4U, 5U, 6U, 7U, 8U, 0U}, 11U}
    };
    static const uint8_t status[] = {0xA5U, 1U, 2U, 3U};
    UartState state;
    UartReport report;
    UartCommand command;
    uint32_t now = 0U;
    size_t index;

    /** LEN8 is a valid frame bound but unsupported command-specific length. **/
    for (index = 0U; index < sizeof rows / sizeof rows[0]; index += 1U) {
        command = (UartCommand){UART_SET_PERIOD, 555U};
        if (uart_init(&state, 100U, now) != UART_OK ||
            !test_feed(&state, rows[index].bytes, rows[index].count, 4U, &now, &report, &command) ||
            report.commandPresent || command.kind != UART_SET_PERIOD || command.periodMs != 555U ||
            state.applicationPeriod != 100U || state.phase != UART_SEEK ||
            state.diagnostics.rejected != 1U) {
            return false;
        }
        if (!test_feed(&state, status, 4U, 4U, &now, &report, &command) ||
            !report.commandPresent || command.kind != UART_GET_STATUS || command.periodMs != 100U) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Exercise simultaneous timeout/command and accepted-command preservation.
 * @param[in] None.
 * @return True if bounded event ordering and copied results survive later bytes.
 */
static bool test_event_order(void)
{
    static const uint8_t prefix[] = {0xA5U, 1U, 2U};
    static const uint8_t suffix[] = {3U, 0U, 0xA5U, 0U};
    static const uint8_t status[] = {0xA5U, 1U, 2U, 3U};
    UartState state;
    UartIngress ingress;
    UartReport report;
    UartCommand command = {UART_SET_PERIOD, 555U};
    uint32_t now = 0U;
    size_t index;

    /** One completion in byte1 leaves only three bytes: no second complete frame fits. **/
    if (uart_init(&state, 100U, now) != UART_OK ||
        !test_feed(&state, prefix, 3U, 4U, &now, &report, &command) ||
        !test_feed(&state, suffix, 4U, 4U, &now, &report, &command) ||
        !report.commandPresent || command.kind != UART_GET_STATUS || command.periodMs != 100U ||
        report.events[0] != UART_COMMAND || report.events[3] != UART_BAD_LENGTH) {
        return false;
    }
    if (uart_receive(&state, 0xA5U, &ingress) != UART_OK ||
        uart_poll(&state, 3U, &report, &command) != UART_OK) {
        return false;
    }
    for (index = 0U; index < 4U; index += 1U) {
        if (uart_receive(&state, status[index], &ingress) != UART_OK) {
            return false;
        }
    }
    return uart_poll(&state, 23U, &report, &command) == UART_OK && report.commandPresent &&
        report.consumed == 4U && report.eventCount == 5U && report.events[0] == UART_TIMEOUT &&
        report.events[4] == UART_COMMAND && state.diagnostics.timeouts == 1U;
}

/**
 * @brief Check exact timeout equality, late buffered suffix, age reset and wrap.
 * @param[in] None.
 * @return True for independent timeout fixtures.
 */
static bool test_timeout(void)
{
    static const uint8_t prefix[] = {0xA5U, 3U, 1U, 0x64U};
    UartState state;
    UartIngress ingress;
    UartReport report;
    UartCommand command = {UART_SET_PERIOD, 555U};
    uint32_t now = 0U;

    /** Buffered bytes carry no arrival timestamp and expire before delayed drain. **/
    if (uart_init(&state, 100U, 0U) != UART_OK ||
        !test_feed(&state, prefix, 4U, 4U, &now, &report, &command) ||
        uart_receive(&state, 0U, &ingress) != UART_OK ||
        uart_receive(&state, 0x66U, &ingress) != UART_OK ||
        uart_poll(&state, 20U, &report, &command) != UART_OK || state.age != 0U ||
        state.diagnostics.timeouts != 0U || !report.commandPresent || command.periodMs != 100U) {
        return false;
    }
    if (uart_init(&state, 100U, 0U) != UART_OK ||
        !test_feed(&state, prefix, 4U, 4U, &now, &report, &command)) {
        return false;
    }
    if (uart_receive(&state, 0U, &ingress) != UART_OK ||
        uart_receive(&state, 0x66U, &ingress) != UART_OK ||
        uart_poll(&state, now + 20U, &report, &command) != UART_OK ||
        report.commandPresent || report.events[0] != UART_TIMEOUT || state.phase != UART_SEEK ||
        state.applicationPeriod != 100U || command.periodMs != 100U) {
        return false;
    }
    if (uart_init(&state, 100U, UINT32_C(4294967290)) != UART_OK ||
        uart_receive(&state, 0xA5U, &ingress) != UART_OK ||
        uart_poll(&state, UINT32_C(4294967290), &report, &command) != UART_OK ||
        uart_poll(&state, 13U, &report, &command) != UART_OK || state.age != 19U ||
        uart_poll(&state, 14U, &report, &command) != UART_OK || state.phase != UART_SEEK ||
        report.events[0] != UART_TIMEOUT ||
        uart_poll(&state, 15U, &report, &command) != UART_OK || report.eventCount != 0U) {
        return false;
    }
    if (uart_receive(&state, 0xA5U, &ingress) != UART_OK ||
        uart_poll(&state, 16U, &report, &command) != UART_OK ||
        uart_receive(&state, 1U, &ingress) != UART_OK ||
        uart_poll(&state, 35U, &report, &command) != UART_OK || state.age != 0U ||
        uart_poll(&state, 54U, &report, &command) != UART_OK || state.age != 19U) {
        return false;
    }
    return true;
}

/**
 * @brief Check FIFO FULL preservation followed by explicit transport discard.
 * @param[in] None.
 * @return True when the failed A5 is dropped and later fresh frames recover.
 */
static bool test_loss(void)
{
    static const uint8_t status[] = {0xA5U, 1U, 2U, 3U};
    UartState state;
    UartIngress ingress;
    UartReport report;
    UartCommand command = {UART_SET_PERIOD, 555U};
    Fifo before;
    uint32_t now = 0U;
    size_t index;

    /** First demonstrate the borrowed FIFO contract without transport recovery. **/
    if (uart_init(&state, 100U, now) != UART_OK ||
        uart_receive(&state, 0xA5U, &ingress) != UART_OK ||
        uart_poll(&state, 0U, &report, &command) != UART_OK) {
        return false;
    }
    for (index = 0U; index < 4U; index += 1U) {
        if (uart_receive(&state, (uint16_t)index, &ingress) != UART_OK) {
            return false;
        }
    }
    before = state.queue;
    if (fifo_push(&state.queue, 0xA5U) != FIFO_FULL || state.queue.head != before.head ||
        state.queue.tail != before.tail || state.queue.count != before.count) {
        return false;
    }
    for (index = 0U; index < 4U; index += 1U) {
        if (state.queue.slots[index] != before.slots[index]) {
            return false;
        }
    }
    if (uart_receive(&state, 0xA5U, &ingress) != UART_LOSS ||
        ingress.fifoStatus != FIFO_FULL || ingress.queuedBeforeLoss != 4U ||
        !ingress.fullPreservedBeforeDiscard || state.queue.count != 0U || state.phase != UART_SEEK ||
        state.applicationPeriod != 100U || command.periodMs != 555U ||
        uart_poll(&state, 1U, &report, &command) != UART_OK || report.eventCount != 0U) {
        return false;
    }
    now = 1U;
    return test_feed(&state, status, 4U, 4U, &now, &report, &command) &&
        report.commandPresent && command.kind == UART_GET_STATUS && command.periodMs == 100U;
}

/**
 * @brief Reject independent initialized metadata fixtures through public calls.
 * @param[in] None.
 * @return Whether every named field remains preserved.
 */
static bool test_bad_metadata(void)
{
    static const UartState seed = {
        .queue = {{0xA5U, 0U, 0U, 0U}, 0U, 1U, 1U},
        .phase = UART_SEEK, .lastObserved = 10U, .applicationPeriod = 100U
    };
    static const UartReport saved = {2U, 1U, {UART_START}, true, {1U, 2U, 3U, 4U, true}};
    static const struct {
        UartPhase phase;
        size_t length;
        size_t received;
        uint32_t age;
        uint16_t period;
        size_t count;
    } rows[] = {
        {UART_SEEK, 0U, 0U, 0U, 100U, 5U}, {(UartPhase)99, 0U, 0U, 0U, 100U, 1U},
        {UART_SEEK, 0U, 0U, 20U, 100U, 1U}, {UART_SEEK, 9U, 0U, 0U, 100U, 1U},
        {UART_SEEK, 0U, 0U, 0U, 0U, 1U}, {UART_LENGTH, 1U, 0U, 0U, 100U, 1U},
        {UART_PAYLOAD, 0U, 0U, 0U, 100U, 1U}, {UART_PAYLOAD, 9U, 0U, 0U, 100U, 1U},
        {UART_PAYLOAD, 1U, 1U, 0U, 100U, 1U}, {UART_CHECKSUM, 1U, 0U, 0U, 100U, 1U},
        {UART_SEEK, 0U, 0U, 1U, 100U, 1U}, {UART_SEEK, 0U, 0U, 0U, 1001U, 1U}
    };
    size_t index;

    /** These are legal C objects with deliberately inconsistent named values. **/
    for (index = 0U; index < sizeof rows / sizeof rows[0]; index += 1U) {
        UartState state = seed;
        UartState bad;
        UartReport report = saved;
        UartIngress ingress = {FIFO_EMPTY, 3U, true};
        UartCommand command = {UART_SET_PERIOD, 555U};
        state.phase = rows[index].phase;
        state.length = rows[index].length;
        state.received = rows[index].received;
        state.age = rows[index].age;
        state.applicationPeriod = rows[index].period;
        state.queue.count = rows[index].count;
        bad = state;
        if (uart_poll(&state, 11U, &report, &command) != UART_BAD_STATE ||
            uart_receive(&state, 0U, &ingress) != UART_BAD_STATE ||
            !test_state(&state, &bad) || !test_report(report, saved) || command.periodMs != 555U ||
            ingress.fifoStatus != FIFO_EMPTY || ingress.queuedBeforeLoss != 3U ||
            !ingress.fullPreservedBeforeDiscard) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Check invalid observation/state/arguments before any accepted mutation.
 * @param[in] None.
 * @return True for named-field/output preservation.
 */
static bool test_rejection(void)
{
    UartState state;
    UartState before;
    UartReport report = {2U, 1U, {UART_START}, true, {1U, 2U, 3U, 4U, true}};
    UartReport saved = report;
    UartIngress ingress = {FIFO_EMPTY, 3U, true};
    UartCommand command = {UART_SET_PERIOD, 555U};

    /** Fault fixtures are real initialized objects, never arbitrary bad addresses. **/
    if (uart_init(&state, 100U, 10U) != UART_OK ||
        uart_receive(&state, 0xA5U, &ingress) != UART_OK) {
        return false;
    }
    before = state;
    if (uart_poll(&state, UINT32_C(2147483658), &report, &command) != UART_TIME_REJECTED ||
        !test_state(&state, &before) || !test_report(report, saved) || command.periodMs != 555U ||
        uart_init(&state, 0U, 0U) != UART_INVALID_ARGUMENT || !test_state(&state, &before) ||
        uart_init(&state, 1001U, 0U) != UART_INVALID_ARGUMENT || !test_state(&state, &before) ||
        uart_receive(&state, 256U, &ingress) != UART_INVALID_ARGUMENT ||
        !test_state(&state, &before) || uart_init(NULL, 100U, 0U) != UART_INVALID_ARGUMENT ||
        uart_receive(NULL, 0U, &ingress) != UART_INVALID_ARGUMENT ||
        uart_receive(&state, 0U, NULL) != UART_INVALID_ARGUMENT ||
        uart_poll(NULL, 11U, &report, &command) != UART_INVALID_ARGUMENT ||
        uart_poll(&state, 11U, NULL, &command) != UART_INVALID_ARGUMENT ||
        uart_poll(&state, 11U, &report, NULL) != UART_INVALID_ARGUMENT) {
        return false;
    }
    if (!test_state(&state, &before) || !test_report(report, saved)) {
        return false;
    }
    return uart_init(&state, 100U, 0U) == UART_OK &&
        uart_poll(&state, TIME_MAX_PERIOD, &report, &command) == UART_OK &&
        state.lastObserved == TIME_MAX_PERIOD && report.consumed == 0U &&
        uart_poll(&state, UINT32_C(4294967294), &report, &command) == UART_OK &&
        state.lastObserved == UINT32_C(4294967294) && command.periodMs == 555U;
}

/**
 * @brief Check observable saturation for every diagnostic and finite all-noise input.
 * @param[in] None.
 * @return True if no diagnostic wraps and work remains bounded.
 */
static bool test_saturation(void)
{
    static const uint8_t status[] = {0xA5U, 1U, 2U, 3U};
    static const uint8_t bad[] = {0xA5U, 0U};
    UartState state;
    UartIngress ingress;
    UartReport report;
    UartCommand command = {UART_SET_PERIOD, 555U};
    uint32_t now = 0U;
    size_t index;

    /** Counters may reach maximum; the next increment sets the sticky indicator. **/
    if (uart_init(&state, 100U, 0U) != UART_OK) {
        return false;
    }
    state.diagnostics.accepted = UINT32_MAX;
    state.diagnostics.rejected = UINT32_MAX;
    state.diagnostics.timeouts = UINT32_MAX;
    state.diagnostics.losses = UINT32_MAX;
    if (!test_feed(&state, status, 4U, 4U, &now, &report, &command) ||
        state.diagnostics.accepted != UINT32_MAX || !report.diagnostics.saturated) {
        return false;
    }
    state.diagnostics.saturated = false;
    if (!test_feed(&state, bad, 2U, 4U, &now, &report, &command) ||
        state.diagnostics.rejected != UINT32_MAX || !state.diagnostics.saturated) {
        return false;
    }
    state.diagnostics.saturated = false;
    if (
        uart_receive(&state, 0xA5U, &ingress) != UART_OK ||
        uart_poll(&state, now, &report, &command) != UART_OK ||
        uart_poll(&state, now + 20U, &report, &command) != UART_OK ||
        state.diagnostics.timeouts != UINT32_MAX || !state.diagnostics.saturated) {
        return false;
    }
    now += 20U;
    state.diagnostics.saturated = false;
    for (index = 0U; index < 5U; index += 1U) {
        UartStatus expected = index == 4U ? UART_LOSS : UART_OK;
        if (uart_receive(&state, 0U, &ingress) != expected) {
            return false;
        }
    }
    if (state.diagnostics.losses != UINT32_MAX || !state.diagnostics.saturated) {
        return false;
    }
    return true;
}

/**
 * @brief Exercise a fixed 1000-poll all-noise stream through public calls.
 * @param[in] None.
 * @return True if every call consumes four bytes without producing a command.
 */
static bool test_noise(void)
{
    static const uint8_t noise[] = {0U, 1U, 2U, 3U};
    UartState state;
    UartReport report;
    UartCommand command = {UART_SET_PERIOD, 555U};
    uint32_t now = 0U;
    size_t index;

    /** The workload is fixed rather than waiting for a condition to become true. **/
    if (uart_init(&state, 100U, now) != UART_OK) {
        return false;
    }
    for (index = 0U; index < 1000U; index += 1U) {
        if (!test_feed(&state, noise, 4U, 4U, &now, &report, &command) ||
            report.consumed != 4U || report.commandPresent || state.phase != UART_SEEK) {
            return false;
        }
    }
    return command.kind == UART_SET_PERIOD && command.periodMs == 555U;
}

/**
 * @brief Run active public-interface tests in normal and NDEBUG builds.
 * @param[in] None.
 * @return Zero only for all checks and successful output.
 */
int main(void)
{
    static const struct { const char *name; bool (*run)(void); } cases[] = {
        {"commands", test_commands}, {"invalid frames", test_invalid_frames},
        {"event order", test_event_order}, {"timeout", test_timeout},
        {"loss", test_loss}, {"rejection", test_rejection}, {"metadata", test_bad_metadata},
        {"saturation", test_saturation}, {"noise", test_noise}
    };
    size_t index;

    /** Tests use ordinary checks, not assert, and never touch hardware. **/
    for (index = 0U; index < sizeof cases / sizeof cases[0]; index += 1U) {
        if (!cases[index].run()) {
            if (fprintf(stderr, "FAIL UART case: %s\n", cases[index].name) < 0) {
                return 2;
            }
            return 1;
        }
    }
    if (puts("PASS UART: literals, fragments, events, timeout, loss, rejection, saturation, separate FIFO/time") < 0 ||
        fflush(stdout) != 0) {
        return 1;
    }
    if (printf("Host sizes: Fifo=%zu UartState=%zu UartReport=%zu UartIngress=%zu UartCommand=%zu Diagnostics=%zu\n",
        sizeof(Fifo), sizeof(UartState), sizeof(UartReport), sizeof(UartIngress),
        sizeof(UartCommand), sizeof(UartDiagnostics)) < 0 || fflush(stdout) != 0) {
        return 1;
    }
    return 0;
}
#endif

/**
 * @brief Queue a wide-validated byte, or discard continuity after FULL.
 * @param[in,out] state Live initialized exclusive state.
 * @param[in] byte Wide input checked before narrowing.
 * @param[out] report Disjoint writable ingress report.
 * @return Named status; UART_LOSS deliberately changes queue/parser.
 */
UartStatus uart_receive(UartState *state, uint16_t byte, UartIngress *report)
{
    UartState next;
    UartIngress result = {FIFO_OK, 0U, false};

    /** Candidate storage preserves every named field on checkable rejection. **/
    if (state == NULL || report == NULL || byte > UINT8_MAX) {
        return UART_INVALID_ARGUMENT;
    }
    if (!uart_valid(state)) {
        return UART_BAD_STATE;
    }
    next = *state;
    result.fifoStatus = fifo_push(&next.queue, (uint8_t)byte);
    if (result.fifoStatus == FIFO_FULL) {
        result.queuedBeforeLoss = next.queue.count;
        result.fullPreservedBeforeDiscard = true;
        if (fifo_reset(&next.queue) != FIFO_OK) {
            return UART_BAD_STATE;
        }
        uart_clear(&next);
        uart_increment(&next.diagnostics.losses, &next.diagnostics.saturated);
    } else if (result.fifoStatus != FIFO_OK) {
        return UART_BAD_STATE;
    }
    *state = next;
    *report = result;
    return result.fifoStatus == FIFO_FULL ? UART_LOSS : UART_OK;
}

/**
 * @brief Validate time, expire partial state, then drain at most four bytes.
 * @param[in,out] state Live initialized exclusive state.
 * @param[in] now Observation under the true-gap promise.
 * @param[out] report Disjoint writable finite report.
 * @param[out] command Disjoint output changed only on new command.
 * @return Named status; rejection preserves named state and outputs.
 */
UartStatus uart_poll(UartState *state, uint32_t now, UartReport *report, UartCommand *command)
{
    UartState next;
    UartReport result = {0};
    UartCommand accepted = {UART_GET_STATUS, 0U};
    uint32_t elapsed;
    uint8_t byte;
    size_t budget;

    /** Time validation precedes actual queue/parser/application mutation. **/
    if (state == NULL || report == NULL || command == NULL) {
        return UART_INVALID_ARGUMENT;
    }
    if (!uart_valid(state)) {
        return UART_BAD_STATE;
    }
    if (time_elapsed(state->lastObserved, now, &elapsed) != TIME_OK) {
        return UART_TIME_REJECTED;
    }
    next = *state;
    uart_advance(&next, now, elapsed, &result);
    for (budget = 0U; budget < FIFO_CAPACITY; budget += 1U) {
        FifoStatus status = fifo_pop(&next.queue, &byte);
        if (status == FIFO_EMPTY) {
            break;
        }
        if (status != FIFO_OK) {
            return UART_BAD_STATE;
        }
        uart_byte(&next, byte, &result, &accepted);
        result.consumed += 1U;
    }
    result.diagnostics = next.diagnostics;
    *state = next;
    *report = result;
    if (result.commandPresent) {
        *command = accepted;
    }
    return UART_OK;
}
