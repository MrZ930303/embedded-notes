/******************************************************************************
 * @file fifo.h
 * @brief Original embedded-notes four-byte, single-context FIFO interface.
 * @version V1.0 2026-10-17
 *
 * C11, eight-bit bytes and uint8_t. Four internally owned byte values.
 * Reset a real writable Fifo before use; reset does not read prior contents.
 * Later operations require that same live initialized object. Callers must not
 * edit metadata. head is next read, tail next write, count occupancy.
 * Single thread, single execution context, non-reentrant; not task/ISR/DMA-safe
 * or concurrent SPSC. volatile supplies no synchronization or atomicity.
 * Pop output is a live writable caller byte outside the entire Fifo object.
 * Null is rejected, but forged/dangling pointers and overlap are not detected.
 * Metadata checks require real fully initialized objects. Rejection preserves
 * all fields and pop output. Success copies values; no pointer is retained.
 * Bounded operations: no allocation, blocking, waiting or retry.
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_BOUNDED_FIFO_H
#define EMBEDDED_NOTES_BOUNDED_FIFO_H

#include <limits.h>
#include <stddef.h>
#include <stdint.h>

#define FIFO_CAPACITY 4U
#if CHAR_BIT != 8 || !defined(UINT8_MAX)
#error "This example requires eight-bit bytes and uint8_t."
#endif

typedef enum {
    FIFO_OK,
    FIFO_FULL,
    FIFO_EMPTY,
    FIFO_INVALID_ARGUMENT,
    FIFO_BAD_STATE
} FifoStatus;

typedef struct {
    uint8_t slots[FIFO_CAPACITY];
    size_t head;
    size_t tail;
    size_t count;
} Fifo;

/**
 * @brief Establish an empty queue without reading prior contents.
 * @param[in,out] queue Real writable queue object, or null.
 * @return FIFO_OK or FIFO_INVALID_ARGUMENT.
 */
FifoStatus fifo_reset(Fifo *queue);

/**
 * @brief Copy one value into a single-context initialized queue.
 * @param[in,out] queue Live initialized Fifo, or null.
 * @param[in] value Byte copied by value; validate wider inputs before narrowing.
 * @return FIFO_OK/FIFO_FULL/FIFO_INVALID_ARGUMENT/FIFO_BAD_STATE.
 */
FifoStatus fifo_push(Fifo *queue, uint8_t value);

/**
 * @brief Copy the oldest value into a distinct caller-owned byte.
 * @param[in,out] queue Live initialized Fifo, or null.
 * @param[out] output Live writable byte outside the entire queue, or null.
 * @return FIFO_OK/FIFO_EMPTY/FIFO_INVALID_ARGUMENT/FIFO_BAD_STATE.
 */
FifoStatus fifo_pop(Fifo *queue, uint8_t *output);

#endif
