---
title: C 对象、指针与边界速查
description: 对象、跨度、生命周期与受检 little-endian 解码。
---

第 04 单元 · C 基础

# C 对象、指针与边界 · 速查 {#objects-title}

先查对象是否可用，再查两个字节是否足够。

板卡无关C11 与固定字节模型未做硬件验证先证明可以读，
再解释读出的数。

对象活着 + 类型适合 + 范围真实。长度不是存储凭证，终点不是元素。

## 一张审计记录，五个必填项 {#reference-scope-title}

对象是哪块真实存储；类型与对齐是否适合；允许的起点和长度；生命周期是否仍有效；要做的是形成、读取、写入还是相减。非空不是有效性证明，length 也不是存储证明。这里压缩第 04 单元条件，完整解释与静态练习见[章节](c-objects-bounds.html)。



## 对象和指针：把终点与元素分开 {#reference-rules-title}

### 生命周期 {#reference-lifetime}

对象是可表示值的存储区域；值、类型、指针与纸上地址是不同概念。存储期决定生命周期；自动对象随块结束而过期，相关旧指针值变为不确定。const 不延寿，volatile 不提供所有权、边界、原子性或同步。

### 同数组和 one-past {#reference-endpoint}

活 uint8_t a[4]={10,20,30,40}：a[3] 读 40；a+4 可形成终点，不能解引用；a+5 的形成即越界。仅同数组/one-past 指针可相减，结果须可由 ptrdiff_t 表示。禁止操作没有通用读值，不执行它来造答案。

### sizeof 与 size_t {#reference-size}

sizeof 数组保留其完整字节数；普通数组形参调整为指针，sizeof 形参量指针类型。size_t 为无符号尺寸类型，宽度与指针大小均依实现。零长度在本解码器中必拒绝；NULL+0 不获许可。

### 布局与线格式 {#reference-layout}

结构成员有对齐要求，可有中间/末尾 padding；主机表示与字节序不是协议。虚构 tag@0、padding@1、value@2..3、sizeof=4 不是 ABI 保证。不要发原始结构替代显式线编码，也不要未证明类型与对齐就宽指针读取。



## read_le16：唯一成功写出结果 {#reference-decoder-title}

```c
bool read_le16(const uint8_t *input, size_t length,
               size_t offset, uint16_t *output);
```

前提：CHAR_BIT=8，uint8_t 与 uint16_t 存在；input 来自真实活着的可读字节数组，length 是真实可访问范围，调用期间字节稳定；output 为独立、活着、对齐正确且可写的 uint16_t 对象，与输入存储不重叠。NULL 显式拒绝，但不能验证其他伪造/悬空指针或谎报长度；不建立并发协议。

- input 或 output 为 NULL，或 offset>length：false，不读输入、不写输出。
- 先证 offset≤length，再判断 length−offset<2；不足两字节就 false，输出保持。
- 按八位字节拼接，移位前转 unsigned int；完整值就绪才写 *output 并 true。

不使用 offset+2 当唯一守卫，避免无符号回绕；没有真实巨大对象就不要伪造 length。无效生命周期、宽类型错配和越界解引用不能靠返回 false 兜底。

### 手算与失败哨兵 {#reference-fixtures}

每次独立输出初值 BEEF：34 12，length2/offset0 → true/1234；7E 34 12 FF，4/1 → true/1234，4/2 → true/FF12。00 FF → FF00；FF FF → FFFF。低字节 34 + 高字节 12×256 = 1234；big-endian 同两字节为 3412。

真实 pair[2]={34,12}：0/0、2/1、2/2、2/3、2/SIZE_MAX 都 false/BEEF；真实单字节 {34} 的 1/0 也失败。NULL 输入在 0/0 和 2/0 都 false/BEEF；NULL 输出 false、无输出对象可写。SIZE_MAX 只作过大 offset，测试不构造越界或悬空指针。

<a href="../examples/c-objects-bounds/objects.c" download>完整 objects.c（宏控测试 main）</a> · <a href="../examples/c-objects-bounds/README.txt" download>编译与运行说明</a>。使用现有 C11 编译器，通过 mcu-build custom profile validate → dry-run → build；普通与 NDEBUG 可执行测试、独立 -c 编译。所有失败检查用 if/return，不依赖 assert；诊断 fprintf 失败和成功消息 puts 失败都返回非零；puts 成功后也检查 fflush(stdout)，缓冲输出失败仍返回非零。章节展示与编译同一模块。



## 整数规则速辨 {#reference-integers-title}

整数提升：小整数先转 int（可表示全部值时），否则 unsigned int；八位对象不代表八位中间计算。精确 uint8_t 存在时 (uint8_t)-1 按模256得255；这是定义好的转换。有符号 INT_MAX+1 算术溢出没有定义好的 C 结果。255 转 int8_t 超范围时，C11 为实现定义的结果或实现定义的信号；不能把本机 −1 当通用结果。只执行定义好的案例。



## 合上速查再答两问 {#reference-recall-title}

4 字节 frame，offset=3，为何拒绝？

在指针有效且 length=4 的前提下，剩余 4−3=1，不足两个；false，输出旧值保持。合法形成 frame+4 也不能补出第五字节。

const 加长度检查，能让过期对象恢复吗？

不能。限定不延寿，长度也不保留存储。生命周期结束使相关旧指针值不确定；本接口只对有效调用者前提内的输入给出成功/拒绝契约。



## 来源和边界 {#sources-title}

核对日期：2026-10-17。文字、地址格子、协议字节、分类场景和练习均为原创教学设计；技术来源只支撑各自列出的规则。

- [WG14 N1570，2011-04-12 公开 Committee Draft](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)：§3.15 对象；§6.2.4 生命周期；§6.2.5 ¶9 无符号计算；§6.2.6 表示；§6.3.1.1 / §6.3.1.3 提升及转换；§6.3.2.1 / §6.3.2.3 数组与指针；§6.5 ¶5–7 溢出与访问类型；§6.5.3.4 sizeof；§6.5.6 同数组/终点；§6.7.2.1 ¶14–17 结构对齐及填充；§6.7.3 限定；§6.7.6.3 ¶7 参数调整；§7.19 size_t / ptrdiff_t；§7.20.1.1 精确宽度类型。已按实际条款核对，不宣称持有最终 ISO 出版物或最新标准。
- [GCC 13.1 文档 §6.46](https://gcc.gnu.org/onlinedocs/gcc-13.1.0/gcc/Volatiles.html#Volatiles)：已读这一版本关于 volatile 访问与普通内存顺序的限制；它不保证全部 MCU、外设或并发行为。

建议先读：N1570 §6.5.6 ¶8–9，把 same array 与 one past 两个条件圈出，再对照第 02 段。然后读 §6.3.1.3，分开无符号转换与有符号超范围转换。原文有困难时，可请 Agent 逐句解释本章已列的条件。

GCC 13.1.0 宿主严格普通/NDEBUG/模块编译及固定 C 用例已验证；这与 JavaScript 分类模型分开。未做硬件验证：没有烧录、目标 ABI、ISR、DMA、RTOS、真实并发或外设证据。无脚本仍可读全部规则与原生解析，普通打印展开解析并恢复原折叠；本站不保存个人作答。

[回完整章节](c-objects-bounds.html)[下一单元：有界 FIFO](bounded-fifo.html)[学习地图](engineering-map.html#stage-01)
