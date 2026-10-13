---
title: MCU 内存学习路线
description: 从 C 对象与生命周期到 Cortex-M 栈、链接预算和 FreeRTOS 监测的六步学习路线。
---

# MCU 内存学习路线

面向使用 Cortex-M、Keil 与 FreeRTOS 的初学者。按六步完成一次小工程实验：先解释内存，再建立预算，最后用运行证据检查风险。模拟现象帮助理解，工程结论必须回到实际内核、工具链和链接布局。

## 1 画清对象与生命周期

写一个包含普通局部变量、static 变量和 malloc 的函数，分别标注指针对象与它指向的内存。观察函数返回后哪些对象仍然有效；检查 NULL、释放配对和悬空指针。局部变量可能在寄存器中或被优化掉。产出：一张对象归属图，能解释为什么把指针置空不等于释放。

## 2 跟踪栈指针变化

先手算连续压入两个 32 位值时的 SP，再用调试器核对寄存器与反汇编。Cortex-M 使用满递减栈，压栈先减 SP；实际函数可能一次预留整个栈帧，还需满足对齐要求。产出：一份调用与返回记录，不把“栈顶”当成固定高地址。参考 [Arm 栈内存说明](https://developer.arm.com/community/arm-community-blogs/b/architectures-and-processors-blog/posts/how-much-stack-memory-do-i-need-for-my-arm-cortex--m-applications)。

## 3 建立静态预算

读取启动文件、Scatter 与 Map，标明静态数据、堆及各栈的边界。查看 Call Graph，找出大栈帧和最深调用链；单列函数指针、递归、汇编与未知项。产出：预算表及待确认项。Max Depth 还需补入异常压栈和上下文切换开销。参考 [Keil AN316](https://www.keil.com/appnotes/files/apnt_316.pdf)。

## 4 测量任务与中断栈

逐任务读取 uxTaskGetStackHighWaterMark，原生 FreeRTOS 结果乘 sizeof(StackType_t) 换算字节；它表示历史最小剩余量。CMSIS-RTOS2 的 stack_size 已是字节。压力测试后保存水位，同时独立评估 MSP。产出：任务栈与中断栈余量记录。参考 [FreeRTOS API 定义](https://raw.githubusercontent.com/FreeRTOS/FreeRTOS-Kernel/main/include/task.h) 与 [CMSIS 线程接口](https://arm-software.github.io/CMSIS_6/main/RTOS2/group__CMSIS__RTOS__ThreadMgmt.html)。

## 5 区分泄漏与碎片

重复同一业务循环，记录申请、释放、失败、空闲总量及最大连续空闲块。heap_4 和 heap_5 提供 vPortGetHeapStats；heap_5 须先定义区域。产出：能区分正常存活对象、未释放对象与不连续空闲块的日志。最大空闲块还包含分配器开销因素。参考 [FreeRTOS 堆管理](https://freertos.gitbook.io/mastering-the-freertos-tm-real-time-kernel/mastering.ch03)。

## 6 验证最坏路径

覆盖最大报文、超时重试、深层调用、中断高负载和长时间运行。水位扫描只能估算已改写深度，不能证明所有路径安全；不要覆盖正在使用的栈。产出：测试清单、故障现场记录和有依据的安全余量，编译配置或功能变化后重新验证。

## 配套笔记与实验

- [MCU 堆栈原理与监测](../c-memory/heap-stack.md)：完整概念、C 代码和工程检查清单。
- [C 语言与内存笔记索引](../c-memory/index.md)：已经整理好的内容。

建议每走完一步，记下芯片型号、工具链版本、测试条件和观察结果。
