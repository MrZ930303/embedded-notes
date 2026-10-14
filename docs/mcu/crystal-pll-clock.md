---
title: MCU 晶振与主频：从 8 MHz 到 168 MHz
description: 通过可调 STM32F407 PLL 时钟树理解晶体、HSE/HSI、倍频、SYSCLK/HCLK/PCLK、精度、Flash 等待周期与 USB 48 MHz 约束。
---

<!-- 全文搜索输入；主阅读页是同内容的独立交互 HTML。 -->

# MCU 晶振与主频：从 8 MHz 到 168 MHz {#mcu-clock}

外部晶体提供基准，片内 PLL 产生更快的时钟。用 STM32F407 的 8 MHz → 168 MHz 实例，沿着反馈回路和时钟树，把倍频、分频与限制看清楚。

## 交互时钟树 {#clock-lab}

调整参考时钟、M/N/P/Q、AHB/APB 分频与 Flash 等待周期，检查候选配置；非法值不会应用。仅模拟 STM32F407 的 PLL 作为 SYSCLK、VDD 3.3 V / Scale 1，所有状态只存在于页面内存，不访问硬件。

## 01 · 8 MHz 的晶体，为什么能跑 168 MHz？ {#clock-short-answer}
外部晶体提供的是**频率基准**。CPU 使用的是芯片时钟树送来的时钟，两者不必相同。MCU 内部的锁相环 PLL 可以在自身允许范围内，把基准经过分频、倍频、再分频，得到更高频率。

以本文唯一数值模型 STM32F407 为例：

- 外部 8 MHz 晶体配合片内 HSE 振荡电路，形成 8 MHz 参考时钟。
- 先除以 M=8，得到 1 MHz 的 PLL 输入。
- PLL 让内部 VCO 稳定在 336 MHz，即输入的 N=336 倍。
- VCO 输出除以 P=2，得到 168 MHz 的 PLL 主输出，选作 SYSCLK。
- AHB 不再分频，HCLK=168 MHz，供 Cortex-M4 内核等使用。

**8 ÷ 8 × 336 ÷ 2 = 168 MHz**，总倍率是 21，不是直接把 N=336 当成 CPU 相对晶体的倍率。8 MHz 的周期为 125 ns，168 MHz 的周期约 5.95 ns。

这不是让晶体本身突然以 168 MHz 振动，而是片内有源振荡器在电源供能下产生更快的时钟，PLL 用反馈约束它的频率与相位。CPU 也并非每个时钟都完成一条指令：流水线、存储器等待、总线竞争与具体指令都会影响执行时间。

来源：[STM32F407 数据手册 DS8626](https://www.st.com/resource/en/datasheet/stm32f407vg.pdf)、[RM0090 的 RCC 时钟树与 PLL 配置](https://www.st.com/resource/en/reference_manual/rm0090-stm32f4xx-reference-manual-stmicroelectronics.pdf)。

## 02 · 晶体、晶振、HSE 与 HSI，分别是什么？ {#clock-crystal}
### 无源晶体不是独立的时钟发生器 {#clock-passive-crystal}

石英晶体是有谐振特性的无源器件。它需要放大器、反馈网络和合适的负载等组成振荡电路，才能持续振荡。MCU 常把放大电路集成在芯片里，外部晶体接到 OSC_IN / OSC_OUT，按芯片与晶体参数设计外围电容和 PCB。

口语里的“晶振”有时泛指无源晶体，有时指带有源电路的振荡器，选型时不能只看这个名称。**有源振荡器模块**自带振荡电路，需要供电，输出时钟信号；接入 STM32 的 HSE bypass 模式时，应按规定接 OSC_IN，OSC_OUT 的处理遵循手册。两者电气接法不能互换。

负载电容不是“各接一个标称 CL 的电容”。常见近似是 CL ≈ Ca×Cb/(Ca+Cb)+Cstray（Ca、Cb 为两侧电容），Cstray 包含引脚与 PCB 寄生；还要核查 ESR、驱动功率、起振裕量和布局，不能只凭频率相同替换晶体。见 [AN2867 振荡器设计指南](https://www.st.com/resource/en/application_note/an2867-guidelines-for-oscillator-design-on-stm8afals-and-stm32-mcusmpus-stmicroelectronics.pdf)。

### HSE / HSI 是时钟源名称 {#clock-hse-hsi}

- HSE：High-speed external，外部高速时钟源。在 STM32F407 中，可使用 4–26 MHz 晶体/陶瓷谐振器；外部数字时钟 bypass 模式的频率范围为 1–50 MHz，且须符合输入电平、占空比等电气条件。这两个范围不可混用。
- HSI：High-speed internal，片内高速 RC 时钟，STM32F407 的标称值是 16 MHz。它省去外部器件，复位后的系统时钟使用 HSI；精度随校准、供电与温度条件变化。
- HSE 与 HSI 都可以作为这个型号主 PLL 的输入源。本文交互中的 HSE 专指晶体模式，因此只接受 4–26 MHz；没有模拟 bypass。

“外部”不等于无条件更准。精度取决于实际器件、负载、温度、老化与 PCB。高精度/低漂移参考、满足接口要求的时钟与低成本起振方案，可能是不同的设计目标。

## 03 · PLL 如何倍频？看反馈回路 {#clock-pll}
### 锁相的是分频后的反馈 {#clock-feedback}

把参考输入先除以 M，送到鉴相/鉴频与控制环节；把 VCO 输出除以 N，也送回同一个比较环节。环路根据二者的误差调整 VCO。锁定后，平均意义上满足：

**fVCO ÷ N = fREF ÷ M**，所以 **fVCO = fREF ÷ M × N**。

随后，P 分频支路产生主 PLL 输出，Q 分频支路产生供 USB OTG FS、SDIO 和 RNG 使用的相关时钟域。图里的“×N”是锁定结果的等效表达，真实电路不是一个不耗能的数字乘法器。

本文图只画原理级反馈，不声称复现芯片内部的模拟实现、环路带宽或启动波形。PLL 需要等待锁定；输入频率、电压或分频参数不符合要求时，算式仍可能有结果，但不能据此认为硬件能可靠运行。

### 倍频没有凭空提高相对精度 {#clock-accuracy}

假设 8 MHz 参考相对标称值偏高 20 ppm，绝对偏差是 160 Hz。理想整数倍频到 168 MHz 后，仍偏高约 20 ppm，绝对偏差变成 3360 Hz。倍频没有把有误差的标尺变准。

频率精度、频率稳定度、相位噪声和边沿抖动是不同指标。PLL 对不同频段的噪声有不同传递特性，也会增加自身噪声；不能笼统说它总能“消除抖动”或总会“放大所有抖动”。高速接口还要核查具体精度和抖动指标。

## 04 · SYSCLK、HCLK、PCLK 不是同一个时钟 {#clock-tree}
STM32F407 的 SYSCLK 可以选择 HSI、HSE 或主 PLL 输出。没有开启 PLL 时，系统也可以运行；不是所有 MCU 都必须外挂晶体，也不是所有型号都具备同样的 PLL。

- **SYSCLK**：系统时钟选择器输出。本例选 PLL，168 MHz。
- **HCLK**：SYSCLK 经 AHB 预分频器后得到的 AHB/内核相关时钟。本例除以 1，168 MHz。
- **PCLK1**：HCLK 经 APB1 预分频。本例除以 4，42 MHz；STM32F407 的 APB1 上限为 42 MHz。
- **PCLK2**：HCLK 经 APB2 预分频。本例除以 2，84 MHz；APB2 上限为 84 MHz。
- **PLL 的 Q 支路**：从 VCO 单独除以 Q。本例 336÷7=48 MHz；它不是由 HCLK 再分出来的。

CPU 168 MHz 不代表所有外设也都运行在 168 MHz。UART 波特率、SPI、定时器、ADC 等还会在自己的时钟域继续选择或分频，读寄存器之前要先找出真实时钟源。

### 定时器还有一个常见例外 {#clock-timers}

对本文 STM32F407：APB 预分频为 1 时，连接该 APB 的定时器时钟等于 PCLK；预分频不为 1 时，定时器时钟等于 2×PCLK。因此典型方案下 APB1 定时器是 84 MHz，APB2 定时器是 168 MHz。**这不表示 APB 总线本身也被加倍**，定时器内部还可继续分频。

其他 STM32 系列/型号的定时器时钟选择、TIMPRE、内核时钟域、PLL 数量与允许范围可能不同。不要把本例寄存器或“乘二规则”不加检查地移植。

## 05 · 算出来，不等于能运行 {#clock-limits}
本文资料核查日期为 **2026-10-14**。数值模型依据 STM32F405/407 的 **DS8626 Rev 12（March 2026）** 与 **RM0090 Rev 22（May 2026）**，不覆盖同一本手册中的全部其他型号。

### 本例的约束表 {#clock-constraints}

| 项目 | 本模型采用的限制或条件 |
| --- | --- |
| HSE 晶体输入 | 4–26 MHz；bypass 是另外的电气模式 |
| HSI | 标称 16 MHz；不是精度保证 |
| PLLM | 整数 2–63，且 fREF/M 为 1–2 MHz |
| PLLN | 整数 50–432，且 VCO 为 100–432 MHz |
| PLLP | 2、4、6、8 |
| PLLQ | 整数 2–15 |
| PLL 主输出 / SYSCLK | 本模型选 PLL 作为 SYSCLK，P 输出须在 24–168 MHz |
| HCLK / APB1 / APB2 | 不超过 168 / 42 / 84 MHz |
| AHB 预分频 | 1、2、4、8、16、64、128、256、512 |
| APB 预分频 | 1、2、4、8、16 |
| 电源条件 | 固定为 VDD=3.3 V（落在 2.7–3.6 V 档）、内部调压器 Scale 1、正常运行 |
| Flash 等待周期 | 本电压档：0/1/2/3/4/5 WS 分别支持 HCLK ≤30/60/90/120/150/168 MHz；额外等待周期不会提高最高允许频率 |
| USB OTG FS 数值目标 | 勾选目标时，Q 支路标称值必须等于 48 MHz；还需单独满足精度与电气条件 |

RM 建议把 PLL 输入选在 2 MHz 以限制抖动；例如 M4/N168/P2/Q7 同样得到 168/48 MHz。本文保留常见的 1 MHz 输入算例，它仍在合法范围内。数据手册电气表的输入边界为 0.95–2.10 MHz，本模型按 RM 的名义配置范围 1–2 MHz 校验。

当前文档的 VCO 下限为 **100 MHz**，PLLN 可为 **50–432**。旧版本或旧教程可能写 192 MHz / N≥192。DS8626 修订历史记录了 VCO 下限更改；查表时要同时核对型号、文档版本与频率条件，不能把不同版本的数字拼在一起。

### 168 MHz 的前提 {#clock-power-flash}

上限不是无条件承诺。要核查数据手册的供电、温度等级、内部调压器状态、电源稳定性与运行条件。本文锁定 3.3 V / Scale 1，168 MHz 时要求至少 5 个 Flash 等待周期；Scale 2 最高仅 144 MHz，不能与 Scale 1 混用。换到其他 VDD 档位，等待周期表会变，不应套用本文简化校验。

升频前应先确保供电/调压器模式与 Flash 延迟满足目标频率，再调整分频与切换时钟；降频后再根据新频率降低延迟和电源要求。缓存与预取影响性能，不能代替合法的 Flash 等待周期配置。本文没有给出可直接烧录的寄存器写入程序。

### 48 MHz 只是 USB 检查的一部分 {#clock-usb}

USB OTG FS 需要合规的 48 MHz 时钟；RM §34.3.2 要求其输入时钟为 48 MHz ±0.25%（±120 kHz）。本页只能检查标称分频是否得到 48 MHz，不能测出振荡器在所有温度、电压下的误差与抖动。数据手册 USB FS 完整电气指标采用 VDD=3.0–3.6 V，本模型取 3.3 V。选择 HSI 即使能算出 48 MHz，也不能据此宣称 USB 合规；必须核验整个方案的精度预算。

不使用 USB 时，可以关闭本页的“要求 48 MHz”目标。此时 Q 支路超过 48 MHz 仍会被本模型拒绝：这是为了把练习限定在 SDIO/RNG 等外设所需的 ≤48 MHz 支路，并非 PLL Q 输出的普遍电气上限（DS 的 PLL48_OUT 上限为 75 MHz）。本页不覆盖关闭相关外设时的其他 Q 输出配置，也不会仅凭本页数值宣称 USB 合规。SDIO 与 RNG 的自身约束、时钟使能与寄存器配置仍需另查；本页不验证这些外设。

## 06 · 为什么通常用较低频率的外部参考？ {#clock-engineering}
低频外部参考与片内倍频，把两个职责分开：外部器件提供合适的频率基准，片内时钟系统按性能和功耗需要分配频率。常见几到几十 MHz 的器件容易选型，外围设计也能避免直接把几百 MHz 的时钟引入 PCB；成本、功耗、EMI、封装与电气兼容性都可能参与取舍。

这不是绝对规律。外部高速有源时钟、MEMS 振荡器、片内 RC、低速 32.768 kHz 晶体以及其他时钟方案各有用途。低速时钟通常用于 RTC 或低功耗计时，也不能仅凭“有晶体”推断它在给 CPU 提供主频。

### 高频率也有代价 {#clock-performance}

动态功耗常用 P≈αCV²f 帮助理解趋势：频率更高，电压或开关活动更高，通常会提高动态功耗。它不是芯片总功耗的精确计算式，还要考虑漏电、Flash、外设、等待和休眠时间。

提高主频不保证任务等比例变快。若程序受 Flash 等待、存储器访问、外设吞吐或算法限制，收益会更小；有时更快完成工作后进入休眠更省电，有时低频更合适，要测量任务级能耗与时序。

## 07 · 真正配置硬件前，按这条顺序检查 {#clock-checklist}
1. **确认器件身份**：完整 MCU 料号、修订版本、供电与温度范围；使用对应 datasheet、reference manual 和 errata。
2. **确认参考源**：晶体还是有源时钟，HSE 普通模式还是 bypass；检查电气规格、负载和起振条件，HSI 则查校准与全温误差。
3. **画出所有时钟域**：先算 PLL 输入、VCO、P/Q 输出，再算 HCLK、PCLK、定时器与接口时钟，不只看 CPU。
4. **配置运行条件**：在升频前确保合适的电源/调压器状态、Flash 等待周期和安全的总线分频。
5. **启动并等待就绪**：等待 HSERDY 等对应标志；配置 PLL 必须遵守关闭/不可作为当前系统时钟等要求；更改 PLLM 或 PLL 时钟源也须遵守 PLLI2S 关闭要求；开启后检查 PLLRDY，设置超时与失败处理。
6. **切换并确认**：改变 SYSCLK 选择后，读 SWS 确认实际时钟源；更新工程的时钟变量、SysTick 和依赖时钟的驱动，不能只改一个频率宏。
7. **测量并回归**：用合法分频的 MCO 输出或适合的定时器信号验证频率，避免探头负载扰乱晶体节点；测试通信、温度变化、复位与异常恢复。

时钟安全系统 CSS 和失效回退也有型号规定的行为，不能认为所有失锁都会自动无缝恢复。本文“模拟应用”只更新页面状态，省略真实上电、稳定与锁定时间，不连接硬件，也不保证某块开发板可运行。

## 08 · 官方资料与阅读边界 {#clock-references}
- [DS8626：STM32F405xx / STM32F407xx 数据手册](https://www.st.com/resource/en/datasheet/stm32f407vg.pdf)：查供电/频率条件、HSE/HSI 电气特性、PLL 参数、USB OTG FS 特性及修订历史。本文核验 Rev 12。
- [RM0090：STM32F4 参考手册](https://www.st.com/resource/en/reference_manual/rm0090-stm32f4xx-reference-manual-stmicroelectronics.pdf)：STM32F405/407 对应的 RCC 章节、RCC_PLLCFGR、时钟树、Flash 延迟表与电源控制。本文核验 Rev 22，PLLCFGR 见 §7.3.2。
- [AN2867：STM8 / STM32 振荡器设计指南](https://www.st.com/resource/en/application_note/an2867-guidelines-for-oscillator-design-on-stm8afals-and-stm32-mcusmpus-stmicroelectronics.pdf)：晶体选型、负载、增益裕量、起振与 PCB 设计。
- [STM32F407VG 官方产品页](https://www.st.com/en/microcontrollers-microprocessors/stm32f407vg.html)：查当前文档、勘误与完整器件信息。

本页是独立中文学习笔记，图形与交互为原理级教学模型，非 ST 官方配置工具或硬件验证报告。不同系列的 PLL/VCO 范围、最高主频、供电模式、外设时钟与寄存器编码都可能不同；移植之前必须重新核对。

