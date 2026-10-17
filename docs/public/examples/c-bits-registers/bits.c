/******************************************************************************
 * @file bits.c
 * @brief Original, vendor-independent teaching lab for embedded-notes.
 * @version V1.0 2026-10-17
 *
 * Interface: width1..8, values/masks/data within that width, known enums only.
 * Field offset<width and length1..width-offset; shift count<width.
 * BITS_OK writes output; BITS_INVALID preserves it. NULL is rejected first.
 * Other output pointers must designate real, live, writable, correctly typed
 * objects. The interface cannot validate forged or dangling pointers.
 * Requires C11 with optional uint32_t. All intermediate shifts use unsigned long
 * (at least32 bits), after range checks. No assumption that int is32 bits.
 * Define BITS_TEST for host tests; otherwise no main or test I/O is included.
 * One execution context; no shared state, threads, interrupts or hardware.
 * Host build parameters and router workflow are documented in README.txt.
 *
 * No hardware addresses, concurrency, dynamic allocation or undefined examples.
 *****************************************************************************/
#include <stddef.h>
#include <stdint.h>
#ifndef UINT32_MAX
#error This teaching lab requires the optional exact-width uint32_t type.
#endif
#ifdef BITS_TEST
#include <stdio.h>
#endif

typedef enum { BITS_OK, BITS_INVALID } BitsStatus;
typedef enum { BITS_SET, BITS_CLEAR, BITS_TOGGLE, BITS_INVERT } BitsOp;
typedef enum { BITS_RW, BITS_RO, BITS_W1C } BitsAccess;
typedef struct {
    uint32_t rwRead;
    uint32_t rwOther;
    uint32_t rwData;
    uint32_t rwFinal;
    uint32_t w1cRead;
    uint32_t w1cData;
    uint32_t w1cFinal;
    uint32_t w1cDirect;
} BitsTrace;

/**
 * @brief Apply an unsigned fictional-width operation.
 * @param[in] width,value,mask,op Declared model inputs.
 * @param[out] output Live writable uint32_t; unchanged on rejection.
 * @return BITS_OK or BITS_INVALID.
 */
BitsStatus bits_apply(unsigned width, uint32_t value, uint32_t mask, BitsOp op, uint32_t *output)
{
    unsigned long all;
    uint32_t result;
    /**
     * Validate before mask construction; unsigned long has at least 32 bits.
     **/
    if (output == NULL || width == 0U || width > 8U) {
        return BITS_INVALID;
    }
    all = (1UL << width) - 1UL;
    if (value > all || mask > all) {
        return BITS_INVALID;
    }
    switch (op) {
        case BITS_SET:
            result = (uint32_t)((unsigned long)value | mask);
            break;
        case BITS_CLEAR:
            result = (uint32_t)((unsigned long)value & (all ^ mask));
            break;
        case BITS_TOGGLE:
            result = (uint32_t)((unsigned long)value ^ mask);
            break;
        case BITS_INVERT:
            result = (uint32_t)(all ^ value);
            break;
        default:
            return BITS_INVALID;
    }
    *output = result;
    return BITS_OK;
}

/**
 * @brief Extract a field after validating its entire range.
 * @param[in] width,value,offset,length Model width 1..8, field length at least one.
 * @param[out] output Live writable uint32_t; unchanged on rejection.
 * @return BITS_OK or BITS_INVALID.
 */
BitsStatus bits_field(unsigned width, uint32_t value, unsigned offset, unsigned length, uint32_t *output)
{
    unsigned long all;
    /**
     * Check offset before width-offset, and length before constructing its mask.
     **/
    if (output == NULL || width == 0U || width > 8U || offset >= width) {
        return BITS_INVALID;
    }
    if (length == 0U || length > width - offset) {
        return BITS_INVALID;
    }
    all = (1UL << width) - 1UL;
    if (value > all) {
        return BITS_INVALID;
    }
    *output = (uint32_t)(((unsigned long)value >> offset) & ((1UL << length) - 1UL));
    return BITS_OK;
}

/**
 * @brief Shift within the declared display width and clip to that width.
 * @param[in] width,value,count Width 1..8; count below width.
 * @param[out] output Live writable uint32_t; unchanged on rejection.
 * @return BITS_OK or BITS_INVALID.
 */
BitsStatus bits_shift(unsigned width, uint32_t value, unsigned count, uint32_t *output)
{
    unsigned long all;
    /**
     * This stricter display contract is not the complete C shift-count rule.
     **/
    if (output == NULL || width == 0U || width > 8U || count >= width) {
        return BITS_INVALID;
    }
    all = (1UL << width) - 1UL;
    if (value > all) {
        return BITS_INVALID;
    }
    *output = (uint32_t)(((unsigned long)value << count) & all);
    return BITS_OK;
}

/**
 * @brief Interpret written data using fictional all-bit register semantics.
 * @param[in] width,initial,data,access Width 1..8, values within width, known access mode.
 * @param[out] output Live writable uint32_t; unchanged on rejection.
 * @return BITS_OK or BITS_INVALID.
 */
BitsStatus bits_write(unsigned width, uint32_t initial, uint32_t data, BitsAccess access, uint32_t *output)
{
    uint32_t result;
    /**
     * Validate even RO write data; this model alone defines ignored RO writes.
     **/
    if (output == NULL || width == 0U || width > 8U) {
        return BITS_INVALID;
    }
    if (initial > (1UL << width) - 1UL || data > (1UL << width) - 1UL) {
        return BITS_INVALID;
    }
    switch (access) {
        case BITS_RW:
            result = data;
            break;
        case BITS_RO:
            result = initial;
            break;
        case BITS_W1C:
            result = (uint32_t)((unsigned long)initial & ~((unsigned long)data));
            break;
        default:
            return BITS_INVALID;
    }
    *output = result;
    return BITS_OK;
}

/**
 * @brief Stage two separate RMW mistakes using only sequential local values.
 * @param[in] None.
 * @param[out] output Live writable BitsTrace; NULL is rejected before access.
 * @return BITS_OK or BITS_INVALID; output unchanged on failure.
 */
BitsStatus bits_bad_rmw(BitsTrace *output)
{
    BitsTrace trace = {0U};
    /**
     * No thread, interrupt or actual register exists in this replay.
     **/
    if (output == NULL) {
        return BITS_INVALID;
    }
    trace.rwRead = 0U;
    if (bits_write(8U, 0U, 2U, BITS_RW, &trace.rwOther) != BITS_OK) {
        return BITS_INVALID;
    }
    trace.rwData = trace.rwRead | 1U;
    if (bits_write(8U, trace.rwOther, trace.rwData, BITS_RW, &trace.rwFinal) != BITS_OK) {
        return BITS_INVALID;
    }
    trace.w1cRead = 3U;
    trace.w1cData = trace.w1cRead | 1U;
    if (bits_write(8U, trace.w1cRead, trace.w1cData, BITS_W1C, &trace.w1cFinal) != BITS_OK) {
        return BITS_INVALID;
    }
    if (bits_write(8U, trace.w1cRead, 1U, BITS_W1C, &trace.w1cDirect) != BITS_OK) {
        return BITS_INVALID;
    }
    *output = trace;
    return BITS_OK;
}

#ifdef BITS_TEST
/**
 * @brief Keep failure checks active even when NDEBUG is defined.
 * @param[in] condition,name Literal expectation and diagnostic.
 * @param[out] None.
 * @return Zero on success, one on failure.
 */
static int check(int condition, const char *name)
{
    /**
     * Do not use assert for executable test acceptance.
     **/
    if (!condition) {
        if (fprintf(stderr, "FAIL: %s\n", name) < 0) {
            return 1;
        }
        return 1;
    }
    return 0;
}

/**
 * @brief Execute literal mask fixtures.
 * @param[in] None.
 * @param[out] None.
 * @return Nonzero if any expectation fails.
 */
static int test_masks(void)
{
    uint32_t output = 222U;
    int failures = 0;
    /**
     * The expected value comes from the published worked bit row.
     **/
    failures += check(bits_apply(8U, 165U, 12U, BITS_SET, &output) == BITS_OK && output == 173U,
                      "A5 set 0C = AD");
    failures += check(bits_apply(8U, 165U, 12U, BITS_CLEAR, &output) == BITS_OK && output == 161U,
                      "A5 clear 0C = A1");
    failures += check(bits_apply(8U, 165U, 12U, BITS_TOGGLE, &output) == BITS_OK && output == 169U,
                      "A5 toggle 0C = A9");
    failures += check(bits_apply(8U, 165U, 0U, BITS_INVERT, &output) == BITS_OK && output == 90U,
                      "A5 eight-bit complement = 5A");
    failures += check(bits_apply(1U, 1U, 0U, BITS_INVERT, &output) == BITS_OK && output == 0U,
                      "one-bit complement");
    failures += check(bits_apply(8U, 0U, 0U, BITS_SET, &output) == BITS_OK && output == 0U, "zero bits");
    failures += check(bits_apply(8U, 255U, 255U, BITS_CLEAR, &output) == BITS_OK && output == 0U,
                      "highest valid full mask");
    failures += check(bits_apply(8U, 1U, 128U, BITS_SET, &output) == BITS_OK && output == 129U,
                      "highest valid bit set");
    output = 222U;
    failures += check(bits_apply(0U, 0U, 0U, BITS_SET, &output) == BITS_INVALID && output == 222U,
                      "zero width preserves output");
    failures += check(bits_apply(9U, 0U, 0U, BITS_SET, &output) == BITS_INVALID && output == 222U,
                      "width above eight preserves output");
    failures += check(bits_apply(8U, 256U, 0U, BITS_SET, &output) == BITS_INVALID && output == 222U,
                      "value out of width");
    failures += check(bits_apply(8U, 0U, 256U, BITS_SET, &output) == BITS_INVALID && output == 222U,
                      "mask out of width");
    failures += check(bits_apply(8U, 0U, 0U, (BitsOp)99, &output) == BITS_INVALID && output == 222U,
                      "unknown operation");
    failures += check(bits_apply(8U, 0U, 0U, BITS_SET, NULL) == BITS_INVALID, "null output");
    return failures;
}

/**
 * @brief Execute field and shift boundary fixtures.
 * @param[in] None.
 * @param[out] None.
 * @return Count of failed expectations.
 */
static int test_fields_shifts(void)
{
    uint32_t output = 222U;
    int failures = 0;
    /**
     * Use initialized output sentinels and only defined argument conversions.
     **/
    failures += check(bits_field(8U, 165U, 4U, 3U, &output) == BITS_OK && output == 2U, "bits6..4 = 2");
    failures += check(bits_field(8U, 255U, 0U, 8U, &output) == BITS_OK && output == 255U, "full field");
    failures += check(bits_field(8U, 128U, 7U, 1U, &output) == BITS_OK && output == 1U, "highest bit");
    failures += check(bits_shift(8U, 1U, 7U, &output) == BITS_OK && output == 128U, "highest count");
    failures += check(bits_shift(8U, 165U, 0U, &output) == BITS_OK && output == 165U, "zero count");
    failures += check(bits_shift(8U, 165U, 1U, &output) == BITS_OK && output == 74U, "width-clipped shift");
    output = 222U;
    failures += check(bits_field(8U, 1U, 8U, 1U, &output) == BITS_INVALID && output == 222U, "offset endpoint");
    failures += check(bits_field(8U, 1U, 7U, 2U, &output) == BITS_INVALID && output == 222U, "field exceeds width");
    failures += check(bits_field(8U, 1U, 0U, 0U, &output) == BITS_INVALID && output == 222U, "zero field");
    failures += check(bits_field(8U, 1U, (unsigned)-1, 1U, &output) == BITS_INVALID && output == 222U,
                      "converted negative offset before subtraction");
    failures += check(bits_field(8U, 1U, 0U, (unsigned)-1, &output) == BITS_INVALID && output == 222U,
                      "large length before mask shift");
    failures += check(bits_field(0U, 0U, 0U, 1U, &output) == BITS_INVALID && output == 222U, "field width zero");
    failures += check(bits_field(8U, 256U, 0U, 1U, &output) == BITS_INVALID && output == 222U, "field value invalid");
    failures += check(bits_field(8U, 0U, 0U, 1U, NULL) == BITS_INVALID, "field null output");
    failures += check(bits_shift(8U, 1U, 8U, &output) == BITS_INVALID && output == 222U, "count endpoint");
    failures += check(bits_shift(8U, 1U, (unsigned)-1, &output) == BITS_INVALID && output == 222U,
                      "converted negative count rejected");
    failures += check(bits_shift(9U, 1U, 0U, &output) == BITS_INVALID && output == 222U, "shift width invalid");
    failures += check(bits_shift(8U, 256U, 0U, &output) == BITS_INVALID && output == 222U, "shift value invalid");
    failures += check(bits_shift(8U, 0U, 0U, NULL) == BITS_INVALID, "shift null output");
    return failures;
}

/**
 * @brief Execute access semantics and sequential timeline fixtures.
 * @param[in] None.
 * @param[out] None.
 * @return Count of failed expectations.
 */
static int test_access_traces(void)
{
    uint32_t output = 222U;
    int failures = 0;
    /**
     * The independent expected values are fixed in the chapter contract.
     **/
    failures += check(bits_write(8U, 165U, 12U, BITS_RW, &output) == BITS_OK && output == 12U, "RW fixture");
    failures += check(bits_write(8U, 165U, 12U, BITS_RO, &output) == BITS_OK && output == 165U, "RO fixture");
    failures += check(bits_write(8U, 165U, 12U, BITS_W1C, &output) == BITS_OK && output == 161U, "W1C fixture");
    output = 222U;
    failures += check(bits_write(8U, 165U, 12U, (BitsAccess)99, &output) == BITS_INVALID && output == 222U,
                      "invalid access preserves output");
    failures += check(bits_write(0U, 0U, 0U, BITS_RW, &output) == BITS_INVALID && output == 222U, "write width");
    failures += check(bits_write(8U, 256U, 0U, BITS_RW, &output) == BITS_INVALID && output == 222U, "write state");
    failures += check(bits_write(8U, 0U, 256U, BITS_RW, &output) == BITS_INVALID && output == 222U, "write data");
    failures += check(bits_write(8U, 0U, 0U, BITS_RW, NULL) == BITS_INVALID, "write null output");
    {
        BitsTrace trace = {0U};
        failures += check(bits_bad_rmw(&trace) == BITS_OK, "trace status");
        failures += check(trace.rwRead == 0U && trace.rwOther == 2U && trace.rwData == 1U && trace.rwFinal == 1U,
                          "sequential RW loses bit1; intended 3");
        failures += check(trace.w1cRead == 3U && trace.w1cData == 3U && trace.w1cFinal == 0U && trace.w1cDirect == 2U,
                          "sequential W1C OR clears both; direct leaves 2");
        failures += check(bits_bad_rmw(NULL) == BITS_INVALID, "trace null output");
    }
    return failures;
}

/**
 * @brief Execute all host test groups without relying on assert.
 * @param[in] None.
 * @param[out] None.
 * @return Zero on complete acceptance, nonzero on test or output failure.
 */
int main(void)
{
    int failures = test_masks() + test_fields_shifts() + test_access_traces();
    /**
     * Printing success is separate from proving each condition above.
     **/
    if (failures == 0) {
        if (puts("PASS bits: masks, fields, shifts, rejection preservation, "
                 "RW/RO/W1C, two sequential RMW traces") < 0) {
            return 1;
        }
        /**
         * Detect write failure deferred by stdio buffering before reporting success.
         **/
        if (fflush(stdout) != 0) {
            return 1;
        }
    }
    return failures == 0 ? 0 : 1;
}
#endif
