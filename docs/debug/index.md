---
title: 调试与实战
description: 从日志、运行证据与故障记录出发，理解固件诊断的适用范围与验证方法。
search: false
---

# 调试与实战

从可观察的记录出发，区分教学模型、工程设计和真实硬件证据。当前已发布 1 篇完整交互笔记。

## EasyLogger 固件日志

[EasyLogger：从第一行日志到可维护的固件诊断](./easylogger.md)

适用 STM32／GD32 Cortex-M、Keil MDK、FreeRTOS 和 J-Link。从 printf、日志策略与 RTT/UART 的分层开始，逐步理解任务 Mutex、ISR 轻量事件、DMA 缓冲寿命、独立故障现场和量产过滤。

四个教学实验可在页面内操作：等级过滤、RTT 环形缓冲、ISR 优先级、UART 带宽。它们不连接真实硬件，不能替代并发、栈、时延和板级验收。

## 相关笔记

- [MCU 堆栈原理与监测](../c-memory/heap-stack.md)：编译期预算、运行期水位与异常现场。
- [Cortex-M CPU 核心寄存器](../mcu/cortex-m-cpu-registers.md)：异常、栈选择与屏蔽寄存器。
- [HardFault 栈回溯分析](../mcu/hardfault-stack-trace.md)：匹配固件构建，核对硬件帧和故障状态。

## 后续方向

- Map、调用链与内存布局
- HardFault 现场记录与定位
- 日志、断点与时序观察
- 压力测试、长期运行和复现记录

在 [MCU 堆栈原理与监测](../c-memory/heap-stack.md) 中，已经可以看到「编译期预算 + 运行期水位 + 异常现场」的基本工作方法。

一份案例应保留：环境版本、问题现象、复现步骤、证据、根因和验证结果。

