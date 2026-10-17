/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party license grant.
 * @file measurement.c
 * @brief Bounded acquisition-byte sum.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "measurement.h"

/**
 * @brief Validate arguments before any access; commit only a complete sum.
 * @param[in] samples Caller-owned readable bytes (NULL only for count zero).
 * @param[in] count Number of bytes, at most sixteen.
 * @param[out] total Independent writable result, preserved on rejection.
 * @return Explicit status; see measurement.h for caller preconditions.
 */
MeasurementStatus measurement_sum(const uint8_t *samples, size_t count, uint32_t *total)
{
    uint32_t sum = 0U;
    size_t index;

    /**
    * Bounds cap the largest possible sum at 16 * 255 = 4080, below UINT32_MAX.
    **/
    if (total == NULL || count > MEASUREMENT_CAPACITY || (count > 0U && samples == NULL)) {
        return MEASUREMENT_INVALID_ARGUMENT;
    }
    for (index = 0U; index < count; ++index) {
        sum += samples[index];
    }
    *total = sum;
    return MEASUREMENT_OK;
}
