---
title: GPIO 输出与 LED 驱动速查
description: GPIO 输出路径、限流预算公式、手册脚注、晶体管边界和故障检查的压缩打印参考。
---

# GPIO 输出与 LED 驱动速查 {#reference-overview}

先读[完整第 02 单元](gpio-led.html#prerequisites)，再用这张卡回忆。无需指定开发板，未做硬件验证；打印自动展开答案，打印后恢复折叠。

## 规则速查 {#quick-reference}

输入观察节点，输出命令控制驱动通路。写 0/1 是命令，不直接保证节点实际电压。GND 是参考，VIO 是允许的 I/O 电源。

### 输出模式 {#reference-modes}

| 模式 | 写 0 | 写 1 |
| --- | --- | --- |
| 推挽 | 低侧导通，GPIO → GND | 高侧导通，VIO → GPIO |
| 开漏 | 低侧导通，GPIO → GND | 释放；无主动高侧 |

释放不等于高；上拉与负载共同决定电压，无确定偏置不保证高。真实电压须查负载下的 VOH/VOL 和完整料号；高阻不等于零漏电。

### LED 支路与方向 {#reference-paths}

A 阳极、K 阴极，正常用 A → K 正向电流；查实际封装，不把外观当保证。Rled 与 LED 串联，同一支路放前后均可；不省略。VF 随电流、温度、器件改变，反向不是正常模式。

- 拉电流：VIO → 高侧 → GPIO → Rled → LED(A → K) → GND。推挽写 1 请求亮。
- 灌电流：VIO → Rled → LED(A → K) → GPIO → 低侧 → GND。写 0 请求亮。
- 开漏释放、拉电流接法加上拉：VIO → Rpu → GPIO → Rled → LED → GND，可能仅微弱导通；节点受负载影响，不能保证高或亮度。Rpu 不替代 Rled。
- 上拉加低侧导通另有 VIO → Rpu → GPIO → 低侧 → GND 电流，即使 LED 支路 off，仍须计入相关预算。

所有路径都假设正确方向、有效串联电阻、同一允许 VIO 与理想稳态驱动。“无稳态通路”只描述 LED 正向支路，不保证实物黑暗或逻辑高；漏电、瞬态、亮度和电气许可在模型外。[完整 16 组表](gpio-led.html#path-truth-table)。

### 事件到期望，再映射命令 {#reference-events}

固定推挽灌电流 LED，起点期望灭。只消费已经过滤的人工事件，不运行消抖或定时器：每条 PRESSED 翻转一次期望状态，NONE/RELEASED 保持。期望亮 → 写 0，期望灭 → 写 1。

| 人工时间 / ms | 事件 | 期望 | 命令 |
| --- | --- | --- | --- |
| 0 | NONE | 灭 | 1 |
| 11 | PRESSED | 亮 | 0 |
| 12 | NONE | 亮 | 0 |
| 31 | RELEASED | 亮 | 0 |
| 41 | PRESSED | 灭 | 1 |

时间只作记录标签。换推挽拉电流接法，业务翻转条件不变，命令映射反过来。回放不是物理连接、C 固件、RTOS 或硬件验证。

## 限流与同时预算 {#reference-budget}

驱动有压降：拉电流须看负载下的 VOH，灌电流须扣除 VOL。名义示例全为假设：`(3.3−2.0−0.2)V/0.002A=550Ω`。附近 560 Ω 只是起点，仍需最坏核算与功率/温度降额。

```text
t = 容差百分数 / 100
Rmin=R(1−t)；Rmax=R(1+t)
Imax=max(0,Vmax−VFmin)/Rmin              [A]
Imin=max(0,Vmin−VFmax−驱动压降上限)/Rmax  [A]
Pmax=max(0,Vmax−VFmin)²/Rmin             [W]
mA=A×1000；mW=W×1000
组上界=N×Imax；相关总上界=组上界+其他/内核电流
```

上界保守采用驱动压降最小 0；VF 包络必须适用于目标器件、电流与温度。`Vmax≤VFmin` 无正向余量；Imin=0 不保证全范围导通，任何电流都不直接保证亮度。不能用 Typ 填保证 Min；缺界就记“缺依据”。其他电流即使 LED 无通路也照算。

虚构练习包络：电源 3.0—3.6 V、VF 1.8—2.2 V、驱动压降 0—0.4 V、680 Ω±5%，同组同方向同时亮；单脚/组/相关总预算为 4/12/30 mA，其他/内核 10 mA。这些不是 MCU/LED 规格、AMR 或实测。

| 情况 | 每路上界 / mA | 同组 / mA | 含其他总量 / mA | 条件化比较 |
| --- | --- | --- | --- | --- |
| 680 Ω，4 路 | 2.786 | 11.146 | 21.146 | 所列均未超 |
| 680 Ω，5 路 | 2.786 | 13.932 | 23.932 | 组超 |
| 680 Ω，8 路 | 2.786 | 22.291 | 32.291 | 组、总超 |
| 560 Ω，4 路 | 3.383 | 13.534 | 23.534 | 组超 |

默认 Rmin=646 Ω、Rmax=714 Ω、Imin≈0.560 mA、每只电阻 Pmax≈5.015 mW。比较用未舍入值；恰等预算没有余量。额外上拉、不同负载或供电域须另记账；查实际分组/供电路径，不将拉灌正负相抵。[预测计算](gpio-led.html#budget-lab)和[十题完整输入](gpio-led.html#recall-questions)。

## 完整料号与脚注 {#reference-parts}

- **STM32F103C8T6 / LQFP48，DS5319 Rev 20，July 2025：**§5.3.13 表 37 普通 GPIO 八脚同时、IIO=±8 mA、2.7<VDD<3.6 V 对应 VOL≤0.4 V/VOH≥VDD−0.4 V；是条件化输出电平资料，不能直接当各脚预算。§5.2 表 7 的单 I/O ±25 mA、相关 VDD/VDDA 和 VSS 各 150 mA 为 AMR 应力限制，非正常设计目标。表 5 脚注 5 对 PC13—15 的电源开关有 3 mA、≤2 MHz、≤30 pF 限制，并禁止作电流源（如 LED）；普通脚条件不能覆盖特殊禁止。总量须含内核耗电，不编造统一端口数字。
- **Kingbright WP710A10ID，DSAL0505/1101024897，V.12A，印刷日期 08/11/2023：** p2 在 IF=10 mA、TA=25°C 时 VF Typ 1.9 V/Max 2.3 V，附 VF ±0.1 V 注释；没有保证 Min，也不是 2 mA/全温包络。p1 查 A/K；直流、反向、脉冲 AMR 均非默认设计许可，脉冲和温度另有条件。

两者只是读手册案例，不是获准配对接线。记录完整料号、脚、方向、供电/温度、保证方式、全部预算、脚注与未知界。Min/Max 也须连同测试/表征条件使用。

## 何时外接驱动 {#reference-driver}

直驱不满足电流/电压/总预算或负载电源条件时，用有依据的驱动。LED 仍需串联限流或恒流；继电器和高功率负载不能照搬 GPIO 直驱，感性负载还须核对关断保护。

- NPN 低侧：负载接集电极、发射极接地，GPIO 经基极电阻；按实际饱和条件算基极电流、GPIO 预算、VCE(sat) 和损耗，检查复位关断。
- N 沟道 MOS 低侧：源极接参考地，漏极接负载；看实际 VGS、所需 RDS(on) 对应的 VGS/温度条件、栅极电荷/瞬态驱动、热与默认栅源下拉。VGS(th) 不保证充分导通；检查公共参考（或合适隔离/驱动）及上电顺序，避免反向供电。

不提供通用晶体管/电阻型号；[TI SLPA021 §4、§5.2](https://www.ti.com/lit/an/slpa021/slpa021.pdf)支撑 MOS 门极条件与低侧结构，具体选型仍需器件手册。

## 六类故障的优先检查 {#reference-diagnosis}

| 破坏的前提 | 下一步 |
| --- | --- |
| 缺 Rled | 先断电补有依据的串联限流，不靠延时限制导通电流 |
| 方向可疑 | 查完整封装 A/K，不用反向加压试亮 |
| 开漏释放当高 | 查偏置与全部负载，不凭写 1 保证电压/亮度 |
| 推挽互相冲突 | 先断开冲突源，LED 电阻未必在冲突回路 |
| 同时电流漏算 | 核单脚/组/相关总量，加内核/其他与上拉 |
| MOS 阈值当导通 | 查 RDS(on) 的 VGS 条件、驱动/参考和默认关断 |

[逐题诊断](gpio-led.html#diagnosis-lab)。这些是假想独立场景，不是对真实板卡的故障归因。

## 合上卡片，再解释 {#lesson-notes}

### LED 灭能推出 GPIO 没有任何电流吗？ {#reference-recall}

不能。低侧导通加上拉时，即使 LED 支路 off，仍可能有 VIO → Rpu → GPIO → 低侧 → GND 电流；还有模型没有计算的漏电或瞬态。错在把 LED 支路当成整个引脚。

### 开漏写 1 加上拉，能保证高吗？ {#reference-release}

仍要查负载。拉电流 LED 可经 Rpu 获得微弱电流并加载节点，不保证高逻辑或亮度。无确定偏置时高低都不保证。

### 换拉电流接法，PRESSED 规则要改吗？ {#reference-transfer}

只在 PRESSED 翻转期望的规则不变；变的是期望 → 命令映射：推挽拉电流请求亮写 1、请求灭写 0。保持/释放不反复翻转。

### 单脚未超，为什么五路仍需重新核算？ {#reference-budget-recall}

假设 680 Ω±5%、电源上界 3.6 V、VF 下界 1.8 V、驱动最小压降 0，每路约 2.786 mA。五路同组约 13.932 mA 已超虚构组预算 12 mA；其他电流还要计入相关总量。单脚未超不推导全部未超。

### VF 典型值和 MOS 阈值分别缺少什么？ {#reference-condition-recall}

VF Typ 缺保证下界及目标电流/温度包络；VGS(th) 缺所需负载下 RDS(on) 的驱动条件。都不能用一个看起来合适的数字替整套条件验收。

## 核对来源与边界 {#reference-sources}

核对日期 2026-10-17。[ST AN4899 May 2026 Rev 4](https://www.st.com/resource/en/application_note/an4899-stm32-microcontroller-gpio-hardware-settings-and-lowpower-consumption-stmicroelectronics.pdf) §4.2、§4.3.2：输出通路；§5.1 与 §5.1.4—5.1.5：工作条件及负载。[ST DS5319 Rev 20 / July 2025](https://www.st.com/resource/en/datasheet/stm32f103c8.pdf) §5.1、§5.2 表 7、§5.3.13 表 37、表 5 脚注 5：具体条件与特殊限制。[Kingbright WP710A10ID](https://www.kingbrightusa.com/images/catalog/SPEC/WP710A10ID.pdf) DSAL0505/1101024897、V.12A、印刷日期 08/11/2023，p1 极性、p2 电气条件。[TI SLPA021 November 2024](https://www.ti.com/lit/an/slpa021/slpa021.pdf) §4 p4—6、§5/§5.2 p7：门极和低侧条件。首选读 AN4899 §4.3.2，再画一条回路。图片、例子与练习原创，资料不为本站理想模型背书。

模型只证明所列输入与软件行为，不能替代完整料号、原理图、电气和硬件验证。遇到疑问，可向助手指出卡在驱动、节点、LED 方向还是事件映射；隔一段时间换接法重做，不把一次正确视为长期掌握。[下一章：位运算与寄存器读写](c-bits-registers.html) · [位与寄存器速查](c-bits-registers-reference.html) · [回完整章节](gpio-led.html) · [学习地图](engineering-map.html#stage-01) · [资源比较](engineering-map.html#resource-comparison)。
