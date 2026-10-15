---
title: HardFault 后的 Cortex-M 异常栈回溯分析
description: 使用 EXC_RETURN 选择 Cortex-M3/M4 异常栈，按基本帧和可选 M4F 扩展帧偏移核对 PC。
---

# HardFault 后的 Cortex-M 异常栈回溯分析 {#overview}

在 STM32/GD32 与 Keil MDK 中分析 HardFault，先保留故障现场，再确认异常入口、所选栈和硬件帧。只有确认帧可信，并匹配了实际运行固件的调试产物，stacked PC 才能映射到有依据的指令。

这篇文章以 Armv7-M Cortex-M3/M4 为范围。Cortex-M4F 的 FPU 是可选实现；下文扩展帧只适用于具备相应浮点扩展、且该异常使用扩展帧的目标。其他 Cortex-M 架构和芯片配置要核对各自的 Arm 架构手册与芯片参考手册。

> 页面中的 EXC_RETURN 选择器只演示架构位的含义和字段偏移。它不读取目标板或真实内存，也不判断任何真实固件现场。

## 先保留现场，再判断是否能解帧 {#preserve-fault-context}

在清除 sticky Fault 状态或继续运行之前，记录原始 HFSR、CFSR 及 MMFAR/BFAR 当前值，并注明固件构建身份。MMFAR 只有在 `CFSR.MMARVALID=1` 时、BFAR 只有在 `CFSR.BFARVALID=1` 时才是本次现场可用的地址；VALID 为 0 时寄存器里留下的数值不能当成本次故障地址。

`HFSR.FORCED` 表示可配置 Fault 被升级到 HardFault，应继续检查 CFSR 中具体的 MemManage、BusFault 或 UsageFault 状态。`HFSR.VECTTBL` 则指向异常向量读取相关的 BusFault 线索，不能直接归咎于普通的 stacked PC 指令。若状态报告栈压入/弹出错误，或所选栈不可读，应停止把其中的 PC、LR 当作可信现场；不要用另一条栈补出一个“看起来合理”的帧。

## 从异常入口 EXC_RETURN 选择栈 {#decode-exc-return}

发生异常时，处理器把被打断上下文的核心寄存器压入异常入口所选的栈，并在 Handler LR 中放入 `EXC_RETURN`。`EXC_RETURN` 不是被打断程序的普通 LR。基本帧中的 stacked LR 才是被打断上下文保存的 LR，位置为帧基址 `+0x14`。

对 Armv7-M 的这些 Cortex-M3/M4 返回标记，关键位为：

| EXC_RETURN 位 | 含义 |
| --- | --- |
| bit 2 | `0` 选择 MSP，`1` 选择 PSP 作为返回上下文所用的栈。 |
| bit 3 | `0` 返回 Handler 模式，`1` 返回 Thread 模式。 |
| bit 4 | `1` 表示基本帧；`0` 表示包含浮点扩展区的扩展帧（仅适用于具备该扩展的实现）。 |

Thread 模式可以使用 MSP 或 PSP。异常处理进入 Handler 后，Handler 使用 MSP；如果被打断的 Thread 正使用 PSP，硬件帧仍压入该 Thread 选中的 PSP，而不是 Handler 当前正在使用的 MSP。因而应根据发生该异常时对应的 Handler LR/EXC_RETURN 和异常入口栈值来选帧，不能读取 Handler 的 `CONTROL.SPSEL` 来推断，也不能把已执行 C handler prologue 后的当前 SP 当成异常入口 SP。

常见 Armv7-M 返回标记包括 `0xFFFFFFF1`（Handler/MSP/基本帧）、`0xFFFFFFF9`（Thread/MSP/基本帧）、`0xFFFFFFFD`（Thread/PSP/基本帧），以及具备 FPU 时的扩展帧形式 `0xFFFFFFE1`、`0xFFFFFFE9` 和 `0xFFFFFFED`。示意值用于解释位含义；应以目标内核和异常上下文中实际保留的 EXC_RETURN 为准。

## 基本硬件帧的字段偏移 {#basic-exception-frame}

下表地址均相对异常入口所选 MSP/PSP 在硬件压栈后的帧基址。每个字段占一个 32 位字。帧中的 PC 地址是 `[帧基址 + 0x18]` 的内容，而不是 EXC_RETURN 后再套一层固定修正。

| 硬件帧字段 | 相对帧基址偏移 |
| --- | --- |
| R0 | `+0x00` |
| R1 | `+0x04` |
| R2 | `+0x08` |
| R3 | `+0x0C` |
| R12 | `+0x10` |
| 被打断上下文的 LR（stacked LR） | `+0x14` |
| 被打断上下文的 PC（stacked PC） | `+0x18` |
| xPSR | `+0x1C` |

基本帧为 `0x20` 字节。硬件异常帧不包含普通 ABI/RTOS 切换时可能由软件保存的 R4–R11、S16–S31 等寄存器；这些值若存在，应按具体编译器、RTOS 与异常路径的保存约定分别识别。

## Cortex-M4F 扩展帧仍从同一帧基址开始 {#extended-fp-frame}

当 Cortex-M4 实现了 FPU，且本次异常使用扩展浮点帧时，核心帧仍从异常入口帧基址开始：R0 是 `+0x00`、stacked LR 是 `+0x14`、stacked PC 是 `+0x18`、xPSR 是 `+0x1C`。FP 扩展接在核心帧之后。Armv7-M ARM 的 `PushStack()` / `PopStack()` 算法先确定整个帧大小，再把 `frameptr` 指向扩展帧的起点；随后 `ReturnAddress` 仍写在 `frameptr + 0x18`。这是解读扩展帧偏移的主依据。

| FP 扩展字段 | 相对帧基址偏移 |
| --- | --- |
| S0 | `+0x20` |
| S1–S15 | `+0x24` 至 `+0x5C`，每项递增 `0x04` |
| FPSCR | `+0x60` |
| 保留字 | `+0x64` |

硬件扩展帧长度为 `0x68` 字节（基本核心帧 `0x20` 加 FP 区 `0x48`）。不要把 FP 区大小 `0x48` 加到帧基址后再读 PC：即使 `EXC_RETURN[4]=0`，stacked PC 仍在异常入口帧基址 `+0x18`，不是 `SP+0x48`。所说的 SP 必须是硬件异常入口所选栈上的帧基址，不是已经进入 C handler 并执行序言之后的当前 SP。

## 对齐填充、可选 FPU 与懒惰保存 {#alignment-and-lazy-stacking}

8 字节对齐由 `CCR.STKALIGN` 配置影响。若本次异常入口因对齐要求在完整硬件帧之外额外预留一个 4 字节对齐字，stacked xPSR 的 bit 9 会标出这一情况。该填充字不改变上表中 PC 等字段相对帧基址的偏移；恢复异常前 SP 时，需在帧长度之外另计该 `0x04` 字节。缺少本次入口的 xPSR 或相关栈信息时，不应猜测是否有填充。

浮点上下文可能使用 lazy stacking：硬件可先为 FP 状态预留扩展区，推迟实际写入。`FPCCR.LSPACT` 是 bit 0；`FPCAR` 可帮助定位待保存的 FP 上下文。预留空间不等于其中的 S0–S15/FPSCR 已经是本次现场的有效保存值。确认 FPU 是否实现、控制/状态值来自哪个时刻，并结合 lazy 状态判断字段可信度。

## 从 stacked PC 核对真实指令 {#map-stacked-pc}

只有当帧来源和完整性成立后，才用 stacked PC 查找指令。将 PC 映射到与正在运行固件完全匹配的 AXF/ELF、源码、map、符号和反汇编；构建选项、优化等级或产物不一致时，同一地址可能显示为不同代码。Keil µVision 的 Disassembly、Call Stack 与 Locals 视图取决于可用的调试符号、展开信息和调试驱动；工具显示的调用链不是硬件核心帧本身。

不要对 PC 或 LR 套用固定的 `-2` / `-4` 规则。Thumb 指令可以是 16 位或 32 位，返回地址语义取决于具体异常和指令边界；函数指针 bit 0 的 Thumb 状态标记也不能机械套到 stacked PC。应查看匹配版本的反汇编前后文并核对指令边界。简单扫描 RAM 中“像代码地址”的数值只能产生候选，不是可靠的调用栈展开证据。

## 栈帧不可信时停止推断 {#untrusted-frame}

若出现栈压入/弹出错误、lazy FP 保存错误、栈越界、内存不可读或明显损坏，应把 frame field 标成未知/不可信，先检查栈边界、栈指针破坏、访问权限和目标芯片存储映射。不要回退到另一条栈凑出 PC，不要把缺失字补零，也不要用 LR、PC 或扫描结果编造完整调用链。

回溯结果要区分直接可证的字段、仅支持某种解释的线索、以及当前资料不能确认的结论。HardFault 入口本身不说明唯一根因；Fault 类型、内核实现、配置、总线响应及现场完整性都可能改变能得出的结论。

## 四个固定的虚构现场 {#four-fault-snapshots}

下面的可选快照只是本页预置文本，不访问目标板或 RAM，不修改故障寄存器，也不是固件配置校验器。分析顺序是先保留现场和固件身份，再读 HFSR/CFSR；确认异常帧可信以后，才把 stacked PC 对照同一构建产物。案例中的数字和指令是固定教学输入，并不表示真实 STM32/GD32 板测。

### 案例 A：精确数据访问错误 {#case-a}

```text
Target Cortex-M3
EXC_RETURN FFFFFFF9
MSP 20001000; PSP 20004000
HFSR 40000000; CFSR 00008200; BFAR 60000004
R0 60000000; R1/R2/R3/R12 0
stacked LR 08002019; stacked PC 08001234; xPSR 01000000
AXF at 08001234: LDR r1,[r0,#4]
60000004 has no response
```

`FFFFFFF9` 选择 Thread/MSP 基本帧。若给出的 MSP 是异常入口帧基址，stacked PC 字段地址为 `20001018`，值为 `08001234`。`CFSR=00008200` 同时置 `BFSR.PRECISERR` 与 `BFARVALID`；有效 BFAR `60000004` 与 `R0 + 4` 及同版 AXF 中的 `LDR r1,[r0,#4]` 相符。题设说该地址无响应，因此该指令的访问与精确 BusFault 证据吻合。

这组数据没有说明 `R0` 为什么指向该地址，也没有证明更上游的指针或内存破坏原因。不要把原因扩展成“访问地址 0 总会 HardFault”之类通则。

### 案例 B：M4F 扩展帧、除零与 lazy FP {#case-b}

```text
Target Cortex-M4F
EXC_RETURN FFFFFFED
MSP 20007000; PSP 20002000
HFSR 40000000; CFSR 02000000
CCR 00000210; FPCCR C0000019; FPCAR 20002020
R0 3C; R1/R2/R3/R12 0
stacked LR 08004101; stacked PC 08003420; xPSR 01000200
AXF at 08003420: UDIV r2,r0,r1; DIV_0_TRP on; R1 0
pre-exception PSP 2000206C
```

`FFFFFFED` 选择 Thread/PSP 扩展 FP 帧。核心帧仍从异常入口 PSP 开始：stacked PC 位于 `[20002000 + 0x18] = 20002018`，给定值为 `08003420`。不要看到 `EXC_RETURN[4]=0` 就在 SP 上加 `0x48` 后取 PC；Armv7-M 的 `PushStack()`/`PopStack()` 算法先确定总帧大小，再让 `frameptr` 指向同一帧起点，核心 PC 仍写在 `frameptr + 0x18`。扩展区 S0 从 `+0x20` 开始，FPSCR 在 `+0x60`；硬件扩展帧总长 `0x68` 字节，额外对齐字另计。

`xPSR=01000200` 的 bit 9 为 1，表示这次栈对齐留有 4 字节填充；`0x68 + 0x04 = 0x6C`，与给定的异常前 PSP `2000206C` 对应。`CCR=00000210` 同时给出 `STKALIGN` bit 9 与 `DIV_0_TRP` bit 4。`CFSR=02000000` 置 `UFSR.DIVBYZERO`；同版 AXF 的整数指令 `UDIV r2,r0,r1`、`R1=0` 与除零 trap 配置相符，`HFSR.FORCED` 表示这个可配置 UsageFault 已升级。

`FPCCR=C0000019` 的 `LSPACT` bit 0 为 1，`FPCAR=20002020` 是题设给定的 FP 保存区地址。lazy 保存状态下，预留的 FP 槽位不代表 S0–S15/FPSCR 已经写入有效快照；案例没有这些槽位的原始内容，也没有解释 R1 为什么为零。这里是整数 `UDIV`，不是浮点除零。扩展帧、对齐填充和 lazy FP 状态都不能改变核心 PC 的 `+0x18` 偏移。

### 案例 C：IMPRECISERR 与过期 BFAR {#case-c}

```text
Target Cortex-M3
EXC_RETURN FFFFFFF9; MSP 20003000
HFSR 40000000; CFSR 00000400
BFAR 60000004; BFARVALID 0
stacked PC 08005020; matching AXF at PC: NOP
prior writes: multiple writes
stack-scan candidates 08001001 and 08002005
```

`FFFFFFF9` 选择 Thread/MSP 基本帧；若该 MSP 是帧基址，PC 字段地址为 `20003018`。`CFSR=00000400` 表示 `BFSR.IMPRECISERR`，即延迟报告的写错误。当前 stacked PC 映射到 `NOP`，并不能定位更早触发错误的 store。`BFARVALID=0`，因此 `BFAR=60000004` 是无效/旧值，不能作为本次故障地址。给出的 `08001001` 与 `08002005` 只是栈扫描候选，并非可靠调用链；要缩小范围需要更早的总线/跟踪证据或受控复现。

### 案例 D：异常入栈失败，帧不可读 {#case-d}

```text
Target Cortex-M3
EXC_RETURN FFFFFFFD
MSP 20007F00; PSP 1FFFFFE0
HFSR 40000000; CFSR 00001000
RAM starts 20000000; task stack 20000000..20000800
PSP timing unspecified; CCR unspecified
exception frame unreadable; stacked PC unknown
```

`FFFFFFFD` 选择 Thread/PSP，`CFSR=00001000` 置 `BFSR.STKERR`。题设明确帧不可读，stacked PC 必须保持未知。给定 PSP 数值低于 RAM 起始地址，但它的采样时点和 `CCR` 均未提供，所以不能复算对齐填充、精确尝试地址或唯一根因。

不能改用看起来位于 RAM 的 MSP 凑 PC，不能扫描 RAM 或补零猜帧，也不能虚构 MMFAR/BFAR。现有证据只够报告所选 PSP 帧不可信和 STKERR；栈耗尽、SP 被破坏、映射或访问问题都需要额外证据区分。

## 故障状态寄存器与位掩码 {#fault-status-masks}

以下为 Armv7-M/Cortex-M3/M4 的系统控制空间示例地址；具体芯片还应核对对应参考手册。CFSR 是 MMFSR `[7:0]`、BFSR `[15:8]` 与 UFSR `[31:16]` 的合并寄存器。

| 寄存器 / 位 | 地址或掩码 | 解读边界 |
| --- | --- | --- |
| CFSR | `0xE000ED28` | MMFSR/BFSR/UFSR 合并状态 |
| HFSR | `0xE000ED2C` | FORCED 表示可配置 fault 升级，需继续检查 CFSR |
| MMFAR | `0xE000ED34` | 仅 `CFSR.MMARVALID=1` 时作为本次有效地址 |
| BFAR | `0xE000ED38` | 仅 `CFSR.BFARVALID=1` 时作为本次有效地址 |
| HFSR.VECTTBL | bit 1 · `0x00000002` | 向量表读取相关 fault，不直接归因于普通 stacked PC 指令 |
| HFSR.FORCED | bit 30 · `0x40000000` | 可配置 fault 已升级到 HardFault；不单独指出底层原因 |
| CFSR.MMARVALID | bit 7 · `0x00000080` | MMFAR 有效标志 |
| BFSR.PRECISERR | bit 9 · `0x00000200` | 精确数据访问错误，结合 BFARVALID 与匹配反汇编 |
| BFSR.IMPRECISERR | bit 10 · `0x00000400` | 异步/延迟写错误，PC 可能越过肇事 store |
| BFSR.STKERR | bit 12 · `0x00001000` | 异常入栈错误，普通硬件帧解码可能不可信 |
| BFSR.BFARVALID | bit 15 · `0x00008000` | BFAR 有效标志；为 0 时不能用旧值定责 |
| MMFSR.MSTKERR | bit 4 · `0x00000010` | MemManage 入栈错误，需怀疑帧完整性 |
| UFSR.DIVBYZERO | bit 25 · `0x02000000` | 结合指令与目标配置；除零 trap 可配置 |
| FPCCR.LSPACT | bit 0 · `0x00000001` | lazy FP preservation 状态；预留槽位不证明 FP 值已保存 |

HFSR/CFSR sticky 状态采用 write-one-to-clear。先保存原始 HFSR/CFSR 和地址寄存器，再判断 `MMARVALID`/`BFARVALID`；在任何清除操作之前保留原值，不要把 W1C 写入用于现场演示。若状态未在本次复现前清理，多个置位可能累积自不同故障。

`FPCCR.LSPACT` bit 0 依据 Arm 寄存器定义和图示。PM0214 Rev.10 §4.6.2 一句正文把 LSPACT 标作 bit 1，与同节图、相邻 USER 字段和 Arm 定义冲突；本文说明该笔误并按 bit 0 解读。

## 在 Keil 中匹配实际固件构建 {#match-the-firmware-build}

1. **保留固件身份。**记录板上实际运行版本对应的 AXF/ELF、MAP、源码版本、Arm Compiler 版本和编译/链接选项；地址不能跨构建套用。
2. **先确认帧可信。**依据异常入口 `EXC_RETURN` 和当时选中的原始 MSP/PSP，检查帧地址、stacking fault、xPSR 对齐位与 FP 状态。C handler prologue 后的当前 SP 可能已改变。
3. **对照反汇编。**在 µVision 用匹配产物检查 Disassembly、Call Stack、Locals、符号与前后指令。优化、内联、尾调用和展开信息缺失都会影响源码映射/调用链；栈扫描只能给候选，不能确认完整回溯。
4. **确认调试器能力。**µVision `Fault Reports` 是否可用取决于当前 debug driver。驱动不支持时，根据已保存现场或只读寄存器视图检查状态；菜单缺失不构成故障原因证据。

Arm Compiler 6 的只读清单示例为：

```text
fromelf --text -c -s --output=firmware.dis.txt firmware.axf
```

仅使用产生该 AXF 的匹配 Arm Compiler 6 安装，并核对确切工具链版本；命令读取 `firmware.axf`、生成文本反汇编和符号清单，不执行目标程序。Arm Compiler 5 应使用其自身对应版本的工具与文档，不混用 AC5/AC6，也不把 AXF 上传到模型。

本页没有万能 naked HardFault handler，也不建议在故障 handler 中调用 `printf`、`malloc` 或 RTOS API。地址零访问和除零都不能一概断言为 HardFault；实际结果受指令、配置、内核和实现影响。对 PC 或 LR 不套固定 `PC-2`/`PC-4` 修正，且不能把 LR 当作硬件帧 PC 的替代品。

## 参考资料 {#sources}

- Arm, [Armv7-M Architecture Reference Manual DDI 0403E.e](https://documentation-service.arm.com/static/606dc36485368c4c2b1bf62f#page=532), B1-532–536、B1-539–540：异常进入/返回与 `PushStack()` / `PopStack()` 的帧构造算法。扩展帧偏移以此算法为准。
- Arm, [Cortex-M4 Devices Generic User Guide DUI 0553B](https://documentation-service.arm.com/static/5f2ac76d60a93e65927bbdc5), §§2.3–2.4、§4.3.10：处理模式、堆栈选择、核心寄存器、浮点状态。
- STMicroelectronics, [PM0214 Rev.10](https://www.st.com/resource/en/programming_manual/dm00046982-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf), §2.3 printed p.43 Fig. 12、§4.4：Cortex-M4 编程模型和 Fault 状态的交叉参考。帧偏移出现图示差异时，以 Armv7-M 算法为准。
- Arm, [AAPCS32](https://github.com/ARM-software/abi-aa/blob/main/aapcs32/aapcs32.rst)：过程调用约定。软件保存区和硬件异常帧需分别解释。
- Arm, [Cortex-M4 Devices Generic User Guide DUI 0553B](https://documentation-service.arm.com/static/5f2ac76d60a93e65927bbdc5#page=226), §4.3.10–13、§4.6.2–3：SCB fault 状态、有效位及 FPCCR/FPCAR 定义。
- Arm, [Arm Compiler fromelf User Guide DUI0805_l_en](https://documentation-service.arm.com/static/63eb52cb9567172d4e2aa9d7)：Arm Compiler 6 `fromelf` 的反汇编与符号清单参数。
- Arm/Keil, [AN209](https://www.keil.com/appnotes/files/apnt209.pdf#page=15)：µVision Fault Reports 的 driver 适用性与异常地址分析。

另见 [Cortex-M CPU 核心寄存器](./cortex-m-cpu-registers.md)，了解 R0–PC、xPSR 和异常控制寄存器。本文是架构教学材料，不替代具体 STM32/GD32 型号参考手册、勘误表或匹配固件的现场诊断。
