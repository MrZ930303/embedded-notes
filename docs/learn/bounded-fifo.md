阶段01 · 单元05 · C基础

# 单执行上下文的有界FIFO {#bounded-fifo}

四个槽位，两个方向，一个数量。先能解释哪个值真正排队，再让代码移动它。

容量4 · 字节值0..255 · 非重入 · 无硬件依赖

**队列顺序 ≠ 数组顺序**

head找最旧值；count限定有效数量。空与满都可能head==tail。

[槽位与顺序](#fifo-vocabulary)[预测实验](#fifo-lab)[固定回放](#fifo-replay)[C11源码](#fifo-c-lab)[独立十题](#fifo-practice)

## 从采集值到四个有归属的槽位 {#fifo-overview-title}

前置：已能把 LED 的期望状态与输出命令分开，并读过上一章的 C 对象、长度与生命周期。本章让采集终端暂存四个已接收字节：先进入的有效字节先离开。它们可能是四次采样的数值；此处不接串口、不接 DMA。

**本章成果：**一张能解释的 head/tail/count 轨迹，以及自己运行的 C 测试输出。按“认槽位 → 手算一次 → 预测回放 → 审查接口 → 独立十题”走，每段只交一个小成果。浏览器模型、主机 C 检查、硬件验证是三件事；本章硬件未验证，也没有个人进度或掌握记录。

## 先定义顺序、方向与容量 {#fifo-vocabulary-title}

**FIFO（先进先出）**规定取出的顺序：最早成功放入、且尚未取出的值先出。**有界**表示可容纳的数量固定，本例容量为 4；第五个值遇到满状态就返回失败，不覆盖最旧值、不等待空间。

队列对象内部拥有四个 `uint8_t` 值槽位；本章声明一个字节为 8 位，取值 0..255。**push** 把一个值复制进队列；**pop** 把最旧值复制到调用者提供的输出字节。保存的是值，不是源变量的地址或借来的缓冲指针。

**head 始终是下次读的下标，tail 始终是下次写的下标，count 是当前有效值的数量。**head、tail 各在 0..3，count 在 0..4。下标从 3 再前进，回到 0，叫回绕。数组仍只有四个槽，没有向地址更远处扩张。

**物理槽位顺序**是数组下标 0、1、2、3；**逻辑队列顺序**是从 head 开始数 count 个有效值，必要时跨过 3 回到 0。只有这些值排在队里。pop 后的槽可以保留旧字节；这些**陈旧字节**没有排队，不能因看见旧数值就把它再读一次。

物理槽0=85、1=102、2=51、3=68；head=tail=2、count=4；逻辑顺序51→68→85→102。

固定回放中 push102 之后的原创状态图。head==tail 仍可为满，必须结合 count。实际 C 对象的地址、填充和布局不由此图规定。

在空状态 `head=tail=0,count=0` 没有有效值；装满后 `head=tail=0,count=4` 四槽都有效。因此不能只用 head==tail 判空。count 保留了空和满的区别，容量四个都可用。

本段交付物：在图上圈出下次读位置，再单独写出逻辑顺序；不要按数组从 0 到 3 抄答案。

## 成功与拒绝，分别改变什么 {#fifo-transitions-title}

一次成功 push：先检查元数据和容量，把值复制到 slots[tail]，再让 tail 回绕前进并让 count 加一。一次成功 pop：先检查元数据和非空，把 slots[head] 复制到输出，再让 head 回绕前进并让 count 减一。

下标和 count 必须作为同一次概念操作完成。只改 tail、不改 count，下一次检查就会把已写入值当作不存在；只增 count、不写槽，就会把陈旧值当新值。这里的“同一次”依赖一个执行上下文连续调用，**不是原子操作承诺**。

运行前的不变量为 `tail == (head + count) % 4`，并且三个元数据都在范围内。先检查范围，才计算关系和访问槽位；本例通过检查后 head+count 最大为 7，不会在 size_t 中溢出。每次调用固定工作量，没有动态分配、阻塞、等待或隐含重试。

### 手算一次：入17、入34、出17 {#fifo-worked-example}

手算三步，输出初值165

 | 操作后 | head | tail | count | 逻辑顺序 | 输出

 | reset | 0 | 0 | 0 | 空 | 165（原值）

 | push17 | 0 | 1 | 1 | 17 | 165

 | push34 | 0 | 2 | 2 | 17,34 | 165

 | pop | 1 | 2 | 1 | 34 | 17

第一步在槽0写17，tail 到1；第二步在槽1写34，tail 到2。pop 从 head=0 读出17，head 到1，count 变1。槽0仍可能是17，但逻辑队列只有34。输出对象仍属于调用者，之后可以保留这次取得的17。

### 满与空：拒绝是可依赖的结果 {#fifo-rejection}

count=4 时 push 返回 FULL，所有槽、head、tail、count 都保持；不覆盖最旧值。count=0 时 pop 返回 EMPTY，所有队列状态和输出原值都保持。调用者必须先检查状态；EMPTY 后输出里的102可能来自上一次成功，不能当作本次新数据。

## 一个执行上下文是接口条件 {#fifo-single-context-title}

**本队列只能由单线程、单执行上下文拥有，且不可重入。**一次调用结束后才能开始下一次。不能把同一队列交给任务与 ISR、DMA，或两个并发调用者；即使说“只有一个生产者、一个消费者（SPSC）”，这份实现仍不安全。这里不运行真实数据竞争。

给成员加 volatile 不会把槽位写入和元数据更新变成同步协议，也不保证整个操作原子。[GCC13.1 §6.46](#fifo-source-gcc) 明确说明 volatile 不能作为给非 volatile 内存排序的屏障；C 的 volatile 访问本身也有实现定义条件。跨上下文需要重新设计并验证同步、所有权和生命周期，留到后续课程。

本章只证明指定软件输入的行为，不证明 RTOS、ISR、DMA、目标 MCU 时序、电气或硬件采集通过。

## 先预测状态与逻辑队列，再应用 {#fifo-lab-title}

预测选项与状态对应：本次操作成功=OK，队列已经装满=FULL，队列目前为空=EMPTY，调用参数无效=INVALID_ARGUMENT，队列状态失配=BAD_STATE。下方结果给出真实状态名；C源码使用同义的FIFO_前缀枚举。

先选一个操作，在纸上写状态和操作后的有效值，再提交。字节域为十进制整数0..255；空、负数、小数、256 或其他文字不能先取模变成合法字节。pop 不使用输入字节。逻辑队列用逗号分开，最多四个0..255整数；没有值写“空”。

起点 reset：head=0、tail=0、count=0，物理槽都清零，输出原值165。所有控制只运行本页内存模型，单执行上下文、不可重入；不接任务、ISR 或 DMA。编辑条件会清除预测，标为待应用，上次结果保留且明确标注，不会提前给出新答案。

操作push · 放入一个值pop · 取出最旧值待放入字节（十进制0..255）可选故障夹具（真实已初始化对象的副本）正常队列空队列参数空pop输出参数已初始化head=4已初始化tail与count关系失配预测返回状态先选状态本次操作成功队列已经装满队列目前为空调用参数无效队列状态失配预测操作后的逻辑队列

提交预测并应用重置空队列

待应用：push17；先填写两个预测。

还没有应用新操作。

已应用起点：head=0 tail=0 count=0；逻辑队列：空；物理槽：0,0,0,0；输出=165

上次操作：reset。物理零字节此时都没有排队。

故障选择是在提交时创建一次独立、全字段已初始化的副本；失败保留该副本所有字段，正常交互队列仍保持上次有效状态。null-output 只用于 pop，选 push 时会拒绝该无意义组合。它不构造任意地址，不尝试通过模型证明 C 能检查悬空指针。

## 固定14步：装满、拒绝、回绕、排空 {#fifo-replay-title}

回放从自己的空队列开始，与上面的自由实验独立。全部输入已固定：push17、34、51、68；再push85；pop两次；push85、102；pop四次；最后再pop。每步先预测状态和逻辑队列，应用才显示本步结果；不会先跑到末尾。最后停止，重置可以重做。

下一步1/14：push17

预测返回状态先选状态本次操作成功队列已经装满队列目前为空调用参数无效队列状态失配预测操作后的逻辑队列

提交预测走一步重置固定回放

先预测；当前仍为已应用起点。

输入已知，结果尚未应用。

已应用起点：head=0 tail=0 count=0；逻辑队列：空；物理槽：0,0,0,0；输出=165

自己算完后核对：完整静态14行与原因（无脚本可读）

从空队列与输出165开始的独立固定答案

 | 步/操作 | 状态 | head | tail | count | 逻辑顺序 | 输出

 | 1 push17 | OK | 0 | 1 | 1 | 17 | 165

 | 2 push34 | OK | 0 | 2 | 2 | 17,34 | 165

 | 3 push51 | OK | 0 | 3 | 3 | 17,34,51 | 165

 | 4 push68 | OK | 0 | 0 | 4 | 17,34,51,68 | 165

 | 5 push85 | FULL | 0 | 0 | 4 | 17,34,51,68 | 165

 | 6 pop | OK | 1 | 0 | 3 | 34,51,68 | 17

 | 7 pop | OK | 2 | 0 | 2 | 51,68 | 34

 | 8 push85 | OK | 2 | 1 | 3 | 51,68,85 | 34

 | 9 push102 | OK | 2 | 2 | 4 | 51,68,85,102 | 34

 | 10 pop | OK | 3 | 2 | 3 | 68,85,102 | 51

 | 11 pop | OK | 0 | 2 | 2 | 85,102 | 68

 | 12 pop | OK | 1 | 2 | 1 | 102 | 85

 | 13 pop | OK | 2 | 2 | 0 | 空 | 102

 | 14 pop | EMPTY | 2 | 2 | 0 | 空 | 102

四次push使tail绕回0，count=4明确为满；第一次85没有写入。两次pop释放槽0和槽1，head到2。再写85和102使用这两个空位，逻辑顺序却从槽2开始：51、68、85、102。排空后head=tail=2但count=0。最后一次pop保持输出102；102是上次成功结果，不是又取到一个值。

本段交付物：遮住静态答案，按每步记录状态、下标、数量和逻辑顺序，再挑出一次成功回绕与一次拒绝说明原因。表格是人工固定期望，不由交互脚本生成。

## 值所有权、有效对象与重置 {#fifo-ownership-title}

### 值复制：修改源变量，不会修改队列 {#fifo-copy-fixture}

```c
uint8_t source = 17;
/* 先检查 fifo_reset(&queue) == FIFO_OK */
/* 再检查 fifo_push(&queue, source) == FIFO_OK */
source = 99;
/* fifo_pop(&queue, &output) == FIFO_OK 时 output 为17 */
```

push 的参数按值传入，随后写进内部槽。source=99只修改源变量；队列拥有自己的17。pop 复制到独立输出对象后，调用者也拥有那份输出值。上面的片段只强调顺序，下面完整源码执行并检查所有返回值。

### 接口不能替调用者证明所有存储有效 {#fifo-pointer-contract}

queue 必须指向真实、存活、可写且类型合适的 Fifo 对象；push/pop 前已经调用 fifo_reset。pop 的 output 必须是调用者真实存活的可写 uint8_t 对象，**不能与队列对象的任何部分重叠**，包括内部 slots。实现没有通用地址合法性或重叠检测，非空也不能证明生命周期和权限。不要把悬空、伪造或任意未初始化对象拿来测试“能否返回失败”。

空queue，或pop的空output，返回 INVALID_ARGUMENT，并在访问队列前拒绝。BAD_STATE 只用于已初始化对象的坏元数据：head/tail超0..3、count超0..4，或者范围都合法但关系不一致。它不代表能发现所有存储错误，也不能发现一个恰巧自洽但被外部篡改的值序列。

### reset 是写入一个新起点 {#fifo-reset-contract}

fifo_reset(NULL) 返回 INVALID_ARGUMENT；否则对真实可写对象直接写入全部槽为0、head=tail=count=0，返回OK，不读取原先payload或元数据。因此可以初始化尚未赋值的真实自动对象，也可恢复已初始化的坏元数据；reset 后旧队列内容被丢弃。这个重置不是并发恢复机制，其他执行上下文不能同时读写它。

## 完整C11模块与实际主机检查 {#fifo-c-lab-title}

<a href="../examples/bounded-fifo/fifo.c" download>下载完整 fifo.c</a> · <a href="../examples/bounded-fifo/README.txt" download>下载使用与复现说明</a>。这是本站原创、厂商无关的C11模块，没有GPIO地址访问。实现要求8位字节和uint8_t；不满足时编译报错，不悄悄换一种数据域。head/tail/count使用size_t，不假定MCU或主机的指针宽度。

公开C接口与五种状态

 | 接口/状态 | 条件与可见结果

 | fifo_reset(Fifo *queue) | 非空真实可写对象→OK；写入确定空起点，不读取旧值

 | fifo_push(Fifo *queue,uint8_t value) | 先验证元数据；未满→复制值、前进tail、count+1，返回OK

 | fifo_pop(Fifo *queue,uint8_t *output) | 先拒绝空参数，再验证元数据；非空→复制最旧值、前进head、count-1

 | FIFO_FULL / FIFO_EMPTY | 容量满/无有效值；保持所有队列字段，pop不改output

 | FIFO_INVALID_ARGUMENT | queue为空，或pop output为空；不访问队列

 | FIFO_BAD_STATE | 真实已初始化对象的元数据范围/关系失配；不读槽、不修改状态或output

下面显示的**完整源文件**与下载、实际编译的源字节相同。只有定义 `FIFO_TEST` 才带测试main；不定义时可独立编译模块。C的uint8_t形参已经是字节域；调用者若在更宽整数转成uint8_t之前需要拒绝256，必须先在转换前验证，不能要求此形参恢复被转换丢掉的信息。浏览器输入在转换前拒绝越界。

展开完整可复用源码与全部测试

```c
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

```

### 在自己的主机复现 {#fifo-c-reproduce}

```c
cc -std=c11 -Wall -Wextra -Werror -pedantic -DFIFO_TEST fifo.c -o fifo-test
./fifo-test
cc -std=c11 -Wall -Wextra -Werror -pedantic -DFIFO_TEST -DNDEBUG fifo.c -o fifo-test-ndebug
./fifo-test-ndebug
cc -std=c11 -Wall -Wextra -Werror -pedantic -c fifo.c -o fifo.o
```

Windows按实际编译器和终端使用.exe名称。先准备已有C11编译器，不要求特定开发板。若你所在工程要求统一构建入口，应把以上同一参数配置到工程允许的profile中。本次本地主机验证使用已安装GCC13.1.0，经mcu-build自定义profile执行validate→dry-run→build；正常、NDEBUG和无main模块编译退出0，两个可执行测试退出0。公开命令给出编译器参数，不要求读者拥有作者的私有路径。

实际测试输出：`PASS FIFO: literal replay, boundaries, null, initialized corruption, snapshots, copy, 20000 steps`。检查不依赖assert，因此NDEBUG不消除验收。固定14行检查字节顺序、状态、head/tail/count、输出以及拒绝前后所有命名字段和槽位；另测0/255、空参数、真实已初始化的越界/关系失配、reset恢复与复制17。长回放用一个线性移位列表作独立预期，连续20000次调用，核对最旧字节、数量、边界和拒绝保持；它没有复制环形下标算法。

本段交付物：保留编译器版本、实际命令和测试退出码，给一次FULL和一次EMPTY写出“哪些状态不能变”。主机C检查与页面脚本检查分别成立，都不构成硬件、RTOS或并发验证。

## 十题：基础、故障与迁移 {#fifo-practice-title}

合上前面的答案，先写结论与原因，再展开每题原生解析。每题输入独立，不依赖上次操作。普通打印展开解析后恢复原折叠；“只打印题目”保留全部题干，隐藏答案、模型读数和其他已解例子；打印失败也清除临时模式。无脚本可读全部正文和原生解析；题目专用打印按钮需脚本。

展开全部答案折叠全部答案只打印题目

### 01 · 基础：同样的下标 {#fifo-question-01}

容量4，head=tail=2。对象A count=0，对象B count=4。分别表示什么？只凭head==tail能否区分？

展开本题原因

A为空，B为满；count保存占用数量，四个槽都可用。若只看下标相等，会把满误判为空。下一步先写count，再判断是否能读或写。

### 02 · 基础：槽里有17就能读吗 {#fifo-question-02}

容量4，slots=[17,34,0,0]，head=1、tail=2、count=1，输出原值165。一次pop的状态、输出、元数据和逻辑队列是什么？

展开本题原因

OK，输出34；head=2、tail=2、count=0，逻辑队列为空。槽0的17是陈旧值，槽1随后也成为陈旧值；不能再因槽里留着字节而继续读。

### 03 · 基础：跨过数组末尾 {#fifo-question-03}

容量4，slots=[0,0,51,68]，head=2、tail=0、count=2。push85成功后，写哪个槽，元数据和逻辑队列是什么？

展开本题原因

写槽0；head=2、tail=1、count=3，逻辑顺序51,68,85。tail回绕不改变FIFO顺序，不能按物理槽0到3抄为85,0,51,68。

### 04 · 故障：满时覆盖最旧值 {#fifo-question-04}

容量4，slots=[17,34,51,68]，head=tail=0、count=4，输出原值165。push85返回什么，哪些值必须保持？

展开本题原因

FULL。四个槽和head=0、tail=0、count=4全部保持，输出也仍为165。本接口拒绝新值，没有覆盖最旧值模式；上层应显式处理丢弃或其他策略。

### 05 · 故障：空输出为何看起来有效 {#fifo-question-05}

容量4，head=tail=2、count=0，槽仍是旧值，调用者output=102。pop返回EMPTY后，能否把102当作本次新采样？队列会怎样？

展开本题原因

不能。EMPTY后全部状态和output保持，102是上一次的值。只有OK才授权消费新输出；盯着output内容而忽略返回状态会重复处理旧数据。

### 06 · 所有权：源变量被改写 {#fifo-question-06}

一个真实队列先reset，uint8_t source=17，push成功；随后source=99，再向独立输出对象pop成功。输出是多少？若调用者将output指向queue.slots[0]是否满足接口？

展开本题原因

输出17，队列复制了值，不借用source地址。output指向内部槽违反不重叠前提；此实现不承诺检测这类错误。应提供队列外、存活可写的输出字节。

### 07 · 故障：范围内也可能失配 {#fifo-question-07}

真实全字段已初始化对象slots=[1,2,3,4]，head=0、tail=0、count=1，output=165。push9或pop分别如何处理？能用未初始化对象做同样试验吗？

展开本题原因

两者均BAD_STATE，因为(0+1)%4应为1而tail为0；所有字段与output保持。不能读取任意未初始化对象来测试拒绝，读取不确定成员本身可能就不成立。先有真实已初始化夹具，再单独改变元数据。

### 08 · 恢复：reset需要先读旧值吗 {#fifo-question-08}

真实可写Fifo自动对象尚未赋值；另一真实对象已初始化但head=4。分别调用fifo_reset；空指针调用fifo_reset(NULL)。预期状态是什么？

展开本题原因

前两者都OK，完整写入零槽、head=tail=count=0，不读取旧payload或元数据。NULL返回INVALID_ARGUMENT。push/pop的已初始化前提不能因此删除；reset也不保护同时访问。

### 09 · 迁移：一个生产者也不够 {#fifo-question-09}

主循环push，ISR中pop，同一个容量4队列；有人建议给head/tail/count加volatile，并声称这是SPSC所以安全。本章实现能否这样用？为什么？

展开本题原因

不能。此实现只允许单线程、单执行上下文且不可重入，槽和元数据的多步更新不是原子协议。volatile不提供所需同步与排序保证；必须在后续设计中另行解决跨上下文所有权和同步，不能把这个主机测试当作证明。

### 10 · 迁移：换值与字节边界 {#fifo-question-10}

从reset开始，push0、push255、pop、push17、pop、pop、pop；所有pop连续复用同一个、独立于队列的output；仅在序列开始初始化为165。写出四次pop的状态/输出、最后head/tail/count。若浏览器输入256应怎样处理？

展开本题原因

四次pop依次OK/0、OK/255、OK/17、EMPTY/17；最后head=tail=3、count=0。浏览器在转换前拒绝256，保留上次有效队列和输出，不把它取模为0。把数值换为其他合法字节，队列的顺序规则仍相同。

练习成果：一张不依赖物理槽顺序的逻辑轨迹、一份拒绝保持检查和一次实际C测试记录。隔一天换为0、255、7、9，从空队列再做“装满→拒绝→两次读→回绕写入”，解释每一步；不要只背17的序列。若卡住，可把“head与tail方向”“陈旧槽位”“输出保持”或“单上下文前提”中的具体一处交给助手追问。完成章节或一次选对都不能推出长期掌握。

## 核对来源、版本与适用范围 {#fifo-sources-title}

技术资料核对日期2026-10-17。图、回放、解释和练习是原创教学材料，不复制私有或付费课程。来源支撑下述语言条件；队列策略和固定答案仍由本章合同、独立测试和审阅负责。

- [WG14 N1570，Committee Draft，2011-04-12](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)：实际阅读§6.2.4（对象生命周期、不确定初值），§6.3.1.1/6.3.1.3（整数提升及无符号转换），§6.5.6（同数组与端点），§6.7.3（限定符及实现定义volatile访问），§7.19（size_t），§7.20.1.1（可选的精确宽度整数）。它是公开委员会草案，不冒充购买的最终ISO标准。**首选阅读任务：**先读§6.2.4第1—2、6段，解释为何“非空地址”不足以替代live object前提，再对照本章output合同。
- [GCC13.1手册§6.46：When is a Volatile Object Accessed?](https://gcc.gnu.org/onlinedocs/gcc-13.1.0/gcc/Volatiles.html)：完整页面已读，说明实现的volatile访问语义，以及它不替非volatile内存提供排序屏障。只支撑GCC版本限定的访问条件，不作为ISR/DMA安全或FIFO原子性的证明。
- [Matt Pocock teach](https://github.com/mattpocock/skills/blob/main/skills/productivity/teach/SKILL.md?plain=1)：知识先行、短成果、预测反馈、回忆与迁移的教学组织方法；不提供C技术正确性证明。

## 下一段：构建与启动 {#fifo-next-title}

上章对象与边界给本章的存储前提，本章交付一份可解释的队列轨迹。接下来进入06构建与身份，再沿07复位、08内存预算和09时钟继续。06—09为本地候选，后续10—14仍待建设；单元10才进入定时器。局部模型、主机测试、发布和硬件分别验收。

[上一章：C对象与边界](../learn/c-objects-bounds.html)[本章打印速查](../learn/bounded-fifo-reference.html)[下一章：构建与身份](../learn/build-link-identity.html)[构建与身份速查](../learn/build-link-identity-reference.html)[阶段01地图](../learn/engineering-map.html#stage-01)
