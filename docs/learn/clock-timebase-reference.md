阶段02 · 单元09 · 本地候选

# 时钟与时基打印速查 {#clock-timebase-reference}


## 使用前先保留这些条件 {#clock-ref-overview-title}

单元09压缩速查，前置是完整章的因果推导。成果是一张可解释的名义计划。STM32F407VG、内部稳压器常规运行、VDD2700..3600mV（固定示例3300）、Scale1/2、无实测。晶体HSE4..26MHz、外部旁路1..50MHz、名义HSI16MHz分别建模，电平/波形/温度/供电脚注不因算式成立而消失。

本页保守共同子域：输入1..2MHz、N192..432、VCO192..432MHz；POLICY表示模型范围。DS8626Rev12 March2026实际输入0.95..2.10、VCO100..432；HALv1.8.5 N50..432（F411例外）；历史RM0090Rev5 September2013写N/VCO下限192。当前官方RM未读，不把历史版本冒称最新，不把政策拒绝冒称物理非法。

## 方程与固定名义计划 {#clock-tree-title}

反馈理想锁定：fVCO/N=fref/M，因此VCO=fref×N/M，P输出=VCO/P，Q输出=VCO/Q。SYSCLK再经AHB得HCLK，经各APB得PCLK。P、Q不是串联；N不是整条倍频。固定8MHz/M8/N336/P2/Q7/AHB1/APB4/2产生输入1、VCO336、SYSCLK/HCLK168、PCLK1/2=42/84、Q48MHz。相对参考误差理想传递，抖动另需分析与测量。

F407 APB预分频1时TIM=PCLK，否则TIM=2×PCLK；USART2等仍取PCLK1，USART1/6取PCLK2。固定例子USART2 42MHz、APB1定时器84MHz。Q48=1要求恰好48MHz但不证明USB合规；Q支路检查DS上限75MHz，Q48=0仅报告未使用支路。

## 校验与切换顺序 {#clock-switch-title}

M2..63，P2/4/6/8，Q2..15；AHB1/2/4/8/16/64/128/256/512，APB1/2/4/8/16。Scale1 HCLK≤168MHz、Scale2≤144MHz，PCLK1≤42、PCLK2≤84MHz。VDD2.7..3.6V最少WS对应HCLK上限30/60/90/120/150/168MHz为0/1/2/3/4/5。算术保留分子/分母，先查溢出、再比中间级；拒绝保持已接受输出。

固定假切换：已可用HSI→临时APB÷16请求/读回→SW_HSI请求/SWS确认→停PLL并观察PLLRDY清除→停HSE并观察清除→改旁路模式→开HSE/HSERDY→开PWR、VOS1/VOSRDY→Flash5写/读回→停用PLL/PLLI2S条件下配置共享M/source及PLL字段→开PLL/PLLRDY→AHB1、APB÷16保持→SW_PLL请求/SWS确认→最终APB写/读回。向下84MHz确认后，Flash2写/读回，再VOS2/VOSRDY。

F407 VOS/VOSRDY均bit14（RMRev5pp138–139、DeviceF4v2.6.10芯片头）。HALv1.8.5 F407分支写VOS并等VOSRDY，未要求该操作先停PLL；不要复制其他家族分支。重配PLLM/N/P/Q有独立停用条件，M/source还共享PLLI2S；HSEBYP仅在HSE关闭时改。Scale1→2先降HCLK，反向先确认Scale1；本例降至84，符合HAL“低于144”注释。

起点向上HSI16/Scale2/WS0→PLL168/Scale1/WS5；向下PLL168/Scale1/WS5→PLL84/Scale2/WS2，两者PLLI2S均关闭。正常第2次观察成功，单等待上限1..3；HSE/PLL/VOS/停止/SWS超时或Flash读回失配终止，脚本确认HSI16、APB÷16且目标未成功。真实回退可失败，这个脚本不是硬件保证，也没有事务回滚。

## SysTick周期接口 {#clock-tick-title}

选HCLK或F407的HCLK/8后再计算count=source/request，LOAD=count−1。本接口要求整除、周期count2..16777216。168MHz/1kHz→168000/167999；2Hz/1Hz→2/1；16777216Hz/1Hz→16777216/16777215。count1/LOAD0虽能编码但无正常1→0周期事件，返回NO_EVENT；count0或超限返回RANGE。10Hz/3Hz返回INEXACT并保留旧输出；若另行取count3实际10/3Hz误差+11.111…%，count4实际2.5Hz误差−16.666…%，本接口都不提交。

## USART过采样16接口 {#clock-uart-title}

D≈PCLK/baud，最近整数、半数向上；先要求baud≤PCLK/16，再检验D16..65535。BRR=D；尾数D/16、小数D%16。42MHz/115200→D365，尾数22、小数13/16、BRR0x016D；实际42000000/365=8400000/73≈115068.493；误差(实际−请求)/请求=−48000/42048000≈−0.114155%。165/10半数向上选17，160/10选16，65535/1选65535，65536/1拒绝，159/10仍因超过PCLK/16拒绝。

误差分数不等于通用合格阈值。RMRev5§30.3.5要求发端、接收端量化/振荡器和线路误差合计小于所选帧长/OVER8/ONEBIT/分数条件的容差；没有固定2%通行证。OVER8=1与通信中改变BRR不在本模型适用流程。

## 复用、状态与完整下载 {#clock-c-lab-title}

clock_plan、clock_tick、clock_uart只在OK写输出。非空指针必须指向真实存活对象，输出可写且不重叠输入；单上下文、不可重入，NULL检查不保证悬空或假长度安全。clock_switch_begin完整建立起点，step要求begun state；终止后DONE不前进。无CLOCK_PLAN_TEST时无main；加入宏运行严格测试，NDEBUG不消除验收。

<a href="../examples/clock-timebase/clock_plan.h" download>下载clock_plan.h</a>

<a href="../examples/clock-timebase/clock_plan.c" download>下载clock_plan.c</a>

<a href="../examples/clock-timebase/README.txt" download>下载README.txt</a>

完整源码、头和指令逐字显示在[完整章C11区](../learn/clock-timebase.html#clock-c-lab)；README保留通用编译命令、调用合同与证据界限。源为本项目原创，按LiXin风格不虚构EternalChip归属或第三方许可。

## 折叠回忆：先想再开 {#clock-practice-title}

### 独立条件：42MHz/115200、OVER8=0 {#clock-ref-question}

最近D半数向上、有效D16..65535。求BRR并说明USART为何不采用APB1定时器84MHz。

展开原因

D365、BRR0x016D；USART用PCLK1，TIM的预分频倍频规则只作用于定时器输入。误差−48000/42048000，不代表整个链路验证。


[回完整章独立十题](../learn/clock-timebase.html#clock-practice)。隔日换条件再解释，完成阅读不能推出长期掌握。

## 主资料与证据限制 {#clock-sources-title}

核对日期2026-10-17。图、推导、夹具、题目和主机代码为原创教学材料。先读推荐的器件资料，再按条件核对，不能把下载或排队当已读。当前官方RM0090未完成读取；这里明确使用历史Rev5，保留与较新DS/HAL的差异，不自称最新硬件配置工具。

[S1 · ST DS8626 Rev12，March2026](https://www.st.com/resource/en/datasheet/dm00037051.pdf)：实际查阅F407VG型号、§6.3.1表14/15供电与频率、§6.3.8表30/32来源域、§6.3.10表36 PLL电气域与脚注。首选阅读任务：从表36找出输入和VCO的范围，再把电气条件与本页POLICY写成两行。未检验实际供电、温度、晶体或波形。

[S22 · ST RM0090 DocID018909 Rev5，September2013，Keil制造商资料存档](https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf)：历史1705页；实际阅读§3.5.1pp80–81 Flash表11与升降频顺序、§5.4.1/.2pp138–139 F407 VOS/VOSRDY、§7.2p213 APB定时器/SysTick、§7.3pp220–226 HSEBYP/PLL/SW-SWS/分频、§30.3.3/.4pp956/959–960及§30.3.5p969、§30.6.3p989 UART。旧N/VCO192下限与DS/HAL版本差异已保留；旧p119 bit15文字错误不盖过实际bit14寄存器表。

[S2/S3/S5/S21/S25 · ST HALv1.8.5，commit b6f0ed3829f3829eb358a2e7417d80bba1a42db7](https://github.com/STMicroelectronics/stm32f4xx-hal-driver/tree/b6f0ed3829f3829eb358a2e7417d80bba1a42db7)：RCC头的N/M/P/Q条件，HAL_RCC_ClockConfig的Flash读回与SWS、临时APB保护；UART头/源的过采样16与PCLK选择；pwr_ex.c的F405/407专属分支与其他家族分支实际分别核对。F407分支写VOS并有限等待VOSRDY，不含该电压操作的PLL关闭前提。HAL注释低于144MHz与表最大144MHz分别保留，降频例子选84MHz。

[S24 · ST CMSIS DeviceF4 v2.6.10，commit 5f41fb29d22773896c780052bf61e47fc924d524](https://github.com/STMicroelectronics/cmsis-device-f4/blob/5f41fb29d22773896c780052bf61e47fc924d524/Include/stm32f407xx.h)：F407专用头VOS_Pos14、VOSRDY_Pos14、mask0x4000，与历史RM交叉核对；不是从F42x头猜测。实际未读硬件状态。

[S4 · ST PM0214 Rev10，March2020](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)：§4.5pp246–249，24位计数、HCLK/HCLK8选择、LOAD=N−1、LOAD0无正常事件；芯片集成条件仍需器件RCC资料。

[Matt Pocock teach](https://github.com/mattpocock/skills/blob/main/skills/productivity/teach/SKILL.md?plain=1)：用于知识先行、短成果和预测/回忆组织，不作为器件正确性的证明。

## 继续路线 {#clock-next-title}

[返回完整章](../learn/clock-timebase.html)·[阶段02地图](../learn/engineering-map.html#stage-02)·[晶振、PLL与时钟树桥梁](../mcu/crystal-pll-clock.html)。下一段10—14仍待建设。此为本地候选：主机C与浏览器、整站构建、独立审阅、发布分别取证；未做目标硬件、波形、供电、物理纸张验证。
