/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party license grant.
 * @file measurement.h
 * @brief Bounded acquisition-byte sum, independent of the host test entry.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef MEASUREMENT_H
#define MEASUREMENT_H

#include <stddef.h>
#include <stdint.h>

#define MEASUREMENT_CAPACITY 16U

typedef enum {
    MEASUREMENT_OK = 0,
    MEASUREMENT_INVALID_ARGUMENT
} MeasurementStatus;

/**
 * @brief Sum zero to sixteen acquisition bytes; preserve output on rejection.
 * @param[in] samples Live readable array of at least count bytes when count > 0.
 * @param[in] count In [0, MEASUREMENT_CAPACITY]; zero permits samples == NULL.
 * @param[out] total Live writable uint32_t, disjoint from the input byte object.
 * @return MEASUREMENT_OK, or MEASUREMENT_INVALID_ARGUMENT without output writes.
 * Caller guarantees truthful extents, lifetime, nonaliasing and single context.
 * A nonnull pointer alone cannot establish those caller preconditions.
 */
MeasurementStatus measurement_sum(const uint8_t *samples, size_t count, uint32_t *total);

#endif
