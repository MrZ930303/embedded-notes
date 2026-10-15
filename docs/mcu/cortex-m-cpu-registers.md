---
title: Cortex-M CPU 核心寄存器
description: 交互理解 R0–PC、xPSR、异常屏蔽寄存器与 CONTROL；以 Armv7-M Cortex-M3/M4 为主。
---

# Cortex-M CPU 核心寄存器 {#overview}

本文以 Armv7-M Cortex-M3/M4 为主，从 R0–R15 与 AAPCS 调用规则讲起，再说明 xPSR、PRIMASK、FAULTMASK、BASEPRI 和 CONTROL。交互模型使用 Cortex-M4 的示例配置，不用于验证真实固件或设备配置。

## 一张图看懂寄存器组 {#register-map-title}

R0–R12 是通用数据寄存器。R13、R14、R15 分别是 SP、LR、PC 的架构别名。硬件角色由架构定义；AAPCS32 则规定函数调用时寄存器如何传递参数、返回结果，以及跨调用由哪一方保存。

| 寄存器 | AAPCS32 约定 |
| --- | --- |
| R0–R3 | 前四个参数和返回值；调用者保存。 |
| R4–R8、R10–R11 | 被调用者保存。 |
| R9 | 平台寄存器或被调用者保存，取决于平台/PCS。 |
| R12 / IP | 调用者保存的过程间临时寄存器，链接器 veneer 也可能使用。 |
| R13 / SP | 当前栈指针别名；有 MSP、PSP。 |
| R14 / LR | 普通子程序返回链接；异常入口可装入 EXC_RETURN。 |
| R15 / PC | 程序计数器和控制流寄存器。 |

依据：[AAPCS32 §6.1.1](https://github.com/ARM-software/abi-aa/blob/2025Q1/aapcs32/aapcs32.rst)、[Arm Cortex-M4 Generic User Guide §2.1.3](https://documentation-service.arm.com/static/5f2ac4ab60a93e65927bbdbf)、[ST PM0214 Rev 10 §2.1.3](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)。

## 点选寄存器：它现在代表什么？ {#register-explorer-title}

交互页面可点选 R0–R15、xPSR/APSR/IPSR/EPSR、PRIMASK、FAULTMASK、BASEPRI 和 CONTROL，查看用途与限制。R9 的调用约定取决于平台；R13/SP 有 MSP/PSP 两种物理栈；R14/LR 的 EXC_RETURN 与普通函数返回地址不同；R15/PC 在 Cortex-M4 常见读取情境中通常显示当前指令地址加 4。某些 PC-relative 运算还会对齐地址，不能用统一偏移反推所有指令。

Cortex-M 执行 Thumb 指令。对 BX/BLX 及相关写 PC 的形式，目标最低位为 1 表示 Thumb 状态；分支目标地址不把该状态位当作普通取指地址位。

## R13 / SP、R14 / LR、R15 / PC {#stack-link-pc-title}

- **SP：** CONTROL.SPSEL 选择 Thread mode 使用 MSP（0）还是 PSP（1）。Handler mode 始终使用 MSP。异常入口先把帧压入异常发生前的 Thread 栈；Thread 用 PSP 时，帧在 PSP，而 Handler 随后从 MSP 运行。
- **LR：** 普通调用中是返回链接；异常入口时 LR 可保存特殊的 EXC_RETURN。Armv7-M 基本帧示例：<code>0xFFFFFFF9</code> 返回 Thread/MSP，<code>0xFFFFFFFD</code> 返回 Thread/PSP，<code>0xFFFFFFF1</code> 返回 Handler/MSP。浮点扩展帧具有其他 EXC_RETURN 状态位。Handler 后续的普通函数调用可能覆盖活跃 LR，编译器按需保存。
- **PC：** Cortex-M4 的常见读值是当前指令地址 + 4；PC-relative 形式可能先按字对齐。对 BX/BLX 和相关写 PC 形式，目标 bit 0 代表 Thumb 状态，不应解释为普通奇偶地址位。

## xPSR：APSR、IPSR、EPSR 的组合视图 {#xpsr-title}

xPSR 由 APSR、IPSR、EPSR 的不重叠字段组成。APSR 包含 N、Z、C、V，Q 及 DSP 扩展的 GE 取决于实现；IPSR 表示当前异常号，Thread 为 0，外部 IRQn 的异常号为 IRQn + 16；EPSR 描述 Thumb 执行状态和实现的 IT/ICI 状态。普通 MRS 读取 EPSR 视图时其位读为 0，MSR 对 EPSR 的写入会被忽略；IPSR 不能通过普通 MSR 写入。调试异常现场时还可检查自动压栈的 xPSR。

依据：[CMSIS-Core 6 Core Register Access](https://arm-software.github.io/CMSIS_6/main/Core/group__Core__Register__gr.html)、[ST PM0214 Rev 10 §2.1.3、§2.3.5](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)。

## PRIMASK、FAULTMASK、BASEPRI：屏蔽激活，不是清 Pending {#mask-registers-title}

- **PRIMASK = 1：** 阻止所有可配置优先级异常激活；NMI、HardFault 不受它屏蔽。
- **FAULTMASK = 1：** 阻止除 NMI 外的所有异常，包括 HardFault。异常返回时通常自动清除；从 NMI 返回例外。
- **BASEPRI = 0：** 禁用 BASEPRI 阈值屏蔽；不影响 PRIMASK/FAULTMASK 状态。
- **BASEPRI 非零：** 阻止优先级数值等于或大于阈值的可配置异常激活；数值越小优先级越高。NMI 和固定优先级 HardFault 不由 BASEPRI 屏蔽。

它们改变异常激活资格，不会清除 Pending，也不会中止已经 Active 的 Handler。同步故障、SVC、故障升级和 Lockup 有各自的异常规则，不应把某个 C 操作概括成必然触发 HardFault。写入屏蔽状态要遵守特权限制；FAULTMASK 不能在 NMI 或 HardFault 优先级下有效置位。

依据：[ST PM0214 Rev 10 §2.1.3、§2.3.2、§4.3.5–4.3.7](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)、[CMSIS-Core 6](https://arm-software.github.io/CMSIS_6/main/Core/group__Core__Register__gr.html)。

## BASEPRI 的编码：4 个实现位的示例 {#basepri-encoding-title}

NVIC 优先级字段左对齐存放在字节中。实现的高位数依具体内核/芯片而定，未实现的低位读为 0、写入忽略。数字越小代表优先级越高；BASEPRI 的 0 表示关闭自身阈值屏蔽。

演示假设 <code>__NVIC_PRIO_BITS = 4</code>，四位全部用作抢占优先级，不分配子优先级位。逻辑优先级 5 编码为 <code>5 &lt;&lt; 4 = 0x50</code>；<code>BASEPRI = 0x50</code> 阻止逻辑优先级 5–15，放行 0–4。BASEPRI = 0 不阻止任何优先级。若只实现高四位，原始写入值 <code>5</code> 位于未实现的低位，有效阈值读回相当于 0；<code>__set_BASEPRI(5)</code> 不等于设置逻辑优先级 5。

互动可调整阈值，并叠加 PRIMASK、FAULTMASK；表中 Pending 始终保留，已有 Active handler 继续运行。这是注明实现位数的教学模型，不是器件配置校验。

依据：[CMSIS-Core NVIC priority access](https://arm-software.github.io/CMSIS_6/main/Core/group__NVIC__gr.html)、[ST PM0214 Rev 10 §4.3.7](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)。

## CONTROL：Thread 特权级、栈选择和浮点上下文 {#control-register-title}

- **nPRIV (bit 0)：** 0 为 Thread 特权，1 为 Thread 非特权。Handler 始终特权运行；非特权 Thread 不能靠直接写 CONTROL 将自己升回特权。
- **SPSEL (bit 1)：** 0 选择 MSP，1 选择 PSP，但只用于 Thread mode。Handler 始终用 MSP。
- **FPCA (bit 2)：** 有 FPU 的实现中表示浮点上下文状态，可影响异常浮点保存/延迟压栈；它不是 FPU 使能位。

特权代码更改 `CONTROL` 后应紧接着执行 `ISB`，让后续指令按新的特权状态和 Thread 栈选择继续执行。常见次序为 `MSR CONTROL, Rn; ISB`。非特权 Thread 不能通过写 `CONTROL` 清除 `nPRIV` 来提升权限。

交互包含 Thread/MSP、Thread/PSP 和嵌套 Handler 情景。Thread/PSP 进入异常时，自动帧先入 PSP，Handler 活动 SP 是 MSP，入口 LR 例为 <code>0xFFFFFFFD</code>。嵌套 Handler 的例子在 MSP 上压入帧，入口 EXC_RETURN 例为 <code>0xFFFFFFF1</code>。异常入口 LR 中的 EXC_RETURN 与保存帧内的普通 LR 槽位代表不同东西。

依据：[ST PM0214 Rev 10 §2.1.3、Table 11](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)、[Arm Cortex-M33 TRM](https://support.arm.com/documentation/100235/0100/The-Cortex-M33-Processor/Programmer-s-model/Core-registers/CONTROL-register)。

## 不要把所有 Cortex-M 当成同一套寄存器 {#architecture-variants-title}

| 内核 | 架构 | 相关差异 |
| --- | --- | --- |
| Cortex-M0 | Armv6-M | 有 PRIMASK；没有 BASEPRI、FAULTMASK；CONTROL.nPRIV 不支持。 |
| Cortex-M0+ | Armv6-M | 有 PRIMASK；没有 BASEPRI、FAULTMASK；特权支持可选，依实现而定。 |
| Cortex-M23 | Armv8-M Baseline | 有 PRIMASK；没有 BASEPRI、FAULTMASK。 |
| Cortex-M3 | Armv7-M | 有 PRIMASK、FAULTMASK、BASEPRI。 |
| Cortex-M4 / M7 | Armv7E-M | 有 Mainline 屏蔽寄存器；FPU/FPCA 行为依具体实现。 |
| Cortex-M33 | Armv8-M Mainline | 有 BASEPRI、FAULTMASK；安全扩展、FPU 等可选配置带来额外状态。 |

差异依据：[Arm Cortex-M0 Guide](https://documentation-service.arm.com/static/5ea6ce5e9931941038def8c1)、[Cortex-M0+ Guide](https://documentation-service.arm.com/static/5f04abc8dbdee951c1cdc9f7)、[Armv8-M 架构与程序员模型](https://documentation-service.arm.com/static/64b7f5c638511951cb79fc45)、[Armv7-M Architecture Reference Manual](https://support.arm.com/ddi0403/Introduction)。

## 怎样把寄存器知识用于调试 {#using-the-model-title}

先确认目标核、架构版本和可选功能；随后核实芯片头文件中的 <code>__NVIC_PRIO_BITS</code>、优先级分组以及异常控制状态。调试时分清当前模式、活动 SP、入口时的 EXC_RETURN 和保存到异常帧中的 LR；解释 R0–R12 时按目标工具链 ABI/AAPCS 规则判断保存约定。

交互固定为四个已实现优先级位的 Cortex-M4 教学模型，不读取目标设备，不能验证真实芯片、NVIC 分组、库宏或固件屏蔽效果。实际配置需对照该 MCU 的参考手册、CMSIS 设备头文件和目标上的调试证据。

继续阅读：[产生 HardFault 后使用栈回溯分析异常代码](./hardfault-stack-trace.md)。

## 官方资料 {#sources-title}

- [Arm Cortex-M4 Devices Generic User Guide (DUI0553A)](https://documentation-service.arm.com/static/5f2ac4ab60a93e65927bbdbf)
- [Arm Cortex-M3 Devices Generic User Guide](https://documentation-service.arm.com/static/5ea823e69931941038df1af5)
- [Armv7-M Architecture Reference Manual (DDI0403E.e)](https://documentation-service.arm.com/static/606dc36485368c4c2b1bf62f#page=532)
- [AAPCS32 §6.1.1, release 2025Q1](https://github.com/ARM-software/abi-aa/blob/2025Q1/aapcs32/aapcs32.rst)
- [CMSIS-Core 6 Core Register Access](https://arm-software.github.io/CMSIS_6/main/Core/group__Core__Register__gr.html) and [NVIC](https://arm-software.github.io/CMSIS_6/main/Core/group__NVIC__gr.html)
- [ST PM0214 Rev 10](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)
- [Arm Introduction to Armv8-M Architecture and its Programmers Model](https://documentation-service.arm.com/static/64b7f5c638511951cb79fc45)
