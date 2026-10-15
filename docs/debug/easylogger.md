---
title: EasyLogger：从第一行日志到可维护的固件诊断
description: 理解 printf、日志等级和 RTT/UART 的分层，操作过滤、RTT 缓冲、中断优先级与 UART 带宽教学模型，建立任务日志和独立故障记录的使用边界。
---

# EasyLogger：从第一行日志到可维护的固件诊断 {#easylogger-title}

适用环境：STM32／GD32 的 Cortex-M 工程，Keil MDK、FreeRTOS、J-Link。GD32 的其他指令集型号不在本文范围。HTML 是完整的主要阅读页面；本文同时提供全文搜索输入。四个实验均是教学模拟，不连接真实硬件，不测量真实时序。

## 快速结论：先让一条任务日志可靠地走完 {#quick-start}

推荐入门路线：普通任务调用 `log_e`、`log_w`、`log_i`、`log_d`，EasyLogger 管理等级、标签和格式，`elog_port_output` 接 RTT 或 UART。业务模块依赖统一日志接口，更换传输通道时只调整移植层。最初采用同步 EasyLogger、FreeRTOS Mutex、RTT SKIP；先不启用额外异步或缓冲模块。

这里的同步只表示调用任务完成格式化和向 RTT RAM 复制，不表示 J-Link 已取走数据。开发时 J-Link RTT 很便利；维修、工装和产品测试按需选择 UART DMA。ISR 只记录固定长度事件，任务再格式化；HardFault 保存独立最小现场，下次启动再解释。量产默认控制等级、限频并审查敏感信息。

临时观察一个变量或极小单任务程序可以使用 `printf`；多模块、多人维护、需要量产开关的固件更适合统一日志。学习清单不能当作自动通过硬件测试的证明。

## printf、EasyLogger 与传输是三个层次 {#logging-layers}

`printf` 把参数格式化成文本，再交给 C 运行库输出。EasyLogger 在格式化之外提供等级、模块标签、格式与过滤。RTT、UART 是传输后端，所以 EasyLogger 与 RTT 可以配合使用。EasyLogger 仍然消耗 CPU、栈和 RAM；浮点格式化支持和体积取决于工具链，库宣传体积不是整个工程的实际占用。

普通日志的路径：源代码调用 → 编译期宏筛选 → 参数求值 → 运行时等级与标签过滤 → 共享缓冲区格式化 → 关键词过滤 → 后端写入。关键词通常在格式化后检查，不能当作免除格式化成本的前置筛选。运行时不输出，也未必省掉实参求值。

不要把 `++counter`、获取锁或其他业务操作放进日志参数。比如 `log_d("n=%u", ++counter)` 会因编译删除而改变业务行为。先完成业务操作，再记录结果。RAW 和 hexdump 不属于本页普通 `log_x` 的过滤模型。

来源：[EasyLogger 等级宏与接口](https://github.com/armink/EasyLogger/blob/master/easylogger/inc/elog.h)、[共享缓冲和过滤顺序](https://github.com/armink/EasyLogger/blob/master/easylogger/src/elog.c)。

## RTT 与 UART：选择传输，也选择满载策略 {#transport-choice}

RTT 通过调试接口访问 MCU RAM 缓冲，不额外占用 UART。常见背景访问模式不必为每个字符停止 CPU；某些目标只能使用会暂停 CPU 的 Stop Mode，因此不能保证完全不影响运行。RTT 与 SWO/ITM、半主机机制不同，能观察 SWO 的工具不一定支持 RTT。

UART DMA 适合串口工装、产品测试和维修，无需长期连接 J-Link。DMA 减少逐字节搬运负担，但格式化、复制、排队、启动传输、回调及缓存维护仍有成本。两者都不是历史数据库；没有接收方或持久化，旧日志通常无法事后找回。

RTT SKIP 在一次数据不能完整放入时整次不写；TRIM 尽量写入、舍弃尾部，UTF-8 可能截在多字节字符中间；BLOCK 等待空间，主机不消费时可能无限等待。普通开发日志建议 SKIP，并统计未完整接收次数。完整性单位是一次写入，不能保证跨多次调用的长文本或 hexdump 完整。SKIP 不覆盖最旧消息。

非阻塞只是写入不等待主机；整条 `log_i` 仍可能格式化、等待 Mutex 或进入短临界区。写入 RAM 不等于 PC 已收到，更不等于文件保存。

来源：[SEGGER RTT 文档](https://kb.segger.com/RTT)、[官方 RTT 源码](https://github.com/SEGGERMicro/RTT)。

## 等级过滤实验：编译删除与运行时不输出 {#filter-lab}

教学模拟，不连接真实硬件。等级映射固定为 ASSERT=0、ERROR=1、WARN=2、INFO=3、DEBUG=4、VERBOSE=5，数字越小越严重。

全局编译上限 C、文件 `LOG_LVL` 上限 F、运行上限 R、消息等级 L。普通 `log_x` 只有同时满足 `L <= C` 和 `L <= F` 才被保留，否则是“编译删除，参数不求值”。保留后虚拟参数计数增加，再判断 `L <= R`；未通过是“参数已求值，运行时不输出”。不会执行用户输入的 C 表达式。

TAG 按字符串包含匹配；关键词在生成模拟格式化文本后做包含匹配。RAW/hexdump 不纳入模型。C=WARN、R=VERBOSE 无法恢复 INFO；C=DEBUG、R=ERROR 的 DEBUG 会增加虚拟参数计数但不输出；C=DEBUG、F=WARN 时文件 DEBUG 已删除。运行过滤不能恢复编译期删除的日志。

## Keil 移植：源码、配置与验证入口 {#keil-port}

EasyLogger 通常加入 `elog.c`、`elog_utils.c`、项目自己的 `elog_port.c`，使用匹配版本的 `elog.h` 和唯一生效的 `elog_cfg.h`。RTT 加入 `SEGGER_RTT.c`、完整匹配头文件和项目配置副本 `SEGGER_RTT_Conf.h`；当前官方 RTT 还有 `RTT/SEGGER_RTT_ConfDefaults.h`，不要混搭版本。完整源码从官方项目获得，固定版本并保留许可证。本文没有提供完整可直接编译的板级工程。

建议起点：`ELOG_LINE_BUF_SIZE=256`、`BUFFER_SIZE_UP=2048`、`SEGGER_RTT_MODE_DEFAULT=SEGGER_RTT_MODE_NO_BLOCK_SKIP`、`RTT_USE_ASM=0`。关闭 EasyLogger 额外异步与缓冲模块。需要优化汇编时再加入匹配工具链的 `SEGGER_RTT_ASM_ARMv7M.S`，检查链接，不能认为 AC5、AC6 配置完全相同。

以下为教学配置片段，分别放在匹配版本各自的配置文件中，并非可直接编译的板级工程：

```c
/* elog_cfg.h：关闭额外异步和缓冲模块 */
#define ELOG_LINE_BUF_SIZE 256
/* SEGGER_RTT_Conf.h：对相关编译单元一致生效 */
#define BUFFER_SIZE_UP 2048
#define SEGGER_RTT_MODE_DEFAULT SEGGER_RTT_MODE_NO_BLOCK_SKIP
#define RTT_USE_ASM 0
```

EasyLogger 直接写 RTT 无需重定向 `fputc`/`_write`，也不要求半主机、ITM 或专门开启 MicroLIB。Include Paths 加入组件、EasyLogger、RTT、配置目录、CMSIS、FreeRTOS。检查预处理结果，避免厂家包的同名配置遮蔽工程配置。所有编译单元需使用一致 RTT 配置。使用所需 C99 支持，确认 `snprintf`/`vsnprintf` 可用，测量实际任务栈。

静态 Mutex 需 `configUSE_MUTEXES=1`、`configSUPPORT_STATIC_ALLOCATION=1`。查询调度器状态需 `INCLUDE_xTaskGetSchedulerState=1`；`portMAX_DELAY` 真正无限等待通常还需 `INCLUDE_vTaskSuspend=1`。Idle/Timer 静态内存要求按内核版本及工程配置补齐。

保留官方 RTT 锁，检查最终 `SEGGER_RTT_LOCK/UNLOCK` 展开。临界区可能只屏蔽部分中断，比阈值更紧急的 ISR 不能因此认定可并发写同一缓冲。带缓存内核还需检查控制块和数据的可见性。

Keil Debug 选择 J-LINK/J-TRACE Cortex，按芯片配置 SWD；先确认下载和运行，再打开 RTT Viewer。Keil 已占用 J-Link 时可选择 Existing Session。无输出按序检查：编译开关 → 初始化与启动 → 等级过滤 → 程序是否运行 → `_SEGGER_RTT` RAM 地址及可访问性 → 满缓冲 → 缓存及低功耗限制。

来源：[EasyLogger 移植](https://github.com/armink/EasyLogger/blob/master/docs/zh/port/kernel.md)、[RTT 默认配置](https://github.com/SEGGERMicro/RTT/blob/main/RTT/SEGGER_RTT_ConfDefaults.h)、[Keil MDK-ARM](https://kb.segger.com/Keil_MDK-ARM)、[RTT Viewer](https://kb.segger.com/J-Link_RTT_Viewer)。

## 任务、Mutex 与 Assert：把共享资源规则写清楚 {#task-mutex}

推荐教学实现只允许正常任务使用。调度器启动后，由初始化任务完成 `AppLog_Init`，再创建或放行会打印的业务任务。上电早期记录另设计严格单写者的最小路径，不默认复用依赖 Mutex 的接口。初始化后保持格式及过滤稳定；运行时修改也需要同步。

Mutex 是共享资源的任务级互斥机制：任务 A 持有日志锁时，任务 B 等待，A 释放后 B 才操作同一缓冲。EasyLogger 共享格式化缓冲，锁必须覆盖格式化过程，不能只包最后的 `SEGGER_RTT_Write`。绕过 EasyLogger 直接写 RTT 仍要遵守其并发规则。优先级继承能缓解部分优先级反转，不能消除死锁，也不自动保证最大等待时间。

禁止普通日志用于 ISR、HardFault、栈溢出钩子、关中断临界区、调度器挂起区和日志自身回调。时间戳、输出、断言回调不能递归打印；业务代码持有其他锁时应避免循环锁依赖。要求明确最大时延的任务，应设计有界事件记录、汇总和限频。

ISR 不能获取或释放 Mutex，等待为零也不合法。`xSemaphoreTakeFromISR`/`GiveFromISR` 适用于相应二值或计数信号量，不适用于 Mutex。调度器正在运行不表示当前不是 ISR；中断可以发生在运行中的调度器上。

不能把 `elog_port_output_lock` 的等待简单改成零；该回调返回 void，拿锁失败直接返回后，核心仍可能继续写共享缓冲。丢弃或有界等待必须在入口或架构层设计完整失败路径。

Assert 验证程序员认为必须成立的条件，例如初始化资源成功或状态符合约定。队列满、设备断线等可预期情况通常需要正常错误处理。先执行操作、保存返回值，再检查；不要把获取锁等副作用放入 `configASSERT`，关闭断言可能同时删除操作，关闭后仍需明确失败处理。EasyLogger 默认断言处理可能再次打印，应使用不依赖日志锁的独立处理路径。

教学伪代码仅展示操作与检查顺序，名称没有对应板级实现：

```c
result = CreateRequiredResource();
if (result == NULL) {
    IndependentFailurePath(); /* 不依赖日志锁的项目处理 */
    return;
}
configASSERT(result != NULL);
```

HardFault 是硬件异常，与软件断言不同；关闭断言不会修复非法访问、栈损坏或错误上下文。开发断言可以停住调试，量产需要项目自己的安全处置与恢复。

来源：[FreeRTOS 信号量与 Mutex 源码](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/main/include/semphr.h)、[断言与调试](https://github.com/FreeRTOS/FreeRTOS-Kernel-Book/blob/main/ch12.md)。

## ISR 轻量事件：先复制，再由任务解释 {#isr-events}

流程：识别并处理硬件中断源 → 构造固定长度事件 → 非等待投递 → 普通任务取出并格式化。事件可含 id、source、value，短记录按值复制；不能将指向 ISR 局部变量的指针留给任务。队列必须在对应中断启用前创建；队列满只统计丢失，不能等待。按 FromISR 返回的唤醒信息和具体端口规则决定 `portYIELD_FROM_ISR`。

高频捕获和更严格实时中断可只记录计数、标志或预分配环形缓冲。`volatile` 不保证原子性：多个 ISR 递增、任务读后清零、多字快照都需明确同步。微秒级分析优先硬件捕获、周期计数器或逻辑分析仪，不能依赖大量文本。

## ISR 优先级检查器：NVIC 数字越小越紧急 {#isr-lab}

教学模拟，不连接真实硬件。固定前提：典型 Cortex-M3/M4/M7 FreeRTOS 端口，所有实现位用于抢占优先级。实现位数 b 为 1..8，逻辑阈值 T 为非零整数，IRQ 逻辑值 P 为整数，范围均按 `0..2^b-1`；寄存器阈值为 `T << (8-b)`。

P<T 更紧急，禁止所有 FreeRTOS API，包括 FromISR；P>=T 仅表示处于可调用适用 FromISR API 的优先级范围，仍禁止 Mutex 和普通任务 API。b=4、T=5 得到 0x50；IRQ4 和 IRQ0 禁止，IRQ5、IRQ15 可调用适用 FromISR。NVIC 数值越小越紧急，FreeRTOS 任务优先级则是数值越大越高。实际分组、器件实现位和驱动参数编码仍须核对，本文不生成假装通用的初始化代码。

来源：[FreeRTOS Cortex-M3/M4 中断优先级](https://www.freertos.org/Documentation/02-Kernel/03-Supported-devices/04-Demos/ARM-Cortex/RTOS-Cortex-M3-M4)。

## UART DMA：指针必须活到传输完成 {#dma-lifetime}

不能把 EasyLogger 共享日志指针交给 `HAL_UART_Transmit_DMA` 后立即返回；下一条日志可能覆盖尚未发送的数据。应复制到发送队列拥有的存储，由单一发送者启动 DMA，完成后才释放。

工程必须定义复制入队接口、满队列策略、过长记录处理、BUSY/启动失败归属、完成与错误回调、环形回绕、多生产者同步和丢失计数。回调不能调用普通日志。DMA 内存须能被外设访问，带 D-cache 的器件按厂商要求清理缓存和对齐；停止、复位前 flush 也需时间上限。

打开 EasyLogger 异步宏不会自动解决这些问题；通常先在调用方格式化，再决定哪些等级进入缓冲，部分高严重度日志仍可能同步输出。异步不等于 ISR 安全。

来源：[EasyLogger 异步源码](https://github.com/armink/EasyLogger/blob/master/easylogger/src/elog_async.c)。

## RTT 环形缓冲实验：容量、写入与等待 {#rtt-lab}

教学模拟，不连接真实硬件。物理容量 N 留一个字节区分空满，有效容量 N-1；`free=N-1-used`，读写指针按模 N 前进。真实固件编码由工程决定；此模型用 TextEncoder 统计 UTF-8 字节数，不能用字符数代替。

SKIP 在 len<=free 时全收，否则收 0 并增加一次丢弃写入。TRIM 接收 min(len,free)，不足计一次未完整写入和丢失字节。BLOCK 先接收容得下的部分，其余 pendingWrite 等待；主机读取后继续，全部完成模拟调用才返回。浏览器主线程不会被阻塞，同一发送者等待时不能发起下一次写入。主机断开时 pending 可以无限等待，模型不虚构超时。读取最多 min(requested,used)。

手算例：N=32，写 20 后剩余 11。再写 16，SKIP 收 0，TRIM 收 11，BLOCK 收 11 并待 5；主机读 8 后 BLOCK 完成余下 5。成功只表示放入 RAM，不表示 PC 收到或保存。

页面物理容量范围为 2..4096 字节，输入文本最多 16384 码元，单次读取请求为 0..1000000 字节。容量、模式改变会重建空缓冲；BLOCK 等待期间禁止该发送者继续写入及改配置，可以读取、断开、重连或重置。重置放弃等待写入，不代表固件有超时机制。图形按比例缩略，读写指针以数值为准，模型不保存文本或还原被截断字符。

## UART 带宽估算器：平均能装下，突发仍会溢出 {#uart-lab}

教学模拟，不连接真实硬件。固定 8N1：每字节 1 起始位、8 数据位、1 停止位，共 10 bit。输入波特率 baud、每条字节 B、每秒条数 f、缓存字节 Q，须为有限非负数，baud 与 B 必须为正。

理论有效字节率=baud/10；需求=B*f；单条线路时间毫秒=B*10000/baud；占用率=需求/理论字节率。持续超载时，空缓存近似填满秒数=Q/(需求-理论字节率)。否则只说明平均速率可容纳，突发仍可能溢出，不能保证永不丢日志。忽略协议空闲、DMA 边界、调度开销；线路时间不是启动 DMA 调用的 CPU 耗时。

115200、B=100、f=200、Q=2048：理论 11520 byte/s，需求 20000 byte/s，单条约 8.68 ms，占用约 173.6%，连续平均模型约 0.242 秒填满缓存。

## HardFault：独立保存最小现场 {#fault-record}

故障处理不要依赖 `log_e`、FreeRTOS Mutex、动态内存或普通 Flash 驱动。任务栈、MSP、调度器及共享缓冲都可能损坏。最小异常入口保存 EXC_RETURN、MSP/PSP 和可用故障寄存器；确认帧可读后才读取，放入独立保留区，再执行项目安全处置或复位，下次启动验证、解释。

记录可包含 magic、版本、长度、固件构建 ID、序号、frame_valid、寄存器、校验。Handler 的 LR/EXC_RETURN 与异常帧 LR 不同。有效原始 Cortex-M4 硬件帧的核心 PC 在 SP+0x18；FP 扩展不会把核心帧移到 +0x48。不能无条件把原始 SP[6] 当 PC，是因为必须先验证 SP 的含义、有效 RAM、对齐、完整帧长度、地址加法溢出和入栈失败，不能拿 C 函数 prologue 后的 SP 代替异常入口 SP。

FPU 扩展帧与延迟压栈需要辨别。STKERR、MSTKERR、LSPERR 可能表示现场不可靠；BFAR/MMFAR 结合有效位解释；非精确 BusFault 的 PC 未必是致错指令。不同 Cortex-M 能力不同，M0/M0+ 不套用完整 M4 模型。

即使待检查 SP 合法，普通 C handler 自身仍需要健康栈；MSP 损坏可能在检查前再次 fault。高可靠方案要编译器、内核特定的最小汇编入口、独立紧急栈及反汇编审查，本文不提供伪通用的 AC5/AC6 可复制 handler。

保留 RAM 需正确段和 Scatter File UNINIT 设置，启动程序、Bootloader、ECC 初始化及复位类型均不能覆盖。NOINIT/UNINIT 不等于掉电保存。记录先标无效，写字段与校验，最后提交有效标记；下次启动验证后才使用。缓存和复位保持性需实测；故障时写 Flash 要专门失效设计，通常先保存可靠最小记录，恢复后再持久化。分析使用对应构建的 AXF/ELF、Map、源码与编译选项，不能拿重新编译的地址表猜测。

来源：[ST Cortex-M4 PM0214](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)、[Keil AN209](https://www.keil.com/appnotes/files/apnt209.pdf)、[Keil 链接与 Scatter 设置](https://www.keil.com/support/man/docs/uv4/uv4_dg_adsld.asp)。

## 量产策略与人工验收 {#production}

DEBUG 保留常用等级，VERBOSE 临时开启、限频；TEST 记录构建 ID、复位原因、关键事件；RELEASE 默认 ERROR/WARN，INFO 按需，编译关闭大量 DEBUG/VERBOSE。RAW 和直接底层输出另行审查。日志不包含密钥、密码、令牌、不必要个人信息，维修接口配置适当权限。

关键历史更适合固定长度二进制事件：ID、时间基准、参数、次数、序号、构建 ID、校验。设计异常持续判定、恢复事件、限频、磨损控制与掉电恢复，不能每次循环写 Flash。看门狗复位后，只能忠实记录“上次复位原因为看门狗”，不能伪造复位前已保存的事件。

人工验收至少覆盖：两个以上任务并发打印；断开主机业务仍运行且丢弃计数增长；长行和浮点下的任务栈、最坏延迟；队列满不等待；真实 NVIC 优先级；DMA BUSY/错误/回绕/缓存；安全环境中故障及复位记录；量产字符串、敏感数据、对应符号文件归档。页面勾选或教学计算不能替代这些测试。

## 易错点纠正 {#corrections}

当前官方 `ElogErrCode` 只定义 `ELOG_NO_ERR`，不要照抄未定义的 `ELOG_ERR`。当前 RTT 接口是 `SEGGER_RTT_SetFlagsUpBuffer`，不是 `SEGGER_RTT_SetFlags`。配置必须在编译单元间一致；禁用汇编用 `RTT_USE_ASM=0`，或正确配置匹配汇编。

非阻塞不代表整条日志无等待；调度器运行不代表不是 ISR；异步不代表 ISR 安全；DMA 指针须活到传输完成；Assert 与 HardFault 不同；保留 RAM 不等于掉电保存；故障 C 函数不能假设自己的栈正常。

## 验证边界与来源追溯 {#validation-limits}

本页是由明确编辑稿制作的教学笔记，完整参考工程未随页面提供。研究阶段曾在云端以官方 EasyLogger/RTT C 源码及模拟 CMSIS/FreeRTOS 做主机烟雾测试：DEBUG/RELEASE 基础格式化、编译过滤、长行输出长度上限及满缓冲计数通过 ASan/UBSan；LeakSanitizer 因环境限制关闭。

该结论只对应研究参考实现；页面的新教学片段不继承该烟测结论。未在 Keil、AC5/AC6、真实 FreeRTOS 并发或目标硬件验证。四个交互只演示规则，不连接硬件，不是时序测试。源码链接的 master/main 会变化，接入工程应固定所用版本并保留许可。

浏览器窄视口验收只属于桌面视口模拟，不能称为真实手机或真实硬件测试。

## 官方来源与继续阅读 {#references}

2026-10-15 官方分支 HEAD 定位：[EasyLogger master 806328e131836662fa83dd43364a53f699fd76ac](https://github.com/armink/EasyLogger/tree/806328e131836662fa83dd43364a53f699fd76ac)、[RTT main 4d8feab3150f86f37a9d323ddc88d6cdf5673072](https://github.com/SEGGERMicro/RTT/tree/4d8feab3150f86f37a9d323ddc88d6cdf5673072)、[FreeRTOS Kernel main 8be86d4a24fd4091f8f4192018423ab590f408db](https://github.com/FreeRTOS/FreeRTOS-Kernel/tree/8be86d4a24fd4091f8f4192018423ab590f408db)。它们只标识本次官方来源，不是先前主机烟测的快照，也未据此重新执行 C 或硬件测试。

- [EasyLogger 项目](https://github.com/armink/EasyLogger) 与 [移植说明](https://github.com/armink/EasyLogger/blob/master/docs/zh/port/kernel.md)。
- [elog.h：宏、错误枚举和断言](https://github.com/armink/EasyLogger/blob/master/easylogger/inc/elog.h)、[elog.c：共享缓冲与过滤](https://github.com/armink/EasyLogger/blob/master/easylogger/src/elog.c)、[elog_async.c：异步边界](https://github.com/armink/EasyLogger/blob/master/easylogger/src/elog_async.c)。
- [SEGGER RTT 文档](https://kb.segger.com/RTT)、[RTT 源码](https://github.com/SEGGERMicro/RTT)、[默认配置](https://github.com/SEGGERMicro/RTT/blob/main/RTT/SEGGER_RTT_ConfDefaults.h)。
- [Keil MDK-ARM](https://kb.segger.com/Keil_MDK-ARM)、[J-Link RTT Viewer](https://kb.segger.com/J-Link_RTT_Viewer)。
- [FreeRTOS Mutex 与信号量](https://github.com/FreeRTOS/FreeRTOS-Kernel/blob/main/include/semphr.h)、[Cortex-M 中断优先级](https://www.freertos.org/Documentation/02-Kernel/03-Supported-devices/04-Demos/ARM-Cortex/RTOS-Cortex-M3-M4)、[内核书第 12 章：断言与调试](https://github.com/FreeRTOS/FreeRTOS-Kernel-Book/blob/main/ch12.md)。
- [ST PM0214](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)、[Keil AN209](https://www.keil.com/appnotes/files/apnt209.pdf)、[Keil Scatter 配置](https://www.keil.com/support/man/docs/uv4/uv4_dg_adsld.asp)。

返回[调试与实战](./index.md)，继续阅读 [Cortex-M CPU 核心寄存器](../mcu/cortex-m-cpu-registers.md)。
