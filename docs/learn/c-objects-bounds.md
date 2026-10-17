---
title: C 对象、指针与边界
description: 对象、跨度、生命周期与受检 little-endian 解码。
---

第 04 单元 · C 基础

# C 对象、指针与边界 {#objects-title}

从“地址像是正确的”走到一张可解释的对象审计记录。

板卡无关C11 与固定字节模型未做硬件验证先证明可以读，
再解释读出的数。

对象活着 + 类型适合 + 范围真实。长度不是存储凭证，终点不是元素。

## 从输出意图走到可信的字节 {#learning-path-title}

第 03 单元已经把寄存器写入拆成读值、写入数据和结果。本单元回到 C：采集终端拿到一段字节后，先证明对象仍存在、范围真实，再解出一个数。数值看起来正常，并不能倒过来证明一次读取合法。

前置：能读简单数组、函数调用和无符号数。本单元产物：一张对象审计记录（对象/类型/范围/生命周期/操作/结论），以及一条成功或拒绝的 read_le16 记录。无需购买开发板。

分三次完成：① 用约 8 分钟区分对象与指针并审计一格；② 用约 10 分钟解两个字节并检查失败；③ 离开模型做十题，隔一天换一组字节重新说明原因。时间只是建议，练习覆盖不等于长期掌握。

[对象与格子](#object-vocabulary)[跨度约定](#span-contract)[受检解码](#decode-contract)[十题回忆](#practice)[来源](#sources)

## 01 · 先说清楚：对象、值、类型与地址 {#object-vocabulary-title}



对象（object）是程序执行环境中的一块数据存储区域，它的内容可以表示值。值是解释后的内容，例如无符号数 18；类型规定访问时如何解释内容以及允许的操作。`uint8_t sample = 0x12;` 中，sample 是对象的名字，0x12 是初始值，uint8_t 是这里要求存在的精确八位无符号类型。



指针值在类型与生命周期规则下指向对象、函数，或允许的终点；它自身也可以存储在一个指针对象里。`&sample` 取得指向 sample 的指针；`*p` 通过 p 指定目标对象。纸上的“地址 0x1001”只是教学位置标记，不能凭这个数字制造一个合法、对齐且活着的 C 对象。



存储期（storage duration）决定存储保留的方式；生命周期（lifetime）是执行过程中保证为该对象保留存储的那段时间。自动存储期对象通常随所在块执行而生灭；静态存储期对象持续整个程序执行。C 还区分线程和分配存储期，本章不展开。它们不是语言承诺的“栈区/堆区地址表”。



自动对象所在块结束后，不能继续使用指向它的旧指针；原目标或其 one-past 目标生命周期结束时，相关指针值变为不确定。即使调试画面还留着字节，也没有继续读取许可。[N1570 §3.15、§6.2.4](#source-n1570)支持这些对象与生命周期规则。



随手产物：写“对象 sample；类型 uint8_t；值 0x12；生命周期内可访问；地址画法不提供额外保证”。先把四栏分开，再看下面的格子。

## 02 · 在格子上做一次完整审计 {#memory-audit-title}

图中的完整声明是活着的 `uint8_t frame[4]`，`frame = {0x34, 0x12, 0xA0, 0x00}`。下表的地址仅为虚构位置标记，不是真实 ABI 或指针转储：

| 数组元素 | 虚构地址 | 已初始化的字节值 |
| --- | --- | --- |
| frame[0] | 0x1000 | 0x34 |
| frame[1] | 0x1001 | 0x12 |
| frame[2] | 0x1002 | 0xA0 |
| frame[3] | 0x1003 | 0x00 |

虚构标记 `0x1004` 只表示该数组的 one-past 终点，不是 frame 元素，不能读取成第五个字节，也没有可展示的读取值。

原创格子只假定：CHAR_BIT=8，uint8_t 存在，四个元素连续、已初始化且生命周期有效。它们是四个独立字节，不需要主机大小端假设。另一对象的邻接不会把 frame 变长。

### 一起做：读取 frame[1] {#grid-worked}

对象是图中真实存在的四元素数组；读取的类型是 uint8_t；索引 1 落在 0..3；生命周期仍有效。因此 `frame[1]` 的值为声明的 `0x12`，十进制 18。结论来自这五个前提，不是来自“0x1001 看起来像地址”。

`frame + 4` 则只形成数组末尾后一个位置，叫 one-past。它可作遍历终点，不能读取成第五个元素。`frame + 5` 的形成已经超出允许范围；不能说“只要没解引用就总安全”。

### 同一数组是指针运算的范围 {#same-array}

同一活数组中，`(frame + 4) - frame` 得 4，因为两个端点均在该数组/one-past 范围，差值还须可由 ptrdiff_t 表示。不要对两个无关数组做指针相减，也不要把整数地址相减冒充这种规则。单独对象在这些运算中按长度为 1 的数组处理。

[N1570 §6.5.6 ¶7–9](#source-n1570)同时约束形成、解引用与相减。先问“是否同一数组”，再问“操作落在哪个元素或终点”。



### 静态对照：指出禁止的是哪一步 {#invalid-operation-table}

 | 固定场景 | 结论 | 因果理由

 | 活 frame[4]，frame[1] | 读取 0x12 | 有效元素、类型匹配、仍活着。

 | 活 frame[4]，仅形成 frame+4 | 只形成终点 | one-past 不是元素。

 | 活 frame[4]，读取 frame[4] | 没有定义好的 C 读取结果 | 解引用了 one-past。

 | 活 frame[4]，形成 frame+5 | 没有定义好的 C 结果 | 形成已越过允许范围。

 | p=NULL，执行 *p | 没有定义好的 C 读取结果 | 空指针没有指向对象。

 | 自动对象已结束生命周期，想沿旧指针读 | 不能继续求值/读取旧指针 | 指针值已变为不确定；旧字节画面没有许可。

 | 把字节数组转成 uint16_t* 并读 | 不能批准该宽类型读取 | 转型不建立 uint16_t 对象、访问类型或对齐保证。

## 03 · 先预测允许的操作，再显示分类 {#grid-lab-title}

下列活动只分类声明的规则场景，绝不执行所列非法 C。输入只允许列表中的七例；格子仍是上一段活着的 frame[4]，除非场景明确改成空指针或过期对象。先选“读元素 / 只形成终点 / 不能执行”，提交后再检查理由。

审计场景（七个固定前提）活 frame[4]：读取 frame[1]活 frame[4]：仅形成 frame+4活 frame[4]：读取 frame[4]活 frame[4]：形成 frame+5p=NULL：读取 *p自动对象已结束：再用旧指针读字节数组：转换 uint16_t* 后读取

你的预测（选后才能应用）先独立预测只形成终点不允许执行可读取元素

待应用：尚未显示本次分类。

应用并解释重置本活动

JavaScript 关闭：请在上一段的七行完整对照表上先遮住结论，独立写原因，再核对；非法场景没有读取数值。

## 04 · 指针、长度和生命周期必须同时成立 {#span-contract-title}

接口收到 `input` 和 `length`，并没有收到能自动验证存储的凭证。span 在这里指“起点指针 + 真实可读长度”的接口约定：调用者保证 input 来自真实、活着、可访问的字节数组，length 不超过从该起点起可读的连续字节数；可以只交出更短前缀。空指针检查与数值范围检查不能鉴别任意伪造指针、悬空指针或谎报长度。



### 数组 sizeof 与函数参数不是一回事 {#sizeof-array-pointer}

```c
uint8_t bytes[4] = { 0x7E, 0x34, 0x12, 0xFF };
/* 在本作用域：sizeof bytes == 4；sizeof bytes[0] == 1。 */
void inspect(const uint8_t bytes[4]);
/* 参数声明会调整为 const uint8_t *；这里的 [4] 不传递数组大小。
   在函数体内 sizeof bytes 量的是指针类型，不是调用者数组。 */
```



数组表达式在多数场合转换为首元素指针；sizeof 数组时保留数组类型。普通数组形参会调整为指针形参，长度须显式传入；不要用 sizeof 参数恢复调用者容量。[N1570 §6.3.2.1、§6.5.3.4（含脚注 103）、§6.7.6.3 ¶7](#source-n1570)给出这几条不同的规则。本例没有采用形参 static 最小长度约定。



### size_t、零长度与算术顺序 {#zero-and-size}

`size_t` 是 sizeof 结果使用的无符号整数类型。它多宽、指针有多大，都不是固定的“MCU 常数”。在本章 decoder 中 length=0 表示空跨度，必定拒绝读取两个字节；NULL 也必定拒绝。零长度不会使 `NULL + 0` 成为允许的指针运算。



无符号尺寸减法会回绕：当 offset>length 时，先算 length−offset 可能得到很大的数。因此先判断 `offset > length`，再求剩余字节；同样不用 `offset + 2 <= length` 当唯一守卫，因为加法可能回绕。范围证明完成后才索引，保证 offset+1 本身也不会溢出。[§7.19、§6.5.6 与无符号规则](#source-n1570)支撑这里的类型和范围条件。



### const / volatile 都不能补齐缺少的对象 {#qualifier-limits}

`const uint8_t *input` 限制通过这条访问路径修改字节，不延长生命周期、不证明地址有效，也不保证别处没人修改。对象若本来定义为 const，绕开限定强行写它是未定义行为。

`volatile` 涉及实现对可观察访问的处理，不提供所有权、数组边界、原子性或线程同步。GCC 13.1 文档还明确普通内存访问不会仅因旁边有 volatile 就获得所需顺序；本模块不用 volatile。调用期间字节必须稳定，外部并发写入要由另一个明确协议解决。参见 [GCC 13.1 §6.46](#source-gcc)与 [N1570 §6.7.3](#source-n1570)。

## 05 · 存储布局不能替代线格式 {#wire-representation-title}

对齐是某类型对象可以放置和访问的位置要求；填充 padding是实现可能留在结构成员之间或末尾的额外空间。成员声明顺序有规则，却不保证紧挨着；对象表示、类型宽度和主机字节序也有实现条件。把一个缓冲区转成宽整数指针，不会自动满足类型与对齐。

### 明确虚构布局：结构不是三字节报文 {#padding-example}

```c
struct Reading { uint8_t tag; uint16_t value; };
/* 只为作图选的假布局：tag@0，padding@1，value@2..3，sizeof=4。
   不是实际编译器的布局断言；padding 的内容不作为协议数据。 */
```

即使某次主机观察刚好得到四字节，也不能把 `sizeof(struct Reading)` 个原始字节当可移植报文。实现可能有不同对齐与填充，填充值不承诺；little-endian（低有效字节先）与 big-endian（高有效字节先）是线格式必须显式约定的顺序。[N1570 §6.2.6、§6.7.2.1 ¶14–17](#source-n1570)只支撑语言布局条件，不批准任何特定 ABI。



### 手算一次：低字节 34，高字节 12 {#decode-worked}

线格式声明：每字节八位，两字节表示无符号 little-endian 数。字节 `0x34,0x12` 组成 `0x12 × 256 + 0x34 = 0x1234 = 4660`；若线格式改成 big-endian，同样两字节会表示 0x3412。要按协议选顺序，不能根据主机字节序猜。

完整调用例：真实且活着的 `frame={0x7E,0x34,0x12,0xFF}`，length=4，offset=1，另一个活 uint16_t 输出对象初值 0xBEEF。先看 1≤4，再算剩余 3≥2，最后读取索引 1 和 2，成功写 0x1234。offset=3 只剩一字节，拒绝并保留 0xBEEF。注意这里的 frame 与格子活动是两组明确独立的字节。

## 06 · read_le16：先拒绝，再索引，最后写输出 {#decode-contract-title}

接口 `bool read_le16(const uint8_t *input, size_t length, size_t offset, uint16_t *output)` 只承担两个字节的受检解码。调用者前提：真实、活着、类型适合且可读的 input 字节数组，真实 length；另一个独立、活着、对齐正确且可写的 uint16_t output 对象，不能与输入存储重叠。输入在调用期间保持稳定。它不能替调用者验证伪造或悬空指针，也不建立并发协议。

此示例要求 CHAR_BIT=8 且 uint8_t / uint16_t 精确宽度类型存在；这些类型在 C11 中是有条件提供的。本源码在不支持的实现上用 #error 报告前提不成立，而不假装所有 C 机器都适用。

- 先检查 input / output 是否 NULL，及 offset 是否超过 length；任何一个失败直接返回 false。
- 已证 offset≤length 后才做 `length-offset<2` 判断；零长度、短跨度、终点处均拒绝，无输入读取。
- 通过后读取两个字节，用 unsigned int 拼接。它至少能表示 0..65535；左移 8 前先转为此无符号类型，避免小类型提升与有符号中间值的陷阱。
- 完整值就绪后才写 *output 并返回 true。所有 false 路径保留旧输出，调用者必须检查 bool，不能把旧输出误认作新帧。

 | 每行输出先置 BEEF；真实输入 | length / offset | 状态与输出（十六进制）

 | 34 12 | 2 / 0 | true → 1234

 | 7E 34 12 FF | 4 / 1 | true → 1234

 | 7E 34 12 FF | 4 / 2 | true → FF12

 | 00 FF | 2 / 0 | true → FF00

 | FF FF | 2 / 0 | true → FFFF

 | 34 12，交出空前缀 | 0 / 0 | false → BEEF

 | 真实单字节 34 | 1 / 0 | false → BEEF

 | 34 12 | 2 / 1、2、3 或 SIZE_MAX | false → BEEF（每个 offset 分别调用）

 | NULL 输入 | 0 / 0 或 2 / 0 | false → BEEF，无读取

 | 34 12，output=NULL | 2 / 0 | false，没有输出对象可写

SIZE_MAX 测试只作为对真实小对象的过大 offset；没有把微小数组配上虚构巨大 length，也没有形成越界或悬空指针去试探函数。NULL 是接口显式接纳的拒绝值，其他无效指针不能因此被当作安全故障输入。

## 07 · 先预测一次解码，再检验旧值是否保留 {#decode-lab-title}

固定的真实跨度模型为四个已初始化字节 `7E 34 12 FF`；length 是它的可读前缀，范围 0..4。offset 是非负安全整数或字面词 SIZE_MAX（只代表一定超过这段长度的偏移，不模拟主机 SIZE_MAX 宽度）。输出模型起点 BEEF，成功后成为新值，拒绝后仍是上次值。input=NULL / output=NULL 仅模拟本接口已定义的拒绝条件。

可读前缀 length（整数 0..4）

offset（非负安全整数或 SIZE_MAX）

输入指针条件活着的字节数组明确的空指针值

输出指针条件（独立对象）活着的独立输出明确的空指针值

你的预测先独立预测成功并写结果拒绝并保留值

待应用：尚未显示本次解码。

应用并核对重置本活动

调用后模型输出：

无脚本时，使用上一段固定表并在每次调用前写出输出旧值；这些静态步骤已包含正常、终点、空指针和极大偏移，不需要运行非法 C。

## 08 · 四类整数规则，不能混成一个“溢出” {#integer-categories-title}

整数提升：小整数在某些表达式中先转成 int（若能表示全部原值），否则转成 unsigned int。uint8_t 变量不保证每个中间结果都只有八位。解码模块在移位前主动转成 unsigned int，使计算类型与范围可说明。

定义好的无符号转换：在本例精确八位 uint8_t 存在时，`(uint8_t)-1` 按模 256 转换，结果 255；这不是“执行有符号溢出后截断”。无符号尺寸运算也按自身范围回绕，故需要前述检查顺序。

有符号算术溢出：例如 int 已为 INT_MAX 再执行 +1，结果不可表示，没有定义好的 C 结果。本课只分类，不执行它，也不给一个固定的负值。

超范围转成有符号类型：例如本例存在 int8_t 时把 255 转成 int8_t，C11 允许实现定义的结果，或引发实现定义的信号。这不同于无符号模转换，也不同于有符号算术溢出。不能把本机观察的 −1 宣称为所有 C11 实现的唯一结果。

依据：[N1570 §6.3.1.1、§6.3.1.3 ¶1–3、§6.5 ¶5](#source-n1570)。下载测试只执行定义好的 uint8_t 负数转换；没有“用 UB 跑出来的标准答案”。

## 09 · 下载并复现同一个 C11 模块 {#portable-c-title}

下面是下载文件里完整的可复用模块部分，和实际编译的实现一致；`OBJECTS_TEST` 宏才启用文件后面的测试 main，不定义时没有 main。检查由 if/return 执行，NDEBUG 不会移除失败验证。它不分配存储、不读取硬件，也不是完整 MCU 工程。

<a href="../examples/c-objects-bounds/objects.c" download>下载 objects.c（模块与测试）</a> · <a href="../examples/c-objects-bounds/README.txt" download>下载完整操作说明</a>

```c
/******************************************************************************
 * @file objects.c
 * @brief Original, board-independent C11 byte-decoding teaching module.
 * @version V1.0 2026-10-17
 * Ownership and licensing follow the repository; no vendor affiliation claimed.
 *****************************************************************************/
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <limits.h>

#if CHAR_BIT != 8 || !defined(UINT8_MAX) || !defined(UINT16_MAX)
#error "This example requires eight-bit bytes, uint8_t and uint16_t."
#endif

/**
 * @brief Decode two little-endian bytes within a truthful live input span.
 * @param[in] input Real readable byte array; length must not exceed its extent.
 * @param[in] length Truthful accessible byte count from input; zero is empty.
 * @param[in] offset Byte index to the first of the two required bytes.
 * @param[out] output Distinct live writable uint16_t object, outside input storage.
 * @return true on success; false preserves output and does not read input.
 * Null arguments are rejected. Non-null pointer validity, lifetime, alignment,
 * truthful extent and distinct output ownership remain caller preconditions.
 */
bool read_le16(const uint8_t *input, size_t length, size_t offset, uint16_t *output)
{
    /** Establish bounds before subtraction, indexing or pointer arithmetic. **/
    if (input == NULL || output == NULL || offset > length) {
        return false;
    }
    if (length - offset < 2U) {
        return false;
    }
    /** Cast before shifting: unsigned int can represent at least 0..65535. **/
    *output = (uint16_t)((unsigned int)input[offset]
                       | ((unsigned int)input[offset + 1U] << 8U));
    return true;
}
```



### 复现步骤与证据范围 {#c-run-steps}

使用已安装且支持这些前提的 C11 编译器。仓库维护者通过 mcu-build 的 custom profile 依次 validate → dry-run → build，保存实际命令、退出码、源码与产物哈希，再运行测试程序；编译器命令如下，按本地现有工具名配置 profile，不把机器路径写进课程。

```c
cc -std=c11 -Wall -Wextra -Werror -pedantic -DOBJECTS_TEST objects.c -o objects-test
cc -std=c11 -Wall -Wextra -Werror -pedantic -DOBJECTS_TEST -DNDEBUG objects.c -o objects-ndebug
cc -std=c11 -Wall -Wextra -Werror -pedantic -c objects.c -o objects.o
```

运行前两个程序（Windows 使用产生的 .exe 文件）。成功消息为 `PASS objects C11: 5 successful reads, 9 rejections, unchanged sentinels, unsigned conversion.`；任一检查失败返回非零并列出 FAIL 案例。诊断 fprintf 失败仍返回失败，成功消息 puts 失败也返回非零；puts 成功后立即检查 fflush(stdout)，缓冲输出失败仍返回非零；输出 API 返回值均立即检查。输出用例与上一表相同，还检查所有失败哨兵。独立编译 -c 验证模块不依赖测试入口。

本地使用 GCC 13.1.0 完成严格普通、NDEBUG 与模块编译，并运行前两者。这个证据只覆盖所列宿主 C11 输入；浏览器模型单独验证其交互。未做硬件验证：没有烧录、目标 ABI、真实寄存器、ISR、DMA、RTOS 或并发测试。

## 10 · 十题：基础、故障和迁移 {#practice-title}

先合上结果，在纸上写“结论 + 缺少或满足的前提”，再展开解析；每题的完整输入都在题目里。可请 Agent 针对“one-past 为何不能读”或“旧输出为何不能当新数据”等具体困惑继续解释。隔一天换字节和偏移重做，覆盖本页不构成个人掌握记录。

“只打印题目”依赖 JavaScript，隐藏答案、已应用结果和前文解题；普通浏览器打印会展开解析，打印结束恢复原折叠。若题目打印调用失败，也清理临时模式并恢复折叠。无脚本仍可阅读全文与原生 details 解析，普通打印不必依赖活动。

展开全部答案折叠全部答案只打印题目

C 对象、指针与边界 · 空白练习单。每题写结论、原因和下一条检查。

### 01 · 对象和地址不是同一栏 {#question-01}

给定活着且已初始化的 uint8_t sample=0x12，纸上把它画在虚构 0x2000；p=&sample。分别说出对象、值、类型，以及 p 指向什么。能仅拿整数 0x2000 当成可读对象吗？

展开本题原因

对象是 sample 的数据存储，值为 0x12（18），类型为 uint8_t，p 指向 sample。整数标记不证明存储、对齐、访问类型或生命周期，不能因此批准读取。

### 02 · 终点允许做什么 {#question-02}

给定活 uint8_t a[4]={0x10,0x20,0x30,0x40}。分别分类 a[3]、仅形成 a+4、读取 a[4]、仅形成 a+5；非法项不要写猜测读值。

展开本题原因

a[3] 读取 0x40；a+4 只形成允许的 one-past；a[4] 解引用终点，不存在定义好的读取结果；a+5 的形成就越界。判断单位是同一数组，不是碰巧相邻的地址。

### 03 · 相邻数组也不能相减 {#question-03}

给定两个独立活数组 uint8_t a[4] 与 b[4]，全已初始化。画图时 b 恰在 a 后。比较 (a+4)-a 与 b-a；假设前者差值可由 ptrdiff_t 表示。

展开本题原因

前者是同一数组内的端点相减，得 4；b-a 不符合相同数组/one-past 前提，不能由相邻画图得到定义好的差值。不要改用整数地址差冒充指针差。

### 04 · 指针不保存数组容量 {#question-04}

调用者 uint8_t bytes[4]={1,2,3,4}，接口 void inspect(const uint8_t bytes[4])。调用者所在作用域 sizeof bytes 与函数体内 sizeof bytes 各量什么？主机指针宽度未给。

展开本题原因

调用者量完整数组，得 4 个 C 字节；函数形参已调整为指针，量的是该指针类型大小，题目不能给一个通用数字。长度须另传，参数 [4] 不是数组容量证明。

### 05 · 零长度不能授权空运算 {#question-05}

本章 read_le16，input=NULL，length=0，offset=0；另一个活 uint16_t output 初值 BEEF。应返回什么、输出什么？能否先算 input+offset 再判断？

展开本题原因

返回 false，output 保持 BEEF，没有输入读取。先拒绝 NULL，不能用“加零”给空指针制造合法数组运算。长度为零意味着无字节可读。

### 06 · 过期对象与 const {#question-06}

块内 const uint8_t local[2]={0x34,0x12}，保存指向 local 的指针；块已经结束。有人说 const 使数据不变所以仍可读。应检查哪项，能否给一个固定结果？

展开本题原因

生命周期已结束，指向原对象或其终点的指针值变为不确定，不能继续沿旧指针读取。const 不延寿，也不把画面里残留字节变成结果；不给固定值。

### 07 · 非零偏移的成功记录 {#question-07}

真实活 uint8_t frame[4]={0x7E,0x34,0x12,0xFF}，另一个独立活输出初值 BEEF；length=4，offset=1，little-endian，八位字节。列检查顺序、索引、返回和输出。

展开本题原因

先检查非空与 1≤4；再算 4−1=3≥2；读索引 1、2，0x12×256+0x34=0x1234；返回 true，输出 1234。不能按主机顺序转型读取。

### 08 · 巨大偏移不要先加二 {#question-08}

真实活 uint8_t pair[2]={0x34,0x12}，length=2，offset=SIZE_MAX；独立活输出 BEEF。本章实现先判 offset>length，另一实现只判 offset+2<=length。谁有足够守卫？

展开本题原因

本章先拒绝过大 offset，返回 false，输出 BEEF；另一守卫的无符号 offset+2 会回绕，可能让检查失效。不能执行随后潜在越界读取；没有伪造巨大 length。

### 09 · 结构布局迁移到报文 {#question-09}

某假实现 struct {uint8_t tag; uint16_t value;} 的布局为 tag@0、padding@1、value@2..3、sizeof=4。协议要求 tag 后紧跟 little-endian 两字节。能直接发送结构原始四字节吗？

展开本题原因

不能作为可移植的三字节线格式：有填充，主机字节序和表示还可能不同。应按协议逐字段编码；解码用八位无符号字节拼接，不用未证明类型与对齐的宽指针转型。

### 10 · 把三种结果类别分开 {#question-10}

假设 uint8_t、int8_t 存在。只分类：(uint8_t)-1；int x=INT_MAX 后执行 x+1；把整数 255 转成 int8_t。不执行后两者，哪项有通用数值，哪项没有？

展开本题原因

第一项定义好按模 256，得 255；第二项是有符号算术溢出，未定义行为；第三项超范围转为有符号类型，C11 为实现定义的结果或实现定义的信号。不能统一说成截断为 −1，也不能用一次本机运行替代规则。

## 来源、首读任务与验证边界 {#sources-title}

核对日期：2026-10-17。文字、地址格子、协议字节、分类场景和练习均为原创教学设计；技术来源只支撑各自列出的规则。

- [WG14 N1570，2011-04-12 公开 Committee Draft](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)：§3.15 对象；§6.2.4 生命周期；§6.2.5 ¶9 无符号计算；§6.2.6 表示；§6.3.1.1 / §6.3.1.3 提升及转换；§6.3.2.1 / §6.3.2.3 数组与指针；§6.5 ¶5–7 溢出与访问类型；§6.5.3.4 sizeof；§6.5.6 同数组/终点；§6.7.2.1 ¶14–17 结构对齐及填充；§6.7.3 限定；§6.7.6.3 ¶7 参数调整；§7.19 size_t / ptrdiff_t；§7.20.1.1 精确宽度类型。已按实际条款核对，不宣称持有最终 ISO 出版物或最新标准。
- [GCC 13.1 文档 §6.46](https://gcc.gnu.org/onlinedocs/gcc-13.1.0/gcc/Volatiles.html#Volatiles)：已读这一版本关于 volatile 访问与普通内存顺序的限制；它不保证全部 MCU、外设或并发行为。

建议先读：N1570 §6.5.6 ¶8–9，把 same array 与 one past 两个条件圈出，再对照第 02 段。然后读 §6.3.1.3，分开无符号转换与有符号超范围转换。原文有困难时，可请 Agent 逐句解释本章已列的条件。

JavaScript 只做规则分类与固定四字节算术，不运行 C 或验证任意指针。宿主 C 测试只证明上述有效对象与拒绝输入；没有验证真实 MCU、ABI、缓存、ISR、DMA、RTOS、并发或电气时序。未做硬件验证。本站不保存答案或个人进度。

## 把解码结果交给下一个有界模块 {#next-lesson-title}

完成对象审计和解码记录后，继续第 05 单元：让接受的字节进入单执行上下文有界 FIFO。长度约束解决不了队列状态一致性，volatile 也不能让它自动用于中断。06–09 的构建与启动知识在后续批次，定时器仍在单元 10。

[对象与边界速查](c-objects-bounds-reference.html)[上一单元：位与寄存器](c-bits-registers.html)[下一单元：有界 FIFO](bounded-fifo.html)[回到工程地图](engineering-map.html#stage-01)
