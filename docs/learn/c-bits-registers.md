---
title: 位运算与寄存器读写
description: 八位数、掩码、整数提升、RW/RO/W1C、两条 RMW 失败时间线与 C11 实验。
---

# 位运算与寄存器读写 {#overview}

第 03 单元 · 从“想改变一个输出”到“解释每一次写入”。服务于可升级的数据采集终端：改变一个控制位时，必须知道哪些状态保留、哪些状态被覆盖、哪些事件被确认。上章的 LED 命令还不能保证这个软件过程正确。

## 起点、短路径与交付物 {#prerequisites}

先能分清 LED 输出命令、实际电流通路与输入观察；需要时回看[GPIO 输出](gpio-led.html#driver-modes)。本章从零解释位和掩码，不要求指定开发板。所有八位寄存器、时间线和图均为原创虚构模型；未做硬件验证。

按四小段完成：① 给0xA5的位编号并解释一次掩码变化；② 把读值、写入数据、新状态写成三列；③ 分别复述RW丢更新与W1C误确认；④ 在宿主C11实验中复现固定结果。每段先读例子，再预测，最后写原因。最终产物是一张注明读、改、写顺序和访问属性的寄存器写入记录，不是个人掌握证书。

## 一排位怎样表示一个非负数 {#bit-pattern}

位（bit）只有0和1。这里声明无符号八位模型，范围0..255；bit0是最低有效位，权重1，bit7权重128。一排位左边是高位，位置不随取值改变。二进制10100101的1落在bit7、bit5、bit2、bit0，权重相加128+32+4+1=165。

十六进制把每四个二进制位写成一位：1010是A（十进制10），0101是5，因此这一排是0xA5。前缀0x说明记数法，不声明变量的C类型、寄存器访问宽度或电压。八位是模型范围，不意味着STM32有可按字节访问的同名寄存器。标准C11没有本章采用的0b二进制整数字面量；代码用十六进制或十进制，图用二进制帮助观察。

<figure class="bit-figure" aria-labelledby="bit-diagram-title"><figcaption id="bit-diagram-title">原创位图：0xA5与掩码0x0C。每格依次是位号、权重、原值、选择位。</figcaption><div class="bit-grid"><div><b>bit7</b><span>权重128</span><strong>1</strong><small>mask 0</small></div><div><b>bit6</b><span>权重64</span><strong>0</strong><small>mask 0</small></div><div><b>bit5</b><span>权重32</span><strong>1</strong><small>mask 0</small></div><div><b>bit4</b><span>权重16</span><strong>0</strong><small>mask 0</small></div><div><b>bit3</b><span>权重8</span><strong>0</strong><small>mask 1</small></div><div><b>bit2</b><span>权重4</span><strong>1</strong><small>mask 1</small></div><div><b>bit1</b><span>权重2</span><strong>0</strong><small>mask 0</small></div><div><b>bit0</b><span>权重1</span><strong>1</strong><small>mask 0</small></div></div></figure>

本段小产物：遮住165，写出每个1的权重，再按四位一组还原A5。

## 掩码与 AND、OR、XOR、按位取反 {#mask-rules}

掩码（mask）是一组选择位；本章掩码的1表示选中此位置。0x0C=00001100选中bit3和bit2。AND（&）两边都为1才得1；OR（|）至少一边为1就得1；XOR（^）两边不同才得1；按位取反（~，bitwise complement）翻转参与运算的每一位。它是一个运算，不等同于有符号整数的二进制补码（two's complement）表示。它们逐位工作；逻辑运算&&、||、!判断真假，不能替换这里的运算符。

设置选中位用 value | mask：mask为1强制结果为1，为0保留原位。清除用 value & width_complement(mask)：选中位遇0清零，其他位遇1保留。翻转用 value ^ mask：选中位取反，未选中位不变。关键是保留未选位，不是把整体替换成mask。

完整手算：原值10100101，mask为00001100。OR让bit3从0变1、bit2保持1，其他六位原样留下，得到10101101=0xAD=173。清位使bit3和bit2都成0，得到10100001=0xA1=161。XOR让bit3从0变1、bit2从1变0，得到10101001=0xA9=169。八位内全取反为01011010=0x5A=90。

| 八位value=0xA5，mask=0x0C | 结果 | 不变部分 |
| --- | --- | --- |
| 设置 set / OR | 0xAD | mask为0的六位 |
| 清除 clear / AND补掩码 | 0xA1 | mask为0的六位 |
| 翻转 toggle / XOR | 0xA9 | mask为0的六位 |
| 八位内取反 complement | 0x5A | 八位内没有不变位 |

这只是数值变换，尚未说明如何写外设。[N1570 §6.5.10–12](#source-n1570)给出逐位规则，寄存器访问语义仍需独立查证。

## 字段、移位与整数提升 {#width-promotions}

字段（field）是连续一段位。取0xA5的bit6..4，起点offset=4、长度length=3：右移4让bit4到最低位，再用低三位掩码7筛选，得到010=2。offset7、length2超过八位末端，必须拒绝。先确认offset小于width，再做width-offset，避免无符号减法先绕回大数。

整型提升（integer promotions）发生在运算前。若存在uint8_t，它恰好八位；通常会先提升为能表示0..255的int。~x具有提升后的类型，不能把八格图当成所有中间值的宽度。赋回窄无符号类型会按目标范围转换，但不会把之前的运算变成八位。本C模块先验证width=1..8，用至少32位的unsigned long与1UL运算，显式裁剪到宽度掩码，最后转换为uint32_t。

C11移位要求两侧为整数并各自提升；计数必须非负且小于提升后左操作数类型的位宽。无符号左移按该类型范围取模；有符号左移还要求左值非负，乘以相应2的幂后能由结果类型表示，否则无定义结果。有符号负数右移是实现定义。本课不执行非法移位来“看结果”。1 << -1违反计数条件；在提升后int恰好32位的条件下，1 << 32无定义，不能教成必得0。

本模型另有更严格的显示合同：count=0..width-1，移出格子的位丢弃。八位value1左移7得128，count8被模型拒绝；不等于任意C左移8都非法。八位165左移1裁剪后得74，count0保持165。[N1570 §6.3.1.1、§6.5.3.3、§6.5.7](#source-n1570)是语言规则依据。

## 实验一：先预测数值变换 {#mask-lab}

输入为十进制整数：width=1..8，value与mask=0..(2^width-1)。字段要求offset=0..width-1、length=1..width-offset；左移count=0..width-1；其他操作不使用字段或计数。预测填写十进制结果。编辑只标待应用，不改变最后一次已应用结果。应用消耗预测；重置恢复八位、165、12、设置、起点4、长度3、计数1，清空预测并隐藏结果。

<!-- mask-controls -->

无脚本固定练习：八位165、mask12，设置结果173；改成清除后应重新预测161。若错，逐位核对bit3/bit2，尤其原本为1的bit2。第二次改成value1、mask128，先说明其余七位为什么不变，再得129。

## 读值、写出数据与新状态 {#register-semantics}

寄存器暴露一组状态或控制位；访问语义说明一次读写做什么。这里仅模拟所有八位同属性的虚构寄存器：没有保留位、混合字段、异步事件或读副作用。RW（read/write）用写入数据替换状态；RO（read-only）在本模型中忽略写入；W1C（write one to clear）写1清除对应待处理位，写0保留。待处理（pending）表示事件尚待处理，不表示LED电压。

相同初始0xA5和写数据0x0C：RW得0x0C；虚构RO保持0xA5；W1C清bit3/bit2，bit3本来0、bit2本来1，最后0xA1。总线上写出的仍为0x0C，不能因为结果A1就说“写了A1”。

| 观察读值 | 模式 | 实际写出数据 | 得到状态 | 原因 |
| --- | --- | --- | --- | --- |
| 0xA5 | RW | 0x0C | 0x0C | 整体替换 |
| 0xA5 | 虚构RO | 0x0C | 0xA5 | 模型规定忽略 |
| 0xA5 | W1C | 0x0C | 0xA1 | 写1选择清除 |

真实RO写、WO读的非法方向访问不受本模型保证。不能普遍声称“RO写必无影响”或“WO读必为0”；值、错误响应与限制只能由具体器件手册和总线合同给出。混合字段与保留位也不能直接套全字|=、&=。先查属性和合法访问宽度，再选表达式。

## 实验二：同样写12为何结果不同 {#register-lab}

初始读值和写数据均为十进制0..255，模式为RW/虚构RO/W1C。每次试验从所填初始值重新开始，没有隐藏累计或异步变化。先预测最终状态再应用；模式或数据一变预测失效。下方分列读值、实际写出数据与得到状态。

<!-- register-controls -->

无脚本固定案例见上表：165、12在RW/RO/W1C分别得12/165/161。小产物：抄成三列记录，每行补一句“写出的1代表什么”。

## 两类 RMW 错误有不同因果链 {#rmw-timelines}

读改写（read-modify-write，RMW）先读一个值，在软件里改，再写回。reg |= mask一个表达式也可能包含两个独立外设访问。第一类错误是旧快照覆盖另一个更新；第二类错误是写回数据的1在W1C中成了确认命令。第二类即使没有并发也会发生，不能都说成“线程太快”。下面按顺序安排概念角色，不执行C竞态。

### RW：旧快照丢更新 {#rw-lost-update}

RW初始0。A想设bit0，读取0后停住；B想设bit1，读当前0并写2，状态变2；A仍用旧0，计算0 OR1=1并写回。最后1，B的bit1丢失；两个意图合并本应3。不是OR真值表错，而是过时读值替换了新状态。

<!-- rw-controls -->

静态时间线：开始0 → A读0（状态0）→ B写2（状态2）→ A写旧值OR1（状态1）。逐步写“谁持有快照”和“当前寄存器是什么”；A手里的0不会因B更新自动变2。

### W1C：OR赋值误确认标志 {#w1c-or-assignment}

另起一例：pending bit0/1均为1，即3。只想确认bit0却先读3，计算3 OR1=3，再写3。两个写入位均为1，W1C把两位清成0。直接写请求mask1会只清bit0并留下2。这里没有角色插入更新；错误是读回状态被重新当成清除命令。

<!-- w1c-controls -->

静态时间线：开始3 → 读3（状态3）→ 形成数据3（尚未写，状态3）→ 写3（状态0）。正确对照为初始3直接写1得到2。真实W1C的新事件与确认同时发生时，还要查器件规定；本模型没有这种时序。

## volatile 与专用置位/复位各管什么 {#volatile-limits}

volatile使访问遵循实现的可观察访问规则，什么构成访问仍有实现规定。它不把读、计算、写变成不可分割一步，也不是C线程同步、所有权管理或通用内存屏障。即使按要求发出了A的读写，旧快照仍会覆盖更新；即使每次访问发生，错误W1C数据仍会误确认。[GCC13.1 §6.46](#source-gcc)还明确区分volatile与非volatile访问的排序，不能由前者推出后者已完成。

专用置位/复位寄存器把“选哪些位、做什么动作”作为一次文档化写入，可免去特定输出位更新先读ODR的需要。它只解决手册限定的外设操作，不能推出协议、多对象事务或任意共享内存全部线程安全。ISR/任务/DMA所有权、同步策略和硬件时序留给后续课程；本课没有任意RMW的通用药方。

## 对照历史 RM0008：IDR、ODR、BSRR、EXTI_PR {#stm32f1-manual}

以下仅对照实际核读的ST RM0008，June2009，Doc ID13902 Rev9，Keil保存的原厂文档。这是历史版，不代表最新手册/勘误或板级验证。这里是32位寄存器，与八位全有效位模型不同；具体STM32F1料号、引脚实现、时钟、模式与复位条件仍须复核。本页不解引用数值地址或执行目标驱动。

- GPIOx_IDR，p149 §8.2.3：低16位输入观察，只读；该版Word mode only，即32位字访问。高16位保留、读0。不能从虚构RO“忽略写”推导真实IDR非法写行为。
- GPIOx_ODR，p150 §8.2.4：低16位读写输出数据锁存，同样Word mode only；高16位保留、读0。锁存不是引脚电压/电流：模式、复用、负载和连线仍影响实际观察。读0规则也不授权任意写保留位。
- GPIOx_BSRR，p150 §8.2.5：Word mode、写方向；低半BSy写1设置对应ODR位，高半BRy写1复位；两半写0都是不动作。同一y的BS与BR同时为1，该版设置优先。文档用于单独ODR位的原子设置/清除，不能外推为任意C表达式或协议的原子性。例如仅设ODR bit0，写BS0命令即可，不必把ODR旧快照整字写回。
- EXTI_PR，p180 §9.3.6：实现位标为rc_w1，所选边沿事件使对应pending为1，写1或改变边沿检测敏感度可清该位。31:20保留须保持复位值0；bit19仅connectivity line使用，其他器件保留。不能拿0xFFFFFFFF当通用确认值，不能把0..19都视为每个型号可用。该版PR复位值标为undefined，不能假定启动总为0。访问宽度仍按该外设总线/寄存器访问规定复核，不能由八格图选择字节访问；本课不生成PR目标访问代码。

共同顺序：确认目标与版本 → 查宽度和方向 → 读位定义、保留位、脚注 → 选择表达式。WO读、RO写及保留位非法访问都不获得本模型数值承诺。[历史手册](#source-rm0008)训练查证方法，实际工程仍须当前目标文档和勘误。

## C11模块与失败合同 {#c-contract}

下载<a href="../examples/c-bits-registers/bits.c" download>bits.c</a>与<a href="../examples/c-bits-registers/README.txt" download>README.txt</a>。原创厂商无关纯数值模块要求C11和可选精确宽uint32_t，缺失则编译报错。width=1..8，值及mask/data必须在宽度内。unsigned long至少32位；实际移位最多8位的掩码构造或7位数据移动，先校验再执行，不依赖int恰好32位。

公开interface：bits_apply(width,value,mask,op,output)实现set/clear/toggle/invert；bits_field(width,value,offset,length,output)提取字段；bits_shift(width,value,count,output)有界左移；bits_write(width,initial,data,access,output)解释RW/虚构RO/W1C；bits_bad_rmw(output)返回BitsTrace。BitsOp与BitsAccess只接受已定义枚举。数值参数为无符号类型，负数经C转换成大值也须被域检查拒绝，不能当成合法索引。

返回BITS_OK/BITS_INVALID。失败保持输出原值，NULL在解引用前拒绝；非NULL仍须为真实、存活、可写且类型正确的对象，函数不能验证伪造或悬空指针。无硬件句柄和共享状态。BitsTrace的RW读值/他人更新/写数据/终值为0/2/1/1；W1C读值/写数据/终值/直接写1对照为3/3/0/2；角色均是单执行流局部值。

仅BITS_TEST启用main和测试输出，不定义时可编译独立模块。普通条件检查不会被NDEBUG关闭。测试以初始化输出哨兵222验证宽度0/9、值/掩码256、字段零长/越端、计数8和转换后的负计数、未知操作/模式及NULL拒绝。没有真实并发、非法有符号移位或硬件访问。成功输出先检查puts再检查fflush(stdout)，以发现缓冲写出的延迟错误；写或刷新失败返回非零。测试失败即使stderr诊断写不出也保持非零。

### 完整发布源代码 {#c-source}

下方包含可复用模块全部函数体及BITS_TEST测试，和下载文件逐字相同；JavaScript结果不替代C执行。代码可折叠，普通打印会展开。

<!-- published-c-start -->
<details id="published-c"><summary>展开完整 bits.c（模块与测试）</summary>

~~~c
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
~~~

</details>
<!-- published-c-end -->

### 复现宿主检查 {#c-host-lab}

三种等价编译参数如下，Windows程序通常加.exe：

~~~sh
cc -std=c11 -Wall -Wextra -Werror -pedantic -DBITS_TEST bits.c -o bits-test
./bits-test
cc -std=c11 -Wall -Wextra -Werror -pedantic -DBITS_TEST -DNDEBUG bits.c -o bits-test-ndebug
./bits-test-ndebug
cc -std=c11 -Wall -Wextra -Werror -pedantic -c bits.c -o bits.o
~~~

本项目实际验证经mcu-build custom profile的validate → dry-run → build，再运行生成程序；参数解释不替代工程入口。记录编译器版本、源SHA-256、普通/NDEBUG运行退出码与模块产物SHA-256。网页脚本测试、宿主运行、构建、浏览器、审查、发布分别记录，均不等同硬件验证。

本章这份源已实际用既有GCC13.1.0宿主编译器经过该路由验证：严格C11编译、普通运行、NDEBUG运行和无main模块编译均返回0，测试检查保持启用。程序实际输出为“PASS bits: masks, fields, shifts, rejection preservation, RW/RO/W1C, two sequential RMW traces”。被验证的源SHA-256为 `8964ef336bd48bdb5ae0bc520be6433412dc473f5bd2a675be32be3f01167f2b`。这只记录宿主数值行为，不是目标固件、硬件、浏览器或远端发布的通过声明。

## 十题：独立回忆、故障与迁移 {#ten-exercises}

先遮住正文及已应用结果，在纸上写结论与原因，再展开每题原生解析。每题自带输入。“只打印题目”保留条件并隐藏答案及其他解答；普通打印展开details并在结束后恢复折叠。无脚本仍能读静态例子、逐题展开答案；题目打印模式需要脚本。不保存作答、分数或推断掌握。

<!-- print-controls -->

<div class="exercise">

### 01 · 一排位的三个记法 {#exercise-01}

虚构无符号八位值10100101，bit0最右、权重1。写出十六进制、非负十进制和为1的位号，解释最高位权重。

<details class="exercise-answer" id="answer-01"><summary>展开第01题原因</summary><p>0xA5、165，bit7/5/2/0为1。bit7权重128，128+32+4+1=165；1010与0101分别是A与5。</p></details>
</div>

<div class="exercise">

### 02 · 只清两位 {#exercise-02}

八位value=0xA5、mask=0x0C，只清选中位并保留其他位。选择结果并解释bit2：A 0xAD，B 0xA9，C 0xA1。

<details class="exercise-answer" id="answer-02"><summary>展开第02题原因</summary><p>C。mask选bit3/2，两位清0，其他六位保留。原bit2为1，清后得A1；AD是设置、A9是翻转。</p></details>
</div>

<div class="exercise">

### 03 · XOR不是保证开 {#exercise-03}

八位value=0xA5、mask=0x0C，执行XOR翻转。写出十六进制和二进制，解释为何不同于设置得到的0xAD。

<details class="exercise-answer" id="answer-03"><summary>展开第03题原因</summary><p>0xA9=10101001。bit3从0到1，bit2从1到0；OR会使bit2继续为1。重复XOR两次会回到原值。</p></details>
</div>

<div class="exercise">

### 04 · 八格与C类型 {#exercise-04}

存在uint8_t、x=0xA5，实现的int能表示0..255。“~x中间结果一定是八位0x5A”如何判断？A“先看提升”，B“必是八位”，C“必为零值”。另给出模型八位内取反。

<details class="exercise-answer" id="answer-04"><summary>展开第04题原因</summary><p>A。x先提升为int，~结果是提升后类型。明确裁剪的八位模型内取反是0x5A=90；赋回窄类型不能改变之前的类型。</p></details>
</div>

<div class="exercise">

### 05 · 字段与计数端点 {#exercise-05}

width8、value0xA5，分别判断offset4/length3、offset7/length2；value改1后判断左移count7/count8。拒绝时C输出哨兵222应怎样？不要外推任意C左移8非法。

<details class="exercise-answer" id="answer-05"><summary>展开第05题原因</summary><p>4/3字段得2，7/2越界拒绝。1左移7得128，count8违反模型count&lt;width合同，输出仍222。普遍C计数上界取决于提升后左类型，还须检查有符号值条件。</p></details>
</div>

<div class="exercise">

### 06 · 三种访问属性 {#exercise-06}

三个独立虚构八位寄存器初始0xA5，都写数据0x0C，没有保留位或异步变化。给出RW、RO（模型忽略写）、W1C新状态，并指出实际写出的数据。

<details class="exercise-answer" id="answer-06"><summary>展开第06题原因</summary><p>RW得0x0C，虚构RO保持0xA5，W1C得0xA1。三次写数据都是0x0C，A1是清除后状态；真实RO非法写须查手册。</p></details>
</div>

<div class="exercise">

### 07 · RW丢更新 {#exercise-07}

RW初始0。A读0后停，B设bit1写2，A用旧快照设bit0再写。终值选A 0x03、B 0x01、C 0x02；指出丢失位并判断volatile能否合并两项意图。

<details class="exercise-answer" id="answer-07"><summary>展开第07题原因</summary><p>B。A旧0 OR1整字写1，丢B的bit1；合并意图本应3。volatile既不更新旧快照，也不使多访问不可分割。</p></details>
</div>

<div class="exercise">

### 08 · 无并发的W1C错误 {#exercise-08}

虚构W1C初始3，bit1/0均pending，仅想确认bit0，无其他角色。比较读3后OR1写回与直接写1的写数据和最终状态。

<details class="exercise-answer" id="answer-08"><summary>展开第08题原因</summary><p>OR赋值写3，两位都被确认，终值0；直接写1留下2。原因是待处理状态的1被重新当成清除命令，不依赖并发。</p></details>
</div>

<div class="exercise">

### 09 · BSRR查证迁移 {#exercise-09}

仅限RM0008 June2009 Rev9：设ODR bit0且不写回ODR旧快照。BSRR哪半哪位写1，其余动作位写0表示什么？访问宽度、同位BS/BR同时1优先级是什么？ODR=1能否证明引脚电压？

<details class="exercise-answer" id="answer-09"><summary>展开第09题原因</summary><p>低半BS0写1，其余0是不动作；32位Word访问，同位设置优先。ODR是锁存，实际电压还受模式、负载、复用与连线影响。专用命令不能证明应用线程安全。</p></details>
</div>

<div class="exercise">

### 10 · 拒绝合同与保留位 {#exercise-10}

bits_field输入width8/value165/offset8/length1，真实可写uint32_t输出初值222。返回及输出为何？另有人据全有效位模型向任意STM32F1 EXTI_PR写0xFFFFFFFF；按RM0008 Rev9指出两条位限制。

<details class="exercise-answer" id="answer-10"><summary>展开第10题原因</summary><p>BITS_INVALID，输出保持222；先拒绝offset端点再减法/移位。PR31:20保留须保持0；19仅connectivity line使用，其他器件保留。还须查具体料号实现位和访问规则。</p></details>
</div>

## 复习、来源与下一步 {#sources-next}

隔一天换value0x81、mask0x03，不开正文解释设置/清除/翻转与W1C，再把两个反例倒序复述。应能指出不变位、实际写数据和失效原因；完成本页不证明长期保持。可向助手追问“提升后的左操作数”“W1C为何不能OR赋值”或“ODR与IDR差别”，并提供自己的三列记录。

### 语言规则：N1570 {#source-n1570}

[WG14 N1570，2011-04-12 Committee Draft](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)：核读§6.3.1.1/3提升/转换、§6.5.3.3按位取反、§6.5.7移位、§6.5.10–12位运算、§6.7.3限定符、§7.20.1.1精确宽类型。是公开委员会草案，不冒称最终ISO文本。推荐先读§6.5.7两段移位前提，配count7/8例子；它不规定STM32寄存器。

### 编译器：GCC13.1 {#source-gcc}

[GCC13.1 §6.46 When is a Volatile Object Accessed?](https://gcc.gnu.org/onlinedocs/gcc-13.1.0/gcc/Volatiles.html)：区分可观察访问、非volatile排序与赋值后是否重读。版本细节不能外推到任意编译器/总线，更不证明RMW原子性。

### 外设：RM0008历史版 {#source-rm0008}

[ST RM0008，June2009，DocID13902 Rev9，Keil保存的原厂PDF](https://www.keil.com/dd/docs/datashts/st/stm32f10xxx.pdf)：p149 §8.2.3、p150 §8.2.4/5、p180 §9.3.6支持有限对照。真实使用须核对目标料号、当前手册/勘误、时钟/模式、访问宽度、保留位和板级条件。模型、宿主编译和文档核读都不代替硬件验证。

[打印速查](c-bits-registers-reference.html) · [上一章：GPIO输出](gpio-led.html) · [下一章：C对象与边界](c-objects-bounds.html) · [学习地图](engineering-map.html#stage-01)。下一章把数值表示连接到对象、指针、长度与寿命，避免正确位运算落在无权访问的存储上。
