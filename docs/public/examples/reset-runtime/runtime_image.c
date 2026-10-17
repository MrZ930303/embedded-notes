/******************************************************************************
 * @file runtime_image.c
 * @brief Original embedded-notes bounded fictional reset/runtime transaction.
 * @author embedded-notes project contributors
 * @version V1.0 2026-10-17
 * No MCU-address dereference, real reset, register write or function-pointer call.
 * Define RUNTIME_IMAGE_TEST for live runtime checks; omit it for module use.
 * Original project teaching code; no third-party authorship or license implied.
 *****************************************************************************/
#include "runtime_image.h"
#include <limits.h>
#if CHAR_BIT != 8 || !defined(UINT8_MAX) || !defined(UINT32_MAX)
#error "This model requires eight-bit bytes, uint8_t and uint32_t."
#endif
#ifdef RUNTIME_IMAGE_TEST
#include <stdio.h>
#include <string.h>
#endif
/**
 * @brief Decode one little-endian vector word from an already checked span.
 * @param[in] bytes Four live initialized bytes.
 * @return Decoded32-bit value; no alignment-dependent typed dereference.
 */
static uint32_t read_le32(const uint8_t *bytes)
{
    /**
     * Promote before shifting so narrow integer promotions cannot overflow.
     **/
    return (uint32_t)bytes[0] | ((uint32_t)bytes[1] << 8U) |
           ((uint32_t)bytes[2] << 16U) | ((uint32_t)bytes[3] << 24U);
}
/**
 * @brief Validate region metadata before any offset addition or byte access.
 * @param[in] request Live initialized request with bounded object lengths.
 * @return Range, arithmetic or overlap status.
 */
static RuntimeStatus validate_regions(const RuntimeRequest *request)
{
    size_t dataEnd;
    size_t bssEnd;
    /**
     * Empty spans still require offset <= object length; no pointer is formed.
     **/
    if (request->dataLength > SIZE_MAX - request->dataSource ||
        request->dataLength > SIZE_MAX - request->dataDestination ||
        request->bssLength > SIZE_MAX - request->bssDestination) {
        return RUNTIME_ADDRESS_OVERFLOW;
    }
    if (request->dataSource > request->flashLength ||
        request->dataLength > request->flashLength - request->dataSource ||
        request->dataDestination > request->ramLength ||
        request->dataLength > request->ramLength - request->dataDestination ||
        request->bssDestination > request->ramLength ||
        request->bssLength > request->ramLength - request->bssDestination) {
        return RUNTIME_BAD_RANGE;
    }
    dataEnd = request->dataDestination + request->dataLength;
    bssEnd = request->bssDestination + request->bssLength;
    if (request->dataLength != 0U && request->bssLength != 0U &&
        request->dataDestination < bssEnd && request->bssDestination < dataEnd) {
        return RUNTIME_OVERLAP;
    }
    return RUNTIME_OK;
}
/**
 * @brief Check declared32-bit labels and decode a complete initial context.
 * @param[in] flash Checked live readable object of at least eight bytes.
 * @param[in] request Bounded real-object metadata.
 * @param[out] candidate Private report, never caller output.
 * @return Validation status, without changing caller RAM/report.
 */
static RuntimeStatus validate_context(const uint8_t *flash, const RuntimeRequest *request,
                                      RuntimeReport *candidate)
{
    uint32_t flashEnd;
    uint32_t ramEnd;
    /**
     * Exclusive integer endpoints must fit; this is a model address policy.
     **/
    if (request->flashLength > UINT32_MAX - request->flashBase ||
        request->ramLength > UINT32_MAX - request->ramBase) {
        return RUNTIME_ADDRESS_OVERFLOW;
    }
    flashEnd = request->flashBase + (uint32_t)request->flashLength;
    ramEnd = request->ramBase + (uint32_t)request->ramLength;
    candidate->initialSp = read_le32(flash);
    candidate->entryWord = read_le32(flash + 4U);
    candidate->entryTarget = candidate->entryWord & ~UINT32_C(1);
    if (candidate->initialSp < request->ramBase || candidate->initialSp > ramEnd ||
        candidate->initialSp % 8U != 0U) {
        return RUNTIME_BAD_SP;
    }
    if ((candidate->entryWord & 1U) == 0U || request->execStart < request->flashBase ||
        request->execEnd > flashEnd || request->execStart > request->execEnd ||
        candidate->entryTarget < request->execStart || candidate->entryTarget > request->execEnd ||
        request->execEnd - candidate->entryTarget < 2U) {
        return RUNTIME_BAD_ENTRY;
    }
    return RUNTIME_OK;
}
/**
 * @brief Validate the whole request, prepare bounded scratch RAM and commit.
 * @param[in] flash Real initialized byte object under the header preconditions.
 * @param[in] request Real initialized metadata, distinct from other objects.
 * @param[in,out] ram Initialized accepted output; unchanged on failure.
 * @param[in,out] report Initialized accepted report; unchanged on failure.
 * @return Explicit status, independent of assertions and NDEBUG.
 */
RuntimeStatus runtime_image_initialize(const uint8_t *flash, const RuntimeRequest *request,
                                       uint8_t *ram, RuntimeReport *report)
{
    uint8_t scratch[RUNTIME_CAPACITY];
    RuntimeReport candidate = {0U, 0U, 0U, 0U, 0U, false};
    RuntimeStatus status;
    size_t index;
    /**
     * NULL checks precede every caller access. Non-NULL is not a validity proof.
     **/
    if (flash == NULL || request == NULL || ram == NULL || report == NULL) {
        return RUNTIME_INVALID_ARGUMENT;
    }
    if (request->flashLength > RUNTIME_CAPACITY || request->ramLength == 0U ||
        request->ramLength > RUNTIME_CAPACITY) {
        return RUNTIME_BAD_LENGTH;
    }
    if (request->flashLength < 8U) {
        return RUNTIME_BAD_VECTOR;
    }
    status = validate_context(flash, request, &candidate);
    if (status != RUNTIME_OK) {
        return status;
    }
    status = validate_regions(request);
    if (status != RUNTIME_OK) {
        return status;
    }
    for (index = 0U; index < request->ramLength; ++index) {
        scratch[index] = ram[index];
    }
    for (index = 0U; index < request->dataLength; ++index) {
        scratch[request->dataDestination + index] = flash[request->dataSource + index];
    }
    for (index = 0U; index < request->bssLength; ++index) {
        scratch[request->bssDestination + index] = 0U;
    }
    candidate.copied = request->dataLength;
    candidate.zeroed = request->bssLength;
    candidate.mainReady = true;
    /**
     * No fallible operation remains. Commit only under single-context ownership.
     **/
    for (index = 0U; index < request->ramLength; ++index) {
        ram[index] = scratch[index];
    }
    *report = candidate;
    return RUNTIME_OK;
}
#ifdef RUNTIME_IMAGE_TEST
/**
 * @brief Report a failed expectation with checked I/O.
 * @param[in] condition Behavioral result.
 * @param[in] name Diagnostic literal.
 * @return Whether the expectation passed.
 */
static bool expect_true(bool condition, const char *name)
{
    /**
     * Returning false remains effective with NDEBUG.
     **/
    if (!condition) {
        if (fprintf(stderr, "FAIL runtime: %s\n", name) < 0) {
            return false;
        }
        if (fflush(stderr) != 0) {
            return false;
        }
    }
    return condition;
}
/**
 * @brief Compare named report fields, never indeterminate structure padding.
 * @param[in] left First live initialized report.
 * @param[in] right Second live initialized report.
 * @return Whether every meaningful field agrees.
 */
static bool same_report(const RuntimeReport *left, const RuntimeReport *right)
{
    /**
     * A structure assignment preserves values without defining padding bytes.
     **/
    return left->initialSp == right->initialSp && left->entryWord == right->entryWord &&
           left->entryTarget == right->entryTarget && left->copied == right->copied &&
           left->zeroed == right->zeroed && left->mainReady == right->mainReady;
}
/**
 * @brief Check failure status and all actual output bytes/meaningful fields.
 * @param[in] flash Real initialized input, or NULL for the explicit NULL case.
 * @param[in] request Real initialized metadata, or NULL.
 * @param[in,out] ram Real64-byte accepted output, never NULL here.
 * @param[in,out] report Real initialized accepted report.
 * @param[in] expected Independently specified status.
 * @param[in] nullOutput Zero normally, one for RAM NULL, two for report NULL.
 * @return Whether rejection and complete preservation hold.
 */
static bool expect_rejected(const uint8_t *flash, const RuntimeRequest *request, uint8_t *ram,
                            RuntimeReport *report, RuntimeStatus expected, unsigned int nullOutput)
{
    uint8_t before[RUNTIME_CAPACITY];
    RuntimeReport prior = *report;
    RuntimeStatus status;
    /**
     * Snapshot only real initialized storage, even when a call argument is NULL.
     **/
    memcpy(before, ram, sizeof before);
    status = runtime_image_initialize(flash, request, nullOutput == 1U ? NULL : ram,
                                      nullOutput == 2U ? NULL : report);
    if (!expect_true(status == expected, "rejection status")) {
        return false;
    }
    return expect_true(memcmp(before, ram, sizeof before) == 0 && same_report(&prior, report),
                       "rejection preserves every output byte and report field");
}
/**
 * @brief Exercise real initialized metadata faults and exact endpoints.
 * @param[in,out] flash Real64-byte fixture input.
 * @param[in,out] ram Real64-byte accepted image.
 * @param[in,out] report Real accepted report.
 * @return Whether all independently specified cases pass.
 */
static bool check_boundaries(uint8_t *flash, uint8_t *ram, RuntimeReport *report)
{
    const RuntimeRequest seed = {4096U, 8192U, 64U, 64U, 4112U, 4114U, 32U, 8U, 4U, 16U, 4U};
    RuntimeRequest request;
    RuntimeStatus status;
    size_t index;
    const uint8_t badSp[4][4] = {{255U, 31U, 0U, 0U}, {65U, 32U, 0U, 0U},
                                {60U, 32U, 0U, 0U}, {255U, 255U, 255U, 255U}};
    /**
     * All four NULL positions are guarded before any pointee access.
     **/
    if (!expect_rejected(NULL, &seed, ram, report, RUNTIME_INVALID_ARGUMENT, 0U) ||
        !expect_rejected(flash, NULL, ram, report, RUNTIME_INVALID_ARGUMENT, 0U) ||
        !expect_rejected(flash, &seed, ram, report, RUNTIME_INVALID_ARGUMENT, 1U) ||
        !expect_rejected(flash, &seed, ram, report, RUNTIME_INVALID_ARGUMENT, 2U)) {
        return false;
    }
    for (index = 0U; index < 4U; ++index) {
        memcpy(flash, badSp[index], 4U);
        if (!expect_rejected(flash, &seed, ram, report, RUNTIME_BAD_SP, 0U)) {
            return false;
        }
    }
    flash[0] = 64U;
    flash[1] = 32U;
    flash[2] = 0U;
    flash[3] = 0U;
    flash[4] = 16U;
    if (!expect_rejected(flash, &seed, ram, report, RUNTIME_BAD_ENTRY, 0U)) {
        return false;
    }
    flash[4] = 19U;
    if (!expect_rejected(flash, &seed, ram, report, RUNTIME_BAD_ENTRY, 0U)) {
        return false;
    }
    flash[4] = 15U;
    if (!expect_rejected(flash, &seed, ram, report, RUNTIME_BAD_ENTRY, 0U)) {
        return false;
    }
    flash[4] = 17U;
    for (index = 0U; index < 21U; ++index) {
        RuntimeStatus expected = RUNTIME_BAD_RANGE;
        request = seed;
        switch (index) {
            case 0U:
                request.execEnd = 4113U;
                expected = RUNTIME_BAD_ENTRY;
                break;
            case 1U:
                request.execEnd = 4161U;
                expected = RUNTIME_BAD_ENTRY;
                break;
            case 2U:
                request.flashLength = 7U;
                expected = RUNTIME_BAD_VECTOR;
                break;
            case 3U:
                request.ramLength = 0U;
                expected = RUNTIME_BAD_LENGTH;
                break;
            case 4U:
                request.flashBase = UINT32_MAX - 63U;
                expected = RUNTIME_ADDRESS_OVERFLOW;
                break;
            case 5U:
                request.ramBase = UINT32_MAX - 63U;
                expected = RUNTIME_ADDRESS_OVERFLOW;
                break;
            case 6U:
                request.dataSource = 61U;
                break;
            case 7U:
                request.dataDestination = 61U;
                break;
            case 8U:
                request.bssDestination = 61U;
                break;
            case 9U:
                request.bssDestination = 10U;
                expected = RUNTIME_OVERLAP;
                break;
            case 10U:
                request.dataSource = SIZE_MAX;
                expected = RUNTIME_ADDRESS_OVERFLOW;
                break;
            case 11U:
                request.dataDestination = SIZE_MAX;
                expected = RUNTIME_ADDRESS_OVERFLOW;
                break;
            case 12U:
                request.bssDestination = SIZE_MAX;
                expected = RUNTIME_ADDRESS_OVERFLOW;
                break;
            case 13U:
                request.dataSource = 65U;
                request.dataLength = 0U;
                break;
            case 14U:
                request.dataDestination = 65U;
                request.dataLength = 0U;
                break;
            case 15U:
                request.bssDestination = 65U;
                request.bssLength = 0U;
                break;
            case 16U:
                request.dataLength = SIZE_MAX;
                expected = RUNTIME_ADDRESS_OVERFLOW;
                break;
            case 17U:
                request.bssLength = SIZE_MAX;
                expected = RUNTIME_ADDRESS_OVERFLOW;
                break;
            case 18U:
                request.flashLength = 0U;
                expected = RUNTIME_BAD_VECTOR;
                break;
            case 19U:
                request.flashLength = 35U;
                break;
            default:
                request.execStart = 4113U;
                expected = RUNTIME_BAD_ENTRY;
                break;
        }
        if (!expect_rejected(flash, &request, ram, report, expected, 0U)) {
            return false;
        }
    }
    request = seed;
    request.dataSource = 64U;
    request.dataDestination = 64U;
    request.dataLength = 0U;
    request.bssDestination = 64U;
    request.bssLength = 0U;
    status = runtime_image_initialize(flash, &request, ram, report);
    if (!expect_true(status == RUNTIME_OK && report->copied == 0U && report->zeroed == 0U &&
                     report->mainReady, "all-empty regions with exact endpoints")) {
        return false;
    }
    request = seed;
    request.bssDestination = 64U;
    request.bssLength = 0U;
    status = runtime_image_initialize(flash, &request, ram, report);
    if (!expect_true(status == RUNTIME_OK && report->copied == 4U && report->zeroed == 0U,
                     "empty BSS exact endpoint")) {
        return false;
    }
    request = seed;
    request.dataSource = 64U;
    request.dataDestination = 64U;
    request.dataLength = 0U;
    status = runtime_image_initialize(flash, &request, ram, report);
    if (!expect_true(status == RUNTIME_OK && report->copied == 0U && report->zeroed == 4U,
                     "empty data exact endpoints")) {
        return false;
    }
    request = seed;
    request.dataSource = 60U;
    request.dataDestination = 60U;
    request.bssDestination = 56U;
    status = runtime_image_initialize(flash, &request, ram, report);
    if (!expect_true(status == RUNTIME_OK && ram[56] == 0U && ram[59] == 0U && ram[63] == 165U,
                     "nonempty exact endpoints and adjacent regions")) {
        return false;
    }
    flash[0] = 0U;
    status = runtime_image_initialize(flash, &seed, ram, report);
    if (!expect_true(status == RUNTIME_OK && report->initialSp == 8192U,
                     "inclusive bottom stack boundary under model policy")) {
        return false;
    }
    flash[0] = 64U;
    return true;
}
/**
 * @brief Reject over-capacity metadata using truthful actual65-byte objects.
 * @return Whether both capacity rejections preserve all real output storage.
 */
static bool check_capacity(void)
{
    uint8_t flash[65];
    uint8_t ram[65];
    uint8_t before[65];
    RuntimeRequest request = {4096U, 8192U, 65U, 65U, 4112U, 4114U, 32U, 8U, 4U, 16U, 4U};
    RuntimeReport report = {8256U, 4113U, 4112U, 4U, 4U, true};
    RuntimeReport prior = report;
    RuntimeStatus status;
    /**
     * The larger real objects make capacity rejection a defined experiment.
     **/
    memset(flash, 165, sizeof flash);
    memset(ram, 165, sizeof ram);
    memcpy(before, ram, sizeof before);
    status = runtime_image_initialize(flash, &request, ram, &report);
    if (!expect_true(status == RUNTIME_BAD_LENGTH, "real65-byte Flash capacity rejection")) {
        return false;
    }
    if (!expect_true(memcmp(before, ram, sizeof before) == 0 && same_report(&prior, &report),
                     "all65 actual bytes preserved")) {
        return false;
    }
    request.flashLength = 64U;
    status = runtime_image_initialize(flash, &request, ram, &report);
    if (!expect_true(status == RUNTIME_BAD_LENGTH, "real65-byte RAM capacity rejection")) {
        return false;
    }
    return expect_true(memcmp(before, ram, sizeof before) == 0 && same_report(&prior, &report),
                       "RAM capacity rejection preserves bytes and report");
}
/**
 * @brief Execute the independently specified64-byte fixture.
 * @return Zero only when every check and final output succeeds.
 */
int main(void)
{
    uint8_t flash[RUNTIME_CAPACITY];
    uint8_t ram[RUNTIME_CAPACITY];
    RuntimeRequest request = {4096U, 8192U, 64U, 64U, 4112U, 4114U, 32U, 8U, 4U, 16U, 4U};
    RuntimeReport report = {0U, 0U, 0U, 0U, 0U, false};
    RuntimeStatus status;
    size_t index;
    const uint8_t vector[8] = {64U, 32U, 0U, 0U, 17U, 16U, 0U, 0U};
    const uint8_t data[4] = {17U, 34U, 51U, 68U};
    /**
     * Every object is real and initialized before a rejection fixture can run.
     **/
    memset(flash, 165, sizeof flash);
    memset(ram, 165, sizeof ram);
    memcpy(flash, vector, sizeof vector);
    memcpy(flash + 32U, data, sizeof data);
    status = runtime_image_initialize(flash, &request, ram, &report);
    if (!expect_true(status == RUNTIME_OK, "baseline status")) {
        return 1;
    }
    for (index = 0U; index < RUNTIME_CAPACITY; ++index) {
        uint8_t expected = 165U;
        if (index >= 8U && index <= 11U) {
            expected = data[index - 8U];
        } else if (index >= 16U && index <= 19U) {
            expected = 0U;
        }
        if (!expect_true(ram[index] == expected, "literal RAM bytes")) {
            return 1;
        }
    }
    if (!expect_true(report.initialSp == 8256U && report.entryWord == 4113U &&
                     report.entryTarget == 4112U && report.copied == 4U && report.zeroed == 4U &&
                     report.mainReady, "meaningful report fields")) {
        return 1;
    }
    if (!check_boundaries(flash, ram, &report)) {
        return 1;
    }
    if (!check_capacity()) {
        return 1;
    }
    if (puts("PASS runtime: fixed64-byte image, transactional boundaries and live checks") == EOF) {
        return 1;
    }
    if (fflush(stdout) != 0) {
        return 1;
    }
    return 0;
}
#endif
