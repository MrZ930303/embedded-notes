/******************************************************************************
 * @file button.c
 * @brief Original, vendor-independent teaching example for embedded-notes.
 * @version V1.0 2026-10-17
 *
 * Host build: cc -std=c11 -Wall -Wextra -Werror -pedantic -DBUTTON_TEST
 *               button.c -o button-test
 * Run: ./button-test
 * Define BUTTON_TEST only for the host executable; omit it for a module object.
 *
 * Interface contract:
 * - Supply a uint32_t-capable C11 implementation and sampled bool input levels.
 * - Initialize before use. A zeroed object can be rejected safely, but reading an
 *   arbitrary uninitialized automatic object is undefined behavior in C.
 * - One execution context owns an object. Do not modify its fields externally.
 * - ready means the initial observed level qualified; armed means a release was
 *   qualified. Initial held input never creates PRESSED: release, then press.
 * - thresholdMs and maxGapMs are both in [1, 2^31 - 1] ms. The caller guarantees
 *   the REAL interval between calls is less than 2^31 ms. Unsigned subtraction
 *   handles modulo wrap, not an unobserved full counter cycle or clock reset.
 * - A detected delta >=2^31 invalidates the object; reinitialize. A smaller gap
 *   >maxGapMs sets gapSeen and restarts evidence without inventing missed input.
 * - A filtered transition to release emits RELEASED, including the first release
 *   after boot-held qualification. gapSeen stays true until reinitialization.
 * - Repeated observations at one timestamp do not advance elapsed time. Software
 *   only observes call times, not every electrical change between them.
 * No GPIO driver, target firmware, electrical measurement or hardware validation.
 *****************************************************************************/

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef BUTTON_TEST
#include <stdio.h>
#endif

#define BUTTON_TIME_LIMIT UINT32_C(0x80000000)

typedef enum {
    BUTTON_INVALID = -1,
    BUTTON_NONE,
    BUTTON_PRESSED,
    BUTTON_RELEASED
} ButtonEvent;

typedef struct {
    bool initialized;
    bool activeHigh;
    bool candidate;
    bool stable;
    bool ready;
    bool armed;
    bool gapSeen;
    uint32_t sinceMs;
    uint32_t lastMs;
    uint32_t thresholdMs;
    uint32_t maxGapMs;
} Button;

/**
 * @brief Start qualification without emitting an initial pressed event.
 * @param[in,out] button Valid writable object; invalid settings clear this object.
 * @param[in] rawHigh Sampled electrical high (true) or low (false).
 * @param[in] activeHigh Whether high means physically pressed.
 * @param[in] nowMs Unsigned 32-bit monotonic millisecond counter, modulo wrap.
 * @param[in] thresholdMs Positive qualification duration, less than 2^31 ms.
 * @param[in] maxGapMs Positive permitted call interval, less than 2^31 ms.
 * @return true on success; false for null or invalid settings.
 */
bool button_init(Button *button, bool rawHigh, bool activeHigh, uint32_t nowMs,
                 uint32_t thresholdMs, uint32_t maxGapMs)
{
    /** Failure leaves a nonnull object safely uninitialized. **/
    if (button == NULL) {
        return false;
    }
    *button = (Button){0};
    if (thresholdMs == 0 || thresholdMs >= BUTTON_TIME_LIMIT ||
        maxGapMs == 0 || maxGapMs >= BUTTON_TIME_LIMIT) {
        return false;
    }
    *button = (Button){
        .initialized = true,
        .activeHigh = activeHigh,
        .candidate = rawHigh,
        .stable = rawHigh,
        .sinceMs = nowMs,
        .lastMs = nowMs,
        .thresholdMs = thresholdMs,
        .maxGapMs = maxGapMs
    };
    return true;
}

/**
 * @brief Consume one observation and return at most one transition event.
 * @param[in,out] button Previously initialized or zero-initialized object.
 * @param[in] rawHigh Sampled electrical high or low.
 * @param[in] nowMs Counter with the initialization time semantics.
 * @return NONE/PRESSED/RELEASED, or INVALID if the interface contract fails.
 */
ButtonEvent button_update(Button *button, bool rawHigh, uint32_t nowMs)
{
    uint32_t gapMs;
    /** Reject a zero-initialized object; arbitrary indeterminate storage is invalid C usage. **/
    if (button == NULL || !button->initialized) {
        return BUTTON_INVALID;
    }
    gapMs = (uint32_t)(nowMs - button->lastMs);
    /** Modulo arithmetic cannot detect an entirely missed counter cycle. **/
    if (gapMs >= BUTTON_TIME_LIMIT) {
        button->initialized = false;
        return BUTTON_INVALID;
    }
    button->lastMs = nowMs;
    if (gapMs > button->maxGapMs) {
        button->gapSeen = true;
        button->candidate = rawHigh;
        button->sinceMs = nowMs;
        return BUTTON_NONE;
    }
    if (rawHigh != button->candidate) {
        button->candidate = rawHigh;
        button->sinceMs = nowMs;
    }
    if ((uint32_t)(nowMs - button->sinceMs) < button->thresholdMs) {
        return BUTTON_NONE;
    }
    if (!button->ready) {
        button->ready = true;
        button->stable = button->candidate;
        button->armed = button->stable != button->activeHigh;
        return BUTTON_NONE;
    }
    if (button->stable == button->candidate) {
        return BUTTON_NONE;
    }
    button->stable = button->candidate;
    if (button->stable != button->activeHigh) {
        button->armed = true;
        return BUTTON_RELEASED;
    }
    if (button->armed) {
        button->armed = false;
        return BUTTON_PRESSED;
    }
    return BUTTON_NONE;
}

#ifdef BUTTON_TEST
static unsigned g_failures;

/**
 * @brief Record an observable requirement even when NDEBUG is defined.
 * @param[in] condition Requirement result.
 * @param[in] label Human-readable requirement.
 * @return None.
 */
static void test_expect(bool condition, const char *label)
{
    /** Test checks never disappear in release compilation. **/
    if (!condition) {
        ++g_failures;
        fprintf(stderr, "FAIL: %s\n", label);
    }
}

/**
 * @brief Fixed artificial electrical input from the lesson, not measured data.
 * @param[in] timeMs Time relative to a previously qualified release.
 * @return Electrical high or low at that displayed sample time.
 */
static bool test_waveform_level(uint32_t timeMs)
{
    static const uint32_t times[] = {2, 3, 4, 5, 6, 24, 25, 26, 34, 35, 36};
    static const bool levels[] = {false, true, false, true, false, true, false, true, false, true, false};
    bool rawHigh = true;
    /** Input levels are specified separately from the debouncing implementation. **/
    for (size_t index = 0; index < sizeof(times) / sizeof(times[0]); ++index) {
        if (timeMs >= times[index]) {
            rawHigh = levels[index];
        }
    }
    return rawHigh;
}

/**
 * @brief Check the lesson's independently hand-calculated 11/31/41 ms answers.
 * @param[in] None.
 * @return None.
 */
static void test_waveform(void)
{
    Button button = {0};
    unsigned presses = 0;
    unsigned releases = 0;
    /** The displayed t=0 follows five milliseconds of confirmed release. **/
    test_expect(button_init(&button, true, false, 0, 5, 1), "valid initialization");
    for (uint32_t timeMs = 1; timeMs <= 5; ++timeMs) {
        test_expect(button_update(&button, true, timeMs) == BUTTON_NONE, "silent release warmup");
    }
    for (uint32_t timeMs = 0; timeMs <= 50; ++timeMs) {
        ButtonEvent event = button_update(&button, test_waveform_level(timeMs), timeMs + 5);
        ButtonEvent expected = BUTTON_NONE;
        if (timeMs == 11 || timeMs == 41) {
            expected = BUTTON_PRESSED;
        } else if (timeMs == 31) {
            expected = BUTTON_RELEASED;
        }
        test_expect(event == expected, "fixed waveform event time");
        if (event == BUTTON_PRESSED) {
            ++presses;
        } else if (event == BUTTON_RELEASED) {
            ++releases;
        }
    }
    test_expect(presses == 2 && releases == 1 && !button.gapSeen, "waveform totals and no hold repeats");
}

/**
 * @brief Long unobserved intervals must restart the evidence window.
 * @param[in] None.
 * @return None.
 */
static void test_gap(void)
{
    Button button = {0};
    test_expect(button_init(&button, true, false, 0, 5, 1), "gap initialization");
    /** Release is qualified before the candidate changes at time 6. **/
    for (uint32_t timeMs = 1; timeMs <= 5; ++timeMs) {
        test_expect(button_update(&button, true, timeMs) == BUTTON_NONE, "gap warmup");
    }
    test_expect(button_update(&button, false, 6) == BUTTON_NONE, "start candidate before gap");
    test_expect(button_update(&button, false, 100) == BUTTON_NONE, "gap cannot prove stability");
    test_expect(button.gapSeen, "gap flag is observable");
    for (uint32_t timeMs = 101; timeMs <= 105; ++timeMs) {
        ButtonEvent expected = timeMs == 105 ? BUTTON_PRESSED : BUTTON_NONE;
        test_expect(button_update(&button, false, timeMs) == expected, "new window completes at 105");
    }
}

/**
 * @brief A detected invalid clock delta requires explicit reinitialization.
 * @param[in] None.
 * @return None.
 */
static void test_invalid_time(void)
{
    Button button = {0};
    test_expect(button_init(&button, true, false, 10, 5, 1), "clock initialization");
    /** A backward counter creates a modular difference outside the declared contract. **/
    test_expect(button_update(&button, true, 9) == BUTTON_INVALID, "backward counter rejected");
    test_expect(button_update(&button, true, 10) == BUTTON_INVALID, "clock error requires reinit");
    test_expect(button_init(&button, true, false, 0, 5, 1), "clock reinit");
    test_expect(button_update(&button, true, BUTTON_TIME_LIMIT) == BUTTON_INVALID, "half-range gap rejected");
    test_expect(button_init(&button, true, false, 0, 5, 1), "clock second reinit");
    test_expect(button_update(&button, true, 1) == BUTTON_NONE, "reinit restores operation");
}

/**
 * @brief A qualified release must precede the first pressed event after startup.
 * @param[in] None.
 * @return None.
 */
static void test_startup(void)
{
    Button button = {0};
    /** Already held at boot is a state, not a new press event. **/
    test_expect(button_init(&button, false, false, 0, 5, 1), "boot-held initialization");
    for (uint32_t timeMs = 1; timeMs <= 20; ++timeMs) {
        test_expect(button_update(&button, false, timeMs) == BUTTON_NONE, "boot-held emits no press");
    }
    for (uint32_t timeMs = 21; timeMs <= 26; ++timeMs) {
        ButtonEvent expected = timeMs == 26 ? BUTTON_RELEASED : BUTTON_NONE;
        test_expect(button_update(&button, true, timeMs) == expected, "boot-held release qualifies at 26");
    }
    for (uint32_t timeMs = 27; timeMs <= 32; ++timeMs) {
        ButtonEvent expected = timeMs == 32 ? BUTTON_PRESSED : BUTTON_NONE;
        test_expect(button_update(&button, false, timeMs) == expected, "first new press qualifies at 32");
    }
    test_expect(button_init(&button, true, false, 0, 5, 1), "startup-bounce initialization");
    for (uint32_t timeMs = 0; timeMs <= 20; ++timeMs) {
        test_expect(button_update(&button, test_waveform_level(timeMs), timeMs) == BUTTON_NONE,
                    "no prequalified release means no 11 ms event at boot");
    }
}

/**
 * @brief Ten/twelve millisecond filtering swallows the eight millisecond release.
 * @param[in] None.
 * @return None.
 */
static void test_thresholds(void)
{
    static const uint32_t thresholds[] = {10, 12};
    static const uint32_t firstPressTimes[] = {16, 18};
    /** Literal answers are derived in the lesson, not calculated by this test. **/
    for (size_t index = 0; index < 2; ++index) {
        Button button = {0};
        uint32_t thresholdMs = thresholds[index];
        test_expect(button_init(&button, true, false, 0, thresholdMs, 1), "threshold initialization");
        for (uint32_t timeMs = 1; timeMs <= thresholdMs; ++timeMs) {
            test_expect(button_update(&button, true, timeMs) == BUTTON_NONE, "chosen-threshold warmup");
        }
        for (uint32_t timeMs = 0; timeMs <= 50; ++timeMs) {
            ButtonEvent expected = timeMs == firstPressTimes[index] ? BUTTON_PRESSED : BUTTON_NONE;
            test_expect(button_update(&button, test_waveform_level(timeMs), timeMs + thresholdMs) == expected,
                        "short release produces no release or second press");
        }
    }
}

/**
 * @brief Exercise active-high mapping while the counter wraps from UINT32_MAX.
 * @param[in] None.
 * @return None.
 */
static void test_active_high_wrap(void)
{
    Button button = {0};
    uint32_t startMs = UINT32_MAX - 10;
    /** The press begins before wrap; five elapsed milliseconds finish at zero. **/
    test_expect(button_init(&button, false, true, startMs, 5, 1), "active-high initialization");
    for (uint32_t offset = 1; offset <= 5; ++offset) {
        test_expect(button_update(&button, false, startMs + offset) == BUTTON_NONE, "active-high warmup");
    }
    for (uint32_t offset = 6; offset <= 20; ++offset) {
        ButtonEvent expected = offset == 11 ? BUTTON_PRESSED : BUTTON_NONE;
        test_expect(button_update(&button, true, startMs + offset) == expected, "wrapped press and held state");
    }
    for (uint32_t offset = 21; offset <= 26; ++offset) {
        ButtonEvent expected = offset == 26 ? BUTTON_RELEASED : BUTTON_NONE;
        test_expect(button_update(&button, false, startMs + offset) == expected, "active-high release");
    }
}

/**
 * @brief A gap equal to the maximum is allowed; a larger one restarts evidence.
 * @param[in] None.
 * @return None.
 */
static void test_gap_boundary(void)
{
    Button button = {0};
    /** Irregular but permitted observation times still use elapsed milliseconds. **/
    test_expect(button_init(&button, true, false, 0, 5, 2), "gap-boundary initialization");
    test_expect(button_update(&button, true, 2) == BUTTON_NONE, "maximum interval allowed at 2");
    test_expect(button_update(&button, true, 4) == BUTTON_NONE, "maximum interval allowed at 4");
    test_expect(button_update(&button, true, 5) == BUTTON_NONE, "release qualifies at 5");
    test_expect(button_update(&button, false, 7) == BUTTON_NONE, "candidate starts at 7");
    test_expect(button_update(&button, false, 9) == BUTTON_NONE, "candidate age 2");
    test_expect(button_update(&button, false, 11) == BUTTON_NONE, "candidate age 4");
    test_expect(button_update(&button, false, 12) == BUTTON_PRESSED, "candidate age 5");
    test_expect(!button.gapSeen, "equal maximum interval is not a gap");
    test_expect(button_update(&button, true, 15) == BUTTON_NONE, "exceeded interval starts new release");
    test_expect(button_update(&button, true, 17) == BUTTON_NONE, "release age 2");
    test_expect(button_update(&button, true, 19) == BUTTON_NONE, "release age 4");
    test_expect(button_update(&button, true, 20) == BUTTON_RELEASED, "release qualifies after gap");
    test_expect(button.gapSeen, "gap evidence remains latched");
}

/**
 * @brief Reject a short observed pulse and duplicate-timestamp false progress.
 * @param[in] None.
 * @return None.
 */
static void test_short_pulse(void)
{
    Button button = {0};
    test_expect(button_init(&button, true, false, 0, 5, 1), "pulse initialization");
    /** A low observation from 6 through 9 is interrupted before five milliseconds. **/
    for (uint32_t timeMs = 1; timeMs <= 20; ++timeMs) {
        bool rawHigh = timeMs < 6 || timeMs >= 10;
        test_expect(button_update(&button, rawHigh, timeMs) == BUTTON_NONE, "short pulse never qualifies");
    }
    test_expect(button_update(&button, false, 21) == BUTTON_NONE, "duplicate-time candidate");
    for (unsigned count = 0; count < 100; ++count) {
        test_expect(button_update(&button, false, 21) == BUTTON_NONE, "sample count is not elapsed time");
    }
    for (uint32_t timeMs = 22; timeMs <= 26; ++timeMs) {
        ButtonEvent expected = timeMs == 26 ? BUTTON_PRESSED : BUTTON_NONE;
        test_expect(button_update(&button, false, timeMs) == expected, "pulse exact threshold at 26");
    }
}

/**
 * @brief Validate nulls, zero/out-of-range configuration and accepted extremes.
 * @param[in] None.
 * @return None.
 */
static void test_parameters(void)
{
    Button button = {0};
    static const uint32_t invalidValues[] = {0, BUTTON_TIME_LIMIT, UINT32_MAX};
    /** No public validation depends on assert or a particular build mode. **/
    test_expect(!button_init(NULL, true, false, 0, 5, 1), "null init rejected");
    test_expect(button_update(NULL, true, 0) == BUTTON_INVALID, "null update rejected");
    test_expect(button_update(&button, true, 0) == BUTTON_INVALID, "zero object rejected");
    for (size_t index = 0; index < 3; ++index) {
        test_expect(!button_init(&button, true, false, 0, invalidValues[index], 1), "invalid threshold rejected");
        test_expect(button_update(&button, true, 0) == BUTTON_INVALID, "failed init cannot be used");
        test_expect(!button_init(&button, true, false, 0, 5, invalidValues[index]), "invalid maximum gap rejected");
    }
    test_expect(button_init(&button, true, false, 0, 1, 1), "minimum settings accepted");
    test_expect(button_update(&button, true, 1) == BUTTON_NONE, "one millisecond release qualifies");
    test_expect(button_update(&button, false, 2) == BUTTON_NONE, "one millisecond candidate begins");
    test_expect(button_update(&button, false, 3) == BUTTON_PRESSED, "one millisecond press qualifies");
    test_expect(button_init(&button, true, false, 0, BUTTON_TIME_LIMIT - 1, BUTTON_TIME_LIMIT - 1),
                "maximum valid settings accepted");
    test_expect(button_update(&button, true, BUTTON_TIME_LIMIT - 1) == BUTTON_NONE, "large release qualifies");
    test_expect(button_update(&button, false, BUTTON_TIME_LIMIT) == BUTTON_NONE, "large candidate begins");
    test_expect(button_update(&button, false, UINT32_MAX) == BUTTON_PRESSED, "large exact threshold qualifies");
    test_expect(!button_init(&button, true, false, 0, 0, 1), "bad reinit invalidates old state");
    test_expect(button_update(&button, true, 1) == BUTTON_INVALID, "old state not used after bad reinit");
}

/**
 * @brief Exercise the first published input through the public interface.
 * @param[in] None.
 * @return Zero for success, nonzero for a failed requirement.
 */
int main(void)
{
    /** Execute tests through the same public functions a caller uses. **/
    test_waveform();
    test_gap();
    test_invalid_time();
    test_startup();
    test_thresholds();
    test_active_high_wrap();
    test_gap_boundary();
    test_short_pulse();
    test_parameters();
    if (g_failures != 0) {
        return 1;
    }
    puts("PASS: waveform, boot-held, startup-bounce, active-high, wrap, gap, gap-boundary, "
         "short-pulse, short-release, thresholds, parameters, invalid-time");
    return 0;
}
#endif
