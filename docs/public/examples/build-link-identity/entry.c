/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party license grant.
 * @file entry.c
 * @brief Artificial ARM link inspection entry. NOT BOOTABLE; never execute/flash.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "measurement.h"
#include "build_identity.h"

volatile uint32_t g_inspectionSum;
uint32_t g_inspectionSeed = 17U;
const char * const g_inspectionVersion = build_version;
const char * const g_inspectionManifest = build_source_manifest_sha256;

/**
 * @brief Supply symbol references for linking only; no vector/runtime is supplied.
 * @param[in] None.
 * @param[out] None.
 * @return None; this artificial entry is never invoked.
 */
void lesson_entry(void)
{
    const uint8_t samples[4] = {17U, 34U, 51U, 68U};
    uint32_t total = 0U;

    /**
    * This body provides relocation evidence, not a reset/startup implementation.
    **/
    if (measurement_sum(samples, 4U, &total) != MEASUREMENT_OK) {
        return;
    }
    g_inspectionSum = total;
}
