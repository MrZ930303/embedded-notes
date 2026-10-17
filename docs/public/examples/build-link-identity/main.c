/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party license grant.
 * @file main.c
 * @brief Hosted multi-file example and live checks, including under NDEBUG.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "measurement.h"
#include "build_identity.h"
#include <stdio.h>
#include <string.h>

/**
 * @brief Check literal fixtures using initialized, nonoverlapping real storage.
 * @param[in] None.
 * @param[out] None.
 * @return Zero on success, one on the first failed expectation.
 */
static int check_measurement(void)
{
    const uint8_t samples[4] = {17U, 34U, 51U, 68U};
    uint8_t maximum[MEASUREMENT_CAPACITY + 1U] = {0U};
    uint32_t total = 999U;
    size_t index;

    /**
    * All failure checks are ordinary control flow, never compiled-out assertions.
    **/
    if (measurement_sum(samples, 4U, &total) != MEASUREMENT_OK || total != 170U) {
        return 1;
    }
    for (index = 0U; index < MEASUREMENT_CAPACITY; ++index) {
        maximum[index] = 255U;
    }
    if (measurement_sum(maximum, MEASUREMENT_CAPACITY, &total) != MEASUREMENT_OK || total != 4080U) {
        return 1;
    }
    if (measurement_sum(NULL, 0U, &total) != MEASUREMENT_OK || total != 0U) {
        return 1;
    }
    total = 999U;
    if (measurement_sum(NULL, 1U, &total) != MEASUREMENT_INVALID_ARGUMENT || total != 999U) {
        return 1;
    }
    if (measurement_sum(samples, 4U, NULL) != MEASUREMENT_INVALID_ARGUMENT) {
        return 1;
    }
    if (measurement_sum(maximum, 17U, &total) != MEASUREMENT_INVALID_ARGUMENT || total != 999U) {
        return 1;
    }
    return 0;
}

/**
 * @brief Report the linked identity, optionally compare an expected version.
 * @param[in] argc Zero or one extra command-line argument is supported.
 * @param[in] argv Hosted C argument strings; optional expected build version.
 * @return Zero only after all checks and flushed output; nonzero on any failure.
 */
int main(int argc, char *argv[])
{
    const uint8_t samples[4] = {17U, 34U, 51U, 68U};
    uint32_t total = 0U;

    /**
    * Never announce success before checking both computation and output errors.
    **/
    if (argc > 2 || check_measurement() != 0) {
        return 1;
    }
    if (argc == 2 && strcmp(argv[1], build_version) != 0) {
        if (fprintf(stderr, "IDENTITY_MISMATCH expected=%s linked=%s\n", argv[1], build_version) < 0) {
            return 2;
        }
        if (fflush(stderr) != 0) {
            return 2;
        }
        return 1;
    }
    if (measurement_sum(samples, 4U, &total) != MEASUREMENT_OK) {
        return 1;
    }
    if (printf("sum=%lu\nversion=%s\nproduct=%s\nsource_manifest_sha256=%s\n",
               (unsigned long)total, build_version, build_product, build_source_manifest_sha256) < 0) {
        return 2;
    }
    if (puts("PASS measurement: literal170, max4080, empty0, null, capacity, preservation; NDEBUG-live") == EOF) {
        return 2;
    }
    if (fflush(stdout) != 0) {
        return 2;
    }
    return 0;
}
