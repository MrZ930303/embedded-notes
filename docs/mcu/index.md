---
title: MCU 基础与外设
description: 从晶体、PLL 与时钟树开始，沿着时钟和数据路径理解 MCU。
---

# MCU 基础与外设

先弄清时钟从哪里来、经过哪些分频，再理解外设的时序与数据流。

## 已完成的交互笔记

- [MCU 晶振与主频：从 8 MHz 到 168 MHz](./crystal-pll-clock.md)：用 STM32F407 的可调时钟树理解晶体、HSE/HSI、PLL、SYSCLK/HCLK/PCLK，以及供电、Flash、USB 与外设的限制。
- [Cortex-M CPU 核心寄存器](./cortex-m-cpu-registers.md)：以 Armv7-M Cortex-M3/M4 为主，交互查看通用寄存器、xPSR、异常屏蔽与 CONTROL。
- [产生 HardFault 后使用栈回溯分析异常代码](./hardfault-stack-trace.md)：根据 EXC_RETURN 和异常入口栈解析基本/扩展帧，核对 stacked PC 与真实构建证据。
- [MCU OTA：从分区到回滚](./mcu-ota.md)：比较单槽、暂存复制、Swap、A/B 与独立恢复镜像，观察分区、断电、试运行与回滚条件，并估算容量。

## 后续方向

以下内容尚在规划，不是已发布的笔记：

- GPIO 与寄存器读写：从位操作到可观察的引脚行为
- 定时器与中断：周期、优先级和时序
- UART / SPI / I²C：沿着数据路径查通信问题
- DMA：理解传输、缓冲区与 CPU 的协作

内存相关内容可沿着 [MCU 内存学习路线](../guide/memory-roadmap.md) 阅读。
