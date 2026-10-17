# GPIO 按键 C11 主机实验

`button.c` 是本站原创教学程序。它只接收采样电平和时间，不依赖芯片寄存器、HAL、RTOS 或开发板。人工波形和主机测试不是硬件测量，也不能证明某个开关适用 5 ms。

## 使用已有编译器运行

在 `button.c` 所在目录，用支持 `uint32_t` 的 C11 编译器执行：

```sh
cc -std=c11 -Wall -Wextra -Werror -pedantic -DBUTTON_TEST button.c -o button-test
./button-test
```

若已有编译器命令叫 `gcc`，将 `cc` 换为 `gcc`。Windows 可输出为 `button-test.exe`，然后执行 `./button-test.exe`。本实验不自动安装编译器。`BUTTON_TEST` 打开同文件末尾的主机测试；不定义它时没有 `main`、测试输出或测试状态。例如仅编译模块：

```sh
cc -std=c11 -Wall -Wextra -Werror -pedantic -c button.c -o button.o
```

全部断言使用普通条件检查，定义 `NDEBUG` 仍然会运行。成功输出：

```text
PASS: waveform, boot-held, startup-bounce, active-high, wrap, gap, gap-boundary, short-pulse, short-release, thresholds, parameters, invalid-time
```

## 先读两条接口

```c
bool button_init(Button *button, bool rawHigh, bool activeHigh, uint32_t nowMs,
                 uint32_t thresholdMs, uint32_t maxGapMs);
ButtonEvent button_update(Button *button, bool rawHigh, uint32_t nowMs);
```

- `rawHigh` 是这次采到的电气高/低；`activeHigh` 指按下是否对应高。上拉低有效按键使用 `activeHigh=false`。
- `button_init` 返回成功与否；空指针、零阈值、零允许间隔、任一配置达到或超过 `2^31 ms` 均失败。非空对象失败后会被清零，不能沿用先前配置。
- 先初始化再更新。`Button button = {0};` 可作为初值；零对象的更新会返回 `BUTTON_INVALID`。不能把未初始化的自动变量传给更新函数并要求它识别任意垃圾值，那在 C 中没有保证。
- 更新返回 `BUTTON_NONE`、`BUTTON_PRESSED` 或 `BUTTON_RELEASED`。`BUTTON_INVALID=-1` 表示空指针、对象尚未初始化或检测到非法时间差。调用者必须检查它；时间错误后需要重新初始化。
- 一个执行上下文独占对象；外部不直接改字段。并发、睡眠时钟重定义、目标 GPIO 读取和事件投递由后续适配层单独设计。`volatile` 不能替代同步。

## 原理量与进阶量

先看 `candidate`（正在观察的电平）、`sinceMs`（它开始的采样时刻）、`stable`（确认后可使用的电平）。初始化时 `stable` 只是初始采样占位，`ready=false` 时不能把它当成已确认结果。原始采样变化时重新计时；观测的候选时间达到阈值后接受电平。

再看 `ready` 与 `armed`：`ready` 表示初始电平已经经过阈值确认；`armed` 表示确认过释放，允许将来的一次按下事件。初始确认不发事件。若开机已按住，这次初始保持不会发 `BUTTON_PRESSED`；确认释放时可以发 `BUTTON_RELEASED`，之后再次确认按下才发第一次 `BUTTON_PRESSED`。保持按住不会连发。

`gapSeen` 是自初始化以来是否发生过超长观测间隔的记录，重新初始化才清除。它不表示漏掉了几个按钮动作，更不能用来恢复它们。

## 11 ms 与开机不是同一个起点

默认波形先用 **5 ms 确认释放**，随后把这个时刻标为教材 `t=0`；因此 C 程序内真实计数是显示时间加 5。人工输入在显示时间 2/3/4/5/6 ms 变为 0/1/0/1/0，阈值 5 ms 时在显示 11 ms 发按下。扩展释放/再按下在 31/41 ms 发事件。

若从开机直接喂相同抖动，初始释放不足 5 ms，最终初始确认的是按下状态；此时不会发 11 ms 按下事件。`startup-bounce` 测试明确验证这一区别。

阈值改为 10/12 ms 时，测试也分别预热 10/12 ms；第一事件在显示 16/18 ms。扩展波形中 26→34 ms 只有 8 ms 释放，不能通过这些阈值，因此没有释放和第二次按下事件。

## 时间和观测契约

所有时间单位都是毫秒。计数由 `uint32_t` 提供，允许按模 `2^32` 回绕。阈值和最大间隔都是 `[1, 2^31-1] ms`。**调用者必须保证相邻调用的真实间隔小于 `2^31 ms`**，并保持同一种单调计时语义。无符号差不能识别已经漏掉的一整个计数周期，也不能修复时钟重置；睡眠后时钟语义改变要重新初始化。

检测到无符号时间差达到 `2^31` 会返回 `BUTTON_INVALID` 并使对象失效。普通间隔若大于 `maxGapMs`，会记录 `gapSeen`、从当前采样重新累计候选时间，保留此前已接受状态；间隔等于最大值则正常处理。

例如 6 ms 读到低，100 ms 才再次读到低，阈值 5 ms、最大间隔 1 ms：100 ms 不能据此发按下，之后每毫秒调用，最早 105 ms 才接受。两个采样点之间的脉冲可能完全未被观察；本算法不能证明电气上每一瞬间都稳定。多次调用相同时间戳也不能冒充经过了多毫秒。

## 维护者复现与证据

仓库中的 `scripts/test-gpio-button-c.mjs` 用本机已有 `mcu-build` 自定义 profile 封装编译。它读取 `CC`，也可传 `--compiler <现有编译器路径>`；构建路由位置可通过 `MCU_BUILD_ROUTER` 或 `--router <build_router.py>` 指定；Python 可传 `--python`。不安装或修改全局配置。

脚本会编译并运行测试版本和 `NDEBUG` 版本、编译无测试模块，再仅在 `.scratch/gpio-textbook/code-evidence` 中复制一个故意将接受条件从 `>=阈值` 改为 `>阈值` 的错误版本。错误版本必须编译成功而实际时间测试失败；原下载源码保持不变并再次通过。目录中的 `result.json` 记录命令、退出状态、编译器版本输出、构建产物及 SHA-256，路由日志和临时 profile 留在同目录。

覆盖路径包括固定波形、精确阈值边界、启动按住、启动抖动、有效高、回绕、超长与恰好允许的采样间隔、短脉冲、短释放、阈值 1/5/10/12、重复时间戳、空指针、无效配置和合法配置边界。这是列举路径的主机测试，不是穷尽证明；未做目标 MCU 的电气、实时调度或抗干扰验证。
