/******************************************************************************
 * @file runtime_image.h
 * @brief Original embedded-notes fictional image transaction interface.
 * @author embedded-notes project contributors
 * @version V1.0 2026-10-17
 * Original project teaching code; no third-party authorship or license implied.
 *****************************************************************************/
#ifndef RUNTIME_IMAGE_H
#define RUNTIME_IMAGE_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#define RUNTIME_CAPACITY 64U
typedef enum {
    RUNTIME_OK,
    RUNTIME_INVALID_ARGUMENT,
    RUNTIME_BAD_LENGTH,
    RUNTIME_ADDRESS_OVERFLOW,
    RUNTIME_BAD_VECTOR,
    RUNTIME_BAD_SP,
    RUNTIME_BAD_ENTRY,
    RUNTIME_BAD_RANGE,
    RUNTIME_OVERLAP
} RuntimeStatus;
typedef struct {
    uint32_t flashBase;
    uint32_t ramBase;
    size_t flashLength;
    size_t ramLength;
    uint32_t execStart;
    uint32_t execEnd;
    size_t dataSource;
    size_t dataDestination;
    size_t dataLength;
    size_t bssDestination;
    size_t bssLength;
} RuntimeRequest;
typedef struct {
    uint32_t initialSp;
    uint32_t entryWord;
    uint32_t entryTarget;
    size_t copied;
    size_t zeroed;
    bool mainReady;
} RuntimeReport;
/**
 * @brief Validate a complete request, prepare private RAM, then commit on OK.
 * @param[in] flash Live readable initialized byte object, truthful flashLength.
 * @param[in] request Live fully initialized request. Lengths are at most64.
 * @param[in,out] ram Live writable initialized object, truthful ramLength.
 * @param[in,out] report Live writable initialized report; unchanged on rejection.
 * @return Explicit status; OK means fictional main-ready, never a branch.
 * All four objects must be distinct, nonoverlapping and live throughout the call.
 * One execution context, no concurrent mutation. NULL is checked. Forged/dangling
 * pointers, dishonest spans and caller alias violations are not detected.
 * Labels are32-bit integers, not pointers. Eight-byte SP alignment and an
 * inclusive RAM boundary interval are model policies. Endpoints must be
 * representable as uint32_t; empty regions still need in-object endpoints.
 */
RuntimeStatus runtime_image_initialize(const uint8_t *flash, const RuntimeRequest *request,
                                       uint8_t *ram, RuntimeReport *report);
#endif
