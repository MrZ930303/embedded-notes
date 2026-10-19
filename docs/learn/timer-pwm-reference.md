阶段03 · 单元10 · 已发布

# 定时器与非阻塞时间打印速查 {#timer-pwm-reference}

## 拿起参数时先查前提 {#timer-ref-overview-title}

<p>用途：拿起参数时先查前提，再算周期、比较值与晚到结果。完整因果推导和独立十题在<a href="../learn/timer-pwm.html">单元10正文</a>；本速查保留公式、边界、状态和复现源，不能替代目标手册与硬件验证。</p><p>使用本页“普通打印完整内容”可打印全部解释；正常结束或打印调度失败都会恢复此前折叠状态与临时模式。无脚本时请先手动展开所需原生折叠，再用浏览器打印菜单；不宣称物理纸张已经检验。</p>

## TIM3周期、量化与编码边界 {#timer-ref-plan-title}

<ul><li>选定F407VG TIM3、16位PSC/ARR/CCR、内部edge-up/PWM1/有效高OCxREF；实际引脚还需使能、极性和复用条件。</li><li>F407 APB÷1：TIM=PCLK；其他支持分频：TIM=2×PCLK。HCLK168/APB1÷4给PCLK42/TIM84MHz；独立HCLK42/APB1÷1给两者42。USART2保持PCLK。</li><li>PSC0..65535，ARR1..65535（0阻塞），名义source1..84000000Hz仅为算术输入域。fCNT=source/(PSC+1)，N=ARR+1，fPWM=source/[(PSC+1)N]。</li><li>CNT&lt;CCR有效；CCR0无效，能编码的CCR&gt;ARR全有效。ARR65535的100%需CCR65536，NOT_REPRESENTABLE；最大65535/65536并非1。ARR≤65534可用CCR=N。</li><li>duty0..10000bp，CCR=floor[(N×bp+5000)/10000]，最近半数向上；达到CCR/N，误差(CCR×10000−N×bp)/(N×10000)。N3的5000/1000/9000bp给CCR2/0/3，误差1/6、−1/10、+1/10。</li><li>先扩宽再乘：最大divisor4294967296；duty乘积加5000≤655365000。频率保留整数比；无需虚构域内uint64溢出状态。</li></ul><p>固定回代：84MHz/PSC83→1MHz；ARR999→1000状态、1ms、1kHz；CCR250→0..249共250有效状态、25%。名义比例没有消除振荡器误差、更新瞬态或tick抖动。</p>

## 预装载、UEV、UDIS与URS {#timer-ref-update-title}

<p>PSC缓冲等待UEV；ARR由ARPE决定；本连续PWM选择OCxPE，历史条款不保证单脉冲例外之外的无预装载PWM。开始前适当UG初始化。UDIS抑制UEV/影子传送；URS仅筛更新IRQ/DMA请求来源，UG仍可更新。UG可重初始化CNT/预分频器，不能承诺中途无毛刺或多寄存器物理原子。</p><p>主机四事件：种子活动83/999/250、CNT500，预装载167/499/250 → PRELOAD_WAIT保持旧活动 → UDIS_UG_HOLD保持影子/CNT0 → URS_UG_TRANSFER生效167/499/250但无UG来源请求 → OVERFLOW_FINISH允许溢出请求来源并终止。没有执行IRQ或测量波形。</p>

## 模32观察与一次有限工作 {#timer-ref-time-title}

<p>1tick=1ms为共享夹具；true forward gap&lt;2^31由调用者保证，period1..2147483647。显式(uint32_t)(now−then)求模差；observed delta≥2147483648拒绝。两个相同样本无法区分gap0与整圈停顿，不能伪称已检测全部违约。</p><p>状态period/lastObserved/remainder，remainder&lt;period。total=oldRemainder+delta；releases=total/period；newRemainder=total%period。商0→work=false/missed0；商&gt;0→work=true/missed=商−1。最多一次工作、无catch-up循环；lastObserved每次合法观察更新，余数保持原相位。</p><p>period10/start100：109→false/0/9；110→true/0/0；145→true/2/5；重复145→false/0/5。4294967290→4的delta10。最大total2147483646+2147483647=4294967293，先扩宽安全；不证明真实gap、tick精度或WCET。</p><p>time_init新存储不读旧值；time_elapsed检查模差；time_service有限报告。TIME_OK、TIME_INVALID_ARGUMENT、TIME_BAD_STATE、TIME_GAP_REJECTED清楚分开。有效超时政策会改变状态，非法时间拒绝保持所有命名状态/输出。真实存活、初始化、对象大小和非重叠前提不能靠NULL检查代替。</p>

## 完整C、资源与复现入口 {#timer-ref-source-title}

<p>timer.h/timer.c封装名义PWM规划及四事件主机轨迹；time.h/time.c封装检查过的模32观察和一次有限服务。分别包含公共头，在独立翻译单元链接；不复制FIFO或把实现文本包含进UART。可选TIMER_TEST/TIME_TEST才含main；NDEBUG不关闭检查。</p><p>所有输入指针必须指向真实、存活、类型正确且已初始化的对象；输出可写、大小诚实，与本调用其他对象均不重叠。init/begin可接受未初始化的新存储而不读旧值，其他状态调用要求已初始化元数据。空指针拒绝无法验证伪造、悬空地址或错误别名。只用真实初始化坏字段做失败测试，不执行未定义行为示范。</p><p>规划拒绝和状态检查失败都保持所有命名输出/接受状态字段；TIMER_DONE不推进终点。time_service只返回报告，不睡眠、不忙等、不调用回调。单上下文独占、不可重入，无堆、递归、MMIO、IRQ或DMA；每次生产调用工作量与存储固定，测试循环也固定上限。栈启发式及主机.su只提供当前编译选项下局部证据，不是目标最坏调用栈。</p><p>复现指令包含已有编译器的常规命令，AgentHub实际编译必须通过mcu-build自定义profile的validate→dry-run→build；保存真实返回码、诊断、源/头/工具/profile/新鲜产物哈希。失败构建不执行旧产物。源码是本项目原创，不虚构EternalChip归属。下面完整源与原生下载保持字节一致。</p><details class="source-fold" id="timer-ref-code"><summary>展开完整C与复现指令（原生下载始终可用）</summary>

### timer.h · 完整文本 {#timer-source-timer-h}

<p><a href="../examples/timer-pwm/timer.h" download>下载timer.h</a></p>

```text
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file timer.h
 * @author embedded-notes contributors
 * @brief F407 TIM3 qualified arithmetic and finite host preload model.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_TIMER_H
#define EMBEDDED_NOTES_TIMER_H
#include <stdbool.h>
#include <stdint.h>

#if !defined(UINT32_MAX) || !defined(UINT64_MAX) || !defined(INT64_MAX)
#error Exact-width uint32_t, uint64_t and int64_t are required.
#endif

typedef enum {
    TIMER_OK = 0,
    TIMER_INVALID_ARGUMENT,
    TIMER_NOT_REPRESENTABLE,
    TIMER_BAD_STATE,
    TIMER_DONE
} TimerStatus;

typedef struct {
    uint32_t sourceHz;
    uint32_t prescaler;
    uint32_t autoReload;
    uint32_t dutyBp;
} TimerRequest;

typedef struct {
    TimerRequest requested;
    uint32_t compare;
    uint64_t divisor;
    int64_t errorNum;
    uint64_t errorDen;
} TimerPlan;

typedef enum {
    TIMER_PRELOAD_WAIT = 0,
    TIMER_UDIS_UG_HOLD,
    TIMER_URS_UG_TRANSFER,
    TIMER_OVERFLOW_FINISH
} TimerEvent;

typedef struct {
    TimerPlan active;
    TimerPlan preload;
    uint32_t phase;
    uint32_t counter;
    bool terminal;
} TimerTrace;

/*
 * Selected arithmetic only: STM32F407VG TIM3, 16-bit PSC/ARR/CCR, internal
 * edge-up PWM1, active-high OCxREF. Supplied nominal source 1..84000000 Hz
 * presupposes a separately qualified clock plan. PSC 0..65535, ARR 1..65535;
 * ARR0 blocks the selected counter. Duty 0..10000 basis points, nearest/ties-up.
 * Every result is nominal: counter frequency source/(PSC+1), PWM frequency
 * source/divisor, achieved duty compare/(ARR+1), signed duty error errorNum/errorDen.
 * An unencodable compare 65536 is rejected, never clamped and called 100%.
 *
 * Pointers name real, live, correctly typed, initialized inputs and writable
 * independent outputs. All objects in one call are disjoint. begin may receive
 * fresh storage; stage/step require initialized trace metadata. Failure preserves
 * every named field/output. NULL checks do not validate arbitrary pointer values.
 * Single-context exclusive ownership, non-reentrant, fixed storage/constant work.
 * No MMIO, heap, recursion, I/O, callback, busy wait or hardware timing guarantee.
 *
 * The trace stores a complete preload/active tuple as a teaching policy. It
 * does not prove physically atomic register writes/transfers. Four events are
 * finite: preload wait; UDIS1+UG holds shadows while resetting counter; UDIS0,
 * URS1+UG transfers without update IRQ/DMA request; overflow permits that request
 * source and terminates. No actual request, interrupt or waveform is generated.
 */

/**
 * @brief Validate and derive one selected timer plan before output mutation.
 * @param[in] request Initialized complete request within the documented domain.
 * @param[out] plan Writable independent output; unchanged on rejection.
 * @return TIMER_OK, TIMER_INVALID_ARGUMENT or TIMER_NOT_REPRESENTABLE.
 */
TimerStatus timer_plan(const TimerRequest *request, TimerPlan *plan);

/**
 * @brief Initialize a finite trace at84MHz/PSC83/ARR999/CCR250, CNT500.
 * @param[out] trace Real writable object, no prior initialization required.
 * @return TIMER_OK or TIMER_INVALID_ARGUMENT.
 */
TimerStatus timer_begin(TimerTrace *trace);

/**
 * @brief Replace the complete preload plan only before the first trace step.
 * @param[in,out] trace Begun valid phase0 trace, independent from request.
 * @param[in] request Proposed complete plan; validation precedes all mutation.
 * @return TIMER_OK, TIMER_INVALID_ARGUMENT, TIMER_NOT_REPRESENTABLE or TIMER_BAD_STATE.
 */
TimerStatus timer_stage(TimerTrace *trace, const TimerRequest *request);

/**
 * @brief Advance exactly one of four host events; terminal calls preserve outputs.
 * @param[in,out] trace Begun valid state, disjoint from event.
 * @param[out] event Writable event output, unchanged on rejection or TIMER_DONE.
 * @return TIMER_OK, TIMER_INVALID_ARGUMENT, TIMER_BAD_STATE or TIMER_DONE.
 */
TimerStatus timer_step(TimerTrace *trace, TimerEvent *event);
#endif
```



### timer.c · 完整文本 {#timer-source-timer-c}

<p><a href="../examples/timer-pwm/timer.c" download>下载timer.c</a></p>

```text
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file timer.c
 * @author embedded-notes contributors
 * @brief Qualified integer PWM arithmetic and finite host update events.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "timer.h"
#include <stddef.h>
#ifdef TIMER_TEST
#include <stdio.h>
#endif

/**
 * @brief Compute exact integer ratios after validating every external field.
 * @param[in] request Initialized independent input.
 * @param[out] plan Writable independent output; no prior read.
 * @return Named status; rejection preserves every output field.
 */
TimerStatus timer_plan(const TimerRequest *request, TimerPlan *plan)
{
    uint64_t count;
    uint64_t compare;
    TimerPlan next;

    /** Wide operands precede multiplication; maximum divisor is 4294967296. **/
    if (request == NULL || plan == NULL) {
        return TIMER_INVALID_ARGUMENT;
    }
    if (request->sourceHz == 0U || request->sourceHz > 84000000U || request->prescaler > 65535U ||
        request->autoReload == 0U || request->autoReload > 65535U || request->dutyBp > 10000U) {
        return TIMER_INVALID_ARGUMENT;
    }
    count = (uint64_t)request->autoReload + 1U;
    compare = (count * request->dutyBp + 5000U) / 10000U;
    if (compare > 65535U) {
        return TIMER_NOT_REPRESENTABLE;
    }
    next.requested = *request;
    next.compare = (uint32_t)compare;
    next.divisor = ((uint64_t)request->prescaler + 1U) * count;
    next.errorNum = (int64_t)(compare * 10000U) - (int64_t)(count * request->dutyBp);
    next.errorDen = count * 10000U;
    *plan = next;
    return TIMER_OK;
}

/**
 * @brief Validate named plan metadata without reading structure padding.
 * @param[in] plan Initialized plan object.
 * @return True when every derived field matches its qualified request.
 */
static bool valid_plan(const TimerPlan *plan)
{
    TimerPlan expected;

    /** An initialized malformed plan is rejected; arbitrary memory is outside scope. **/
    if (timer_plan(&plan->requested, &expected) != TIMER_OK) {
        return false;
    }
    return plan->compare == expected.compare && plan->divisor == expected.divisor &&
        plan->errorNum == expected.errorNum && plan->errorDen == expected.errorDen;
}

/**
 * @brief Check the finite host trace's initialized invariants.
 * @param[in] trace Initialized state with real object extent.
 * @return True if phase, counter and both complete tuples are consistent.
 */
static bool valid_trace(const TimerTrace *trace)
{
    /** The host model never claims that a register write is physically atomic. **/
    return trace->phase <= 4U && trace->terminal == (trace->phase == 4U) &&
        trace->counter <= trace->active.requested.autoReload &&
        valid_plan(&trace->active) && valid_plan(&trace->preload);
}

/**
 * @brief Seed a fresh trace before any proposed preload or step.
 * @param[out] trace Writable real object; no prior read.
 * @return TIMER_OK or TIMER_INVALID_ARGUMENT.
 */
TimerStatus timer_begin(TimerTrace *trace)
{
    TimerTrace next;
    const TimerRequest seed = {84000000U, 83U, 999U, 2500U};
    TimerStatus status;

    /** Commit only after the seed plan is fully formed. **/
    if (trace == NULL) {
        return TIMER_INVALID_ARGUMENT;
    }
    status = timer_plan(&seed, &next.active);
    if (status != TIMER_OK) {
        return status;
    }
    next.preload = next.active;
    next.phase = 0U;
    next.counter = 500U;
    next.terminal = false;
    *trace = next;
    return TIMER_OK;
}

/**
 * @brief Replace a complete proposed tuple before advancing the finite trace.
 * @param[in,out] trace Initialized phase0 state, disjoint from request.
 * @param[in] request Proposed initialized request.
 * @return Named status; all trace fields preserved on failure.
 */
TimerStatus timer_stage(TimerTrace *trace, const TimerRequest *request)
{
    TimerPlan next;
    TimerStatus status;

    /** Checking the whole tuple prevents partial accepted host plans. **/
    if (trace == NULL || request == NULL) {
        return TIMER_INVALID_ARGUMENT;
    }
    if (!valid_trace(trace) || trace->phase != 0U) {
        return TIMER_BAD_STATE;
    }
    status = timer_plan(request, &next);
    if (status != TIMER_OK) {
        return status;
    }
    trace->preload = next;
    return TIMER_OK;
}

/**
 * @brief Advance one declared host event with no per-counter or waiting loop.
 * @param[in,out] trace Initialized valid trace.
 * @param[out] event Independent writable event output.
 * @return Named status; terminal or invalid calls preserve all named fields.
 */
TimerStatus timer_step(TimerTrace *trace, TimerEvent *event)
{
    TimerTrace next;
    TimerEvent nextEvent;

    /** UDIS suppresses transfer; URS filters request sources, not the UG event. **/
    if (trace == NULL || event == NULL) {
        return TIMER_INVALID_ARGUMENT;
    }
    if (!valid_trace(trace)) {
        return TIMER_BAD_STATE;
    }
    if (trace->terminal) {
        return TIMER_DONE;
    }
    next = *trace;
    nextEvent = (TimerEvent)next.phase;
    if (next.phase == 1U) {
        next.counter = 0U;
    } else if (next.phase >= 2U) {
        next.active = next.preload;
        next.counter = 0U;
    }
    next.phase++;
    next.terminal = next.phase == 4U;
    *trace = next;
    *event = nextEvent;
    return TIMER_OK;
}

#ifdef TIMER_TEST
/**
 * @brief Compare every named field of two initialized plans.
 * @param[in] left First plan.
 * @param[in] right Second plan.
 * @return True on field equality; padding is ignored.
 */
static bool same_plan(TimerPlan left, TimerPlan right)
{
    /** The public preservation guarantee concerns values, not padding bytes. **/
    return left.requested.sourceHz == right.requested.sourceHz &&
        left.requested.prescaler == right.requested.prescaler &&
        left.requested.autoReload == right.requested.autoReload &&
        left.requested.dutyBp == right.requested.dutyBp && left.compare == right.compare &&
        left.divisor == right.divisor && left.errorNum == right.errorNum && left.errorDen == right.errorDen;
}

/**
 * @brief Compare all named fields of initialized finite traces.
 * @param[in] left First trace.
 * @param[in] right Second trace.
 * @return True on complete named-field equality.
 */
static bool same_trace(TimerTrace left, TimerTrace right)
{
    /** No memcmp over indeterminate structure padding is needed. **/
    return same_plan(left.active, right.active) && same_plan(left.preload, right.preload) &&
        left.phase == right.phase && left.counter == right.counter && left.terminal == right.terminal;
}

/**
 * @brief Check hand-derived standard, quantized and widest divisor results.
 * @param[in] None.
 * @return True on every literal result.
 */
static bool test_plans(void)
{
    TimerRequest request = {84000000U, 83U, 999U, 2500U};
    TimerPlan plan;
    const uint32_t duty[] = {5000U, 1000U, 9000U};
    const uint32_t compare[] = {2U, 0U, 3U};
    const int64_t error[] = {5000, -3000, 3000};
    size_t index;

    /** N3 makes a tie and two endpoint-rounding effects visible without floats. **/
    if (timer_plan(&request, &plan) != TIMER_OK || plan.compare != 250U || plan.divisor != 84000U ||
        plan.errorNum != 0 || plan.errorDen != 10000000U) {
        return false;
    }
    request.prescaler = 0U;
    request.autoReload = 2U;
    for (index = 0U; index < 3U; index++) {
        request.dutyBp = duty[index];
        if (timer_plan(&request, &plan) != TIMER_OK || plan.compare != compare[index] ||
            plan.errorNum != error[index] || plan.errorDen != 30000U) {
            return false;
        }
    }
    request.prescaler = 65535U;
    request.autoReload = 65535U;
    request.dutyBp = 0U;
    if (timer_plan(&request, &plan) != TIMER_OK || plan.divisor != UINT64_C(4294967296) ||
        plan.compare != 0U) {
        return false;
    }
    request.autoReload = 65534U;
    request.dutyBp = 10000U;
    if (timer_plan(&request, &plan) != TIMER_OK || plan.compare != 65535U || plan.errorNum != 0) {
        return false;
    }
    request.autoReload = 1U;
    request.dutyBp = 5000U;
    return timer_plan(&request, &plan) == TIMER_OK && plan.compare == 1U;
}

/**
 * @brief Reject independent out-of-domain requests without accepted-output loss.
 * @param[in] None.
 * @return True if every invalid request preserves every named plan field.
 */
static bool test_rejection(void)
{
    const TimerRequest bad[] = {
        {0U, 83U, 999U, 2500U}, {84000001U, 83U, 999U, 2500U},
        {84000000U, 65536U, 999U, 2500U}, {84000000U, 83U, 0U, 2500U},
        {84000000U, 83U, 65536U, 2500U}, {84000000U, 83U, 999U, 10001U},
        {84000000U, 83U, 65535U, 10000U}
    };
    const TimerRequest seed = {84000000U, 83U, 999U, 2500U};
    TimerPlan plan;
    TimerPlan before;
    size_t index;

    /** Full duty at maximum ARR is unencodable, not an arithmetic overflow. **/
    if (timer_plan(&seed, &plan) != TIMER_OK) {
        return false;
    }
    before = plan;
    for (index = 0U; index < 7U; index++) {
        TimerStatus expected = index == 6U ? TIMER_NOT_REPRESENTABLE : TIMER_INVALID_ARGUMENT;
        if (timer_plan(&bad[index], &plan) != expected || !same_plan(plan, before)) {
            return false;
        }
    }
    return timer_plan(NULL, &plan) == TIMER_INVALID_ARGUMENT && same_plan(plan, before) &&
        timer_plan(&seed, NULL) == TIMER_INVALID_ARGUMENT;
}

/**
 * @brief Check finite hold/transfer/terminal and invalid metadata preservation.
 * @param[in] None.
 * @return True on independently declared event and active/preload fixtures.
 */
static bool test_trace(void)
{
    TimerTrace trace;
    TimerTrace before;
    TimerEvent event = TIMER_OVERFLOW_FINISH;
    const TimerRequest pending = {84000000U, 167U, 499U, 5000U};
    const TimerRequest invalid = {84000000U, 167U, 0U, 5000U};
    uint32_t index;

    /** Four events are host policy, not measured timer transitions. **/
    if (timer_begin(&trace) != TIMER_OK || timer_stage(&trace, &pending) != TIMER_OK) {
        return false;
    }
    before = trace;
    if (timer_stage(&trace, &invalid) != TIMER_INVALID_ARGUMENT || !same_trace(trace, before)) {
        return false;
    }
    for (index = 0U; index < 4U; index++) {
        if (timer_step(&trace, &event) != TIMER_OK || (uint32_t)event != index ||
            trace.active.requested.prescaler != (index < 2U ? 83U : 167U) ||
            trace.active.requested.autoReload != (index < 2U ? 999U : 499U) ||
            trace.counter != (index == 0U ? 500U : 0U)) {
            return false;
        }
    }
    before = trace;
    if (!trace.terminal || timer_step(&trace, &event) != TIMER_DONE ||
        event != TIMER_OVERFLOW_FINISH || !same_trace(trace, before)) {
        return false;
    }
    trace.phase = 5U;
    before = trace;
    return timer_step(&trace, &event) == TIMER_BAD_STATE && same_trace(trace, before) &&
        timer_stage(&trace, &pending) == TIMER_BAD_STATE && same_trace(trace, before) &&
        timer_begin(NULL) == TIMER_INVALID_ARGUMENT && timer_step(NULL, &event) == TIMER_INVALID_ARGUMENT &&
        timer_step(&trace, NULL) == TIMER_INVALID_ARGUMENT && timer_stage(NULL, &pending) == TIMER_INVALID_ARGUMENT;
}

/**
 * @brief Execute optional host tests with active errors under NDEBUG.
 * @param[in] None.
 * @return Zero only after all checks and standard output succeed.
 */
int main(void)
{
    /** Reusable compilation excludes this main and all host test helpers. **/
    if (!test_plans() || !test_rejection() || !test_trace()) {
        return 1;
    }
    if (puts("PASS timer: literal PWM, wide bounds, rejection, finite preload trace") < 0 ||
        fflush(stdout) != 0) {
        return 1;
    }
    return 0;
}
#endif
```



### time.h · 完整文本 {#timer-source-time-h}

<p><a href="../examples/timer-pwm/time.h" download>下载time.h</a></p>

```text
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file time.h
 * @author embedded-notes contributors
 * @brief Checked modulo32 observations and bounded periodic host policy.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_TIME_H
#define EMBEDDED_NOTES_TIME_H

#include <stdbool.h>
#include <stdint.h>

#if !defined(UINT32_MAX) || !defined(UINT64_MAX)
#error Exact-width uint32_t and uint64_t are required.
#endif

#define TIME_MAX_PERIOD UINT32_C(2147483647)
#define TIME_HALF_RANGE UINT32_C(2147483648)

typedef enum {
    TIME_OK = 0,
    TIME_INVALID_ARGUMENT,
    TIME_BAD_STATE,
    TIME_GAP_REJECTED
} TimeStatus;

typedef struct {
    uint32_t period;
    uint32_t lastObserved;
    uint32_t remainder;
} TimeState;

typedef struct {
    bool work;
    uint32_t missed;
    uint32_t releases;
    uint32_t elapsed;
    uint32_t remainder;
} TimeReport;

/*
 * Unit fixture: one tick = one millisecond. The caller promises a true forward
 * gap < 2^31 ticks between accepted observations. Equal samples cannot reveal
 * unseen complete wraps. Rejection of observed delta >= 2^31 is not a detector
 * of every violated real-gap promise. No signed-cast time ordering is used.
 *
 * All nonnull pointers must name real, live, correctly typed objects. Output
 * objects must be writable and disjoint from all other objects in the call.
 * init may receive fresh storage; other state calls require initialized fields.
 * Nonnull checking cannot validate dangling/forged pointers or false extents.
 * Single execution context, exclusive ownership, non-reentrant. No MMIO, heap,
 * callbacks, recursion, sleeps, retry or catch-up loops. Every operation has
 * constant work/storage. Failure preserves all named state and output fields.
 */

/**
 * @brief Initialize fresh storage without reading its prior contents.
 * @param[in,out] state Real writable object; no old initialization required.
 * @param[in] period Period 1..TIME_MAX_PERIOD ticks.
 * @param[in] now Initial observation, any uint32_t value.
 * @return TIME_OK or TIME_INVALID_ARGUMENT; failure preserves named fields.
 */
TimeStatus time_init(TimeState *state, uint32_t period, uint32_t now);

/**
 * @brief Return checked modulo32 difference under the caller's true-gap promise.
 * @param[in] then Last accepted observation.
 * @param[in] now Next forward observation.
 * @param[out] elapsed Real writable uint32_t; unchanged on failure.
 * @return TIME_OK, TIME_INVALID_ARGUMENT or TIME_GAP_REJECTED.
 */
TimeStatus time_elapsed(uint32_t then, uint32_t now, uint32_t *elapsed);

/**
 * @brief Advance phase once; report at most one work item and exact missed count.
 * @param[in,out] state Initialized period in range, remainder strictly < period.
 * @param[in] now Next observation under the true-gap promise.
 * @param[out] report Real writable object disjoint from state; no old read.
 * @return TIME_OK, TIME_INVALID_ARGUMENT, TIME_BAD_STATE or TIME_GAP_REJECTED.
 */
TimeStatus time_service(TimeState *state, uint32_t now, TimeReport *report);

#endif
```



### time.c · 完整文本 {#timer-source-time-c}

<p><a href="../examples/timer-pwm/time.c" download>下载time.c</a></p>

```text
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file time.c
 * @author embedded-notes contributors
 * @brief Constant-work periodic release policy; host model, no hardware access.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "time.h"
#include <stddef.h>
#ifdef TIME_TEST
#include <stdio.h>
#endif

/**
 * @brief Initialize a periodic phase at now without reading old storage.
 * @param[in,out] state Writable object, possibly fresh.
 * @param[in] period Positive period below the half range.
 * @param[in] now Initial tick sample.
 * @return Named status; failure leaves state unchanged.
 */
TimeStatus time_init(TimeState *state, uint32_t period, uint32_t now)
{
    /** Validate first; do not inspect indeterminate old contents. **/
    if (state == NULL || period == 0U || period > TIME_MAX_PERIOD) {
        return TIME_INVALID_ARGUMENT;
    }
    state->period = period;
    state->lastObserved = now;
    state->remainder = 0U;
    return TIME_OK;
}

/**
 * @brief Check the observed modulo difference, not the unseen true elapsed time.
 * @param[in] then Last accepted sample.
 * @param[in] now New forward sample under the documented real-gap promise.
 * @param[out] elapsed Writable independent output, preserved on rejection.
 * @return Named status; no side effects on failure.
 */
TimeStatus time_elapsed(uint32_t then, uint32_t now, uint32_t *elapsed)
{
    uint32_t delta;

    /** The conversion also preserves modulo32 semantics after integer promotion. **/
    if (elapsed == NULL) {
        return TIME_INVALID_ARGUMENT;
    }
    delta = (uint32_t)(now - then);
    if (delta >= TIME_HALF_RANGE) {
        return TIME_GAP_REJECTED;
    }
    *elapsed = delta;
    return TIME_OK;
}

/**
 * @brief Cross any number of releases with a single finite arithmetic step.
 * @param[in,out] state Initialized valid state; disjoint from report.
 * @param[in] now Next tick sample under the caller's real-gap promise.
 * @param[out] report Copy-by-value result; one work item at most.
 * @return Named status; all state/report fields preserved on failure.
 */
TimeStatus time_service(TimeState *state, uint32_t now, TimeReport *report)
{
    uint32_t delta;
    uint64_t total;
    TimeReport next;
    TimeStatus status;

    /** Validate every checkable premise before committing accepted phase. **/
    if (state == NULL || report == NULL) {
        return TIME_INVALID_ARGUMENT;
    }
    if (state->period == 0U || state->period > TIME_MAX_PERIOD || state->remainder >= state->period) {
        return TIME_BAD_STATE;
    }
    status = time_elapsed(state->lastObserved, now, &delta);
    if (status != TIME_OK) {
        return status;
    }
    total = (uint64_t)state->remainder + (uint64_t)delta;
    /** total <= 4294967293; releases <= 2147483647 for every valid period. **/
    next.releases = (uint32_t)(total / state->period);
    next.remainder = (uint32_t)(total % state->period);
    next.elapsed = delta;
    next.work = next.releases != 0U;
    next.missed = next.work ? next.releases - 1U : 0U;
    state->lastObserved = now;
    state->remainder = next.remainder;
    *report = next;
    return TIME_OK;
}

#ifdef TIME_TEST
/**
 * @brief Compare every named field instead of reading structure padding.
 * @param[in] left Initialized state.
 * @param[in] right Initialized state.
 * @return True exactly when all named fields agree.
 */
static bool same_state(TimeState left, TimeState right)
{
    /** Padding bytes are not part of the state preservation contract. **/
    return left.period == right.period && left.lastObserved == right.lastObserved &&
        left.remainder == right.remainder;
}

/**
 * @brief Compare all public report values without padding assumptions.
 * @param[in] left Initialized report.
 * @param[in] right Initialized report.
 * @return True when every named report field agrees.
 */
static bool same_report(TimeReport left, TimeReport right)
{
    /** This check stays active when NDEBUG is defined. **/
    return left.work == right.work && left.missed == right.missed && left.releases == right.releases &&
        left.elapsed == right.elapsed && left.remainder == right.remainder;
}

/**
 * @brief Execute literal normal/late/wrap fixtures through public calls.
 * @param[in] None.
 * @return True on all independently specified outcomes.
 */
static bool test_trace(void)
{
    TimeState state;
    TimeReport report;
    const uint32_t now[] = {109U, 110U, 145U, 145U};
    const uint32_t missed[] = {0U, 0U, 2U, 0U};
    const uint32_t remainder[] = {9U, 0U, 5U, 5U};
    const bool work[] = {false, true, true, false};
    size_t index;

    /** Expected rows come from hand-counted period boundaries 110/120/130/140. **/
    if (time_init(&state, 10U, 100U) != TIME_OK) {
        return false;
    }
    for (index = 0U; index < 4U; index++) {
        if (time_service(&state, now[index], &report) != TIME_OK || report.work != work[index] ||
            report.missed != missed[index] || report.remainder != remainder[index]) {
            return false;
        }
    }
    return time_init(&state, 10U, UINT32_C(4294967290)) == TIME_OK &&
        time_service(&state, 4U, &report) == TIME_OK && report.work && report.elapsed == 10U &&
        report.releases == 1U && report.missed == 0U && report.remainder == 0U;
}

/**
 * @brief Execute bounded maximum and half-range equality cases.
 * @param[in] None.
 * @return True on all fixed boundary outcomes.
 */
static bool test_bounds(void)
{
    TimeState state;
    TimeReport report;
    uint32_t elapsed = 77U;

    /** The maximum total is 2147483646 + 2147483647, not uint32_t wrap. **/
    if (time_init(&state, TIME_MAX_PERIOD, 0U) != TIME_OK ||
        time_service(&state, UINT32_C(2147483646), &report) != TIME_OK || report.work ||
        time_service(&state, UINT32_C(4294967293), &report) != TIME_OK || !report.work ||
        report.missed != 0U || report.remainder != UINT32_C(2147483646)) {
        return false;
    }
    if (time_init(&state, 1U, 0U) != TIME_OK ||
        time_service(&state, TIME_MAX_PERIOD, &report) != TIME_OK || !report.work ||
        report.missed != UINT32_C(2147483646) || report.remainder != 0U) {
        return false;
    }
    return time_elapsed(0U, TIME_MAX_PERIOD, &elapsed) == TIME_OK && elapsed == TIME_MAX_PERIOD &&
        time_elapsed(0U, TIME_HALF_RANGE, &elapsed) == TIME_GAP_REJECTED && elapsed == TIME_MAX_PERIOD;
}

/**
 * @brief Exercise only initialized real objects on every checkable rejection.
 * @param[in] None.
 * @return True if failure preserves all named accepted state/report fields.
 */
static bool test_rejection(void)
{
    TimeState state = {10U, 100U, 5U};
    TimeState before = state;
    TimeReport report = {true, 17U, 18U, 19U, 20U};
    TimeReport saved = report;
    const uint32_t badPeriods[] = {0U, TIME_HALF_RANGE, UINT32_MAX};
    size_t index;

    /** Invalid initialized metadata is testable; forged pointers are not. **/
    for (index = 0U; index < 3U; index++) {
        if (time_init(&state, badPeriods[index], 0U) != TIME_INVALID_ARGUMENT || !same_state(state, before)) {
            return false;
        }
    }
    if (time_init(NULL, 10U, 0U) != TIME_INVALID_ARGUMENT ||
        time_elapsed(0U, 1U, NULL) != TIME_INVALID_ARGUMENT ||
        time_service(NULL, 0U, &report) != TIME_INVALID_ARGUMENT || !same_report(report, saved) ||
        time_service(&state, 0U, NULL) != TIME_INVALID_ARGUMENT || !same_state(state, before) ||
        time_service(&state, UINT32_C(2147483748), &report) != TIME_GAP_REJECTED ||
        !same_state(state, before) || !same_report(report, saved)) {
        return false;
    }
    state.remainder = state.period;
    before = state;
    if (time_service(&state, 110U, &report) != TIME_BAD_STATE || !same_state(state, before) ||
        !same_report(report, saved)) {
        return false;
    }
    state.period = 0U;
    before = state;
    return time_service(&state, 110U, &report) == TIME_BAD_STATE && same_state(state, before) &&
        same_report(report, saved);
}

/**
 * @brief Run active host checks and propagate output failure without assert.
 * @param[in] None.
 * @return Zero only when all checks and output complete successfully.
 */
int main(void)
{
    /** This optional main is excluded from reusable module compilation. **/
    if (!test_trace() || !test_bounds() || !test_rejection()) {
        return 1;
    }
    if (puts("PASS time: literal trace, wrap, bounds, rejection preservation") < 0 || fflush(stdout) != 0) {
        return 1;
    }
    return 0;
}
#endif
```



### README.txt · 完整文本 {#timer-source-README-txt}

<p><a href="../examples/timer-pwm/README.txt" download>下载README.txt</a></p>

```text
timer-pwm — original embedded-notes C11 teaching model, 2026

Download timer.h, timer.c, time.h and time.c into one directory. Keep the public
headers beside their implementations; do not include a .c file in another .c.
An existing conforming C11 compiler with uint32_t, uint64_t and int64_t is required.
No software installation is part of the example.

Ordinary reproduction commands for a human at a compiler-enabled terminal:
  cc -std=c11 -Wall -Wextra -Werror -pedantic -DTIMER_TEST timer.c -o timer-test
  ./timer-test
  cc -std=c11 -Wall -Wextra -Werror -pedantic -DTIME_TEST time.c -o time-test
  ./time-test
Repeat both compiler commands with -DNDEBUG; checks must still execute.
On Windows use the matching existing compiler and executable filename.
Reusable modules (no test main):
  cc -std=c11 -Wall -Wextra -Werror -pedantic -c timer.c -o timer.o
  cc -std=c11 -Wall -Wextra -Werror -pedantic -c time.c -o time.o
Include the appropriate public header in a separate initialized caller and link
its object with the original module object. Output/result objects must not alias
any other argument object. No implementation is textually included.

AgentHub execution uses the existing mcu-build custom profile route for EVERY
compiler/linker operation: validate, build --dry-run, then build. The parent batch
runner accepts existing compiler/router/Python paths and keeps fresh per-run
profiles, actual return codes, compiler diagnostics, input/output hashes and
before/after source/header hashes. A failed build never executes an old artifact.
The generic commands above describe reproducibility, not a bypass of that route.

Timer scope: STM32F407VG TIM3, 16-bit PSC/ARR/CCR, internally clocked edge-up PWM1,
active-high OCxREF. Source1..84000000Hz is supplied nominally from a separately
qualified clock plan, not established by this arithmetic. PSC0..65535,
ARR1..65535 (ARR0 blocks the selected counter), duty0..10000 basis points.
Rounding is nearest integer compare, ties upward. compare65536 is explicitly
TIMER_NOT_REPRESENTABLE. No clamp claims100% at ARR65535.
  counter frequency = source/(PSC+1)
  PWM frequency = source/((PSC+1)*(ARR+1))
  achieved duty = compare/(ARR+1)
  signed duty error = errorNum/errorDen
84MHz/PSC83/ARR999/duty2500bp gives CCR250, divisor84000,1kHz and25%.
N3 duty5000/1000/9000 gives CCR2/0/3, errors5000/-3000/3000 over30000.
Maximum divisor65536*65536=4294967296 fits uint64_t, not uint32_t.
Duty product plus5000 is <=655365000; all selected signed error terms fit int64_t.

The finite trace is HOST POLICY: seed active83/999/250 at CNT500. Stage a complete
validated preload at phase0; then four steps: PRELOAD_WAIT, UDIS_UG_HOLD,
URS_UG_TRANSFER, OVERFLOW_FINISH. UDIS suppresses shadow transfer; UG can reset
counter/prescaler. URS filters IRQ/DMA request sources, not the UG event. The
third step transfers under UDIS0/URS1; the fourth is an allowed overflow request
source and terminal. No actual request/interrupt or pin waveform is generated.
The complete tuple is a model policy, not physical atomic multi-register writes.
For continuous PWM, historical selected-device clauses require OCxPE; ARR depends
on ARPE, PSC is buffered. Midperiod UG is not promised glitch-free.

Time scope: one tick=one millisecond in the shared UART fixture. The caller must
guarantee true forward gaps between accepted observations strictly <2^31 ticks.
Observed modulo delta>=2^31 is TIME_GAP_REJECTED, preserving all named state/output
fields. Equal samples cannot detect a whole unseen wrap or dishonest real gap.
period1..2147483647, remainder<period; init reads no old contents. Service computes
total=oldRemainder+delta, releases=total/period, remainder=total%period. It returns
at most one work item and missed=releases-1 when releases>0; otherwise missed0.
Validated total<=4294967293 fits uint64_t. No loop per release or signed-cast trick.
P10/start100 with109/110/145 gives (work,missed,remainder):
  (false,0,9), (true,0,0), (true,2,5); repeated145=(false,0,5).
4294967290->4 gives delta10 across wrap. These are fixed independent fixtures.

All pointer preconditions require real live correctly typed storage and honest
extent; null checking is not arbitrary pointer validation. Non-init state calls
require initialized metadata. Single context, exclusive ownership, non-reentrant.
No heap, recursion, sleep, busy wait, MMIO, callbacks, IRQ, DMA or physical I/O.
Production functions have fixed work/storage; optional tests have fixed bounds.
Output failure makes test main return nonzero; no correctness check uses assert.

Primary evidence read2026-10-17: ST historical RM0090 DocID018909 Rev5 Sep2013,
F405/407-specific §7.2p213; TIM3 §18.2p576, §18.3.1/.2/.9pp577-579/595-596,
§18.4.1p612, §18.4.7p622, §18.4.11/.12/.13pp627-628. DS8626 Rev12 Mar2026
§3.21/Table4pp33-35 text-only corroboration; ST CMSIS DeviceF4v2.6.10 F407 header,
commit5f41fb29d22773896c780052bf61e47fc924d524; ST HALv1.8.5 LL TIM header,
commitb6f0ed3829f3829eb358a2e7417d80bba1a42db7. Unsigned/conversion reasoning:
WG14 N1570 public draft2011-04-12 §6.2.5/.3.1.1/.3.1.3 and §7.20.1.1.
Current official RM retrieval failed boundedly; its current clauses remain unread.
DS table pixels and selected silicon errata were not fully audited. Host checks,
heuristic stack checks and per-function .su do not prove target stack/WCET/tick
accuracy, electrical output, oscillator jitter, glitch-free updates or hardware.
```

</details>

## 来源范围与证据缺口 {#timer-ref-evidence-title}

<p>核对日期2026-10-17。图、题目、舍入与调度政策、主机代码是本项目原创教学材料。推荐先读历史RM的计数/比较图，逐项写出适用器件、模式与字段，再对照本页。引用仅代表下面实际阅读范围，不代表整份文档或当前生产配置已验证。</p><ul class="source-list"><li><a href="https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf">S1 · ST RM0090 DocID018909 Rev5，September2013（Keil制造商资料存档）</a>：实际查阅F405/407§7.2p213、TIM3/4与TIM2/5宽度§18.2p576、计数与缓冲§18.3.1/.2pp577–579、PWM§18.3.9pp595–596、UDIS/URS§18.4.1p612、OCxPE限制§18.4.7p622、PSC/ARR/CCR§18.4.11–.13pp627–628。研究时核对了相关完整图页；历史版不称当前规范。</li><li><a href="https://www.st.com/resource/en/datasheet/dm00037051.pdf">S2 · ST DS8626 Rev12，March2026</a>：实际读取§3.21/Table4pp33–35文本交叉核对TIM3/4为16位、接口42MHz/定时器84MHz上限。该表像素未核验，上限不等于每种配置自动达到。</li><li><a href="https://github.com/STMicroelectronics/cmsis-device-f4/blob/5f41fb29d22773896c780052bf61e47fc924d524/Include/stm32f407xx.h">S3 · ST CMSIS DeviceF4 v2.6.10，固定commit5f41fb29d22773896c780052bf61e47fc924d524</a>：F407专用头APB映射及IS_TIM_32B_COUNTER_INSTANCE；未从其他家族推测TIMPRE。</li><li><a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Inc/stm32f4xx_ll_tim.h">S4 · ST HALv1.8.5 LL TIM，固定commitb6f0ed3829f3829eb358a2e7417d80bba1a42db7</a>：实际读取PSC/ARR/比较值字段及下次更新说明。厂商辅助宏不保证任意输入乘积安全，也不把ARR0变成运行周期。</li><li><a href="https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf">S5 · WG14 N1570公共委员会草案，2011-04-12</a>：本地原始PDF实际读§6.2.5p9、§6.3.1.1/.3与§7.20.1.1，支持无符号模算术、整数提升和可选精确宽类型条件；不等同付费最终ISO正文，也不选择调度政策。</li></ul><p>资料缺口：当前官方RM0090的一次有界获取失败，当前相关条款未读；DS表格像素与所选硅版本勘误没有完整审计。实际振荡器/电压/时钟、PWM引脚、抖动、更新瞬态、tick准确度、IRQ延迟、目标运行与硬件均未验证。本页只交付带条件的名义推导和主机行为；不把可点击图或主机PASS当硬件验收。</p>

## 回到正文与后续数据流 {#timer-ref-next-title}

<div class="next-links"><a href="../learn/timer-pwm.html">完整正文与十题</a><a href="../learn/uart-framing.html">下一章：UART字节与命令</a><a href="../learn/engineering-map.html#stage-03">阶段03地图</a></div>
