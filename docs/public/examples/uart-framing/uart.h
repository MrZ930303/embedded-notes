/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file uart.h
 * @author embedded-notes contributors
 * @brief Bounded byte FIFO to original framed commands; no UART registers.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_UART_H
#define EMBEDDED_NOTES_UART_H

#include "../bounded-fifo/fifo.h"
#include "../timer-pwm/time.h"
#include <stdbool.h>

#define UART_PAYLOAD_CAPACITY 8U
#define UART_EVENT_CAPACITY 5U
#define UART_TIMEOUT_MS 20U

typedef enum { UART_OK = 0, UART_INVALID_ARGUMENT, UART_BAD_STATE, UART_TIME_REJECTED, UART_LOSS } UartStatus;
typedef enum { UART_SEEK = 0, UART_LENGTH, UART_PAYLOAD, UART_CHECKSUM } UartPhase;
typedef enum { UART_SET_PERIOD = 1, UART_GET_STATUS = 2 } UartCommandKind;
typedef enum {
    UART_NOISE = 0, UART_START, UART_LENGTH_ACCEPTED, UART_PAYLOAD_ACCEPTED,
    UART_BAD_LENGTH, UART_BAD_CHECKSUM, UART_BAD_COMMAND, UART_COMMAND, UART_TIMEOUT
} UartEvent;

typedef struct { UartCommandKind kind; uint16_t periodMs; } UartCommand;
typedef struct {
    uint32_t accepted;
    uint32_t rejected;
    uint32_t timeouts;
    uint32_t losses;
    bool saturated;
} UartDiagnostics;
typedef struct {
    Fifo queue;
    UartPhase phase;
    uint8_t payload[UART_PAYLOAD_CAPACITY];
    size_t length;
    size_t received;
    uint8_t checksum;
    uint32_t lastObserved;
    uint32_t age;
    uint16_t applicationPeriod;
    UartDiagnostics diagnostics;
} UartState;
typedef struct {
    FifoStatus fifoStatus;
    size_t queuedBeforeLoss;
    bool fullPreservedBeforeDiscard;
} UartIngress;
typedef struct {
    size_t consumed;
    size_t eventCount;
    UartEvent events[UART_EVENT_CAPACITY];
    bool commandPresent;
    UartDiagnostics diagnostics;
} UartReport;

/*
 * C11 with eight-bit bytes and exact-width types required by both dependencies.
 * One tick = 1 ms. True forward gaps between accepted polls must be < 2^31 ms;
 * observed delta >= 2^31 is rejected. Unseen complete wraps cannot be detected.
 * Timeout is parser/service-observed inactivity, NOT wire interbyte timing.
 * Every byte drained in a poll shares now. Delayed drain can expire buffered data.
 *
 * All nonnull pointers name real, live, correctly typed, sufficiently sized
 * objects. Outputs are writable and disjoint from state and each other. Init
 * may receive fresh storage; later calls require all fields initialized and
 * exclusively owned. Do not externally modify metadata. Null checks do not
 * validate forged/dangling pointers or overlap. Single execution context,
 * non-reentrant; no ISR/DMA/task/concurrent SPSC safety. volatile is no repair.
 * No heap, recursion, waits, callbacks or hardware I/O. Poll consumes at most
 * four bytes, records at most five events and accepts at most one command.
 * Invalid argument/state/time leaves every named state/output field unchanged.
 * UART_LOSS is a deliberate valid transition: discard queue and partial parser,
 * drop the failed byte, preserve applicationPeriod. Later fresh input recovers.
 * Counters saturate at UINT32_MAX; attempted increments there set saturated.
 * Output command changes only when report.commandPresent is true. A status
 * command copies the current period, without changing applicationPeriod.
 */

/**
 * @brief Initialize fresh real storage without reading prior contents.
 * @param[in,out] state Writable object, possibly fresh.
 * @param[in] initialPeriod Application seed in 1..1000 ms.
 * @param[in] now Initial uint32 observation.
 * @return UART_OK or UART_INVALID_ARGUMENT; rejection preserves state.
 */
UartStatus uart_init(UartState *state, uint16_t initialPeriod, uint32_t now);

/**
 * @brief Queue one checked wide byte, or explicitly discard continuity on FULL.
 * @param[in,out] state Live initialized exclusive state.
 * @param[in] byte Value 0..255; rejected before narrowing otherwise.
 * @param[out] report Independent real writable ingress result.
 * @return UART_OK, UART_LOSS, UART_INVALID_ARGUMENT or UART_BAD_STATE.
 */
UartStatus uart_receive(UartState *state, uint16_t byte, UartIngress *report);

/**
 * @brief Check time/timeout before a bounded four-byte drain.
 * @param[in,out] state Live initialized exclusive state.
 * @param[in] now Forward observation under the true-gap promise.
 * @param[out] report Independent real writable finite event result.
 * @param[out] command Independent output, changed only for a new command.
 * @return UART_OK, UART_INVALID_ARGUMENT, UART_BAD_STATE or UART_TIME_REJECTED.
 */
UartStatus uart_poll(UartState *state, uint32_t now, UartReport *report, UartCommand *command);

#endif
