/******************************************************************************
 * @file objects.c
 * @brief Original, board-independent C11 byte-decoding teaching module.
 * @version V1.0 2026-10-17
 * Ownership and licensing follow the repository; no vendor affiliation claimed.
 *****************************************************************************/
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <limits.h>

#if CHAR_BIT != 8 || !defined(UINT8_MAX) || !defined(UINT16_MAX)
#error "This example requires eight-bit bytes, uint8_t and uint16_t."
#endif

/**
 * @brief Decode two little-endian bytes within a truthful live input span.
 * @param[in] input Real readable byte array; length must not exceed its extent.
 * @param[in] length Truthful accessible byte count from input; zero is empty.
 * @param[in] offset Byte index to the first of the two required bytes.
 * @param[out] output Distinct live writable uint16_t object, outside input storage.
 * @return true on success; false preserves output and does not read input.
 * Null arguments are rejected. Non-null pointer validity, lifetime, alignment,
 * truthful extent and distinct output ownership remain caller preconditions.
 */
bool read_le16(const uint8_t *input, size_t length, size_t offset, uint16_t *output)
{
    /** Establish bounds before subtraction, indexing or pointer arithmetic. **/
    if (input == NULL || output == NULL || offset > length) {
        return false;
    }
    if (length - offset < 2U) {
        return false;
    }
    /** Cast before shifting: unsigned int can represent at least 0..65535. **/
    *output = (uint16_t)((unsigned int)input[offset]
                       | ((unsigned int)input[offset + 1U] << 8U));
    return true;
}

#ifdef OBJECTS_TEST
#include <stdio.h>

/**
 * @brief Check an independent literal result through the public interface.
 * @param[in] input Live byte array, or NULL as a rejected argument.
 * @param[in] length Truthful extent of the test span.
 * @param[in] offset Candidate byte offset.
 * @param[in] expectedStatus Required success or rejection.
 * @param[in] expectedValue Literal required output, including sentinel on rejection.
 * @param[in] name Human-readable fixture name.
 * @return Zero on a match, one on a failed expectation.
 */
static int check_decode(const uint8_t *input, size_t length, size_t offset,
                        bool expectedStatus, uint16_t expectedValue, const char *name)
{
    uint16_t output = UINT16_C(0xBEEF);
    bool status = read_le16(input, length, offset, &output);

    /** A sentinel makes accidental output writes observable on each rejection. **/
    if (status != expectedStatus || output != expectedValue) {
        if (fprintf(stderr, "FAIL: %s\n", name) < 0) {
            return 1;
        }
        return 1;
    }
    return 0;
}

/**
 * @brief Verify normal and nonzero-offset wire fixtures using real byte arrays.
 * @return Failed expectation count; independent of assert and NDEBUG.
 */
static int test_success(void)
{
    const uint8_t pair[] = { 0x34U, 0x12U };
    const uint8_t frame[] = { 0x7EU, 0x34U, 0x12U, 0xFFU };
    const uint8_t edges[] = { 0x00U, 0xFFU, 0xFFU };
    int failures = 0;

    /** Expected values were hand-worked from the declared little-endian format. **/
    failures += check_decode(pair, sizeof pair, 0U, true, UINT16_C(0x1234), "exact pair -> 0x1234");
    failures += check_decode(frame, sizeof frame, 1U, true, UINT16_C(0x1234), "nonzero offset -> 0x1234");
    failures += check_decode(frame, sizeof frame, 2U, true, UINT16_C(0xFF12), "last exact pair -> 0xFF12");
    failures += check_decode(edges, sizeof edges, 0U, true, UINT16_C(0xFF00), "zero and 255 bytes");
    failures += check_decode(edges, sizeof edges, 1U, true, UINT16_C(0xFFFF), "maximum two-byte value");
    if ((uint8_t)-1 != UINT8_C(255)) {
        if (fprintf(stderr, "FAIL: defined unsigned conversion\n") < 0) {
            return failures + 1;
        }
        failures += 1;
    }
    return failures;
}

/**
 * @brief Reject boundary and null inputs without using invalid storage.
 * @return Failed expectation count; no forged extent or dangling pointer is used.
 */
static int test_rejections(void)
{
    const uint8_t pair[] = { 0x34U, 0x12U };
    const uint8_t shortSpan[] = { 0x34U };
    int failures = 0;

    /** Huge offsets are tested only against truthful small live objects. **/
    failures += check_decode(pair, 0U, 0U, false, UINT16_C(0xBEEF), "zero length sentinel");
    failures += check_decode(shortSpan, sizeof shortSpan, 0U, false, UINT16_C(0xBEEF), "one byte sentinel");
    failures += check_decode(pair, sizeof pair, 1U, false, UINT16_C(0xBEEF), "one byte remaining sentinel");
    failures += check_decode(pair, sizeof pair, 2U, false, UINT16_C(0xBEEF), "offset at end sentinel");
    failures += check_decode(pair, sizeof pair, 3U, false, UINT16_C(0xBEEF), "offset beyond end sentinel");
    failures += check_decode(pair, sizeof pair, SIZE_MAX, false, UINT16_C(0xBEEF), "SIZE_MAX sentinel");
    failures += check_decode(NULL, 0U, 0U, false, UINT16_C(0xBEEF), "null empty input sentinel");
    failures += check_decode(NULL, sizeof pair, 0U, false, UINT16_C(0xBEEF), "null input sentinel");
    if (read_le16(pair, sizeof pair, 0U, NULL)) {
        if (fprintf(stderr, "FAIL: null output\n") < 0) {
            return failures + 1;
        }
        failures += 1;
    }
    return failures;
}

/**
 * @brief Run the defined host-C tests; excluded from the reusable module build.
 * @return Zero only if every expectation succeeds.
 */
int main(void)
{
    int failures;

    /** Call both test groups even when one group reports a failure. **/
    failures = test_success();
    failures += test_rejections();
    if (failures != 0) {
        return 1;
    }
    if (puts("PASS objects C11: 5 successful reads, 9 rejections, unchanged sentinels, unsigned conversion.") == EOF) {
        return 1;
    }
    if (fflush(stdout) == EOF) {
        return 1;
    }
    return 0;
}
#endif
