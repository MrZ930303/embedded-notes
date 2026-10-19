/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file bus.h
 * @author embedded-notes contributors
 * @brief Bounded supplied-event LIS3DH host transaction, not an MMIO driver.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_BUS_H
#define EMBEDDED_NOTES_BUS_H
#include <stdbool.h>
#include <stdint.h>

#define BUS_DEADLINE_MS UINT32_C(20)

typedef enum { BUS_I2C = 0, BUS_SPI } BusProtocol;
typedef enum {
    BUS_OK = 0, BUS_INVALID_ARGUMENT, BUS_BAD_STATE, BUS_BUSY, BUS_TIME_REJECTED
} BusCallStatus;
typedef enum { BUS_IDLE = 0, BUS_PENDING, BUS_READY, BUS_FAILED } BusStatus;
typedef enum {
    BUS_WAIT_FREE = 0, BUS_START, BUS_ADDRESS_WRITE, BUS_SUBADDRESS, BUS_RESTART,
    BUS_ADDRESS_READ, BUS_DATA, BUS_FINAL_NACK, BUS_STOP, BUS_SELECT, BUS_COMMAND,
    BUS_SPI_DATA, BUS_DESELECT, BUS_ERROR_STOP, BUS_DONE
} BusPhase;
typedef enum {
    BUS_CAUSE_NONE = 0, BUS_ADDRESS_NACK, BUS_DATA_NACK, BUS_ARLO,
    BUS_TIMEOUT, BUS_BACKEND, BUS_STUCK
} BusCause;
typedef enum { BUS_RELEASED = 0, BUS_OWNED, BUS_LOST, BUS_UNKNOWN } BusResource;
typedef enum { BUS_EVENT_OK = 0, BUS_EVENT_WAIT, BUS_EVENT_NACK,
    BUS_EVENT_ARLO, BUS_EVENT_ERROR, BUS_EVENT_STUCK } BusEventKind;
typedef struct { BusProtocol protocol; uint8_t address7; uint8_t reg; } BusRequest;
typedef struct { BusEventKind kind; uint8_t received; } BusEvent;
typedef struct {
    BusStatus status;
    BusPhase phase;
    BusPhase nextPhase;
    BusCause cause;
    BusCause policyCause;
    BusPhase failurePhase;
    BusResource resource;
    uint32_t elapsed;
    bool action;
    bool transmitted;
    uint8_t tx;
    bool discarded;
    bool candidatePresent;
    uint8_t candidate;
    bool resultPresent;
    uint8_t result;
    bool newResult;
    bool identityMatches;
} BusReport;
typedef struct {
    uint32_t initialized;
    BusRequest request;
    BusStatus status;
    BusPhase phase;
    BusCause cause;
    BusCause policyCause;
    BusPhase failurePhase;
    BusResource resource;
    uint32_t lastObserved;
    uint32_t elapsed;
    bool candidatePresent;
    uint8_t candidate;
    bool resultPresent;
    uint8_t result;
} BusState;

/* One exclusive, non-reentrant execution context; no IRQ/concurrency/heap/MMIO.
 * All nonnull pointers name real live correctly typed objects of honest extent.
 * State, request/event and report must be disjoint. init alone accepts fresh
 * uninitialized storage; never call it to erase a live operation or uncertainty.
 * Other calls require initialization and intact named metadata. Checked nulls
 * do not validate dangling/forged pointers, aliasing or arbitrary corruption.
 * One tick = 1ms; true forward inter-observation gap <2^31 is caller's promise.
 * Observed delta >=2^31 rejects before ALL state/report changes. Equal samples
 * are valid; unseen full wraps cannot be detected. Deadline equality expires.
 * No callbacks/retry/cancel/reset/physical bus-clear API. Explicit start after
 * terminal is allowed only for RELEASED/LOST local resources and is not retry
 * policy or proof of free physical lines. UNKNOWN refuses resource reuse.
 * Constant storage: one copied 3-field request, one candidate, one committed byte;
 * one supplied event and one output report per call, no event queue/history.
 */

/**
 * @brief Initialize genuinely fresh storage without reading old members.
 * @param[out] state Writable fresh object with no live old resource.
 * @return BUS_OK or BUS_INVALID_ARGUMENT; invalid preserves named fields.
 */
BusCallStatus bus_init(BusState *state);

/**
 * @brief Validate/copy selected WHO_AM_I request; no protocol action.
 * @param[in,out] state Initialized state; previous result survives admission.
 * @param[in] request I2C/SPI, address7=0x18, reg=0x0F; pointer not retained.
 * @param[in] now Any tick for first admission, checked observation thereafter.
 * @return BUS_OK, INVALID_ARGUMENT, BAD_STATE, BUS_BUSY or TIME_REJECTED.
 */
BusCallStatus bus_start(BusState *state, const BusRequest *request, uint32_t now);

/**
 * @brief Observe deadline first, then consume at most one supplied phase event.
 * @param[in,out] state Initialized state; invalid call/time preserves all fields.
 * @param[in] now Forward observation; equality20 expires before event acceptance.
 * @param[in] event WAIT waits, OK advances; NACK only valid on I2C address/SUB;
 * ARLO only on owned I2C; STUCK/ERROR on any active phase. Invalid event rejects.
 * @param[out] report Disjoint writable object, unchanged on rejected call.
 * phase is this call's executed/detected phase; nextPhase is resulting state.
 * cause/failurePhase preserve the initiating fault across ERROR_STOP; policyCause
 * records a later TIMEOUT without erasing it. action is at most
 * one logical phase (WAIT/deadline/terminal calls have none). resultPresent may
 * describe an older result; ONLY newResult authorizes a fresh successful value.
 * @return BUS_OK for a report, otherwise named rejection with no mutation.
 */
BusCallStatus bus_poll(BusState *state, uint32_t now, const BusEvent *event, BusReport *report);
#endif
