---
title: GPIO 按键：从电压到一次可靠事件
description: 零基础 GPIO 输入、门限与上下拉，采样消抖、十题解析和可下载 C11 状态机。
---

# 从 GPIO 电压到一次可靠的按键事件 {#overview}

## 本章做到什么：两个检查点 {#chapter-goals}

本章只追一个结果：**从电路解释一次可靠的按键事件**。无需先买开发板，也不指定引脚或芯片厂商。电路、人工输入、程序和习题为本站原创；动画与主机测试不等于真实芯片的电气、时序或抗干扰验证。

分两层学习，不要求一次跨过全部门槛：

- **原理必读：**从第 0 节开始，解释电压参考、GPIO 输入、高阻与上下拉；沿线路预测 0、1 或无法保证；手算原始变化怎样形成一次事件。完成十题中的 1—6、9—10，即可检查这一层。
- **C 代码进阶：**先读语法桥梁，再运行独立 C11 状态机；解释启动按住、丢采样和计时回绕。完成第 7—8 题与主机实验。没有 C 基础时，可以先停在第一个检查点，之后回来读代码。

本页和[速查卡](gpio-button-reference.html)属于[学习地图第 01 阶段](./engineering-map.html#stage-01)的一章，不能代替整个电路与 C 阶段。GPIO 输出、LED 限流、完整 C 语言基础和缓冲区课程仍在建设中。

## 0. 零基础入口：节点与电压 {#zero-entry}

**MCU（微控制器）**能运行程序，并通过引脚与外部电路交换信号。**GPIO** 是 General-Purpose Input/Output，即通用输入/输出。输入模式让程序观察引脚的逻辑值；输出模式由程序控制输出驱动电路，具体输出模式留到后续章节。本章只使用数字输入，不要求配置任何厂商寄存器。某个引脚是否支持数字输入、复位时是什么状态，仍须查真实型号手册。

**电压是两个点之间的差。**“GPIO 是 3.3 V”在这里表示 GPIO 节点相对本电路 GND 的电压是 3.3 V。GND 是选定的参考节点，不天然等于大地。VIO 表示与该输入相适配的 I/O 电源，不表示所有 MCU 都使用 3.3 V。两个设备若要直接交换这种电平，必须有设计明确的参考关系；本章先讨论同一低压电路内的节点。

理想导线直接连在一起的点视作同一个节点；闭合的理想开关也视作直接连接。按钮松开是**断路**；按下是把两个触点连通。GPIO 与 GND 不会因为画在同一页上就成为同一个节点。经过电阻虽然可能有电流路径，但电阻两端可以有电压差，不能因此叫作同一点。真实按钮还有接触电阻与抖动，后面再加上这些限制。

电流描述电荷流动，单位安培 A；电压单位伏特 V；电阻单位欧姆 Ω。电阻两端的电压差 U、支路电流 I 与阻值 R 满足本章使用的关系 **I = U / R**。例如 10 kΩ = 10000 Ω，1 mA = 0.001 A。不要把“节点有电压”误解为“必须有很大的电流流进 GPIO”。

**入门自检：**GPIO 电压相对谁？相对该电路 GND。GPIO 与 GND 在松开按钮时必然是同一点吗？不是；要看线路是否把它们连通。先解释这两问，再记“按下为零”。

以后接硬件时先断电核对原理图、供电和仪器接地；不将未知电压或市电接入 GPIO，不随意把不同系统的地短接。需隔离的系统不能用“共地”二字代替设计。本章纸面与主机实验不涉及这些接线操作。

## 1. 输入收到电压，程序读到逻辑值 {#core-idea}

手指按下是**动作**；引脚电压是**物理量**；程序读到的 0/1 是数字输入电路判定后的**逻辑值**；应用收到的“按下”是软件定义的**事件**。动作名称不决定逻辑值，逻辑 1 也不是固定 1 V，更不是一次精确电压测量。

**数字输入门限**要看数据手册：常用 **VIL(max)** 表示保证低电平的输入电压上界，**VIH(min)** 表示保证高电平的输入电压下界。在允许输入电压、供电、温度等规定条件内，低于或等于前者的有效输入可保证识别为低，高于或等于后者可保证识别为高。两者之间不保证作何判定，不能创造“半按下”业务状态。实际翻转点也不必等于保证界限；施密特输入还有与先前状态有关的滞回，须另查对应规格。[TI 数据手册阅读指南 §4.5.5—4.5.6、§4.6.1—4.6.3](#source-logic)可帮助区分这些概念。

**假设门限练习，非真实器件规格：**设 VIO=3.3 V，允许输入范围暂设为 0—3.3 V，VIL(max)=0.8 V，VIH(min)=2.0 V。只按这组虚构规格推理：

| 练习输入 | 结论 | 原因 |
| --- | --- | --- |
| 0.2 V | 保证为低（0） | 在允许范围内，且不超过 0.8 V |
| 1.4 V | 无法保证 0 或 1 | 落在两个保证区间之间 |
| 3.0 V | 保证为高（1） | 在允许范围内，且不低于 2.0 V |
| −1 V 或 5 V | 不能套用此表接线 | 超出这道练习声明的允许范围 |

这组数只用于练习，不是 STM32/GD32 或任意 MCU 的规格。绝对最大额定值不是推荐工作条件；“耐较高电压”也可能受具体引脚、供电和模式限制。数值最终来自完整料号的数据手册，[ST AN4899 §5.1、§5.1.4 与 §6.3](#source-st)只是 STM32 情形的阅读对照。

数字输入常呈现**高输入阻抗**：它主要观察节点，不像强力电源把节点固定到高或低。但高阻不等于完全没有电流、电容或保护结构。没有外部驱动、上下拉或其他确定偏置时，电荷、漏电和干扰会影响节点，这叫**悬空**。悬空不保证 0，不保证 1，也不保证每次都随机跳动；偶尔一直读到 1 仍不能证明线路可靠。

### 换一个输入，再预测 {#voltage-exercise}

仍用允许范围 0—3.3 V、VIL(max)=0.8 V、VIH(min)=2.0 V 的假设器件；输入改为 1.2 V，能保证读到什么？

**解析：**1.2 V 在允许范围内，但位于两个保证区间之间，无法保证 0 或 1。这不是真实器件参数。

交互可改输入电压并先预测，再提交解释；仅改电压不会泄露新答案。先判断是否落在 0—3.3 V 的允许范围，再比较门限：0.8 V 包含在保证低区间，2.0 V 包含在保证高区间，0 V 与 3.3 V 也在本题允许范围内；负数或超过 3.3 V 不能套用本题门限接线。空值或非有限数字不接受。

## 2. 上拉、下拉与有效电平 {#pull-resistors}

先沿这条理想线路推理：**VIO → 电阻 R → GPIO 节点 → 按钮 → GND**。GPIO 配置为数字输入。

**松开：**按钮断路，输入只需很小的漏电流时，电阻压降通常很小，GPIO 节点被拉向 VIO；满足高电平门限才读到 1。上拉提供的是默认偏置，不是在命令程序“已经按下”。

**按下：**按钮将 GPIO 节点可靠连接到 GND，节点电压接近 0，满足低电平门限才读到 0。同时 VIO → R → 按钮 → GND 形成电流支路；主要电流经过电阻和按钮，不是全部灌进 GPIO 输入。

算术例子：VIO=3.3 V，R=10 kΩ，忽略按钮电阻，则按下电流约为 **3.3 / 10000 A = 0.33 mA**。这不是通用选型建议。把 R 换成导线会在按下时把电源直接接地，产生短路风险；R 过小则增加按下电流和功耗。R 也不是越大越好：漏电引起的压降、寄生电容充放电、线路与环境干扰都要纳入门限裕量和响应要求。[TI SCEA094 的 Design Considerations](#source-ti)讨论了硬件方案里的漏电压降与电阻/功耗取舍，并未给本章软件算法背书。

**下拉迁移：**电阻改接 GPIO 到 GND，按钮改接 GPIO 到合适的 VIO，松开就读 0，按下读 1。所谓**低电平有效**，只是业务上的有效状态用电气低表示；高电平有效则相反，不评价信号质量。不要死记“按钮就是零”，而要追踪节点连到了哪里。

内部与外部上拉都能提供偏置，但内部电阻范围、复位时是否启用、低功耗时是否保留，依器件而定。板上若已有上下拉或其他驱动，必须一起画入线路。下方模型只演示单电阻和按钮，省略保护、输入漏电与电容，不能当完整原理图或实际接线指南。[ST AN4899 §4.2—4.3.1](#source-st)解释其 STM32 输入/输出缓冲及上下拉情形；其中 §5.1.5 的开漏/I²C 计算不能充作所有按钮的电阻表。

## 先预测，再改变线路 {#circuit-lab}

选择下一次电路：上拉/下拉、电阻接入/移除、按钮按下/松开；先预测“0、1、无法保证”，再提交。图和读数始终保留已应用状态，只改设置不会泄露新答案。无 JavaScript 时，用上文线路推理与下文真值表核对全部情况。绿色连接和电流箭头只是理想逻辑示意，不是实测或接线指南。

## 一次动作，为什么出现三个下降沿 {#bounce-lab}

raw 从 1 变 0 叫下降沿，从 0 变 1 叫上升沿；边沿是一次采样数据变化，不天然等于一次手指动作。机械触点可能反复通断，形成多个原始边沿，这叫触点抖动。上拉提供偏置，不保证消除抖动；[TI SCEA094](https://www.ti.com/document-viewer/lit/html/scea094)支持触点与硬件消抖概念，不验证本算法。

时间原点：t=0 前已用释放电平完成至少所选阈值的确认，默认 5 ms；预热不在图内。这不是刚开机开始按的波形。主时间轴每 1 ms 采样，初始为 1；2/3/4/5/6 ms 依次为 0/1/0/1/0，保持至 20 ms，原始下降沿共三次。阈值 5 ms 时，6+5=11 ms 接受一次按下，持续保持不重复。

可调整 1—12 的整数毫秒阈值、逐步/播放/暂停/结束/重置。无效阈值拒绝运行，保留上一有效示例。采样记录显示 raw、candidate、since、age、stable、原始下降沿与事件数；曲线仅回放人工数据。扩展输入增加 24/25/26 ms 的 1/0/1 与 34/35/36 ms 的 0/1/0，保持至 50 ms；默认在 31 ms 释放、41 ms 第二次按下，总两次。5 ms 是教学参数，不是通用推荐。

## 3. 从采样推导一次事件 {#lesson-notes}

本层解释原始、候选、稳定与事件，所有答案在无 JavaScript 时仍可展开阅读。

### 原始、候选、稳定与事件 {#raw-vs-event}

**raw** 是这一次采样得到的电平；**candidate** 是正在等待确认的候选电平；**stable** 是过滤器已接受的状态；**event** 是一次通知。稳定状态不变，事件就不会每次采样都重复发出。

| 电路与条件 | 松开 | 可靠按下 | 一个按下事件 |
| --- | --- | --- | --- |
| 上拉，按钮接地 | 1 | 0 | 已接受的 stable 从 1→0 |
| 下拉，按钮接允许的 VIO | 0 | 1 | 已接受的 stable 从 0→1 |
| 电阻移除，松开且无其他驱动 | 无法保证 | 由按钮连接的地或电源决定 | 先恢复可靠默认电平 |

上拉和下拉的过滤规则相同，只有“哪个电平代表按下”不同。代码将映射集中在 activeHigh：rawHigh 表示采样为高；activeHigh 表示高是否对应按下，两者相等才表示物理输入正在表达按下。原始边沿、已接受的状态变化与业务事件应分开记录。

### 观察候选满阈值 {#filter-rule}

先用**已确认释放的基线**理解核心规则，暂时不讨论上电初始化。每 1 ms 先读取该时刻输入，再更新候选，最后检查时长。raw 与 candidate 不同，就更新候选，并将 since 记成此刻；候选达到阈值后才接受为 stable。伪代码只是理解桥梁，完整契约与 C 实现在进阶层。


```text
前提：已经确认释放，candidate = stable = 1
每次采样 raw，当前时刻 now：
  若 raw != candidate：candidate = raw；since = now
  若 candidate != stable 且 now - since >= threshold：
    stable = candidate
    若 stable 是按下电平：发出一次按下事件
```

| 教材时刻 | raw / candidate | since | 已观察时长 | stable / 结果 |
| --- | --- | --- | --- | --- |
| 0—1 ms | 1 / 1 | −5（预热起点） | 已观察 5—6 ms | 1，不发事件 |
| 2 ms | 0 / 0 | 2 | 0 ms | 1，等待 |
| 3 ms | 1 / 1 | 3 | 0 ms | 1，候选改变 |
| 4 ms | 0 / 0 | 4 | 0 ms | 1，重新计时 |
| 5 ms | 1 / 1 | 5 | 0 ms | 1，再次改变 |
| 6 ms | 0 / 0 | 6 | 0 ms | 1，新的候选 |
| 10 ms | 0 / 0 | 6 | 4 ms | 1，尚不足 5 ms |
| 11 ms | 0 / 0 | 6 | 5 ms | 0，发一次按下 |
| 12—20 ms | 0 / 0 | 6 | 继续增加 | 0，保持不重复 |

表中 since 用教材相对时间；默认预热起点为 −5 ms，显示 t=0 时已经观察 5 ms。阈值为 T 时可将预热起点记为 −T，负数不是时钟倒退。

6、7、8、9、10、11 是六个采样时刻，6 到 11 才经过五毫秒。不能把“五个样点”当成“五毫秒”。阈值换成 10 ms 时，最后的候选从 6 ms 起算，16 ms 才接受。

扩展输入在 24/25/26 ms 是 1/0/1，在 34/35/36 ms 是 0/1/0。默认 5 ms 阈值：26+5=31 ms 接受释放，36+5=41 ms 接受第二次按下。阈值为 10 ms（或交互中的 12 ms）时，释放候选从 26 到 34 只维持 8 ms，未成为 stable，所以没有第二次按下。这体现延迟与短状态遗漏的取舍，不是计数器失灵。

### 观察边界 {#sampling-limits}

“稳定”在软件里只指**观察到的采样未变**，不能证明两次采样之间所有电气时刻都没变化。以下四例全部是人工数据，不是实测波形。交互中每例先选择预测，再提交并揭晓理由；无 JavaScript 时仍可直接展开完整推理。代码进阶层说明本实现如何处理它们。

#### 启动就按住：会立即报一次按下吗？ {#scenario-boot}

输入：上拉低电平有效；从初始化起 raw 一直为 0，每 1 ms 采样，阈值 5 ms。之后先释放并确认，再按下并确认。

**推理：**本章策略不为初始按住产生 PRESSED。初始状态要先确认，且只有确认过释放才允许下一次按下。若在 21 ms 首次读到释放，26 ms 接受释放；27 ms 再次读到按下，32 ms 才发按下。启动策略是产品选择，并非所有按钮都应如此。原 11 ms 示例的 t=0 前已确认释放，不能将它当作开机后 11 ms 的承诺。

#### 短释放：阈值越大一定越好吗？ {#scenario-short-release}

输入：先按原波形确认一次按下；26 ms 开始的释放候选在 34 ms 被下一次按下打断，只有 8 ms。比较阈值 5 ms 与 10 ms。

**推理：**5 ms 阈值在 31 ms 接受释放、41 ms 接受第二次按下。10 ms 阈值没有接受这次释放，稳定状态一直是按住，因此不会为后来同一按下电平再发第二个按下。阈值增大可抑制更长的短状态，也会漏掉本来希望识别的快速操作。

#### 长间隔：6 ms 之后到 100 ms 才再采样 {#scenario-gap}

输入：已确认释放；6 ms 采到按下，100 ms 才再调用且仍按下。阈值 5 ms，允许最大调用间隔 maxGapMs=1。之后恢复每 1 ms 调用。

**推理：**不能说观察到了 94 ms 连续稳定。中间没有采样，本实现记录 gapSeen，并从 100 ms 重新累计候选；之后调用满足契约，最早 105 ms 才接受按下。漏掉的完整按压无法恢复；增加阈值也补不回观测。

#### 采样间毛刺：两个点相同，期间一定没变化吗？ {#scenario-glitch}

输入：每 1 ms 采样，0 ms 与 1 ms 都读到 1；人工设定在 0.3—0.5 ms 曾出现一个低脉冲。

**推理：**两个观测值都为 1，软件可能完全没看见这段 0.2 ms 脉冲。缩短消抖阈值不保证发现未采到的输入。若需求必须捕获这种脉冲，要重新设计采样或硬件捕获；这也不是过压保护或安全停机电路的替代方案。

### 误区与故障 {#common-mistakes}

三个常见误区：**“按下就是 1”**混淆动作与电平；**“上拉等于消抖”**混淆偏置与时间过滤；**“悬空必定随机跳”**把无法保证误当成某种固定表现。

故障：一次按下被计三次。先保存原始输入、stable、事件和业务计数，不先盲目增大延时。依次问：原始波形是否多次跳变？stable 是否也多次变化？业务计数是否与一个 PRESSED 一一对应？采样是否按约定进行？节点是否有可靠偏置？

若 raw 抖动、stable 只变一次但业务加三次，要查重复消费事件；若 stable 也反复变，查阈值、采样与真实抖动；若节点悬空或电压落在未保证区，先修电路与配置。修复后重放同一输入，再加入保持、释放、短按和第二次按下回归。没有真实波形时只能提出排查假设，不能宣布硬件根因已经确认。

### 十个独立练习 {#recall-questions}

先写理由，再核对；第 7—8 题可在 C 进阶后完成。可用“只打印十道练习（不含答案）”按钮生成本次练习卷，打印时隐藏解析和章节其他部分，完成或取消打印后恢复阅读状态。速查卡的默认打印仍自动展开答案。

**第 5—6 题共用的原始采样输入**

t=0 前已经确认释放，预热时长至少等于所选阈值；t=0 的原始值 raw=1。每 1 ms 采样，按该时刻输入更新。

原输入：2/3/4/5/6 ms 的 raw 依次为 0/1/0/1/0。扩展输入还加入 24/25/26 ms 的 1/0/1，以及 34/35/36 ms 的 0/1/0。未列出的时刻保持前值，最后保持到 50 ms；阈值按各题给定。

1. 输入一直读到 1，能证明上拉已经正确接入吗？
2. 假设门限为 0.8 V / 2.0 V，允许范围 0—3.3 V，测到 1.4 V，可以定义为“半按下”吗？
3. VIO=3.3 V、R=4.7 kΩ，忽略按钮电阻，按下电流约多少？把 R 换成导线是否更可靠？
4. 上拉换成下拉，按钮改接合适 VIO，应对哪种稳定变化计一次按下？
5. 原人工输入阈值为 10 ms，第一次何时确认？6 到 10 ms 有五个采样点，是否已满 5 ms？
6. 扩展输入的释放候选从 26 到 34 ms。5 ms 与 10 ms 阈值分别会发生什么？
7. 已确认释放，6 ms 读到按下，100 ms 才再调用且仍按下。thresholdMs=5、maxGapMs=1，是否应在 100 ms 立即接受？
8. 上电已按住，5 ms 后会自动发一次按下吗？怎样才能发第一次？
9. 代码写成 if (raw == 0) count++，持续按住会怎样？应把计数接到哪里？
10. 每 1 ms 采样，两个采样点间有 0.2 ms 低脉冲，是否一定能发现？

### 解析与错误原因 {#recall-answers}

1. 不能。高阻悬空也可能暂时保持高。应核对电路、输入配置与电压；一次或多次相同读数都不能代替确定偏置。错在把现象当作设计保证。
2. 不能。1.4 V 在该假设规格的数字输入未保证区，不是第三种可靠按键状态；应排查电路与电气条件。该门限不是真实器件规格。
3. I≈3.3/4700 A≈0.70 mA。换成导线会在按下时把电源直接接地，有短路风险。算出电流只完成一个条件，仍须核对门限、漏电、功耗及器件允许值。
4. 从稳定释放到稳定按下，即 0→1。过滤规则不变，只改变有效电平映射；原始上升沿也可能抖动，不能直接当按下事件。
5. 第一次在 16 ms（6+10）。6、7、8、9、10 五个时刻之间只有四毫秒，阈值看经过时长，不数样点。前提为 t=0 前已确认释放，且按每 1 ms 时刻调用。
6. 5 ms：31 ms 接受释放，41 ms 第二次按下，总两次。10 ms：8 ms 释放不够阈值，stable 未离开按住，没有第二次按下。不能只说“大阈值更可靠”，必须结合希望识别的最短操作。
7. 不应。本实现记 gapSeen，并从 100 ms 重计；若后续每 1 ms 调用，105 ms 才接受。中间未观测不等于已经稳定，漏掉的完整动作不能重建。
8. 本章策略不会为这次初始按住发按下。先确认初始状态，再确认一次释放，之后的新按下满阈值才发 PRESSED；不能把预确认释放的 11 ms 示范套到刚开机。
9. 每次采样都会加一，即使电压完全不抖。过滤器只在稳定状态从释放转为按下时返回一次 PRESSED；业务层消费这个事件再加一，而不是把“当前按住”当“刚刚按下”。
10. 不能，脉冲可能完全在观测间隙。减少过滤阈值不会补回未采到的信息；需要根据需求设计采样率或硬件捕获。这里的结论来自采样模型，不是对某块板的测量。

## 4. C 代码进阶：可以稍后回来 {#c-advanced}

### 语法桥梁 {#c-syntax}

先手算上面的状态表，再读这座 C 语法桥梁。它足以帮助理解本例，不等于一页学完 C：

| 写法 | 在本例中的意思 |
| --- | --- |
| bool、true、false | 一个真/假值；rawHigh=true 表示采样为高，不自动表示按下 |
| uint32_t | 实现须提供的 32 位无符号整数，本例用它表示毫秒计数；单位写进名字和契约 |
| typedef struct {...} Button | 将一个按键跨调用保存的状态放在一起；每个按键要有自己的对象 |
| Button *button、&button | 指针参数让函数修改调用者保存的对象；& 取对象地址，-> 访问指针所指对象的成员 |
| enum、ButtonEvent | 用名字表示有限种返回结果，比散落 0/1 更清楚 |
| if、!=、==、>= | 分别是条件判断、不等、相等、大于等于；= 是赋值，不是相等比较 |
| return | 结束本次调用并返回结果；本例不会在函数里等待时间走完 |

继续读源码时：! 表示逻辑取反，|| 表示任一条件成立；NULL 是空指针，{0} 将对象成员初始化为零；.字段=按字段名给初值，UINT32_C 构造适合的无符号整数常量，#ifdef 选择是否编译测试分支。注释说明意图，不参与执行。遇到尚不熟悉的声明，可先对照变量表追踪一个样点，再补后续 C 基础；不要求靠猜补齐整门语言。

先跟踪 candidate（新候选）、sinceMs（候选起点）、stable（确认后的状态）这三个核心量。再看 ready：初始状态是否已满阈值；armed：是否已确认释放、允许下一次按下；gapSeen：是否曾丢失约定的采样间隔。刚初始化时 stable 只是初始采样的占位，ready=false 时不能当作已确认结果。initialized 用于拒绝未初始化或已失效的对象，不是第四种按键电平。

**读一次状态迁移：**候选变化会改 candidate 与 sinceMs；时长不足立即返回 NONE；达到阈值才考虑接受。第一次达到阈值只建立初始 stable，不发按下；若它是释放则 armed=true。之后接受释放会置 armed 并返回 RELEASED；接受按下且 armed=true 才返回 PRESSED，并清除 armed，因而保持按住不连发。

### 调用契约 {#c-contract}

调用者负责采样，状态机只接收电平和时间：

- **初始化：**先提供一个可写的 Button 对象。button_init 返回 bool，空指针或非法参数返回 false；非空对象在失败后保持明确的未初始化状态。必须检查结果。不能把未初始化的任意内存交给 update；零初始化对象可以被安全拒绝。
- **输入映射：**rawHigh=true 为电气高，activeHigh=true 表示高有效；上拉按钮接地用 activeHigh=false，下拉按钮接 VIO 用 true。每个对象只由一个执行上下文读写；中断与任务共享须另做同步，volatile 不能替代它。
- **启动：**先确认初始状态，不发初始按下。启动已按住时，须先确认释放再允许后来的按下。按下和释放都过滤，长按保持不连发；长按、双击由后续业务层定义。
- **调用间隔：**相邻调用间隔超过 maxGapMs，设置 gapSeen，候选从当前采样重新计时，返回 NONE；等于 maxGapMs 仍允许。gapSeen 是历史标志，重新初始化才清除。它不会恢复漏掉的完整按压。
- **时间：**单位为毫秒；thresholdMs 与 maxGapMs 都必须大于 0 且小于 2^31 ms，相邻有效调用的真实间隔也必须小于 2^31 ms。使用 uint32_t 计数的模回绕，以无符号差计算经过时长。本实现检测到差值不小于 2^31 时返回 INVALID 并使对象失效，但不能检测完全漏掉一整个计数周期；调用者仍要守约。计数任意倒退、复位或休眠改变计时语义后，须重新初始化。[C11 委员会草案的无符号运算规则](#source-c11)只说明算术，不证明真实时间或采样满足条件。
- **返回值：**BUTTON_INVALID=-1，BUTTON_NONE=0，BUTTON_PRESSED=1，BUTTON_RELEASED=2。调用者应处理 INVALID；只在 PRESSED 时给业务计数加一。每次 update 只做有限次判断并返回，没有忙等、延时或芯片驱动。

下方是可下载源文件的核心，完整文件还包含 BUTTON_TEST 条件编译的主机测试。

### C 核心 {#c-source}

```c
/******************************************************************************
 * @file button.c
 * @brief Original, vendor-independent teaching example for embedded-notes.
 * @version V1.0 2026-10-17
 *
 * Host build: cc -std=c11 -Wall -Wextra -Werror -pedantic -DBUTTON_TEST
 *               button.c -o button-test
 * Run: ./button-test
 * Define BUTTON_TEST only for the host executable; omit it for a module object.
 *
 * Interface contract:
 * - Supply a uint32_t-capable C11 implementation and sampled bool input levels.
 * - Initialize before use. A zeroed object can be rejected safely, but reading an
 *   arbitrary uninitialized automatic object is undefined behavior in C.
 * - One execution context owns an object. Do not modify its fields externally.
 * - ready means the initial observed level qualified; armed means a release was
 *   qualified. Initial held input never creates PRESSED: release, then press.
 * - thresholdMs and maxGapMs are both in [1, 2^31 - 1] ms. The caller guarantees
 *   the REAL interval between calls is less than 2^31 ms. Unsigned subtraction
 *   handles modulo wrap, not an unobserved full counter cycle or clock reset.
 * - A detected delta >=2^31 invalidates the object; reinitialize. A smaller gap
 *   >maxGapMs sets gapSeen and restarts evidence without inventing missed input.
 * - A filtered transition to release emits RELEASED, including the first release
 *   after boot-held qualification. gapSeen stays true until reinitialization.
 * - Repeated observations at one timestamp do not advance elapsed time. Software
 *   only observes call times, not every electrical change between them.
 * No GPIO driver, target firmware, electrical measurement or hardware validation.
 *****************************************************************************/

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef BUTTON_TEST
#include <stdio.h>
#endif

#define BUTTON_TIME_LIMIT UINT32_C(0x80000000)

typedef enum {
    BUTTON_INVALID = -1,
    BUTTON_NONE,
    BUTTON_PRESSED,
    BUTTON_RELEASED
} ButtonEvent;

typedef struct {
    bool initialized;
    bool activeHigh;
    bool candidate;
    bool stable;
    bool ready;
    bool armed;
    bool gapSeen;
    uint32_t sinceMs;
    uint32_t lastMs;
    uint32_t thresholdMs;
    uint32_t maxGapMs;
} Button;

/**
 * @brief Start qualification without emitting an initial pressed event.
 * @param[in,out] button Valid writable object; invalid settings clear this object.
 * @param[in] rawHigh Sampled electrical high (true) or low (false).
 * @param[in] activeHigh Whether high means physically pressed.
 * @param[in] nowMs Unsigned 32-bit monotonic millisecond counter, modulo wrap.
 * @param[in] thresholdMs Positive qualification duration, less than 2^31 ms.
 * @param[in] maxGapMs Positive permitted call interval, less than 2^31 ms.
 * @return true on success; false for null or invalid settings.
 */
bool button_init(Button *button, bool rawHigh, bool activeHigh, uint32_t nowMs,
                 uint32_t thresholdMs, uint32_t maxGapMs)
{
    /** Failure leaves a nonnull object safely uninitialized. **/
    if (button == NULL) {
        return false;
    }
    *button = (Button){0};
    if (thresholdMs == 0 || thresholdMs >= BUTTON_TIME_LIMIT ||
        maxGapMs == 0 || maxGapMs >= BUTTON_TIME_LIMIT) {
        return false;
    }
    *button = (Button){
        .initialized = true,
        .activeHigh = activeHigh,
        .candidate = rawHigh,
        .stable = rawHigh,
        .sinceMs = nowMs,
        .lastMs = nowMs,
        .thresholdMs = thresholdMs,
        .maxGapMs = maxGapMs
    };
    return true;
}

/**
 * @brief Consume one observation and return at most one transition event.
 * @param[in,out] button Previously initialized or zero-initialized object.
 * @param[in] rawHigh Sampled electrical high or low.
 * @param[in] nowMs Counter with the initialization time semantics.
 * @return NONE/PRESSED/RELEASED, or INVALID if the interface contract fails.
 */
ButtonEvent button_update(Button *button, bool rawHigh, uint32_t nowMs)
{
    uint32_t gapMs;
    /** Reject a zero-initialized object; arbitrary indeterminate storage is invalid C usage. **/
    if (button == NULL || !button->initialized) {
        return BUTTON_INVALID;
    }
    gapMs = (uint32_t)(nowMs - button->lastMs);
    /** Modulo arithmetic cannot detect an entirely missed counter cycle. **/
    if (gapMs >= BUTTON_TIME_LIMIT) {
        button->initialized = false;
        return BUTTON_INVALID;
    }
    button->lastMs = nowMs;
    if (gapMs > button->maxGapMs) {
        button->gapSeen = true;
        button->candidate = rawHigh;
        button->sinceMs = nowMs;
        return BUTTON_NONE;
    }
    if (rawHigh != button->candidate) {
        button->candidate = rawHigh;
        button->sinceMs = nowMs;
    }
    if ((uint32_t)(nowMs - button->sinceMs) < button->thresholdMs) {
        return BUTTON_NONE;
    }
    if (!button->ready) {
        button->ready = true;
        button->stable = button->candidate;
        button->armed = button->stable != button->activeHigh;
        return BUTTON_NONE;
    }
    if (button->stable == button->candidate) {
        return BUTTON_NONE;
    }
    button->stable = button->candidate;
    if (button->stable != button->activeHigh) {
        button->armed = true;
        return BUTTON_RELEASED;
    }
    if (button->armed) {
        button->armed = false;
        return BUTTON_PRESSED;
    }
    return BUTTON_NONE;
}
```

### 主机实验 {#c-host-lab}

<a href="../examples/gpio-button/button.c" download>下载 button.c</a>，使用已有且支持 C11、提供 uint32_t 的编译器。无需下载厂商库，也没有 GPIO 驱动需要猜补：

```sh
cc -std=c11 -Wall -Wextra -Werror -pedantic -DBUTTON_TEST button.c -o button-test
./button-test
```

若编译器命令名为 gcc，将 cc 换成 gcc；Windows 可输出 button-test.exe，再运行 .\button-test.exe。本章不要求安装编译器，未配置时先完成原理层。

BUTTON_TEST 会启用同一个文件中的 main 和测试；不加这个定义时只得到可供调用的状态机模块。检查进程退出状态：0 表示这次列出的检查通过；非 0 须看失败项。实际编译器版本、测试输出与源文件哈希应随验证记录保存，不能把复制的“PASS”当作证据。

要复现主时间轴，先用释放电平运行至少所选阈值的确认时间，再把这一时刻标成教材 t=0。默认阈值 5 ms，测试先运行 5 ms 释放预热，再输入教材波形；阈值改成 10 ms 时，预热也至少 10 ms。预热不产生按下事件，不藏在“刚上电立刻按下”的假设里。

本次维护在已有 **GCC 13.1.0** 上，以以上严格 C11 选项编译并运行通过；定义 NDEBUG 的版本和不含测试的模块编译也通过。实际测试输出如下，范围仅限这些主机路径：

<pre><code>PASS: waveform, boot-held, startup-bounce, active-high, wrap, gap, gap-boundary, short-pulse, short-release, thresholds, parameters, invalid-time</code></pre>

覆盖固定波形与精确边界、启动按住/初始抖动、有效高、无符号回绕、超长与恰好允许的间隔、短脉冲/释放、不同阈值、无效参数与时间错误。维护者还在隔离副本中将接受条件故意改成“时长严格大于阈值”：它能编译，但行为测试失败；恢复原源码后重新通过。这不是穷尽证明，也没有做硬件验证。完整源码内的测试及同目录 README.txt 可供复现。

进阶实验：先运行原程序；再只把接受条件误改为“时长严格大于阈值”，预测 11 ms 检查为何失败，保存失败输出后恢复原文件并重跑。测试要检验行为边界，不以动画看起来平顺为通过条件。主机测试不覆盖电气门限、驱动采样开销或真实中断调度。

## 5. 验收与证据 {#validation}

| 层级 | 输入或任务 | 通过条件 | 证据边界 |
| --- | --- | --- | --- |
| 概念 | 不看答案说明上拉松开、按下、悬空；画按下电流路径 | 区分电压、逻辑、动作、事件；解释高阻与门限；能计算示例电流 | 自述与练习，不是硬件测量 |
| 人工模型 | 每 1 ms、5 ms 阈值、先确认释放，输入原/扩展波形 | 手算 11/31/41 ms；原始多边沿只形成相应稳定事件；保持不重复 | 本页人工数据，不是示波器记录 |
| 算法边界 | 10 ms 阈值、启动按住、短脉冲、丢采样、有效高与回绕 | 解释 8 ms 释放被吞、启动不发按下、100 ms 重新计时；清楚未观测盲区 | 按已声明输入契约判断 |
| C 主机 | 实际可下载源、编译器、命令、退出码、输出；故意改错再恢复 | 已列主机测试全部通过，边界改错能被测试检出 | 只证明对应程序/输入/编译器的结果，不声称穷尽 |
| 目标硬件（可选） | 完整料号、原理图、模式、供电、上下拉、工具/库版本 | 静态电压合规，真实输入、采样间隔、稳定迁移与事件可对应；多次操作/约定干扰下无未解释多计漏计 | **本章未做硬件验证**，需另立记录 |

上板前先核对实际芯片门限与允许电压，不将未知 5 V 信号接入输入。用万用表查静态电压；用合适的示波器或逻辑分析仪观察短时输入，万用表不能证明抖动不存在。记录测量带宽、采样周期、阈值与原始波形，区分仪器自身的观测能力和程序的采样能力。

完成原理层的标准是能不看答案推导，完成代码层的标准是能解释和复现实验。点击过控件不等于掌握；本站不记录个人掌握百分比。若卡住，可向助手指出你不清楚的是节点、电平、时间、事件还是代码。隔一段时间再换上下拉条件重做一题，检验迁移而非只背答案。

## 6. 已核对的来源与范围 {#sources}

核对日期：**2026-10-17**。以下列出实际阅读的版本与范围；电气资料不替本站自编算法或 5 ms 参数背书。

| 来源 | 已核对位置 | 支撑论点与范围 |
| --- | --- | --- |
| <span id="source-st"></span>[ST AN4899：Guidelines for GPIO hardware settings and low-power consumption on STM32 MCUs](https://www.st.com/resource/en/application_note/an4899-stm32-microcontroller-gpio-hardware-settings-and-lowpower-consumption-stmicroelectronics.pdf)，May 2026 / Rev 4，33 页 | §2.1（p7）；§4.2—4.3.1（p11—13）；§5.1、§5.1.1（p15）；图 4 与 §5.1.4（p17）；§5.1.5（p18—19）；§6.1（p25）；§6.3（p26） | 输入/输出缓冲、上下拉、门限术语、漏电与允许条件；**仅 STM32 情形**。§5.1.5 是开漏/外部接收器与 I²C 计算背景，不是通用按钮电阻表 |
| <span id="source-ti"></span>[TI SCEA094：Debounce a Switch](https://www.ti.com/document-viewer/lit/html/scea094)，October 2020，2 页，未见修订字母 | p1 Product Overview、Design Considerations；[官方 PDF](https://www.ti.com/lit/ab/scea094/scea094.pdf) | 触点抖动、误触发与 RC 硬件消抖，漏电压降和电阻/功耗取舍；**不验证本站软件算法或阈值** |
| <span id="source-logic"></span>[TI SZZA036C：Understanding and Interpreting Standard-Logic Data Sheets](https://www.ti.com/lit/an/szza036c/szza036c.pdf)，December 2002 / revised June 2016，Rev C，60 页 | §3.5（p8）、§4.5.5—4.5.6（p28—29）、§4.6.1—4.6.3（p35—36） | 保证的输入电压范围、CMOS 输入条件与施密特滞回的区别；是逻辑器件手册阅读指南，**不是某个 MCU 的电气规格** |
| <span id="source-c11"></span>[WG14 N1570 C11 Committee Draft](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)，2011-04-12 | §6.2.5 第 9 段、§7.20.1.1 | 无符号模运算与精确宽度整数类型；公开委员会草案，不是付费最终标准。精确宽度类型可能不由某实现提供，本程序要求 uint32_t；不能由算术规则推出硬件计时正确 |
| <span id="source-teach"></span>[Matt Pocock teach](https://github.com/mattpocock/skills/blob/main/skills/productivity/teach/SKILL.md?plain=1) | 单一成果、知识先行、反馈、回忆迁移与打印参考的方法 | 仅教学组织方法，**不提供电气或软件正确性证据** |

假设门限、示例阻值、人工采样数据、解释和习题均独立编写，不从资料中的某个器件偷换成通用参数。实物应用仍要查选定完整料号和板级设计。

## 带着能解释的结果回到主线 {#next-lesson}

先完成一个可解释的结果：沿节点连接推到电压范围，再从观测序列推到一次事件。原理层完成后可先休息；C 进阶层可在补基础后回来练。下一章“GPIO 输出与 LED 限流”仍在建设中，不要求提前购买或选定开发板。

[打开可打印速查](gpio-button-reference.html) · [返回学习地图第 01 阶段](./engineering-map.html#stage-01)
