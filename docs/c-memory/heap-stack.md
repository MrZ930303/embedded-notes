---
title: MCU 堆栈原理与监测
description: 理解 Cortex-M 堆栈、指针、泄漏和碎片，结合 Keil 与 FreeRTOS 做内存预算和运行期监测。
---

<script setup>
import { withBase } from 'vitepress'
</script>

# MCU 堆栈原理与监测

适用于 STM32 与 GD32 Cortex-M 系列、Keil MDK 裸机及 FreeRTOS 工程。重点掌握堆栈的用途、地址方向、常见风险，以及编译期和运行时的监测方法。

**先记住：栈通常随函数调用自动使用和回收；堆通过分配器申请与释放。栈顶不等于高地址，RAM 总占用也不等于实际栈峰值。**

::: tip 先动手，再回来看
<a :href="withBase('/demos/stack-heap.html')" target="_blank" rel="noopener" data-no-router>打开堆栈交互实验</a>，观察压栈、碎片与泄漏。演示是教学模型，数值不是设备实测。
:::

## 堆和栈的基本区别

栈像一摞盘子，后放的先取，称为后进先出。函数调用时建立栈帧，返回时撤销。栈帧可能保存局部数据、寄存器和返回所需的信息，具体由架构、调用约定和编译器决定。

堆像可以借用和归还的仓库，程序按需要申请内存，并管理其生命周期。函数返回不会自动释放它申请的堆内存。

| 对比项 | 栈 Stack | 堆 Heap |
| --- | --- | --- |
| 典型用途 | 函数调用现场和自动局部数据 | 动态申请的数据或对象 |
| 管理方式 | 编译器生成代码配合运行环境管理 | 通过分配器申请与释放 |
| 释放时机 | 对应函数或作用域结束时 | 明确调用释放接口时 |
| 主要风险 | 栈溢出 | 泄漏、碎片、分配失败 |

普通局部变量**通常**使用栈，也可能进入寄存器或被优化掉。全局变量和 static 变量通常位于静态存储区域，不应归入堆或普通函数栈。

## 用 C 代码理解指针与内存

```c
#include <stdlib.h>

void example(void)
{
    int a = 10;                   // 自动局部变量
    int *p = malloc(sizeof *p);    // p 保存动态内存地址

    if (p == NULL) {
        return;                   // 分配失败，不能解引用
    }

    *p = 20;
    /* 使用 a 和 *p */

    free(p);                      // 归还动态内存
    p = NULL;
}
```

**指针变量 p 和它指向的内存是两个对象。** p 本身通常在栈或寄存器中，malloc 申请的对象位于动态分配区域。p 离开作用域，不等于它指向的空间已被释放。

malloc 可按 memory allocation 记忆。在 C 中，包含 stdlib.h 后通常不需要强制转换其返回指针。

| 接口 | 作用 | 注意事项 |
| --- | --- | --- |
| malloc | 申请指定字节数 | 内容未初始化，检查 NULL |
| calloc | 按元素数量和大小分配 | 将分配空间的所有位清零 |
| realloc | 调整已分配空间大小 | 地址可能改变；非零大小申请失败时原块仍有效 |
| free | 释放已分配空间 | 不得重复释放或释放不属于该分配器的地址 |

对 realloc 使用临时指针，确认成功再替换原指针。free 后将 p 置空只能清理这个变量，其他指向同一块内存的指针仍可能悬空。

## 栈顶 栈底和生长方向

高地址、低地址描述地址数值；栈顶描述当前操作位置；生长方向描述使用更多栈空间时地址变化的方向。

对 Cortex-M 的常见满递减栈，压栈时 SP 减小，出栈时 SP 增大。这里将初始高地址边界称为栈底，SP 所在位置称为当前栈顶。

```text
高地址
┌──────────────────────────┐
│ 栈初始边界                │
│ 已使用栈区                │
├──────── SP 当前栈顶 ──────┤
│ 尚未使用的预留栈空间       │
│          ↓ 栈向低地址增长  │
└──────────────────────────┘
低地址
```

以每次压入一个 32 位值为例：

| 操作 | SP | 变化 |
| --- | --- | --- |
| 初始 | 0x20001000 | 初始边界 |
| 压入 A | 0x20000FFC | 减少 4 字节 |
| 压入 B | 0x20000FF8 | 再减少 4 字节 |
| 弹出 B | 0x20000FFC | 增加 4 字节 |

函数调用可理解为 main → A → B，返回顺序是 B → A → main。实际函数可能一次预留完整栈帧，不会每声明一个变量就单独改变 SP。

堆常被画成向高地址扩展，但分配器可能只在固定内存池中复用空闲块；不能据此认为每次 malloc 返回地址都递增。实际堆栈位置、大小和边界应查启动文件、Scatter 文件和 Map 文件。

**不同内核不能照搬：**经典 8051（如 ML51）的硬件栈向高地址增长，PUSH 时先增加 SP 再写入。本文后续 Cortex-M 监测方法不直接适用于 8051。

## 三类常见内存风险

### 栈溢出

栈使用量超过预留范围，会破坏相邻数据，或触发内存保护异常。大局部数组、深层调用、递归和中断嵌套都是常见原因。

例如任务栈只有 2 KB，却调用需要 8 KB 局部数组的函数，预算显然不足；还应计入其他栈帧及异常现场。变量异常、HardFault、跑飞和复位都可能是后果，但并不是栈溢出的专属症状。

### 内存泄漏

申请的内存不再需要却未释放，尤其在唯一指针丢失后，程序无法再归还该空间。反复调用 malloc(1024) 而不 free，可能导致可用堆逐步减少，运行很久后才出现故障。

函数返回不会自动释放堆内存；p = NULL 也不能替代 free(p)。

### 内存碎片

空闲块被仍在使用的内存隔开，空闲总量足够却缺少足够大的连续块。这里主要讨论外部碎片。

```text
[空闲 10 KB][占用][空闲 10 KB][占用][空闲 10 KB]
总空闲 = 30 KB，最大连续空闲块 = 10 KB
申请连续 20 KB 仍可能失败
```

相邻空闲块能否合并取决于分配器；合并也不能越过仍被占用的块。

| 风险 | 记忆词 | 重点观察 |
| --- | --- | --- |
| 栈溢出 | 越界 | 栈边界、调用深度、中断嵌套 |
| 泄漏 | 不归还 | 完整业务循环前后的占用、分配释放记录 |
| 碎片 | 不连续 | 最大连续空闲块及空闲块分布 |

空闲堆减少本身不证明泄漏，也可能是正常存活对象或缓存。应在同样的业务状态下比较。

## Keil 编译期与裸机运行期监测

### 编译报告

查看 Map 文件中的 RAM 布局、静态数据、堆栈预留区域，并查看 Call Graph 的调用链和最大栈深度。

在 Keil µVision 的 Options for Target → Listing 中启用 Callgraph。使用 Arm 链接器时，--callgraph 与 --info=stack 是相关选项；具体设置以工程实际 Arm Compiler 和链接器版本为准。

静态结果不能自动覆盖所有递归、间接调用、中断嵌套和上下文切换开销。遇到 Unknown 或不可分析调用链，需要补充分析，而不是直接把报告值当作安全栈容量。

### 栈水位填充法

1. 根据启动文件、Scatter 和链接结果确定栈真实边界。

2. 在栈尚未使用前填充固定标记，例如 0xA5。

3. 运行压力场景后扫描仍保留标记的区域。

4. 结合 SP、边界检查和故障记录评估余量。

**不能在 main 中直接覆盖整个栈。** 此时已有返回地址和调用现场；若只填充未使用部分，也必须确保不覆盖当前调用和中断可能使用的区域。

水位法反映被改写过的深度，是历史使用量估算。预留但未写入的空间、与标记相同的数据，以及未覆盖的测试路径，都可能影响结果。

### 工具如何组合

- Keil MDK：Map、Call Graph、寄存器和内存窗口。

- GCC 或 STM32CubeIDE：-fstack-usage 生成 .su；-Wstack-usage=512 可对大栈使用函数告警，512 是示例阈值。

- Ozone、J-Link、SystemView：结合适配与配置观察调试现场及运行事件，不能单独替代完整栈预算。

- 堆包装器：记录分配地址、大小、位置、释放和失败次数；最大连续块仍需要分配器自身支持。

## FreeRTOS 任务栈和中断栈

### 任务栈历史余量

```c
/* FreeRTOSConfig.h */
#define INCLUDE_uxTaskGetStackHighWaterMark 1
#define configCHECK_FOR_STACK_OVERFLOW     2
```

```c
#include "FreeRTOS.h"
#include "task.h"

size_t current_task_min_free_bytes(void)
{
    UBaseType_t units = uxTaskGetStackHighWaterMark(NULL);
    return (size_t)units * sizeof(StackType_t);
}
```

NULL 表示当前任务；监测其他任务需传入有效任务句柄。返回值越小，表示历史剩余裕量越少。它不是瞬时剩余量，并且继承填充扫描法的限制。

原生 FreeRTOS 栈深度通常以 StackType_t 元素数计量；标准 Cortex-M 端口中常为每元素 4 字节。CMSIS-RTOS2 的 osThreadAttr_t.stack_size 以字节计，不要混用接口单位。

任务栈峰值估算 = 已分配栈字节数 − 历史最小剩余栈字节数。应逐个统计任务，不能只观察监控任务自身。

### 栈溢出 Hook

```c
void vApplicationStackOverflowHook(TaskHandle_t task,
                                   char *name)
{
    (void)task;
    (void)name;
    taskDISABLE_INTERRUPTS();
    for (;;) {
        /* 调试断点或项目定义的最小故障处理 */
    }
}
```

这是诊断辅助，不是绝对可靠的硬件保护。进入 Hook 时内存可能已损坏，避免复杂日志、额外动态分配或依赖大量栈的处理。

### PSP 和 MSP 都要留余量

典型 Cortex-M FreeRTOS 任务使用 PSP；异常处理代码使用 MSP。任务被打断时，最初的异常现场可压在任务的 PSP 上，然后处理程序在 MSP 上运行；异常嵌套又会增加 MSP 占用。

因此任务栈水位正常，不能证明 MSP 安全。还应考虑端口的上下文保存、FPU 使用以及允许的中断嵌套深度。

## 堆统计与工程实施清单

使用支持统计的 FreeRTOS heap_4 或 heap_5 实现时，可采集：

```c
#include "FreeRTOS.h"

HeapStats_t stats;
vPortGetHeapStats(&stats);

/* 当前空闲总量 */
size_t free_bytes = stats.xAvailableHeapSpaceInBytes;
/* 最大连续空闲块 */
size_t largest_block = stats.xSizeOfLargestFreeBlockInBytes;
/* 历史最小空闲量 */
size_t min_free = stats.xMinimumEverFreeBytesRemaining;
```

也可用 xPortGetFreeHeapSize 和 xPortGetMinimumEverFreeHeapSize 查询相应指标。接口和字段应以工程采用的 FreeRTOS 版本、heap 实现为准，heap_5 还需要先完成内存区域初始化。统计值可能涉及分配器元数据及对齐，不能将最大空闲块数值直接视为同等大小的申请保证。

**FreeRTOS 堆和 C 库堆未必相同。** pvPortMalloc 与 malloc 若使用不同分配器，就必须分别监测，并严格使用对应的释放接口。

推荐按以下顺序落地：

- [ ] 确认 MCU 内核、Keil 编译器版本、链接布局、FreeRTOS 版本及 heap 实现。

- [ ] 保存 Map 与 Call Graph，检查大栈帧和未知调用链。

- [ ] 裸机增加安全的栈水位监测；RTOS 逐任务统计，并单独评估 MSP。

- [ ] 记录空闲堆、历史最低、最大空闲块和分配失败次数。

- [ ] 覆盖最大报文、深层调用、超时重试、中断高负载和长期运行场景。

- [ ] 按最坏场景与安全裕量设置阈值；80% 占用只能作为示例，不能作为统一安全标准。

- [ ] 最后补充适合具体内核的异常现场记录，并评估 MPU 等硬件保护。

可以将接口封装为 MemMonitor 模块，分离通用统计、裸机端口、FreeRTOS 适配与配置。这里的代码用于说明关键接口；实际集成仍需匹配工程配置与链接符号。

**复习口诀：栈溢出看边界，泄漏查归还，碎片看连续；编译期做预算，运行期看水位，异常后查现场。**

## 核对参考

- [FreeRTOS 官方任务 API 定义](https://raw.githubusercontent.com/FreeRTOS/FreeRTOS-Kernel/main/include/task.h)：任务栈水位语义及单位。

- [Arm CMSIS RTOS2 线程管理](https://arm-software.github.io/CMSIS_6/latest/RTOS2/group__CMSIS__RTOS__ThreadMgmt.html)：线程栈配置与查询的字节单位。

- [FreeRTOS 官方堆管理说明](https://github.com/FreeRTOS/FreeRTOS-Kernel-Book/blob/main/ch03.md)：heap 实现及统计。

- [Arm Keil AN316](https://www.keil.com/appnotes/files/apnt_316.pdf)：Cortex-M 栈使用与 Keil 分析方法。

整理时已统一地址示意方向，并明确任务栈水位单位、MSP 与 PSP 的异常压栈关系。
