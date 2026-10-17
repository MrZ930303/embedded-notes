/******************************************************************************
 * @file stack_probe.c
 * @author Embedded Engineering Notes project
 * @brief Original safe bounded call chain for compiler -fstack-usage evidence.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include <stddef.h>
#include <stdint.h>

/** @brief Bounded leaf. @param[in] seed 0..255. @return Defined small sum. */
static unsigned probe_leaf(unsigned seed)
{
    volatile unsigned char local[24] = {0};
    /** Access only this live array, never active-stack fill/probing. **/
    local[0] = (unsigned char)seed;
    local[23] = 3U;
    return (unsigned)local[0] + (unsigned)local[23];
}

/** @brief Bounded middle frame. @param[in] seed 0..255. @return Defined small sum. */
static unsigned probe_middle(unsigned seed)
{
    volatile unsigned char local[40] = {0};
    unsigned child;
    /** The caller frame stays live across the ordinary child call. **/
    local[0] = 5U;
    child = probe_leaf(seed);
    return child + (unsigned)local[0];
}

/** @brief Root of a fixed three-function chain. @param[in] seed Any unsigned value.
 * @return Sum bounded by 270. No target, recursion, VLA or arbitrary pointer access. */
unsigned stack_probe(unsigned seed)
{
    volatile unsigned char local[56] = {0};
    unsigned child;
    /** Constrain the input before passing it to the fixed chain. **/
    local[55] = 7U;
    child = probe_middle(seed & 255U);
    return child + (unsigned)local[55];
}

#ifdef STACK_PROBE_TEST
#include <stdio.h>

/** @brief Execute only bounded initialized local arrays. @return Checked test status. */
int main(void)
{
    /** 17+3+5+7=32 is a literal value oracle, not a frame-size oracle. **/
    if (stack_probe(17U) != 32U || stack_probe(255U) != 270U) {
        if (fprintf(stderr, "FAIL bounded stack probe value\n") < 0) {
            return 2;
        }
        if (fflush(stderr) != 0) {
            return 2;
        }
        return 1;
    }
    if (puts("PASS bounded stack probe: 32 and 270; compiler frames are separate evidence") == EOF) {
        return 2;
    }
    if (fflush(stdout) != 0) {
        return 2;
    }
    return 0;
}
#endif
