---
title: GPIO 按键速查：电平、采样与事件
description: 上下拉、11/31/41ms人工示例、启动与时间契约、可下载C11状态机和验证边界。
---

# GPIO 按键：电平、采样与事件 {#reference-overview}

压缩参考，零基础先读[完整首章](gpio-button.html#zero-entry)。不绑定开发板；人工输入与主机实验不等于硬件验证。

## 先沿电路，再看观测与事件 {#quick-reference}

GPIO 输入观察节点；输出由程序控制驱动电路，具体模式留后续。本章只用数字输入。电压相对本电路 GND，VIO 为该输入允许的 I/O 电源。高阻不等于零电流；悬空不保证高低，也不保证随机跳。数字输入门限 VIL(max)/VIH(min)之间没有保证判定，实际数值查完整料号。

上拉按下支路：VIO → R → 按钮 → GND。3.3 V / 10 kΩ≈0.33 mA 仅算术例子；过小增加电流，过大须关注漏电压降、寄生电容与干扰，不能用导线代替电阻。

### 电路与有效电平 {#truth-table}

**raw** 是这一次采样得到的电平；**candidate** 是正在等待确认的候选电平；**stable** 是过滤器已接受的状态；**event** 是一次通知。稳定状态不变，事件就不会每次采样都重复发出。

| 电路与条件 | 松开 | 可靠按下 | 一个按下事件 |
| --- | --- | --- | --- |
| 上拉，按钮接地 | 1 | 0 | 已接受的 stable 从 1→0 |
| 下拉，按钮接允许的 VIO | 0 | 1 | 已接受的 stable 从 0→1 |
| 电阻移除，松开且无其他驱动 | 无法保证 | 由按钮连接的地或电源决定 | 先恢复可靠默认电平 |

上拉和下拉的过滤规则相同，只有“哪个电平代表按下”不同。代码将映射集中在 activeHigh：rawHigh 表示采样为高；activeHigh 表示高是否对应按下，两者相等才表示物理输入正在表达按下。原始边沿、已接受的状态变化与业务事件应分开记录。

### 按观测确认 {#debounce-rule}

raw 是一次观测，candidate 是候选，sinceMs 是候选起点，stable 是已接受状态。观测到候选未变达到 thresholdMs 才接受；稳定状态变成按下且已允许新按下才产生一次 PRESSED。保持按住不重复。

```text
已确认释放后：
raw 改变 → 更新 candidate，since = now
候选满阈值 → 接受 stable
稳定释放 → 允许下一次按下
稳定按下且已允许 → 发一次 PRESSED，撤销允许
```

“稳定”仅指采样未变，不证明采样间没有毛刺。5 ms 不是通用推荐；阈值须结合实际输入、采样与响应要求。

### 人工示例 {#fixed-example}

**t=0 之前已确认释放至少所选阈值时间，默认 5 ms。**起点 raw=stable=1；2/3/4/5/6 ms 为 0/1/0/1/0。显示 t=0 时，候选已观察 T ms，since=-T 只是显示前预热的相对时刻，不是负数 uint32_t 时钟。

**6+5=11 ms：一次按下。**原始下降沿 2、4、6 ms 共三次。6 到 11 是五毫秒、六个采样时刻，不能数点代替时长。

扩展：24/25/26 ms 为 1/0/1；34/35/36 ms 为 0/1/0。5 ms 阈值在 31 ms 释放、41 ms 第二次按下；10 ms 阈值不能接受仅 8 ms 的释放，所以没有第二次按下。所有输入为人工数据，无硬件验证。

### 启动与时间契约 {#startup-time-contract}

启动先确认初始状态，不为初始按住发按下；先确认释放，再允许后来的按下。相邻调用差值 >maxGapMs，记录 gapSeen 并从当前采样重新累计，不把未观测时间当稳定证据；等于边界可接受。漏掉的完整动作无法恢复。

时间单位毫秒。thresholdMs、maxGapMs >0 且 <2^31 ms，相邻有效调用真实间隔也 <2^31 ms；uint32_t 无符号差处理模回绕。差值不小于2^31会使本实现返回 INVALID 并失效，但无法检出漏掉整个计数周期。计数复位、倒退或休眠改变语义后重新初始化。状态只由一个上下文读写，volatile 不解决共享同步。

初始化返回 bool，返回事件 INVALID=-1 / NONE=0 / PRESSED=1 / RELEASED=2。检查失败，只在 PRESSED 给业务加一。

<a href="../examples/gpio-button/button.c" download>下载 button.c</a>。

```sh
cc -std=c11 -Wall -Wextra -Werror -pedantic -DBUTTON_TEST button.c -o button-test
./button-test
```

已有 gcc 可替代 cc；Windows 输出 .exe 并运行 .\button-test.exe。无需厂商库，测试范围以实际输出和记录为准。

### 硬件验证 {#hardware-check}

1. 查实际完整料号、原理图、模式、供电、门限、上下拉、工具/库版本，先确认安全接线与仪器参考关系。
2. 测静态高低电压；示波器/逻辑分析仪检查真实输入与采样，万用表不能证明短时抖动不存在。
3. 同步记录 raw、采样时刻、candidate、stable、事件和业务计数，验证保持、释放、第二次按下、短状态和约定干扰。
4. 明示未测项，主机 PASS 不能写成硬件通过；本章未做硬件验证，目标电气与时序仍需另测。

## 合上卡片，再解释 {#lesson-notes}

### 上拉移除、按钮松开且无其他驱动，为什么不能保证原始值？ {#reference-recall}

没有上下拉或其他驱动提供确定电平，节点可能悬空，无法保证高低。偶尔读到固定值不能证明偏置可靠，也不能声称一定随机跳。

### 改成下拉、按钮接合适 VIO，什么稳定变化才是按下？ {#reference-transfer}

从稳定释放到稳定按下，即 0→1。过滤规则不变，只改变有效电平映射；原始上升沿也可能抖动，不能直接当按下事件。

### 已确认释放后，2/3/4/5/6 ms 为 0/1/0/1/0，阈值 10 ms，首次何时接受？扩展中 26→34 ms 的释放呢？ {#reference-timing}

第一次在 16 ms（6+10）。6、7、8、9、10 五个时刻之间只有四毫秒，阈值看经过时长，不数样点。前提为 t=0 前已确认释放，且按每 1 ms 时刻调用。

5 ms：31 ms 接受释放，41 ms 第二次按下，总两次。10 ms：8 ms 释放不够阈值，stable 未离开按住，没有第二次按下。不能只说“大阈值更可靠”，必须结合希望识别的最短操作。

### 启动一直按住会产生按下吗？另一个已确认释放的例子在 6 ms 读到按下、100 ms 才再采样，阈值 5 ms、maxGapMs=1，会立即接受吗？ {#reference-startup}

本章策略不会为这次初始按住发按下。先确认初始状态，再确认一次释放，之后的新按下满阈值才发 PRESSED；不能把预确认释放的 11 ms 示范套到刚开机。

不应。本实现记 gapSeen，并从 100 ms 重计；若后续每 1 ms 调用，105 ms 才接受。中间未观测不等于已经稳定，漏掉的完整动作不能重建。

## 已核对来源与适用范围 {#reference-sources}

核对日期：2026-10-17。完整页码、论点映射和限制见[首章来源表](gpio-button.html#sources)。

- [ST AN4899](https://www.st.com/resource/en/application_note/an4899-stm32-microcontroller-gpio-hardware-settings-and-lowpower-consumption-stmicroelectronics.pdf)，May 2026 / Rev 4：§2.1、§4.2—4.3.1、§5.1、§6.1、§6.3。GPIO 缓冲、上下拉和电气条件；只作 STM32 案例，具体参数查完整料号，开漏/I²C 计算不当作按钮电阻表。
- [TI SCEA094：Debounce a Switch](https://www.ti.com/document-viewer/lit/html/scea094)，October 2020，未见修订字母：p1 Product Overview / Design Considerations。支撑触点抖动及硬件消抖概念，不验证本站软件或 5 ms 参数。
- [TI SZZA036C](https://www.ti.com/lit/an/szza036c/szza036c.pdf)，June 2016 / Rev C：§3.5、§4.5.5—4.5.6、§4.6.1—4.6.3。手册里的保证输入范围与滞回，非特定 MCU 的规格。
- [WG14 N1570](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)，2011-04-12：§6.2.5 第 9 段、§7.20.1.1。公开 C11 委员会草案的无符号运算及精确宽度类型；本例要求 uint32_t，不保证硬件时间。
- [Matt Pocock teach](https://github.com/mattpocock/skills/blob/main/skills/productivity/teach/SKILL.md?plain=1)：教学组织方法，无电气或代码正确性证据。

假设门限、阻值算术、人工波形与习题均非真实芯片参数或实测结果。

## 回到主线 {#reference-next}

下一章“GPIO 输出与 LED 限流”建设中。先解释电路，再完成采样与代码检查点；无需提前购买开发板。

[返回完整首章](gpio-button.html) · [学习地图第 01 阶段](./engineering-map.html#stage-01)
