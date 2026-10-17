/******************************************************************************
 * @file fifo.c
 * @brief Original, vendor-independent teaching example for embedded-notes.
 * @version V1.0 2026-10-17
 *
 * Contract: C11, eight-bit bytes and uint8_t. Four internal value slots.
 * Call fifo_reset on a real writable Fifo before push/pop; reset never reads
 * prior contents. All later calls require that same live initialized object.
 * head is next read, tail next write, count occupancy; callers do not edit them.
 * One thread, one execution context, non-reentrant: not task/ISR/DMA-safe,
 * not concurrent SPSC. volatile does not supply synchronization or atomicity.
 * Pop output must point to a live writable caller byte outside the Fifo object.
 * Null is rejected; arbitrary dangling/forged pointers and overlap are NOT
 * detected. Metadata checks apply to real fully initialized objects only.
 * Rejection preserves all fields and pop output. Success copies byte values.
 * Every operation is bounded: no allocation, blocking, wait or retry.
 * Define FIFO_TEST for the executable, omit it for the reusable module.
 * No hardware validation or target-specific synchronization is provided.
 *****************************************************************************/
#include <limits.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#ifdef FIFO_TEST
#include <stdio.h>
#endif
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
 * @brief Check metadata before any slot access in an initialized object.
 * @param[in] queue Non-null live initialized object.
 * @return Whether ranges and occupancy relation agree.
 */
static bool fifo_valid(const Fifo *queue)
{
    /**
     * Bound the addition before checking the modulo relation.
     **/
    return queue->head < FIFO_CAPACITY && queue->tail < FIFO_CAPACITY &&
        queue->count <= FIFO_CAPACITY && (queue->head + queue->count) % FIFO_CAPACITY == queue->tail;
}
/**
 * @brief Establish an empty queue.
 * @param[in,out] queue Real writable queue object, or null.
 * @return FIFO_OK or FIFO_INVALID_ARGUMENT.
 */
FifoStatus fifo_reset(Fifo *queue)
{
    /**
     * Assign all fields without inspecting the object's prior contents.
     **/
    if (queue == NULL) {
        return FIFO_INVALID_ARGUMENT;
    }
    *queue = (Fifo){{0U, 0U, 0U, 0U}, 0U, 0U, 0U};
    return FIFO_OK;
}
/**
 * @brief Copy one value into a single-context initialized queue.
 * @param[in,out] queue Live initialized Fifo, or null.
 * @param[in] value Byte copied by value; no source pointer is retained.
 * @return FIFO_OK/FIFO_FULL/FIFO_INVALID_ARGUMENT/FIFO_BAD_STATE.
 */
FifoStatus fifo_push(Fifo *queue, uint8_t value)
{
    /**
     * Reject before reading a slot or changing metadata.
     **/
    if (queue == NULL) {
        return FIFO_INVALID_ARGUMENT;
    }
    if (!fifo_valid(queue)) {
        return FIFO_BAD_STATE;
    }
    if (queue->count == FIFO_CAPACITY) {
        return FIFO_FULL;
    }
    queue->slots[queue->tail] = value;
    queue->tail = (queue->tail + 1U) % FIFO_CAPACITY;
    queue->count += 1U;
    return FIFO_OK;
}
/**
 * @brief Copy the oldest value into a distinct caller-owned byte.
 * @param[in,out] queue Live initialized Fifo, or null.
 * @param[out] output Live writable byte outside queue, or null; overlap forbidden.
 * @return FIFO_OK/FIFO_EMPTY/FIFO_INVALID_ARGUMENT/FIFO_BAD_STATE.
 */
FifoStatus fifo_pop(Fifo *queue, uint8_t *output)
{
    /**
     * Null checks precede queue access; failure never writes output.
     **/
    if (queue == NULL || output == NULL) {
        return FIFO_INVALID_ARGUMENT;
    }
    if (!fifo_valid(queue)) {
        return FIFO_BAD_STATE;
    }
    if (queue->count == 0U) {
        return FIFO_EMPTY;
    }
    *output = queue->slots[queue->head];
    queue->head = (queue->head + 1U) % FIFO_CAPACITY;
    queue->count -= 1U;
    return FIFO_OK;
}
#ifdef FIFO_TEST
static unsigned int g_failures;
/**
 * @brief Keep test failures active with NDEBUG.
 * @param[in] condition Expected condition.
 * @param[in] label Fixed case name.
 * @return None.
 */
static void test_expect(bool condition, const char *label)
{
    /**
     * No assert is used for test acceptance.
     **/
    if (!condition) {
        g_failures += 1U;
        if (fprintf(stderr, "FAIL: %s\n", label) < 0) {
            g_failures += 1U;
        }
    }
}
/**
 * @brief Compare meaningful fields, never structure padding.
 * @param[in] left Initialized queue snapshot.
 * @param[in] right Initialized queue snapshot.
 * @return Whether every field is equal.
 */
static bool test_same(const Fifo *left, const Fifo *right)
{
    size_t index;
    /**
     * All four bytes include unused stale slots on rejection.
     **/
    if (left->head != right->head || left->tail != right->tail || left->count != right->count) {
        return false;
    }
    for (index = 0U; index < FIFO_CAPACITY; index += 1U) {
        if (left->slots[index] != right->slots[index]) {
            return false;
        }
    }
    return true;
}
/**
 * @brief Run independent literal rows including wrapped logical order.
 * @return None.
 */
static void test_fixed_trace(void)
{
    typedef struct {
        bool push;
        uint8_t value;
        FifoStatus status;
        size_t head;
        size_t tail;
        size_t count;
        uint8_t logical[4];
        uint8_t output;
    } TraceRow;
    static const TraceRow rows[] = {
        {true, 17U, FIFO_OK, 0U, 1U, 1U, {17U, 0U, 0U, 0U}, 165U},
        {true, 34U, FIFO_OK, 0U, 2U, 2U, {17U, 34U, 0U, 0U}, 165U},
        {true, 51U, FIFO_OK, 0U, 3U, 3U, {17U, 34U, 51U, 0U}, 165U},
        {true, 68U, FIFO_OK, 0U, 0U, 4U, {17U, 34U, 51U, 68U}, 165U},
        {true, 85U, FIFO_FULL, 0U, 0U, 4U, {17U, 34U, 51U, 68U}, 165U},
        {false, 0U, FIFO_OK, 1U, 0U, 3U, {34U, 51U, 68U, 0U}, 17U},
        {false, 0U, FIFO_OK, 2U, 0U, 2U, {51U, 68U, 0U, 0U}, 34U},
        {true, 85U, FIFO_OK, 2U, 1U, 3U, {51U, 68U, 85U, 0U}, 34U},
        {true, 102U, FIFO_OK, 2U, 2U, 4U, {51U, 68U, 85U, 102U}, 34U},
        {false, 0U, FIFO_OK, 3U, 2U, 3U, {68U, 85U, 102U, 0U}, 51U},
        {false, 0U, FIFO_OK, 0U, 2U, 2U, {85U, 102U, 0U, 0U}, 68U},
        {false, 0U, FIFO_OK, 1U, 2U, 1U, {102U, 0U, 0U, 0U}, 85U},
        {false, 0U, FIFO_OK, 2U, 2U, 0U, {0U, 0U, 0U, 0U}, 102U},
        {false, 0U, FIFO_EMPTY, 2U, 2U, 0U, {0U, 0U, 0U, 0U}, 102U}
    };
    Fifo queue;
    uint8_t output = 165U;
    size_t index;
    /**
     * Expected rows are worked constants, not generated by the ring logic.
     **/
    test_expect(fifo_reset(&queue) == FIFO_OK, "trace reset");
    for (index = 0U; index < sizeof rows / sizeof rows[0]; index += 1U) {
        const TraceRow *row = &rows[index];
        Fifo before = queue;
        size_t item;
        FifoStatus status = row->push ? fifo_push(&queue, row->value) : fifo_pop(&queue, &output);
        test_expect(status == row->status, "fixed trace status");
        test_expect(queue.head == row->head && queue.tail == row->tail && queue.count == row->count,
            "fixed trace metadata");
        test_expect(output == row->output, "fixed trace output");
        for (item = 0U; item < row->count; item += 1U) {
            test_expect(queue.slots[(row->head + item) % FIFO_CAPACITY] == row->logical[item],
                "fixed trace logical order");
        }
        if (row->status != FIFO_OK) {
            test_expect(test_same(&queue, &before), "rejection snapshot");
        }
    }
}
/**
 * @brief Test valid lifetime boundary and initialized corruption fixtures.
 * @return None.
 */
static void test_boundaries(void)
{
    Fifo queue;
    Fifo before;
    uint8_t output = 165U;
    uint8_t source = 17U;
    size_t index;
    static const Fifo corrupt[] = {
        {{1U, 2U, 3U, 4U}, 4U, 0U, 0U},
        {{1U, 2U, 3U, 4U}, 0U, 4U, 0U},
        {{1U, 2U, 3U, 4U}, 0U, 0U, 5U},
        {{1U, 2U, 3U, 4U}, 0U, 0U, 1U},
        {{1U, 2U, 3U, 4U}, 1U, 2U, 0U},
        {{1U, 2U, 3U, 4U}, SIZE_MAX, 0U, 0U},
        {{1U, 2U, 3U, 4U}, 0U, SIZE_MAX, 0U},
        {{1U, 2U, 3U, 4U}, 0U, 0U, SIZE_MAX}
    };
    /**
     * Reset can initialize an automatic object without inspecting old bytes.
     **/
    test_expect(fifo_reset(&queue) == FIFO_OK, "initial reset");
    before = queue;
    test_expect(fifo_reset(NULL) == FIFO_INVALID_ARGUMENT, "null reset");
    test_expect(fifo_push(NULL, 7U) == FIFO_INVALID_ARGUMENT, "null push");
    test_expect(fifo_pop(NULL, &output) == FIFO_INVALID_ARGUMENT, "null pop queue");
    test_expect(fifo_pop(&queue, NULL) == FIFO_INVALID_ARGUMENT, "null pop output");
    test_expect(fifo_pop(NULL, NULL) == FIFO_INVALID_ARGUMENT, "both null");
    test_expect(test_same(&queue, &before) && output == 165U, "null preservation");
    test_expect(fifo_pop(&queue, &output) == FIFO_EMPTY && output == 165U, "empty sentinel");
    test_expect(fifo_push(&queue, 0U) == FIFO_OK, "zero push");
    test_expect(fifo_push(&queue, UINT8_MAX) == FIFO_OK, "255 push");
    test_expect(fifo_pop(&queue, &output) == FIFO_OK && output == 0U, "zero pop");
    test_expect(fifo_pop(&queue, &output) == FIFO_OK && output == UINT8_MAX, "255 pop");
    test_expect(fifo_reset(&queue) == FIFO_OK, "copy reset");
    test_expect(fifo_push(&queue, source) == FIFO_OK, "copy push");
    source = 99U;
    test_expect(fifo_pop(&queue, &output) == FIFO_OK && output == 17U && source == 99U, "copy ownership");
    for (index = 0U; index < sizeof corrupt / sizeof corrupt[0]; index += 1U) {
        queue = corrupt[index];
        before = queue;
        output = 165U;
        test_expect(fifo_push(&queue, 9U) == FIFO_BAD_STATE, "corrupt push");
        test_expect(fifo_pop(&queue, &output) == FIFO_BAD_STATE, "corrupt pop");
        test_expect(test_same(&queue, &before) && output == 165U, "corrupt preservation");
        test_expect(fifo_reset(&queue) == FIFO_OK && queue.head == 0U && queue.tail == 0U && queue.count == 0U,
            "reset recovers initialized metadata");
    }
}
/**
 * @brief Compare many ring operations with a linear shifting oracle.
 * @return None.
 */
static void test_long_trace(void)
{
    Fifo queue;
    uint8_t expected[4] = {0U, 0U, 0U, 0U};
    size_t length = 0U;
    unsigned long step;
    uint8_t output = 165U;
    /**
     * This oracle shifts a list and has no head/tail or wrap calculation.
     **/
    test_expect(fifo_reset(&queue) == FIFO_OK, "long reset");
    for (step = 0UL; step < 20000UL; step += 1UL) {
        bool push = step % 11UL < 6UL;
        uint8_t value = (uint8_t)((step * 73UL + 19UL) % 256UL);
        uint8_t oldOutput = output;
        Fifo before = queue;
        FifoStatus expectedStatus = push ? (length == 4U ? FIFO_FULL : FIFO_OK) :
            (length == 0U ? FIFO_EMPTY : FIFO_OK);
        FifoStatus status = push ? fifo_push(&queue, value) : fifo_pop(&queue, &output);
        size_t item;
        test_expect(status == expectedStatus, "long status");
        if (expectedStatus == FIFO_OK && push) {
            expected[length] = value;
            length += 1U;
            test_expect(output == oldOutput, "push preserves output");
        } else if (expectedStatus == FIFO_OK) {
            test_expect(output == expected[0], "long oldest byte");
            length -= 1U;
            for (item = 0U; item < length; item += 1U) {
                expected[item] = expected[item + 1U];
            }
        } else {
            test_expect(test_same(&queue, &before) && output == oldOutput, "long rejection snapshot");
        }
        test_expect(queue.count == length && queue.head < 4U && queue.tail < 4U, "long bounds");
        for (item = 0U; item < length; item += 1U) {
            test_expect(queue.slots[(queue.head + item) % 4U] == expected[item], "long logical sequence");
        }
    }
}
/**
 * @brief Verify reset through the public interface.
 * @return Zero on success, nonzero on failure even under NDEBUG.
 */
int main(void)
{
    Fifo queue = {{9U, 9U, 9U, 9U}, 2U, 2U, 4U};
    const Fifo emptySeed = {{0U, 0U, 0U, 0U}, 0U, 0U, 0U};
    /**
     * Fixed expected seed is independent of the implementation.
     **/
    if (fifo_reset(&queue) != FIFO_OK || !test_same(&queue, &emptySeed)) {
        test_expect(false, "reset establishes empty seed");
        return 1;
    }
    test_fixed_trace();
    test_boundaries();
    test_long_trace();
    if (g_failures != 0U) {
        return 1;
    }
    if (puts("PASS FIFO: literal replay, boundaries, null, initialized corruption, snapshots, copy, 20000 steps") < 0) {
        return 1;
    }
    if (fflush(stdout) == EOF) {
        return 1;
    }
    return 0;
}
#endif
