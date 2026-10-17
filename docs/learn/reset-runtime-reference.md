# 复位与C运行环境 · 可打印速查 {#reset-runtime-reference}

阶段02 · 单元07 · 原创64字节模型 · 无硬件操作 · 本地候选

先解释谁准备初始上下文，再证明每个RAM字节的来处。放置、初始化和执行有各自责任。

## 速查：真实对象、初始上下文与失败保持 {#reference-contract-title}

`runtime_image_initialize`只在整个请求有效后改变输出。它先检查四个空参数，再检查容量、向量长度、32位标签端点、SP和入口，然后检查每个区间和目标交集；最后形成私有64字节暂存并提交。报告mainReady在失败时也保持原值，所以旧true不等于这次请求成功。调用者必须先看返回状态，再把报告与其已接受输入配对。

| 条件 | 本模型的明确处理 |
| --- | --- |
| Flash少于8字节；或大于64；RAM不在1..64 | BAD_VECTOR或BAD_LENGTH；不读不存在的向量字 |
| base+length不能表示为uint32_t排他端点 | ADDRESS_OVERFLOW；先比较UINT32_MAX-base再相加 |
| SP超出含顶端边界区间、或不按8对齐 | BAD_SP；对齐为教学政策，不承诺栈需求充足 |
| 缺Thumb位、目标不在执行范围、仅剩1字节、目标在末端 | BAD_ENTRY；最小2字节检查不证明指令正确 |
| offset+length将溢出size_t；或完整区间越界 | ADDRESS_OVERFLOW或BAD_RANGE；不能先加再看包回的小数 |
| data与BSS非空目标相交 | OVERLAP；即使复制阶段看似正确，也不能先写后拒绝 |
| data/BSS长度0 | 仍要求offset≤对应对象长度；exact endpoint64可用，65不可用；不形成该空区间的指针 |

独立故障例：保持向量有效，把BSS起点从16改为10、长度仍4，则data[8,12)与BSS[10,14)交于10..11。不能让后来的零填充悄悄破坏51、68；应在任何RAM/报告写入前拒绝。端点相接如data[8,12)、BSS[12,16)则不重叠。若data与BSS都为空、起点都64，其他上下文有效，允许main-ready但copied=zeroed=0。

**非空指针不足以证明安全。**Flash、request、RAM与report必须是四个存活、完整初始化、互不重叠的真实对象；实际数组必须覆盖声明的flashLength/ramLength，调用期间不得并发修改。函数可以检查NULL和整数范围，不能通用识别伪造/悬空指针、谎报长度或别名。不要把地址标签强转指针来“测试错误”，也不要让report位于RAM里。失败夹具只改变真实已初始化对象中的元数据。C使用size_t上限，JS使用Number.MAX_SAFE_INTEGER上限，数值表示不同；两者在本章0..64的有限合法域与32位标签合同一致。

这里的事务性依赖单执行上下文和非重叠所有权；不是线程同步、断电原子性或真实启动回滚承诺。最多复制64个旧RAM字节，最多复制64个data字节，最多清零64个字节，再最多提交64字节；所有循环都有已验证上界，没有探测内存或等待硬件。

## 速查：64字节固定例与完整解释 {#reference-fixture-title}

固定前提：Flash和RAM各为真实64字节对象，标签分别从0x1000和0x2000开始；标签宽32位，向量采用小端字节序。RAM种子全部为0xA5=165。向量位于Flash偏移0..3与4..7；可执行范围为**[0x1010,0x1012)**，方括号含起点、圆括号不含末端。Flash其余字节可有0xA5，但不分析其是否可执行。

| Flash偏移 / 十六进制字节 | 小端解码 | 解释 |
| --- | --- | --- |
| 0..3：40 20 00 00（十进制64,32,0,0） | 0x00002040=8256 | 0x40+0x20×256；是栈顶边界值 |
| 4..7：11 10 00 00（十进制17,16,0,0） | 0x00001011=4113 | 0x11+0x10×256；bit0=1，目标0x1010 |
| 32..35：11 22 33 44（十进制17,34,51,68） | 四个独立字节 | 源0x1020..0x1023，复制到0x2008..0x200B |

SP0x2040位于[0x2000,0x2040]边界区间且8256除8余0。入口清状态位后为4112，末端4114减4112=2，所以完整最小单元恰好容纳。若末端改为4113只剩1字节；若入口字为4115，目标4114正好等于末端；两者都拒绝。

<figure class="runtime-diagram" aria-labelledby="runtime-diagram-title"><div class="diagram-grid"><div><strong>① 虚构Flash · 64字节</strong><p>标签0x1000..0x103F<br>0..7：SP与入口<br>32..35：17,34,51,68</p></div><div><strong>② 校验 → 私有准备</strong><p>先查完整请求<br>32..35 → 8..11<br>16..19 → 写零<br>失败：不提交</p></div><div><strong>③ 虚构RAM · 64字节</strong><p>标签0x2000..0x203F<br>8..11：17,34,51,68<br>16..19：0,0,0,0<br>其余：165</p></div></div><figcaption id="runtime-diagram-title">原创事务图。箭头表示有限字节复制或处理顺序，不表示总线访问、寄存器赋值或CPU跳转。所有偏移单位为byte；0x前缀为十六进制标签。虚线概念由“失败：不提交”文字表达，无色彩依赖。</figcaption></figure>

图的文字等价：先验证上下文和两个不相交目标，后在私有副本里从Flash32..35复制四字节到RAM8..11，再把RAM16..19写零；直到所有准备结束才公开RAM与报告。源Flash不改变，目标外没有字节被授权写入。

| RAM偏移 / 标签 | 种子 | 成功后的完整区间结果 |
| --- | --- | --- |
| 0..7 / 0x2000..0x2007 | 全165 | 全165 |
| 8..11 / 0x2008..0x200B | 全165 | 17,34,51,68 |
| 12..15 / 0x200C..0x200F | 全165 | 全165 |
| 16..19 / 0x2010..0x2013 | 全165 | 0,0,0,0 |
| 20..63 / 0x2014..0x203F | 全165 | 全165 |

共64字节：4个data、4个BSS、56个保持165；报告initialSp=8256、entryWord=4113、entryTarget=4112、copied=4、zeroed=4、mainReady=true。可先盖住表最后一列自己填完，之后再进入控制器。这个静态例子在无JavaScript时也完整可读。

## 速查：核心与所选CMSIS运行时 {#reference-actors-title}

**复位向量**是复位入口的初始上下文数据，不是“先调用main”的同义词。以[ST PM0214 Rev10，2020年3月，§2.1.3 p19、§2.3.4 p40](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)描述的Cortex-M4为例，复位时从核心可见0x00000000取得MSP初值，从0x00000004取得入口；入口bit0用于Thumb状态，必须为1。最前面的SP字本身不是处理函数指针。这个核心规则并不说明哪一块物理存储器出现在零地址。

芯片负责复位可见的启动映射。历史[RM0090 Rev5，2013年9月，§2.4 pp69–70](https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf)对其STM32F4范围说明BOOT选择的Flash、系统存储器、SRAM启动空间，以及F405/407的物理重映射。这里仅把它作为版本明确的映射例子；不是当前所有STM32的引脚或启动配置指南，更不把本章0x1000当成STM32真实Flash基址。核心取向量的角色与芯片映射到什么字节，是两个证据问题。

**链接器**决定符号、段和地址关系，不在芯片复位时主动执行复制。**启动代码**是入口以后实际运行的指令；**C运行环境**指普通C代码依赖的存储初始化及所选运行库约定。它们可能分散在启动文件、编译器运行库和链接脚本中。托管操作系统的装载器还有自己的装载合同，不能拿主机可执行程序的启动方式替代Flash固件。

小产物：用四行写出“核心取上下文→芯片映射提供字节→入口执行启动代码→所选运行时建立C前提”。其中映射是取字节条件，不是核心之后顺序执行的另一个软件函数。

选定Arm **CMSIS5.9.0**，发布标签2022-05-02，对应commit `2b7495b8535bdcb306dac29b9ded4cfb679d7e5c`。其[ARMCM4启动例子V2.0.3，2020-03-31](https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/Device/ARM/ARMCM4/Source/startup_ARMCM4.c)的`Reset_Handler`先`SystemInit()`再`__PROGRAM_START()`。这是所选设备/工具链例子的顺序；不是所有C程序或所有厂商启动文件的通用顺序。尤其不能因此假定SystemInit调用时所有普通全局初值已经可用。

同一commit的[cmsis_gcc.h启动段](https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/CMSIS/Core/Include/cmsis_gcc.h#L117)在未覆盖宏时将`__PROGRAM_START`映射到`__cmsis_start`：遍历copy-table，遍历zero-table，然后调用`_start()`。这些表依实际链接脚本才有内容，长度为word而不是本模型的byte。

必须同时看[gcc_arm.ld V2.1.0，2020-08-04](https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/Device/ARM/ARMCM4/Source/GCC/gcc_arm.ld)：`.data : AT(__etext)`放在RAM，copy-table给出Flash源与RAM目标；模板zero-table只留了额外BSS条目的可选示例，普通`.bss`不必出现在该表中。因此**不能声称__cmsis_start的zero-table循环单独清除了每个普通.bss**；必须继续核对实际选择的`_start`和C运行库合同。本章未执行该目标运行库，不补写一个“必然调用main”的虚假目标轨迹。

本章模型有自己的明确合同：全部校验→私有data复制→私有BSS清零→提交main-ready。它用这个顺序解释存储责任；它没有声称复刻上述CMSIS例子的全部库步骤、构造器、设备设置或真实复位路径。

## 速查：MSP/PC与bootloader转交 {#reference-bridge-title}

先回看[CPU核心寄存器的SP、LR、PC段](../mcu/cortex-m-cpu-registers.html#stack-link-pc-title)。R13/SP有MSP与PSP的架构角色，R15/PC参与取指和控制流。C变量`uint32_t spLabel`则是普通对象，保存一个数；改变这个对象不会改变处理器的MSP。C指针也有对象、类型和有效期前提，不能因画了0x2000就获得访问该地址的权限。

为什么SP要先有值？函数调用可能需要保存返回现场和局部临时存储；在这些操作发生前，活动栈必须有可靠的边界。为什么入口有状态位？入口数值同时携带控制流目标和Thumb状态信息，不能把奇数入口字直接解释为普通字节下标。本模型把0x1011清除bit0得到0x1010，再要求完整的最小2字节单元；这只验证有限入口范围，不分析其指令、后续分支或栈深度。[PM0214 Rev10 §2.1.3 pp19、23](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)给出该核心的Thumb状态条件；本模型的完整两字节检查和8字节SP对齐是额外教学政策。

声明向下增长的虚构栈时，0x2040可作为64字节RAM的顶端边界，虽然它是一过末端、不是可读取的RAM字节。模型也允许底端0x2000作为边界；这不保证有空间容纳一次调用。模型对齐8字节不能推广成“每条指令都由ABI要求8字节对齐”。通过入口检查更不能推出真实板上向量位置、所有异常向量、权限、栈容量或运行库都正确。

**复位与bootloader受控转交**有不同前提。普通分支或函数调用不会自动重演复位的寄存器、时钟、外设、中断或存储状态变化。转交的两端必须明确谁准备活动栈、向量、执行状态与运行库，如何处理仍活跃的中断、外设和DMA，以及哪些状态由目标保留。此处是对责任的推导，不是可直接复制的跳转流程；本章不提供MSP赋值、伪造函数指针或MMIO代码。

**Flash**在这里存放镜像字节；**RAM**在这里是可写运行存储。初始化的静态对象如`uint8_t samples[4]={17,34,51,68}`需要这些初值在运行前到达可写目标。**LMA（装载地址）**描述初值在装载镜像中的位置，**VMA（运行地址）**描述运行时的地址；在ROM到RAM的安排中二者不同。依据是[GNU ld2.36 §3.1、§3.6.8.2](https://www.sourceware.org/binutils/docs-2.36/ld.html#Output-Section-LMA)的定义和启动复制示例。

本章data初值的LMA标签是0x1020，即Flash偏移32；运行目标VMA标签为0x2008，即RAM偏移8。每复制一个字节，源偏移和目标偏移都前进1，四字节对应关系为32→8、33→9、34→10、35→11。不是把“地址数0x1020”存入RAM，也不是把整个Flash搬进RAM。

**BSS**通常为需要零初始化的静态存储保留RAM空间，其零值可由运行时写入，不必在Flash为每个零都存一份同尺寸的有效载荷。本例只声明RAM偏移16..19清零。**noinit/保留区**依工程链接与运行时合同选择不初始化；不是ISO C给任意未初始化读取的通行证。这里未被data/BSS拥有的字节保留0xA5，用来证明模型没有擅自清空全部RAM，也不把这个图案当成真实硬件复位值。

小产物：写两列“Flash负载字节”和“RAM运行保留”，data在两列各有四字节，BSS只有四字节RAM目标和零填充责任。map能说明本次链接的布局；仍需实际启动代码履行复制/清零合同。

## 可复用模块与完整下载 {#reference-source-title}

先准备已有C11编译器；源代码中的测试宏RUNTIME_IMAGE_TEST打开main，模块使用时不定义它。正常和NDEBUG检查均有实际运行证据；所有编译按项目的统一路由执行。每次立即检查状态，失败不运行旧产物。main-ready始终是有限模型状态。

<a href="../examples/reset-runtime/runtime_image.h" download>下载runtime_image.h</a> · <a href="../examples/reset-runtime/runtime_image.c" download>下载runtime_image.c</a> · <a href="../examples/reset-runtime/README.txt" download>下载复现说明README.txt</a>

```c
/******************************************************************************
 * @file runtime_image.h
 * @brief Original embedded-notes fictional image transaction interface.
 * @author embedded-notes project contributors
 * @version V1.0 2026-10-17
 * Original project teaching code; no third-party authorship or license implied.
 *****************************************************************************/
#ifndef RUNTIME_IMAGE_H
#define RUNTIME_IMAGE_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#define RUNTIME_CAPACITY 64U
typedef enum {
    RUNTIME_OK,
    RUNTIME_INVALID_ARGUMENT,
    RUNTIME_BAD_LENGTH,
    RUNTIME_ADDRESS_OVERFLOW,
    RUNTIME_BAD_VECTOR,
    RUNTIME_BAD_SP,
    RUNTIME_BAD_ENTRY,
    RUNTIME_BAD_RANGE,
    RUNTIME_OVERLAP
} RuntimeStatus;
typedef struct {
    uint32_t flashBase;
    uint32_t ramBase;
    size_t flashLength;
    size_t ramLength;
    uint32_t execStart;
    uint32_t execEnd;
    size_t dataSource;
    size_t dataDestination;
    size_t dataLength;
    size_t bssDestination;
    size_t bssLength;
} RuntimeRequest;
typedef struct {
    uint32_t initialSp;
    uint32_t entryWord;
    uint32_t entryTarget;
    size_t copied;
    size_t zeroed;
    bool mainReady;
} RuntimeReport;
/**
 * @brief Validate a complete request, prepare private RAM, then commit on OK.
 * @param[in] flash Live readable initialized byte object, truthful flashLength.
 * @param[in] request Live fully initialized request. Lengths are at most64.
 * @param[in,out] ram Live writable initialized object, truthful ramLength.
 * @param[in,out] report Live writable initialized report; unchanged on rejection.
 * @return Explicit status; OK means fictional main-ready, never a branch.
 * All four objects must be distinct, nonoverlapping and live throughout the call.
 * One execution context, no concurrent mutation. NULL is checked. Forged/dangling
 * pointers, dishonest spans and caller alias violations are not detected.
 * Labels are32-bit integers, not pointers. Eight-byte SP alignment and an
 * inclusive RAM boundary interval are model policies. Endpoints must be
 * representable as uint32_t; empty regions still need in-object endpoints.
 */
RuntimeStatus runtime_image_initialize(const uint8_t *flash, const RuntimeRequest *request,
                                       uint8_t *ram, RuntimeReport *report);
#endif
```

```c
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
```

```text
reset-runtime: original embedded-notes fictional image initializer (C11)

Files: runtime_image.h, runtime_image.c, README.txt. Keep the header beside C.
No device, target startup, function-pointer jump, MMIO or hardware is exercised.
Original project teaching code; no third-party authorship or license is implied.

Prerequisite: an already installed host C11 compiler with eight-bit bytes,
uint8_t, uint32_t and size_t. No installation or board is needed by this lab.
From this directory, using your compiler driver in place of cc:

cc --version
cc -std=c11 -Wall -Wextra -Werror -Wconversion -Wshadow -pedantic -DRUNTIME_IMAGE_TEST runtime_image.c -o runtime-test
./runtime-test
cc -std=c11 -Wall -Wextra -Werror -Wconversion -Wshadow -pedantic -DRUNTIME_IMAGE_TEST -DNDEBUG runtime_image.c -o runtime-ndebug
./runtime-ndebug
cc -std=c11 -Wall -Wextra -Werror -Wconversion -Wshadow -pedantic -c runtime_image.c -o runtime_image.o

Windows: use the installed driver's name, add .exe to executable output names,
and run .\runtime-test.exe / .\runtime-ndebug.exe in PowerShell. Stop immediately
if a compilation or execution fails; do not run an older executable. In a
managed project requiring a build router, put these identical compiler argv
into its existing custom profile and run validate, dry-run, then build for EACH
actual compile/link. Never use a helper to bypass the project build route.

Expected normal and NDEBUG execution: exit0 and
PASS runtime: fixed64-byte image, transactional boundaries and live checks
An expectation or I/O failure exits nonzero. Runtime checks do not use assert.
Local author validation used existing host GCC13.1.0 via mcu-build custom
validate -> dry-run -> build, including normal/NDEBUG runs and module compile.
This is host evidence, not a target reset or physical startup validation.

Independent fixed fixture: actual64-byte Flash and RAM arrays. Labels0x1000
and0x2000 are integers only. Fill RAM with0xA5; little-endian Flash0..7 bytes
are [64,32,0,0,17,16,0,0], decoding SP0x2040 and entry0x1011 -> target0x1010.
Executable extent [0x1010,0x1012) contains one complete minimum2-byte unit;
no instruction decoding/execution is claimed. Flash32..35=[17,34,51,68].
dataSource32, dataDestination8, dataLength4; bssDestination16,bssLength4.
Success: RAM8..11=[17,34,51,68],16..19=[0,0,0,0], all other bytes0xA5.
Report: initialSp8256,entryWord4113,entryTarget4112,copied4,zeroed4,mainReadytrue.

Use independently of tests: include runtime_image.h in a caller, compile
runtime_image.c without RUNTIME_IMAGE_TEST, and link runtime_image.o. Create
four distinct live, initialized, nonoverlapping objects: readable Flash bytes,
RuntimeRequest, writable RAM bytes and writable RuntimeReport. Supply truthful
actual spans. The call reads/writes only request.flashLength/ramLength bytes;
the caller must ensure the underlying storage really covers them. NULL is
rejected, but an arbitrary non-NULL/dangling/forged pointer or a dishonest span
cannot be validated by this function. Never test those by executing invalid C.
Single execution context, no concurrent access or mutation through aliases.

runtime_image_initialize(flash,&request,ram,&report) validates the WHOLE request
before preparing a private64-byte scratch array. It copies data, zeros BSS,
then commits RAM and named report fields only on RUNTIME_OK. On every rejected
call, all actual accepted RAM bytes and all report fields remain unchanged.
Check status immediately; an unchanged old mainReadytrue is an OLD accepted
report after failure, not evidence that the rejected request succeeded.

Lengths: Flash8..64, RAM1..64. Labels and exclusive endpoints fit uint32_t;
offsets/lengths fit size_t. SP interval includes both RAM boundary endpoints
and requires8-byte alignment, both explicit teaching policies. Empty stack
space at the bottom endpoint is not proof of a usable real call stack.
Entry bit0 must be1; cleared target must have two complete bytes inside the
declared executable interval, itself inside Flash. Entry at end is rejected.
Data source/destination and BSS destination must fit, with no nonempty target
overlap. Check offset+length overflow before arithmetic. Empty data/BSS still
require offset<=object length; an exact endpoint is legal only for zero bytes.
Loops do no pointer formation for those empty regions. Both-empty is allowed.

Statuses: RUNTIME_INVALID_ARGUMENT(NULL), RUNTIME_BAD_LENGTH(capacity policy),
RUNTIME_ADDRESS_OVERFLOW(endpoint or size addition), RUNTIME_BAD_VECTOR(<8),
RUNTIME_BAD_SP(range/alignment), RUNTIME_BAD_ENTRY(Thumb/extent),
RUNTIME_BAD_RANGE(region), RUNTIME_OVERLAP(destinations), RUNTIME_OK(commit).
Fault precedence follows the source, not a promise to list every defect.

Tests use initialized real storage for NULL positions, missing Thumb, entry
before/at end/incomplete extent, SP outside/misaligned, short vector/regions,
label and SIZE_MAX arithmetic, overlap, empty endpoints and nonempty exact ends.
They compare bytes and meaningful report fields, never structure padding.
Main-ready is only this model's completed transaction. Linker placement, actual
core reset, chosen startup/runtime/library contract, boot remapping and a
bootloader's controlled transfer require separate target-specific evidence.
```

## 折叠自检：一过末端与旧报告 {#reference-recall-title}

<p>独立前提：Flash/RAM各64字节，上下文有效。data源64目标64长0，BSS目标64长0；另一次把BSS目标改65。两次怎样？一次OVERLAP之后旧mainReady=true表示什么？</p><details id="reference-answer"><summary>展开原因</summary><p>第一笔OK且复制/零填充0字节；第二笔BAD_RANGE，空段也必须端点≤64。OVERLAP不改旧报告；旧true只属于旧请求，不能当作新请求成功。没有访问虚构端点指针。</p></details>

## 版本、首选阅读与未验证范围 {#reference-sources-title}

资料核对2026-10-17；固定夹具、图、代码和问题为本项目原创。只在实际读到的条款范围引用，不把下载成功等同于硬件验证。

- [PM0214 Rev10，2020年3月](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)：已读§2.1.3 pp19、23与§2.3.4 p40，限所述Cortex-M4核心的初始MSP/PC、向量和Thumb语义。**首选阅读任务：**先看p19的Stack pointer/Program counter，分别圈出“取值槽位”和“被装入的值”，再对照本章虚构标签。
- [CMSIS5.9.0固定commit的startup_ARMCM4.c](https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/Device/ARM/ARMCM4/Source/startup_ARMCM4.c)、[cmsis_gcc.h](https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/CMSIS/Core/Include/cmsis_gcc.h#L117)、[gcc_arm.ld](https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/Device/ARM/ARMCM4/Source/GCC/gcc_arm.ld)：已读Reset_Handler、__cmsis_start及copy/zero/data/BSS段；默认宏可被覆盖，普通BSS责任继续依赖所选_start/运行库。不是通用启动顺序承诺。
- [GNU ld2.36 §3.1、§3.6.8.2](https://www.sourceware.org/binutils/docs-2.36/ld.html#Output-Section-LMA)：已读VMA/LMA定义和ROM→RAM/data、BSS示例；支撑布局和初始化责任的区别，不证明本模型具有目标固件格式。
- [ST RM0090历史Rev5，2013年9月，§2.4 pp69–70](https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf)：有界文本已读，仅用于明确芯片启动alias/remap与核心角色不同；历史版本不是最新手册。未在真实芯片核实BOOT、电源或重映射。

本地C检查和JS模型/控制器检查分开记录。目标启动、硬件、物理纸张以及本批发布仍是独立证据状态；主机输出不能把它们推进为通过。无账号、浏览器存储或外部执行服务。

## 继续阅读 {#reference-next-title}

<div class="next-links"><a href="../learn/reset-runtime.html">返回完整章节</a><a href="../learn/memory-budget.html">下一章：静态内存、堆与调用栈预算</a><a href="../learn/engineering-map.html#stage-02">阶段02地图</a><a href="../mcu/cortex-m-cpu-registers.html#stack-link-pc-title">CPU寄存器桥梁</a></div>
