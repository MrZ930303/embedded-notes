阶段03 · 单元10 · 本地候选

# 定时器、PWM 与非阻塞期限 {#timer-pwm}

## 让采集终端按时做事，也留时间收字节 {#timer-overview-title}

<p>前置：能读单元05的四值FIFO与返回状态，已看单元09的时钟来源；本页不要求先会定时器寄存器。采集终端要每10ms安排一次工作，又要持续服务串口。用一段等待10ms的循环，会把这段时间里的字节处理一起拖住；定时器中断也不会自动补救一个无界的主循环。</p><p>本章小成果分三段：先从明确的TIM3输入推导1kHz、25%；再预测四个预装载事件；最后用109/110/145三个观察值解释“本次做一次、漏过两次”。每段先完成手算再碰按钮。完整推导、无脚本静态例子、五个原始下载和独立十题都在本页；没有个人作答或掌握记录。</p><p>定时器是硬件计数模块；PWM是以周期内有效时间比例表达输出的方式。非阻塞期限是软件在一次有限调用里判断时间并返回的策略。它们相互配合，但不是同一个对象：本页主机代码没有启动任何硬件计数器。</p><p>使用本页“普通打印完整内容”可打印全部解释；正常结束或打印调度失败都会恢复此前折叠状态与临时模式。无脚本时请先手动展开所需原生折叠，再用浏览器打印菜单；不宣称物理纸张已经检验。</p>

## 先声明TIM3与名义时钟来自哪里 {#timer-scope-title}

<p>固定对象是STM32F407VG的TIM3：APB1、16位PSC/ARR/CCR、内部时钟、边沿对齐向上计数、PWM mode1、有效高。PSC是预分频字段；ARR是自动重装载字段；CCR是比较字段；CNT是当前计数。OCxREF是比较逻辑的参考输出。要把它变成外部高电平，还要满足通道使能、极性、GPIO复用及实际电气条件；计算25%不是引脚测量。</p><p>继承单元09的条件性名义计划：HCLK168MHz，APB1÷4得到PCLK1=42MHz。历史RM0090 Rev5的F405/407专属§7.2p213规定APB预分频不为1时，该定时器输入为2×PCLK1，因此TIM3=84MHz；USART2仍用PCLK1=42MHz。独立的另一配置若HCLK42MHz、APB1÷1，则PCLK1与TIM3都42MHz。这两组各自自洽，不能把“×2”推广到所有TIM、所有芯片或串口。</p><p>模型接受外部已声明的整数名义源1..84000000Hz，这个算术域不证明完整供电、总线、振荡器与模式组合合法。TIM2/5的计数宽度不同，F42/43的TIMPRE分支也不同。本页不实现中心对齐、向下计数、编码器、从模式、重复计数器或强制输出。</p><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="先选定时器所在的时钟域，可横向滚动"><svg viewBox="0 0 720 218" role="img" aria-labelledby="timer-clock-caption"><rect x="20" y="20" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="52">F407：HCLK168MHz → APB1÷4 → PCLK1=42MHz</text><rect x="20" y="86" width="680" height="52" rx="6" fill="#d5e7b3"/><text x="36" y="118">APB1预分频≠1 → TIM3=2×42=84MHz；USART2=42MHz</text><rect x="20" y="152" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="184">独立配置：HCLK42MHz → APB1÷1 → TIM3=PCLK1=42MHz</text></svg></div><figcaption id="timer-clock-caption">先选定时器所在的时钟域。原创图；箭头表示推导或状态依赖，行内标出单位与条件。完整关系也在邻近正文说明。</figcaption></figure>

## 从计数状态推导频率与0/100%边界 {#timer-counts-title}

<p>PSC不是直接的除数。PSC=0每个输入时钟计一次，PSC=1每两个输入时钟计一次，因此除数是PSC+1。计数频率fCNT=fTIM/(PSC+1)。向上计数依次占据CNT=0,1,…,ARR，共N=ARR+1个状态，再回到0；所以周期T=(PSC+1)×(ARR+1)/fTIM秒，fPWM=fTIM/[(PSC+1)×(ARR+1)]。这些公式假设稳定输入、已初始化活动字段、持续运行且无外部清除/门控。</p><p>字段可写不等于有运行周期。历史RM§18.4.12p627明确ARR=0阻塞计数器，所以本模型的运行ARR域为1..65535；不能把纯代数N=1当成实物一状态周期。PSC0..65535，ARR1..65535，先检查再计算。</p><p>固定手算：84,000,000Hz÷(83+1)=1,000,000Hz，每次计数1µs。ARR999给0..999共1000状态，所以1000µs=1ms、1000Hz。PWM1有效条件CNT&lt;CCR；CCR250使0..249这250个状态有效，剩余250..999无效，于是有效250µs、占空比250/1000=25%。频率由PSC和ARR决定，CCR改变周期内的有效份额。</p><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="计数状态与有效状态的数量，可横向滚动"><svg viewBox="0 0 720 218" role="img" aria-labelledby="timer-count-caption"><rect x="20" y="20" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="52">84MHz ÷ (PSC83+1) = 1MHz → 每状态1µs</text><rect x="20" y="86" width="680" height="52" rx="6" fill="#d5e7b3"/><text x="36" y="118">CNT0..249：250个有效状态；CNT250..999：750个无效状态</text><rect x="20" y="152" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="184">ARR999 → N1000 → 周期1ms；CCR250 → 有效250µs → 25%</text></svg></div><figcaption id="timer-count-caption">计数状态与有效状态的数量。原创图；箭头表示推导或状态依赖，行内标出单位与条件。完整关系也在邻近正文说明。</figcaption></figure><p>边界也从比较式推导：CCR0时没有非负CNT小于0，恒无效；CCR&gt;ARR且可编码时，每个CNT都小于CCR，恒有效。ARR65535给N65536，要用普通比较获得100%需CCR65536，16位字段不能编码。最大CCR65535只有65535/65536≈99.998474%。本例返回NOT_REPRESENTABLE并保持旧结果；减少ARR到65534或更小可编码CCR=N。另选已文档化模式可能得到恒输出，但模式切换及过渡不在此实现。</p><p>计算前先扩宽：PSC+1与ARR+1最大都65536，相乘4294967296超过uint32_t最大4294967295，却远小于uint64_t上限。先在32位乘完再赋给64位已经晚了。本例从已验证域证明宽度足够，不制造输入域内不可能发生的uint64溢出分支。</p>

## 请求、最近CCR、达到比例与有符号误差 {#timer-quantization-title}

<p>占空请求用整数基点bp：10000bp=100%，2500bp=25%。选最近的整数比较值，刚好一半向上，是本教材选定的舍入政策，不是硬件自动选择。公式CCR=floor[(N×dutyBp+5000)/10000]。达到比例是CCR/N；有符号误差是达到减请求，即(CCR×10000−N×dutyBp)/(N×10000)，乘100得到百分点。不能把请求标签直接当达到值。</p><p>N=3（ARR2）、请求5000bp时理想CCR1.5，半数向上选2；达到2/3，误差5000/30000=1/6≈+16.6667个百分点。请求1000bp理想0.3，选0而恒无效，误差−3000/30000=−10个百分点；请求9000bp理想2.7，选3而恒有效，误差3000/30000=+10个百分点。相同周期内只有有限可选状态数量，分辨率是1/N，增加CPU计算精度不能生成半个比较状态。</p><p>N≤65536，N×dutyBp≤655360000，加5000≤655365000；误差两个非负乘积各≤655360000，差落在int64_t中。JavaScript在这里所有中间整数都低于2^53，C提前用uint64_t并在形成差前分别转int64_t。频率保留source/divisor精确分数直到展示；没有浮点近似决定是否接受。</p><p>反馈核对：84MHz/83/999/2500bp应得到N1000、CCR250、divisor84000、误差0/10000000；N3的三组结果如上。ARR0是INVALID，ARR65535与10000bp是NOT_REPRESENTABLE；拒绝前后旧接受输入和结果保持。先检查字段与N，再检查比较值可编码性。</p><p>交互活动在完整读者页面运行；本镜像保留前述全部静态输入、因果推导与反馈检查。</p>

## 预装载不是当前活动值；事件不是请求 {#timer-preload-title}

<p>写入值、预装载值和当前活动值要分开。历史RM§18.3.1pp577–578说明PSC有缓冲，新的分频在更新事件UEV后生效；ARR是否等待更新由ARPE决定。连续PWM的CCR需要OCxPE预装载；§18.4.7p622把不使用CCR预装载的PWM限于其单脉冲例外，否则行为不保证。§18.3.9p595要求开始前适当UG初始化。本活动选ARR与CCR都预装载。</p><p>UDIS=1抑制更新事件及影子传送；UG仍可能重初始化计数器/预分频器。URS=1则限制哪些来源可以产生更新中断/DMA请求；它不禁止UG的更新与传送。UEV、UIF、更新请求和执行IRQ处理函数是四个对象；本活动只展示事件资格，不执行中断。中途UG可能改变当前周期，不能自动称为无毛刺。</p><p>原创有限模型的种子活动为PSC83/ARR999/CCR250、CNT500，拟提交PSC167/ARR499/5000bp给CCR250。完整拟提交元组先检查再替换预装载；它在主机模型中完整保存，不能推出多个真实寄存器写入或传送物理原子。</p><ol><li>PRELOAD_WAIT：预装载是167/499/250，活动仍83/999/250，CNT500，尚未更新。</li><li>UDIS_UG_HOLD：UDIS1、UG；影子保持83/999/250，但模型CNT重置0。</li><li>URS_UG_TRANSFER：UDIS0、URS1、UG；活动变167/499/250，不产生该来源的更新IRQ/DMA请求。</li><li>OVERFLOW_FINISH：溢出更新可成为URS允许的请求来源，活动值不变，第四步终止。</li></ol><p>概念故障比较：若把“立即改CCR”想成在当前周期把250改成750，那么CNT500处比较逻辑可能改变，周期内出现不连续；这只解释为什么生效边界重要，不是已保证的连续PWM寄存器行为，更不是推荐关闭OCxPE。要设计真正连续、无毛刺的更新，需要当前目标资料、顺序和实测，本页均未完成。</p><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="预装载、活动值、事件与请求分别判断，可横向滚动"><svg viewBox="0 0 720 284" role="img" aria-labelledby="timer-preload-caption"><rect x="20" y="20" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="52">拟提交167/499/250 → 预装载；活动仍83/999/250</text><rect x="20" y="86" width="680" height="52" rx="6" fill="#d5e7b3"/><text x="36" y="118">UDIS1 + UG → 影子保持，CNT可重初始化</text><rect x="20" y="152" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="184">UDIS0 + URS1 + UG → 传送生效，但无该来源更新请求</text><rect x="20" y="218" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="250">随后溢出 → 允许更新请求来源；模型第四步终止</text></svg></div><figcaption id="timer-preload-caption">预装载、活动值、事件与请求分别判断。原创图；箭头表示推导或状态依赖，行内标出单位与条件。完整关系也在邻近正文说明。</figcaption></figure><p>交互活动在完整读者页面运行；本镜像保留前述全部静态输入、因果推导与反馈检查。</p>

## 无符号观察、相位余数与有限晚到政策 {#timer-time-title}

<p>终端每轮可以取样时钟、有限处理队列、判断是否到期，然后返回主循环；等待期间仍可处理其他事。把while(now未到期)藏进一个函数仍然阻塞；到期后while补齐所有遗漏工作也可能一次占用极长时间。本页选择“本次最多做一次，显式报告遗漏”的政策；调用者是否执行工作与是否超载仍要单独判断。</p><p>tick是一个uint32_t观察值，本章与UART夹具1tick=1ms。2^32个值组成一圈。显式(uint32_t)(now−then)得到模2^32差，跨零不特殊。例如then4294967290、now4，差为10。WG14 N1570草案§6.2.5与§6.3.1.1/.3支持无符号约简及转换；直接把大无符号差转成int32_t并看符号会引入超范围有符号转换的实现定义行为，本例不用。</p><p>算式合法还需要时间前提：调用者保证两个已接受观察之间真实向前间隔严格小于2^31tick。接口拒绝观察差≥2147483648；这只是一个可检查拒绝条件，不能从两个样本侦测整圈未观察的时间。相同then与now既可能真间隔0，也可能隔了一整圈；软件看到同样的值，无法替调用者证明未停顿。period也限制1..2147483647。</p><p>状态保存period、lastObserved和remainder（相位余数，始终小于period）。每次服务先检查状态与时间差，total=旧余数+delta，releases=floor(total/period)，新余数=total%period。商为0则work=false、missed0；商大于0则work=true、missed=releases−1。只报告一个工作项，直接越过漏过的周期，保留原相位；没有按商次数循环，也不把“做一次”冒充“所有任务都完成”。</p><p>固定独立例子period10、初始100/余数0：109给delta9、total9、零释放、余数9；110给delta1、total10，一次释放、work=true、missed0、余数0；145给delta35、total35，跨过120/130/140三次释放，最多做一次、漏过2次、余数5。重复145给delta0、total5、无新工作、余数5。lastObserved在每次合法观察都前进，因此时间差不是总从初始100算；余数保存它所未满的一段相位。</p><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="用商和余数直接跨过晚到的周期，可横向滚动"><svg viewBox="0 0 720 284" role="img" aria-labelledby="timer-time-caption"><rect x="20" y="20" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="52">period10，start100：109 → delta9 + rem0 → work0，rem9</text><rect x="20" y="86" width="680" height="52" rx="6" fill="#d5e7b3"/><text x="36" y="118">110 → delta1 + rem9=10 → work1，missed0，rem0</text><rect x="20" y="152" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="184">145 → delta35 + rem0=35 → work1，missed2，rem5</text><rect x="20" y="218" width="680" height="52" rx="6" fill="#eef2e9"/><text x="36" y="250">重复145 → delta0 + rem5=5 → work0，missed0，rem5</text></svg></div><figcaption id="timer-time-caption">用商和余数直接跨过晚到的周期。原创图；箭头表示推导或状态依赖，行内标出单位与条件。完整关系也在邻近正文说明。</figcaption></figure><p>宽度上界：余数最大2147483646，合法观察差最大2147483647，total最大4294967293。先扩到uint64_t后相加，商和余数再按已证明边界缩窄；不需要不可能的uint64溢出状态。period1在最大合法差时最多报告2147483647次释放、missed2147483646，仍只交付一次工作。初始化不读取旧存储；其他调用要求真实、存活且已初始化的状态。错误周期、空输出、坏元数据或被拒绝的大差都保持所有命名字段。</p><p>time_init初始化；time_elapsed返回检查过的观察差；time_service返回TimeReport而不调用任意回调。TIME_INVALID_ARGUMENT、TIME_BAD_STATE、TIME_GAP_REJECTED分别表示可检查参数、初始化元数据与观察差拒绝。真实gap承诺、tick精度、任务执行时间及调度是否及时不由主机算式保证。</p><p>时间反馈核对：本活动仅编辑now会继续已接受相位；编辑period/start将在下一次合法提交时从新种子开始，但旧接受行仍带then/now/period标签。无效或大差不改变旧行，必须先修正并重新预测；不能把拒绝说成自动修复时间。</p><p>交互活动在完整读者页面运行；本镜像保留前述全部静态输入、因果推导与反馈检查。</p>

## 完整原始C11与可重复主机检查 {#timer-c-title}

<p>timer.h/timer.c封装名义PWM规划及四事件主机轨迹；time.h/time.c封装检查过的模32观察和一次有限服务。分别包含公共头，在独立翻译单元链接；不复制FIFO或把实现文本包含进UART。可选TIMER_TEST/TIME_TEST才含main；NDEBUG不关闭检查。</p><p>所有输入指针必须指向真实、存活、类型正确且已初始化的对象；输出可写、大小诚实，与本调用其他对象均不重叠。init/begin可接受未初始化的新存储而不读旧值，其他状态调用要求已初始化元数据。空指针拒绝无法验证伪造、悬空地址或错误别名。只用真实初始化坏字段做失败测试，不执行未定义行为示范。</p><p>规划拒绝和状态检查失败都保持所有命名输出/接受状态字段；TIMER_DONE不推进终点。time_service只返回报告，不睡眠、不忙等、不调用回调。单上下文独占、不可重入，无堆、递归、MMIO、IRQ或DMA；每次生产调用工作量与存储固定，测试循环也固定上限。栈启发式及主机.su只提供当前编译选项下局部证据，不是目标最坏调用栈。</p><p>复现指令包含已有编译器的常规命令，AgentHub实际编译必须通过mcu-build自定义profile的validate→dry-run→build；保存真实返回码、诊断、源/头/工具/profile/新鲜产物哈希。失败构建不执行旧产物。源码是本项目原创，不虚构EternalChip归属。下面完整源与原生下载保持字节一致。</p>

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



## 独立十题：基础、故障与迁移 {#timer-practice-title}

<p class="practice-intro">每题数据和条件独立；先写结论与原因，再展开原生答案。无脚本仍可展开；只打印题目隐藏本页其他已解内容、反馈与结果，普通打印展开解释后恢复折叠。隔一天先重做一题计数、一题事件、一题时间迁移。一次选对不等于长期掌握；可带着具体卡点向助手追问。</p><div id="recall-questions"><article class="exercise" id="timer-exercise-01">

### 01 · 基础：时钟源 {#timer-question-01}

<p>F407方案A为HCLK168MHz/APB1÷4；独立方案B为HCLK42MHz/APB1÷1。TIM3与USART2分别取多少名义Hz？为什么不能统一写2×PCLK？</p><details class="exercise-answer" id="timer-answer-01"><summary>展开本题推导</summary><p>A中TIM3=84MHz、USART2=42MHz；B中两者42MHz。选定F407定时器分支只在APB预分频不为1时翻倍，既不改变PCLK，也不传给USART。下一步先标总线与器件。</p></details></article><article class="exercise" id="timer-exercise-02">

### 02 · 基础：两个加一 {#timer-question-02}

<p>TIM3 edge-up、fTIM84MHz、PSC83、ARR999、CCR250、有效高。计数频率、状态数、周期与有效状态范围各是什么？</p><details class="exercise-answer" id="timer-answer-02"><summary>展开本题推导</summary><p>1MHz、1000状态、1ms/1kHz，CNT0..249有效250µs、25%。PSC83表示除84，ARR999包含0所以1000；不要直接乘83×999。</p></details></article><article class="exercise" id="timer-exercise-03">

### 03 · 故障：ARR0 {#timer-question-03}

<p>有人把TIM3的ARR写0、PSC0、源1MHz，按ARR+1算成1MHz PWM。本章运行规划应如何处理，为什么？</p><details class="exercise-answer" id="timer-answer-03"><summary>展开本题推导</summary><p>INVALID且旧输出保持。历史选定TIM3条款说ARR0阻塞计数器；纯代数一个状态不证明在运行。先核对字段行为再套运行公式。</p></details></article><article class="exercise" id="timer-exercise-04">

### 04 · 故障：100%编码 {#timer-question-04}

<p>16位TIM3 ARR65535，CCR最大65535。最大普通PWM1比例多少？请求10000bp时可夹紧称100%吗？ARR65534又如何？</p><details class="exercise-answer" id="timer-answer-04"><summary>展开本题推导</summary><p>最大65535/65536≈99.998474%。不能；需CCR65536不可编码，NOT_REPRESENTABLE并保持旧结果。ARR65534时N65535、CCR65535可编码100%。另一强制模式需独立条件。</p></details></article><article class="exercise" id="timer-exercise-05">

### 05 · 基础：量化与符号 {#timer-question-05}

<p>ARR2给N3，请求5000、1000、9000bp，最近整数且半数向上。分别求CCR、达到比例和有符号误差（达到减请求）。</p><details class="exercise-answer" id="timer-answer-05"><summary>展开本题推导</summary><p>CCR2/0/3，比例2/3、0、1，误差1/6、−1/10、+1/10，即+16.666…、−10、+10个百分点。分辨率1/3不能靠小数显示增加；非零请求也可能到0。</p></details></article><article class="exercise" id="timer-exercise-06">

### 06 · 故障：扩宽时机 {#timer-question-06}

<p>PSC65535、ARR65535、源84MHz，duty0。divisor准确多少？uint64_t d=(psc+1)*(arr+1)为什么仍可能错？</p><details class="exercise-answer" id="timer-answer-06"><summary>展开本题推导</summary><p>4294967296。若两个操作数先在32位运算已溢出，再赋64位无法恢复；先把至少一个因子扩宽。输入已限域，uint64足够，不应编造域内宽溢出故障。</p></details></article><article class="exercise" id="timer-exercise-07">

### 07 · 故障：事件与请求 {#timer-question-07}

<p>活动83/999/250、CNT500，预装载167/499/250。先UDIS1+UG，再UDIS0/URS1+UG。影子与CNT/更新请求应怎样分别解释？</p><details class="exercise-answer" id="timer-answer-07"><summary>展开本题推导</summary><p>第一步影子仍83/999/250，UG仍可重初始化CNT/预分频器；第二步更新传送167/499/250，URS1限制UG来源的更新中断/DMA请求而不取消UEV。本模型CNT置0；不证明真实物理原子或无毛刺。</p></details></article><article class="exercise" id="timer-exercise-08">

### 08 · 基础：晚到但有限 {#timer-question-08}

<p>period10，start100/余数0，按109→110→145→145顺序服务。逐行写work、missed、remainder，是否补做循环？</p><details class="exercise-answer" id="timer-answer-08"><summary>展开本题推导</summary><p>false/0/9；true/0/0；true/2/5；false/0/5。145时delta35跨3个释放，政策只做一次漏2次。没有catch-up循环；余数保留原相位，不能每次把完整周期从now重新开始。</p></details></article><article class="exercise" id="timer-exercise-09">

### 09 · 迁移：绕回与未知停顿 {#timer-question-09}

<p>period10，从4294967290观察到4；另一设备从100再观察100，但可能睡了一整圈。前者差多少？后者接口能证明gap0吗？观察差正好2147483648呢？</p><details class="exercise-answer" id="timer-answer-09"><summary>展开本题推导</summary><p>前者模差10、一次工作。后者不能证明，0和2^32真间隔有同样样本，违反真实gap<2^31的可能性无法侦测。观察差半圈必须TIME_GAP_REJECTED并保持旧状态；拒绝条件不是全能停顿检测。</p></details></article><article class="exercise" id="timer-exercise-10">

### 10 · 迁移：资源与时间证据 {#timer-question-10}

<p>period2147483647，合法旧余数2147483646，delta2147483647，total多少、商余数多少？主机PASS能证明1ms tick准确、ISR及时或整条调用栈最大值吗？</p><details class="exercise-answer" id="timer-answer-10"><summary>展开本题推导</summary><p>total4294967293，商1、余数2147483646，work一次、missed0。固定宽算术足够；主机PASS不能证明硬件tick、ISR/WCET或整程序栈上界。要分别建立当前目标资料、测量及上下文/调用链证据。</p></details></article></div>

## 核对来源、历史版本与未验证边界 {#timer-sources-title}

<p>核对日期2026-10-17。图、题目、舍入与调度政策、主机代码是本项目原创教学材料。推荐先读历史RM的计数/比较图，逐项写出适用器件、模式与字段，再对照本页。引用仅代表下面实际阅读范围，不代表整份文档或当前生产配置已验证。</p><ul class="source-list"><li><a href="https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf">S1 · ST RM0090 DocID018909 Rev5，September2013（Keil制造商资料存档）</a>：实际查阅F405/407§7.2p213、TIM3/4与TIM2/5宽度§18.2p576、计数与缓冲§18.3.1/.2pp577–579、PWM§18.3.9pp595–596、UDIS/URS§18.4.1p612、OCxPE限制§18.4.7p622、PSC/ARR/CCR§18.4.11–.13pp627–628。研究时核对了相关完整图页；历史版不称当前规范。</li><li><a href="https://www.st.com/resource/en/datasheet/dm00037051.pdf">S2 · ST DS8626 Rev12，March2026</a>：实际读取§3.21/Table4pp33–35文本交叉核对TIM3/4为16位、接口42MHz/定时器84MHz上限。该表像素未核验，上限不等于每种配置自动达到。</li><li><a href="https://github.com/STMicroelectronics/cmsis-device-f4/blob/5f41fb29d22773896c780052bf61e47fc924d524/Include/stm32f407xx.h">S3 · ST CMSIS DeviceF4 v2.6.10，固定commit5f41fb29d22773896c780052bf61e47fc924d524</a>：F407专用头APB映射及IS_TIM_32B_COUNTER_INSTANCE；未从其他家族推测TIMPRE。</li><li><a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Inc/stm32f4xx_ll_tim.h">S4 · ST HALv1.8.5 LL TIM，固定commitb6f0ed3829f3829eb358a2e7417d80bba1a42db7</a>：实际读取PSC/ARR/比较值字段及下次更新说明。厂商辅助宏不保证任意输入乘积安全，也不把ARR0变成运行周期。</li><li><a href="https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf">S5 · WG14 N1570公共委员会草案，2011-04-12</a>：本地原始PDF实际读§6.2.5p9、§6.3.1.1/.3与§7.20.1.1，支持无符号模算术、整数提升和可选精确宽类型条件；不等同付费最终ISO正文，也不选择调度政策。</li></ul><p>资料缺口：当前官方RM0090的一次有界获取失败，当前相关条款未读；DS表格像素与所选硅版本勘误没有完整审计。实际振荡器/电压/时钟、PWM引脚、抖动、更新瞬态、tick准确度、IRQ延迟、目标运行与硬件均未验证。本页只交付带条件的名义推导和主机行为；不把可点击图或主机PASS当硬件验收。</p>

## 把有限时间服务交给UART命令 {#timer-next-title}

<p>本章给终端一套可检查的周期与相位政策：知道计划来自什么源、比较有多少有效状态、何时生效、晚到时漏过多少。单元11将把实际四值FIFO和冻结time接口接入有界UART命令；超时观察仍有真实gap与服务及时性前提。12—14的协议、ADC与驱动故障处理仍待后续完成，阶段03尚未完成。</p><div class="next-links"><a href="../learn/clock-timebase.html">上一章：时钟树与时间基准</a><a href="../learn/timer-pwm-reference.html">本章打印速查</a><a href="../learn/uart-framing.html">下一章：UART字节到有界命令</a><a href="../learn/engineering-map.html#stage-03">阶段03地图</a></div>
