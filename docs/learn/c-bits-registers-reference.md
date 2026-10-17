---
title: 位运算与寄存器读写速查
description: 掩码、提升、RW/RO/W1C、两类RMW错误与C11失败合同。
---

# 位运算与寄存器读写速查 {#reference-overview}

第03单元压缩参考。先读[完整章](c-bits-registers.html)。适用原创无符号1..8位模型与明确限定的历史STM32F1手册对照；未做硬件验证。模型、宿主C、文档核读和发布分别记录，不建立个人掌握记录。

## 位与掩码 {#reference-masks}

bit0最低有效位权重1，八位bit7权重128；10100101=0xA5=165，每四位一位十六进制。mask的1选中操作位置，0保留；0x0C选bit3/2。

| 八位value0xA5，mask0x0C | 结果 | 因果 |
| --- | --- | --- |
| OR设置 | 0xAD/173 | 选中位强制1，其他保持 |
| AND补掩码清除 | 0xA1/161 | 选中位清0，其他保持 |
| XOR翻转 | 0xA9/169 | 选中位取反，其他保持 |
| 八位内取反 | 0x5A/90 | 全部翻转并裁剪宽度 |
| 提取bit6..4 | 2 | 右移4后留下低3位 |

&、|、^、~逐位工作；&&、||、!判断真假，不能互换。数值变换还不是外设访问规则。按位取反（~，bitwise complement）翻转每一位，不等同于有符号数的二进制补码（two's complement）表示。

## 宽度、提升与移位 {#reference-width}

uint8_t存在时恰好八位，但通常提升为可表示其范围的int；~结果具有提升后类型，八格图不代表全部中间值。赋回窄类型不改变之前的运算类型。标准C11无本课采用的0b整数字面量。

C移位两侧先提升，计数非负且小于提升后左操作数类型位宽。无符号左移按该类型范围取模；有符号左移要求非负且结果可表示，否则无定义结果；负有符号右移为实现定义。不执行非法例子来制造输出。

模型更严格：width1..8，count0..width-1；offset&lt;width，length1..width-offset。先查offset再减法，先查计数再移位。八位value1/count7得128，count8拒绝，不等于任意C左移8非法。value165/count1裁剪得74，count0保持165。C用至少32位unsigned long与1UL，验证后才移动，最后转换uint32_t。

## RW、RO、W1C三列记录 {#reference-access}

虚构全八位同属性、无保留位/混合字段/异步变化：

| 初始读值 | 模式 | 实际写出数据 | 新状态 |
| --- | --- | --- | --- |
| 0xA5 | RW替换 | 0x0C | 0x0C |
| 0xA5 | 虚构RO忽略写 | 0x0C | 0xA5 |
| 0xA5 | W1C写1清除、写0保持 | 0x0C | 0xA1 |

pending是待处理事件。写出的0x0C不是得到的A1。真实RO写、WO读与保留位非法访问须查具体手册，不能承诺普遍忽略、读0或固定结果；混合字段不套全字|=、&=。

## 两条错误RMW时间线 {#reference-rmw}

RW：初始0 → A读0停下 → B设bit1写2 → A用旧0设bit0写1 → 终值1，丢bit1，合并意图本应3。原因是过时快照覆盖更新。

W1C：初始3（bit1/0都pending），只想确认bit0 → 读3 → OR1仍3 → 写3 → 终值0；直接写mask1本会留下2。无需并发，读出的1被误作清除命令。

C里只是顺序局部值，无线程/ISR/DMA或数据竞态。volatile不更新旧快照、不使RMW不可分割，不是线程同步或通用内存屏障，不能保证非volatile访问排序。专用置位/复位可避免某些输出操作先读ODR，不能推出协议、多对象或任意共享内存线程安全。

## 历史RM0008核对卡 {#reference-rm0008}

仅ST RM0008，June2009，DocID13902 Rev9，不是最新版本/勘误或板级签核。料号、引脚、时钟、模式与复位条件另核，无地址解引用或目标驱动。

- IDR p149 §8.2.3：低16位只读输入观察、Word mode only（32位）；高16位保留读0，不推导非法写行为。
- ODR p150 §8.2.4：低16位输出锁存读写、Word mode only；高16位保留读0。锁存不证明电压/电流，模式、复用、负载、连线仍适用；读0不授权乱写保留位。
- BSRR p150 §8.2.5：写方向、Word mode；低BS半写1设置ODR，高BR半写1复位，两半0均不动作；同位同时选择时设置优先。原子性限文档的ODR位设置/清除，不覆盖任意C表达式或协议。
- EXTI_PR p180 §9.3.6：实现位rc_w1，选定边沿设pending，写1或改边沿敏感度清除。31:20保留须保持0；19仅connectivity line，其他器件保留，具体料号实现位另核。该版复位值undefined，不能假定启动0；不可全1通用确认。访问宽度按该外设总线/寄存器规定复核，不能由八格图选字节访问。

检查顺序：目标/版本 → 宽度/方向 → 实现位/保留位/脚注 → 表达式。新事件与清除同时发生的行为须查器件，模型未模拟。

## C11接口与拒绝合同 {#reference-c-contract}

<a href="../examples/c-bits-registers/bits.c" download>bits.c</a>、<a href="../examples/c-bits-registers/README.txt" download>运行说明</a>、[完整源代码](c-bits-registers.html#c-source)。要求C11与可选uint32_t，缺失编译报错。width1..8，value/mask/data在宽度内；只用已定义BitsOp/BitsAccess。

| 接口 | 合同 |
| --- | --- |
| bits_apply | set/clear/toggle/invert |
| bits_field | offset&lt;width，length1..width-offset |
| bits_shift | count&lt;width，结果裁剪 |
| bits_write | 虚构RW/RO/W1C |
| bits_bad_rmw | BitsTrace记录0/2/1/1和3/3/0/2 |

BITS_OK/BITS_INVALID；所有拒绝保持输出，NULL先拒绝。非NULL仍须真实、存活、可写、类型正确；不能验证伪造/悬空指针。无符号参数收到转换后的负值也须域检查拒绝。无动态分配、硬件访问或共享状态。

BITS_TEST启用main，普通条件验收在NDEBUG下仍有效；不定义则无main。严格C11 -Wall -Wextra -Werror -pedantic；普通与-DNDEBUG运行，另-c模块编译。工程经mcu-build custom profile validate → dry-run → build。固定值与哨兵222验证正常、端点、NULL、未知模式。宿主成功不代表目标固件/硬件成功。测试成功行显式刷新stdout，写或刷新失败返回非零。

本份源实际已用既有GCC13.1.0通过严格编译、普通/NDEBUG运行和模块编译，退出码均0；[完整章记录源SHA-256](c-bits-registers.html#c-host-lab)。这不代表目标固件、硬件、浏览器或远端发布验证。

## 合上速查再回忆 {#reference-recall-heading}

<details id="reference-recall"><summary>八位value3、W1C只确认bit0，应写什么？为什么不用OR赋值？</summary><p>直接写1留下2；读3再OR1写3会把两个pending都清掉。真实器件仍查实现位、保留位、宽度与同时事件规则。</p></details>

隔天换0x81和mask0x03重写三列记录，解释两类错误。可向助手追问“提升后位宽”或“写数据与状态差别”；不保存答案或推断掌握。

## 推荐来源与继续阅读 {#reference-sources}

[WG14 N1570，2011-04-12委员会草案](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)：推荐先读§6.5.7移位；§6.3.1.1/3提升/转换、§6.5.3.3按位取反、§6.5.10–12位运算、§6.7.3限定符、§7.20.1.1精确宽类型。不是最终ISO文本，不定义外设。

[GCC13.1 §6.46 volatile](https://gcc.gnu.org/onlinedocs/gcc-13.1.0/gcc/Volatiles.html)：版本特定访问/排序，不证明RMW原子性。[ST RM0008 Rev9历史原厂PDF](https://www.keil.com/dd/docs/datashts/st/stm32f10xxx.pdf)：June2009 p149/p150/p180上述条款；实际工程查当前料号文档/勘误。未做硬件验证。

[完整章](c-bits-registers.html) · [下一章：C对象与边界](c-objects-bounds.html) · [学习地图](engineering-map.html#stage-01)
