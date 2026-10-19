---
title: MCU 工程学习中心
description: 八阶段学习地图、三路资料对照、GPIO、C 基础、构建启动、时间与串口十七章，以及各章可打印速查。
---

# MCU 工程学习中心

围绕同一个“可升级的数据采集终端”，把电路、程序、测量、故障定位和交付连起来。先沿主线建立能力，再把技术笔记当作工具。

- [工程学习地图与三路资料对照](./engineering-map.md)：八阶段的先修、项目和验收，区分已核对目录、正文抽样、仅入口和计划课程。
- [第一节原创小课：按下按钮，为什么读到 0？](./gpio-button.md)：先预测，再操作电路与人工抖动模型；解释一次可靠的按下事件。
- [GPIO 按键可打印速查](./gpio-button-reference.md)：电路状态、稳定过滤、回忆题和上板验证清单。
- [第二章：GPIO 输出与 LED 驱动](./gpio-led.md)：预测推挽与开漏的路径，核算限流与同时预算，再回放事件到期望状态。
- [GPIO 输出与 LED 驱动可打印速查](./gpio-led-reference.md)：路径、预算公式、手册条件、外接驱动与故障检查。
- [第三章：位运算与寄存器读写](./c-bits-registers.md)：掩码、整数提升、RW / RO / W1C 与两种错误 RMW 时间线。
- [位与寄存器可打印速查](./c-bits-registers-reference.md)：宽度、写入语义、拒绝合同与历史手册条件。
- [第四章：C 对象、指针与边界](./c-objects-bounds.md)：对象审计、生命周期、字节表示与 read_le16 的检查顺序。
- [C 对象与边界可打印速查](./c-objects-bounds-reference.md)：one-past、零长度、真实存储前提与失败保持。
- [第五章：单执行上下文的有界 FIFO](./bounded-fifo.md)：四字节容量、值所有权、空满拒绝与回绕重放。
- [有界 FIFO 可打印速查](./bounded-fifo-reference.md)：接口条件、不变量、14 步轨迹与主机复现。
- [预处理、编译、链接与构建身份](./build-link-identity.md)：跟随真实多文件实验，区分链接错误、产物格式、生成身份与信任。
- [预处理、编译、链接与构建身份：可打印速查](./build-link-identity-reference.md)：压缩回看本章前提、固定算例、拒绝条件、源码与证据限制。
- [从复位向量到 C 运行环境](./reset-runtime.md)：解码虚构向量，解释 data 复制、BSS 清零与事务提交。
- [从复位向量到 C 运行环境：可打印速查](./reset-runtime-reference.md)：压缩回看本章前提、固定算例、拒绝条件、源码与证据限制。
- [静态内存、堆与调用栈预算](./memory-budget.md)：核算有限 RAM 包络、同时存活需求与有界调用路径。
- [静态内存、堆与调用栈预算：可打印速查](./memory-budget-reference.md)：压缩回看本章前提、固定算例、拒绝条件、源码与证据限制。
- [时钟树、切换与时间基准](./clock-timebase.md)：在限定 F407 条件下推导时钟、有限切换、SysTick 与 UART。
- [时钟树、切换与时间基准：可打印速查](./clock-timebase-reference.md)：压缩回看本章前提、固定算例、拒绝条件、源码与证据限制。

- [定时器、PWM 与非阻塞期限](./timer-pwm.md)：从 TIM3 的时钟域和计数状态推导 PWM，观察预装载生效，并用有限服务报告迟到与漏期。
- [定时器、PWM 与非阻塞期限：可打印速查](./timer-pwm-reference.md)：回看器件条件、PWM 量化、更新事件和模32观察契约，保留完整源码与复现入口。
- [UART 字节到有界命令](./uart-framing.md)：把真实四字节 FIFO 接入原创长度帧，逐层检查校验、命令、服务超时与丢失恢复。
- [UART 字节到有界命令：可打印速查](./uart-framing-reference.md)：压缩回看帧语法、20ms 服务观察期限、队列丢失、输出所有权与独立复现。

- [I2C / SPI 事务与失败](./bus-transactions.md)：按完整事务追踪地址、ACK、CS与结果提交，分清逻辑释放和物理恢复。
- [I2C / SPI 事务与失败：可打印速查](./bus-transactions-reference.md)：按完整事务追踪地址、ACK、CS与结果提交，分清逻辑释放和物理恢复。
- [ADC参考、采样与输入条件](./adc-sampling.md)：推导条件时钟、精确floor码与输入误差，再服务有限主机转换。
- [ADC参考、采样与输入条件：可打印速查](./adc-sampling-reference.md)：推导条件时钟、精确floor码与输入误差，再服务有限主机转换。
- [驱动错误、超时与恢复](./driver-recovery.md)：用有限重试、匹配清理和隔离保留所有权，让实际UART与ADC继续协作。
- [驱动错误、超时与恢复：可打印速查](./driver-recovery-reference.md)：用有限重试、匹配清理和隔离保留所有权，让实际UART与ADC继续协作。

- [异常、NVIC 与共享数据](./interrupt-shared-data.md)：推导四位优先级与 pending/active，用有限选择和显式交错解释共享数据。
- [异常、共享数据：可打印速查](./interrupt-shared-data-reference.md)：压缩回看优先级表示、mask覆盖、RMW与固定工作边界。
- [DMA 缓冲所有权](./dma-ownership.md)：区分 raw DBM 与安全交接，用匹配lease、stop确认和非回绕身份管理两块数据。
- [DMA 缓冲所有权：可打印速查](./dma-ownership-reference.md)：回看NDTR单位、SRAM/CCM条件、所有权与有限恢复。
- [吞吐、抖动与过载](./throughput-overload.md)：从完整线开销、burst与服务空窗手推过载，再运行真实DMA与UART/time组合。
- [吞吐、抖动与过载：可打印速查](./throughput-overload-reference.md)：保留容量、序号窗口、生命周期与原生交接的使用前提。

当前提供学习地图、01—17 十七章及各自速查，共三十五份资料。01—14已发布；12—14公开main源码为dafffcc4b3426aae93f7562ff27a815dfcabe79b，父任务确认CI与线上验收通过，未提供新runID。15—17中断、DMA与吞吐为本地候选，分别提供有限IRQ/RMW、匹配lease交接与真实DMA/UART/time组合。18—32仍待建设；阶段03/04均未宣称整体完成。正文、模型、主机C、浏览器、独立审查、发布、硬件与实体纸张分别记录，不推定个人掌握。工程协作工具是可选补充。

教学组织参考 [Matt Pocock teach](https://github.com/mattpocock/skills/blob/main/skills/productivity/teach/SKILL.md?plain=1)：每课聚焦一个成果，解释必要知识，练习后及时反馈，并用回忆与迁移检验理解。页面不保存个人作答或学习进度。
