阶段02 · 单元09 · 本地候选

# 时钟树、切换与时间基准 {#clock-timebase}


## 让采集终端的“1毫秒”有可追溯的来由 {#clock-overview-title}

前置：已读单元06的构建身份、07的运行环境和08的内存预算，能读整数除法与返回状态。终端即使运行了main，也没有自动得到准确的采样间隔。CPU、外设总线、定时器与串口用的时钟可能不同；把168MHz贴到每一项，会让串口配置错一倍。

本章小成果：一张注明器件、供电、来源和版本的名义时钟表；一段有终点的切换轨迹；一个可重复运行的C11主机检查。它们不等于板子已经锁定、供电转换合格或波形已测准。

短路线分三段：先手算8→1→336→168/42/84，写出条件；再每步预测请求与观察，找出失败终点；最后只推导SysTick与USART一个设置。每段完成后停下来解释一次。完整推导、源代码和十题留在本页，无脚本仍可读；没有保存个人答案、成绩或掌握推断。

## 先选器件、来源与证据版本 {#clock-scope-title}

名义频率是采用标称输入与理想比例得到的计算值。ready是硬件定义状态位的观察；实测需要测量仪器、方法和误差条件。浏览器的脚本观察只有教学含义。本章器件固定STM32F407VG，内部稳压器常规运行，示例VDD=3.3V；模型仅支持2700..3600mV这一个Flash电压带，不表示器件完整供电范围从2.7V开始。温度、VDDA、稳压器与数据手册脚注仍适用，板级供电未验证。

晶体是被动谐振元件，需与片内振荡放大器和外部电路形成振荡；HSE晶体/陶瓷模式的频率域是4..26MHz。旁路模式把外部有源时钟送入OSC_IN，DS允许1..50MHz且另有电平、占空比与边沿条件。两种模式不是同一电路。HSI是片内RC，本模型只用名义16MHz；它的校准、温漂与误差没有消失。选择“8MHz”不能代替先选来源模式。
源版本与教学政策必须分开
 | 资料 | 实际范围/条件 | 本页处理

 | DS8626 Rev12，2026-03，表36 | PLL输入0.95..2.10MHz；VCO100..432MHz；主P输出24..168MHz | 电气条件，表14与脚注继续适用

 | ST HAL v1.8.5 RCC头 | M2..63；N50..432（F411例外最小192）；输入建议1..2MHz | 厂商代码编程条件，不替代未读当前RM

 | RM0090 Rev5，2013-09，§7.3.2 | 历史N192..432；VCO192..432MHz | 与新DS/HAL有版本差异，不称最新版

 | 本页保守共同子域 | 输入1..2MHz；N192..432；VCO192..432；2.7..3.6V | 返回POLICY表示超出所选教学范围，不能推论硬件非法

例如HSE8MHz/M8/N100/P4会得到VCO100MHz、P输出25MHz；新DS与HAL的相应数字允许讨论它，历史RM却写192下限。本模型返回POLICY，是为了在已读版本共同覆盖的子域教学，不宣称该设置物理非法，也不替读者解决尚未读取的当前RM修订差异。源模式、整数编码错误为INVALID或DEVICE，与这个政策拒绝不同。

本段成果：在表头写“F407VG、3.3V、Scale1、HSE晶体8MHz、保守共同子域、未实测”，再解释每个限定词。

## 从反馈方程走到每个外设的输入 {#clock-tree-title}

PLL（锁相环）用相位比较和反馈调节VCO（压控振荡器），使参考分频频率与反馈分频频率趋于一致。锁定状态的理想关系为fref/M=fVCO/N，所以fVCO=fref×N/M。N是反馈倍频设置，并非整条路径的总倍数。P、Q又分别分频，P支路才进入本章SYSCLK选择器。

原创名义时钟图。实线表示频率推导方向，节点值单位MHz；P/Q为独立除法支路，TIM的×2不修改PCLK。条件是本页固定M/N/P/Q、AHB/APB、Scale和Flash配置；图不表示电路布线、锁定时间或测量。

逐级手算：8,000,000/8=1,000,000Hz；再×336=336,000,000Hz。P=2给SYSCLK168,000,000Hz；AHB÷1使HCLK也为168MHz。APB1÷4得PCLK1=42MHz，APB2÷2得PCLK2=84MHz。Q=7从VCO得到48MHz，不能再从168MHz除7得到它。48是名义计算，未检验USB需要的精度与其他条件。

HCLK在本器件配置中供给AHB和处理器相关时钟；PCLK是相应APB总线时钟；外设输入时钟要继续看具体外设规则。F407的APB定时器在预分频=1时取PCLK，预分频不为1时取2×PCLK。因此本例APB1定时器84MHz，USART2等仍取PCLK1=42MHz。USART1/6取PCLK2=84MHz；定时器规则不能复制给USART。定时器、PWM与非阻塞期限实现留到单元10。

对照旧文[晶振、PLL与时钟树](../mcu/crystal-pll-clock.html)：若参考频率带相对误差ε，理想输出为(fref×(1+ε))×N/(M×P)，目标输出也同乘(1+ε)，相对误差并未被倍频消除。绝对Hz偏差会按比例变大。抖动描述边沿随时间的短期偏移，与平均频率准确度不同；PLL会改变噪声传递，还会引入自身抖动。仅靠整数方程，不能得到实际抖动、晶体起振时间或UART波形。

本段成果：遮住图，自己重新画P和Q的分叉，再在“USART42”和“TIM84”之间写出决定它们不同的条件。

## 先验中间级，再预测整个计划 {#clock-plan-lab-title}

同一个168MHz最终结果，可能来自错误中间级。先验证M、N、P、Q和AHB/APB离散值，再比较PLL输入与VCO范围，最后核对SYSCLK/HCLK、总线、Scale和Flash。不要先用浮点数取整成合法寄存器值。本实现保留Hz的整数分子/分母，通过交叉乘法比较，C对乘法先查溢出；JavaScript输入限制在安全整数域，超过精确整数能力返回OVERFLOW。
2.7..3.6V Flash最少等待周期（历史RM Rev5表11，F405/407）
 | HCLK上限MHz | 30 | 60 | 90 | 120 | 150 | 168

 | 最低WS | 0 | 1 | 2 | 3 | 4 | 5

Scale1的HCLK上限168MHz，Scale2为144MHz；PCLK1≤42、PCLK2≤84MHz。Flash等待周期是访问时序条件，不能用“缓存一般命中”来省略。表值只用于声明电压带；本模型拒绝更低电压，而不猜另一行。Q支路还检查DS表36输出上限75MHz。Q48=0只计算未使用支路，未承诺外设可用；Q48=1要求恰好48MHz。
来源模式HSE晶体/陶瓷HSE外部旁路名义HSI16MHz来源Hz（整数）M：2..63N：政策192..432P：2/4/6/8Q：2..15AHB：1/2/4/8/16/64/128/256/512APB1：1/2/4/8/16APB2：1/2/4/8/16VDD mV：2700..3600Scale：1或2Flash WS：0..7Q支路要求精确48MHz：1是/0未使用先预测验证状态先选择DEVICE：器件条件失败OK：计划条件成立FLASH：等待周期不足POLICY：教学子域之外INVALID：输入编码无效OVERFLOW：整数范围不足提交预测并应用恢复计划种子
待应用；先预测。

尚未计算新的计划。

尚无已接受计划。

改变条件会清除旧预测；上次已接受的输入和输出保留且明确标注。非法输入、空值、小数、负数、非有限值不会改变已接受计划。错误预测仍应用正确结果，并解释该看哪层；重置恢复固定种子、清空预测并遮住尚未挣得的结果。

本段成果：把APB1从4改2，预测DEVICE并解释84MHz为什么超过42MHz；恢复4，再把WS从5改4，解释另一个失败原因。

反馈核对：固定HCLK168MHz时，APB1÷2使PCLK1=84MHz，超过42MHz，因此DEVICE应明确提示增加APB1分频；WS4则不足以满足168MHz所需WS≥5，因此FLASH应提示先准备并读回足够等待周期。POLICY要指出具体教学范围，例如VDD2699mV不在2700..3600mV带、N100不在192..432子域；它不是硬件非法的证明。若多个条件同时失败，反馈按模型顺序定位：输入编码与溢出→来源模式/频率→电压和PLL教学子域→SYSCLK/HCLK/总线/Q输出→Q48要求→Flash。正常反馈也要写出当前PLL输入、VCO、HCLK和所需WS，再进入切换预测。

## 算得合法，还要完成请求、观察与安全切换 {#clock-switch-title}

配置请求是软件期望，ready/SWS/readback是随后观察；写了PLLON不等于已锁定，写SW不等于CPU已换来源。数值验证只能证明目标计划符合所选条件，不能证明切换已经发生。

本页使用两个固定、原创、有限的假后端起点。向上：HSI16MHz、Scale2、WS0、AHB/APB均÷1；目标HSE8/M8/N336/P2、HCLK168、APB÷4/÷2、Scale1、WS5。向下：已确认PLL168、Scale1、WS5、APB÷4/÷2；目标同源M8/N336/P4，HCLK84、APB÷2/÷1、Scale2、WS2。两者都声明HSI可用、PLLI2S关闭、没有其他消费者，不能直接套到正在使用音频PLL或通信的实板。
固定切换的因果顺序与文本图
 | 阶段 | 请求与独立观察 | 为什么在这里

 | 安全桥 | 请求HSI，观察已可用；APB临时÷16请求/读回；SW_HSI请求/SWS_HSI观察 | 从活跃PLL移开，避免升频瞬间总线过快

 | 停用/改源 | PLL关闭请求→PLLRDY清除；HSE关闭请求→HSERDY清除；再写HSEBYP模式 | PLL不能仍作为SYSCLK被关闭；旁路模式只在HSE关闭时改

 | 目标准备 | HSE开启→HSERDY；PWR时钟/VOS1请求→F407 VOSRDY；Flash5请求→读回 | 在升HCLK前给核心与Flash足够条件

 | 配置PLL | PLL/PLLI2S关闭条件下写M/source；PLL关闭条件下写N/P/Q；开PLL→PLLRDY | 共享M/source与单PLL字段各有条件

 | 执行切换 | AHB÷1读回且APB÷16保持；SW_PLL请求→SWS_PLL观察；最终APB请求→读回 | 只有观察SWS后才记目标频率

 | 向下放宽 | 确认HCLK84之后，Flash2请求→读回，再Scale2请求→VOSRDY | 先降需求，再放宽供给条件

F407的PWR_CR.VOS与PWR_CSR.VOSRDY都在bit14：历史RM Rev5§5.4.1p138和§5.4.2p139明确写F405/407/415/417；CMSIS DeviceF4 v2.6.10的stm32f407xx.h也给mask0x4000。旧p119正文把VOS写作bit15，与实际寄存器表相矛盾，本页采用寄存器定义和芯片专用头交叉核对。F407 HAL v1.8.5分支是开PWR时钟、写VOS、有限等待VOSRDY，没有为这个VOS操作要求PLL关闭。另一器件分支才额外停PLL，不把它搬过来。

这与重新写PLLM/N/P/Q是两项不同操作：RCC规定改变相关PLL字段要禁用相应PLL，共享M与源选择还涉及PLLI2S。教学轨迹为重配PLL而经过HSI安全桥；它不是“F407改VOS一定要停PLL”的证明。向下先到84MHz再降Scale2，也满足HAL注释“below144MHz”的严格措辞；表中144MHz最大值和注释的“低于”没有被悄悄合并。

假等待的正常脚本在第2次观察就绪，上限1..3，故障脚本永不就绪，达到上限即终止。HSE、PLL、SWS、VOS、停止确认均有独立超时，Flash读回可失配。失败后脚本保证观察到HSI16MHz且APB÷16，保留适合16MHz的当前较保守WS/Scale，目标未成功。这个保证是已声明的假后端，不是实板总能回退；真实HSI或回退SWS也可能失败，需另行故障策略。轨迹不会假称寄存器事务回滚，也没有无限while。

独立手算检查：向上SW_PLL请求那一步仍是HSI16；第一次SWS观察仍为HSI16；第二次才是PLL168。向下第二次SWS观察后是84MHz，WS仍5、Scale仍1；随后读回Flash2并确认VOS2。这些是预测依据，无需先运行控制器。

## 每走一步，先预测这次请求是否已被确认 {#clock-switch-lab-title}

第一次提交才创建所选固定起点，并执行第一步。种子方向向上、无故障、最多3次观察；第一步是HSI开启请求。之后按上表预测。控制器每次只调用一次假后端，不会偷偷跑到末尾。更改方向或故障把它标成新草稿；旧日志仍标有上次条件。

请求：HSEON / VOS / Flash / PLLON / SW

观察：HSERDY / VOSRDY / 读回 / PLLRDY / SWS

有限终点：目标确认；或故障→脚本HSI16

原创请求—观察图。顺序箭头由上至下表示同一依赖链，不把写请求当已完成；每个等待正常第2次就绪，最多3次。向下先观察HCLK84，再降低Flash等待与Scale。图是固定假后端，不表示物理时间轴；完整动作和条件见前表。
固定方向向上16→168MHz向下168→84MHz假后端故障正常第2次观察HSERDY始终不就绪PLLRDY始终不就绪目标SWS始终不匹配Flash5读回失配F407 VOSRDY不就绪关闭观察始终不成立每个等待最多观察次数3次2次1次先预测下一步的性质先选择观察确认：推进一段观察未成：继续等待写入请求：尚待观察失败终止：安全回退成功终止：目标确认提交预测并应用重置固定轨迹
先预测第一步。

起点HSI16、Scale2、WS0；PLLI2S关闭。

尚未执行轨迹。

```text
```

本段成果：分别留下成功向上、成功向下和一次HSERDY超时轨迹。圈出“请求PLL”和“观察PLLRDY”的不同步骤，解释为什么失败后的16MHz不能算目标168MHz已接受。

## SysTick：周期数与24位LOAD相差一 {#clock-tick-title}

本例选HCLK源，即F407 STK_CTRL.CLKSOURCE=1；另一个选项CLKSOURCE=0为HCLK/8，若选它必须把分频后的频率交给计算器。SysTick是24位递减计数器，周期N个源时钟通常写LOAD=N−1。168,000,000Hz/1000Hz=168,000个时钟，所以LOAD=167,999，不是168,000。名义周期168000/168000000=0.001s，名义频率1000Hz，整数整除的量化误差为0；物理源误差仍在。

LOAD[23:0]的最大值0xFFFFFF=16,777,215，对应最大周期count=2^24=16,777,216。count=1会编码LOAD=0，但PM0214Rev10§4.5.2明确指出它没有正常的1→0事件，因此本页的周期事件接口返回NO_EVENT，最小有效周期count=2、LOAD=1。不能因字段能写0就承诺每时钟一次中断。count=0与超过最大值返回RANGE。
独立SysTick边界夹具（均选给定源）
 | 源Hz/请求Hz | 推导 | 接口结果

 | 168000000/1000 | count168000；LOAD167999；达到1000Hz | OK

 | 2/1 | count2；LOAD1 | OK，最小正常周期

 | 1/1 | count1；LOAD0 | NO_EVENT，已接受输出保持

 | 1/2 | 理想count0.5，整数count0 | RANGE，不制造零长度周期

 | 16777216/1 | count16777216；LOAD16777215 | OK，最大周期

 | 16777217/1 | 比最大count多1 | RANGE，输出保持

 | 10/3 | 理想count10/3；不能整除 | INEXACT，本接口不取整

若另一个设计把10/3取最近count3，则实际频率10/3Hz≈3.3333Hz，相对所求3Hz为+11.111…%；选count4则2.5Hz、−16.666…%。这展示量化误差的由来，不是本接口已应用这两种之一。本页选择明确拒绝INEXACT，已接受结果保持；调用者应改源、改请求或采用另行说明的分数分配方案，后者不在本章实现内。

本段成果：把count与LOAD分成两列，独立解释最小正常周期、最大周期与“可写0却不产生周期事件”三个边界。

## USART：从42MHz到BRR0x016D {#clock-uart-title}

本例USART2使用PCLK1=42MHz，普通异步、OVER8=0（16倍过采样）；不覆盖OVER8=1、同步或Smartcard等扩展模式。公式baud=fCK/(16×USARTDIV)。USARTDIV有12位整数尾数和4位小数，令D=16×USARTDIV，BRR的16位编码便是整数D；USARTDIV≥1，故D≥16，并非所有16位数都合法。最高D=65535。

先算理想D=42000000/115200=364.58333…，取最近整数365（精确半数向上）。365=22×16+13，因此尾数22、小数13/16，USARTDIV=22.8125；BRR=(22<<4)|13=0x016D。实际名义baud=42000000/365=8400000/73≈115068.49315。相对误差(实际−请求)/请求=(42000000−115200×365)/(115200×365)=−48000/42048000≈−0.114155%。先保留这个有符号分数，再显示小数，不用显示值反推寄存器。

若分数部分四舍五入到16，要向整数尾数进位；等价整数D的取整自动包含进位。独立夹具clock=165Hz、baud=10，理想D=16.5，按半数向上选17；clock=160、baud=10选16；clock=65535、baud=1选65535；65536/1超范围。159/10虽然可能四舍五入到16，但请求高于clock/16，本接口仍拒绝，不用取整掩盖前提失败。

−0.1142%只是此名义分频的量化项。RM Rev5§30.3.5把发端偏差、接收端量化、接收振荡器偏差和线路影响放进总误差预算，接收容差又依赖帧长、OVER8、ONEBIT与分数。不能写“误差小于固定2%就一定能接收”。实际晶体、两端温漂和线路波形都未验证；BRR也不应在通信进行中随意改写。

本段成果：先不看结果，从PCLK1而非TIMxCLK推导365，再把负号解释成“实际名义速率略慢”。

## 独立时基练习：先声明输入来自哪里 {#clock-timing-lab-title}

这个练习与时钟计划相互独立，输入必须先由你声明来源。种子是SysTick/HCLK168000000/1000；UART请自己改为42000000/115200。SysTick只接受整除周期，UART按最近D、半数向上。结果以精确分数显示，输出中的errorNum/errorDen是相对误差，乘100才是百分数。

时基反馈核对：168MHz/1000Hz整除得到count168000、LOAD167999；42MHz/115200baud得到D365与BRR0x016D，正常反馈应解释这些编码。10Hz/3Hz为非整数count10/3，INEXACT不取整；1Hz/1Hz为count1、LOAD0，NO_EVENT提示缺少正常1→0周期事件。1Hz/2Hz的整数count0或16777217Hz/1Hz超过count16777216，分别说明RANGE原因。UART159Hz/10baud超过PCLK/16，65536Hz/1baud则D65536超出65535；两种RANGE需要不同修正。空值、非法运算类型或无效整数输入应明确INVALID；类型只允许tick/uart。每次拒绝保持上次已接受输入和输出，先修正已指出条件，再预测。

SysTick：HCLK168000000Hz ÷ 请求1000Hz → count168000 → LOAD167999

USART2：PCLK1 42000000Hz ÷ 请求115200baud → 理想D364.583… → D365 → 22与13/16 → BRR0x016D

回代：源频 ÷ 实际分频 → 达到频率 → 有符号误差；仍不等于测量

原创时基编码图。箭头为推导依赖，单位Hz/baud明确；SysTick采用精确整除策略，UART采用最近整数、半数向上。换来源必须重算，UART不能用TIM84MHz。LOAD0的周期事件例外、分频边界与误差分母见上文。
运算类型SysTick周期事件USART过采样16已选来源/总线Hz：正整数，UART≤4294967295请求Hz/baud：正整数先预测返回状态先选择INEXACT：非整除请求NO_EVENT：LOAD0无周期OK：所选条件成立RANGE：计数分频越界INVALID：输入不成立OVERFLOW：整数能力不足提交预测并应用恢复时基种子
待应用；先预测。

尚无本次时基结果。

尚无已接受时基。

## 完整原始C11与可重复主机检查 {#clock-c-lab-title}

clock_plan.h声明输入、精确频率比、状态和有限假状态；clock_plan.c没有真实寄存器访问，启用CLOCK_PLAN_TEST才含主机main。clock_plan、clock_tick、clock_uart只在OK提交输出；INVALID、OVERFLOW、POLICY、DEVICE、FLASH、RANGE、INEXACT和NO_EVENT保留所有旧输出字段。切换begin无旧状态读取，step要求已begin的对象；step是模拟执行，失败报告与名义计划拒绝不同，不承诺硬件回滚。

指针必须指向真实、存活、类型正确的对象；计算输入已初始化，输出可写且不与输入重叠。单上下文、不可重入；NULL检查无法检测伪造地址、悬空、假长度或非法别名。本例无动态内存、无MMIO。状态比较不能替代这些调用者前提，失败测试不能通过执行未定义行为来展示红灯。uint64_t先查source×N、den×rate；通过源频/分频边界后其他交叉乘积上界可证明落在uint64_t内。

原始C是本项目教学代码，依LiXin风格组织，不虚构EternalChip所有权或第三方许可授权。源码与指令均可独立下载；下面完整文本与下载字节对应。

### clock_plan.h · 完整文本 {#clock-source-clock_plan-h}

<a href="../examples/clock-timebase/clock_plan.h" download>下载clock_plan.h</a>

```text
/******************************************************************************
 * Original embedded-notes teaching project, 2026. No third-party authorship claimed.
 * @file clock_plan.h
 * @author embedded-notes project
 * @brief Nominal F407 teaching subdomain and finite fake clock switch; no MMIO.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef CLOCK_PLAN_H
#define CLOCK_PLAN_H
#include <stdint.h>

typedef enum {
    CLOCK_OK, CLOCK_INVALID, CLOCK_OVERFLOW, CLOCK_POLICY, CLOCK_DEVICE,
    CLOCK_FLASH, CLOCK_INEXACT, CLOCK_RANGE, CLOCK_NO_EVENT, CLOCK_DONE,
    CLOCK_TIMEOUT_HSE, CLOCK_TIMEOUT_PLL, CLOCK_TIMEOUT_SWITCH,
    CLOCK_READBACK, CLOCK_TIMEOUT_VOS, CLOCK_TIMEOUT_OFF
} ClockStatus;
typedef enum { CLOCK_HSI, CLOCK_CRYSTAL, CLOCK_BYPASS } ClockSource;
typedef struct { uint64_t num; uint64_t den; } ClockRatio;
typedef struct {
    uint64_t hz;
    uint32_t m, n, p, q, ahb, apb1, apb2, mv, scale, ws, q48;
    ClockSource mode;
} ClockRequest;
typedef struct {
    ClockRatio input, vco, sys, hclk, pclk1, pclk2, timer1, timer2, q;
    uint32_t minimumWs;
} ClockPlan;
typedef struct { uint32_t count, load; ClockRatio achieved; } ClockTick;
typedef struct {
    uint32_t divisor, mantissa, fraction, brr;
    ClockRatio achieved;
    int64_t errorNum;
    uint64_t errorDen;
} ClockUart;
typedef enum {
    CLOCK_FAULT_NONE, CLOCK_FAULT_HSE, CLOCK_FAULT_PLL, CLOCK_FAULT_SWITCH,
    CLOCK_FAULT_READBACK, CLOCK_FAULT_VOS, CLOCK_FAULT_OFF
} ClockFault;
typedef struct {
    uint32_t phase, attempt, limit, steps, down, terminal;
    uint32_t hclk, scale, ws, apb1, apb2, pllOn, plli2sOn, hseOn;
    ClockStatus status;
    ClockFault fault;
    const char *event;
    const char *source;
} ClockSwitch;

/* All non-NULL pointers must refer to live objects of the declared type.
 * Calculate inputs must be initialized; outputs are complete writable storage.
 * Step requires state established by begin; begin does not read old storage.
 * Writable outputs must not overlap inputs. Single context, non-reentrant.
 * No arbitrary/dangling pointer or dishonest object extent can be validated.
 * Calculate calls commit only on CLOCK_OK; otherwise output fields are preserved.
 * Policy: 2.7..3.6 V, input 1..2 MHz, N192..432, VCO192..432 MHz;
 * this conservative shared-evidence subdomain is narrower than DS Rev12/HAL.
 */
/** @brief Validate nominal plan. @param[in] request Live input. @param[out] output Live output. @return Status. */
ClockStatus clock_plan(const ClockRequest *request, ClockPlan *output);
/**
 * @brief Exact periodic SysTick; count1 returns NO_EVENT.
 * @param[in] source Frequency ratio, rateHz >0.
 * @param[out] output Live output.
 * @return Status.
 */
ClockStatus clock_tick(ClockRatio source, uint32_t rateHz, ClockTick *output);
/**
 * @brief OVER8=0 nearest divisor, ties upward.
 * @param[in] clockHz Bus Hz, baud >0.
 * @param[out] output Live output.
 * @return Status.
 */
ClockStatus clock_uart(uint32_t clockHz, uint32_t baud, ClockUart *output);
/**
 * @brief Initialize fixed up16->168 or down168->84 fake fixture.
 * @param[in] down 0/1, fault, limit1..3.
 * @param[out] output Live storage.
 * @return Status.
 */
ClockStatus clock_switch_begin(uint32_t down, ClockFault fault, uint32_t limit, ClockSwitch *output);
/**
 * @brief Execute one bounded fake request/observation.
 * @param[in,out] state Previously begun state.
 * @return Status; DONE does not advance.
 */
ClockStatus clock_switch_step(ClockSwitch *state);
/** @brief Stable status name. @param[in] status Any enum value. @return Static string. */
const char *clock_status_name(ClockStatus status);
#endif
```

### clock_plan.c · 完整文本 {#clock-source-clock_plan-c}

<a href="../examples/clock-timebase/clock_plan.c" download>下载clock_plan.c</a>

```text
/******************************************************************************
 * Original embedded-notes teaching project, 2026. No third-party authorship claimed.
 * @file clock_plan.c
 * @author embedded-notes project
 * @brief Rational nominal arithmetic and finite fake switching. No MMIO.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "clock_plan.h"
#include <stddef.h>
#ifdef CLOCK_PLAN_TEST
#include <stdio.h>
#endif

/** @brief Reduce positive ratio. @param[in] num,den Positive. @return Ratio. */
static ClockRatio ratio(uint64_t num, uint64_t den)
{
    uint64_t a = num;
    uint64_t b = den;
    /** Euclid divides only by nonzero b. **/
    while (b != 0U) {
        uint64_t remainder = a % b;
        a = b;
        b = remainder;
    }
    return (ClockRatio){num / a, den / a};
}

/** @brief Discrete divider test. @param[in] value,ahb Divider and bus. @return 0/1. */
static int divider_valid(uint32_t value, int ahb)
{
    /** Divider encodings are not a continuous interval. **/
    return value == 1U || value == 2U || value == 4U || value == 8U || value == 16U ||
        (ahb != 0 && (value == 64U || value == 128U || value == 256U || value == 512U));
}

/** @brief Check fields and source. @param[in] r Live input. @return Status. */
static ClockStatus request_valid(const ClockRequest *r)
{
    /** Separate malformed fields, physical ranges and a deliberately narrower policy. **/
    if (r->m < 2U || r->m > 63U || r->n < 50U || r->n > 432U ||
        (r->p != 2U && r->p != 4U && r->p != 6U && r->p != 8U) ||
        r->q < 2U || r->q > 15U || !divider_valid(r->ahb, 1) || !divider_valid(r->apb1, 0) ||
        !divider_valid(r->apb2, 0) || (r->scale != 1U && r->scale != 2U) || r->ws > 7U || r->q48 > 1U) {
        return CLOCK_INVALID;
    }
    if ((r->mode == CLOCK_HSI && r->hz != 16000000U) ||
        (r->mode == CLOCK_CRYSTAL && (r->hz < 4000000U || r->hz > 26000000U)) ||
        (r->mode == CLOCK_BYPASS && (r->hz < 1000000U || r->hz > 50000000U)) ||
        (r->mode != CLOCK_HSI && r->mode != CLOCK_CRYSTAL && r->mode != CLOCK_BYPASS)) {
        return CLOCK_DEVICE;
    }
    if (r->mv < 2700U || r->mv > 3600U || r->n < 192U ||
        r->hz < UINT64_C(1000000) * r->m || r->hz > UINT64_C(2000000) * r->m) {
        return CLOCK_POLICY;
    }
    return CLOCK_OK;
}

/**
 * @brief Validate nominal plan transactionally.
 * @param[in] request Live input.
 * @param[out] output Live output.
 * @return Status.
 */
ClockStatus clock_plan(const ClockRequest *request, ClockPlan *output)
{
    ClockPlan next;
    uint64_t product;
    uint64_t sysDen;
    uint64_t hDen;
    uint32_t minimumWs = 0U;
    const uint32_t upperHz[6] = {30000000U,60000000U,90000000U,120000000U,150000000U,168000000U};
    ClockStatus status;
    /** Guard pointers before reads, and multiplication before execution. **/
    if (request == NULL || output == NULL) {
        return CLOCK_INVALID;
    }
    if (request->n != 0U && request->hz > UINT64_MAX / request->n) {
        return CLOCK_OVERFLOW;
    }
    status = request_valid(request);
    if (status != CLOCK_OK) {
        return status;
    }
    product = request->hz * request->n;
    if (product < UINT64_C(192000000) * request->m || product > UINT64_C(432000000) * request->m) {
        return CLOCK_POLICY;
    }
    /** After bounded fields, denominator products and range cross-products fit uint64_t. **/
    sysDen = (uint64_t)request->m * request->p;
    hDen = sysDen * request->ahb;
    if (product < UINT64_C(24000000) * sysDen || product > UINT64_C(168000000) * sysDen ||
        product > (request->scale == 1U ? UINT64_C(168000000) : UINT64_C(144000000)) * hDen ||
        product > UINT64_C(42000000) * hDen * request->apb1 ||
        product > UINT64_C(84000000) * hDen * request->apb2 ||
        product > UINT64_C(75000000) * request->m * request->q) {
        return CLOCK_DEVICE;
    }
    if (request->q48 != 0U && product != UINT64_C(48000000) * request->m * request->q) {
        return CLOCK_POLICY;
    }
    while (minimumWs < 5U && product > (uint64_t)upperHz[minimumWs] * hDen) {
        minimumWs++;
    }
    if (request->ws < minimumWs) {
        return CLOCK_FLASH;
    }
    next.input = ratio(request->hz, request->m);
    next.vco = ratio(product, request->m);
    next.sys = ratio(product, sysDen);
    next.hclk = ratio(product, hDen);
    next.pclk1 = ratio(product, hDen * request->apb1);
    next.pclk2 = ratio(product, hDen * request->apb2);
    next.timer1 = ratio(product * (request->apb1 == 1U ? 1U : 2U), hDen * request->apb1);
    next.timer2 = ratio(product * (request->apb2 == 1U ? 1U : 2U), hDen * request->apb2);
    next.q = ratio(product, (uint64_t)request->m * request->q);
    next.minimumWs = minimumWs;
    *output = next;
    return CLOCK_OK;
}

/**
 * @brief Exact periodic SysTick.
 * @param[in] source,rateHz Frequency and rate.
 * @param[out] output Live output.
 * @return Status.
 */
ClockStatus clock_tick(ClockRatio source, uint32_t rateHz, ClockTick *output)
{
    uint64_t denominator;
    uint64_t count;
    /** Count1 encodes LOAD0, which does not generate the normal periodic 1-to-0 event. **/
    if (output == NULL || source.num == 0U || source.den == 0U || rateHz == 0U) {
        return CLOCK_INVALID;
    }
    if (source.den > UINT64_MAX / rateHz) {
        return CLOCK_OVERFLOW;
    }
    denominator = source.den * rateHz;
    count = source.num / denominator;
    if (count == 0U || count > UINT64_C(16777216)) {
        return CLOCK_RANGE;
    }
    if (source.num % denominator != 0U) {
        return CLOCK_INEXACT;
    }
    if (count == 1U) {
        return CLOCK_NO_EVENT;
    }
    *output = (ClockTick){(uint32_t)count, (uint32_t)(count - 1U), {rateHz, 1U}};
    return CLOCK_OK;
}

/**
 * @brief OVER8=0 nearest divisor, ties upward.
 * @param[in] clockHz,baud Hz.
 * @param[out] output Live output.
 * @return Status.
 */
ClockStatus clock_uart(uint32_t clockHz, uint32_t baud, ClockUart *output)
{
    uint64_t divisor;
    uint64_t denominator;
    ClockUart next;
    /** Reject above-PCLK/16 requests even if rounding would produce divisor16. **/
    if (output == NULL || clockHz == 0U || baud == 0U) {
        return CLOCK_INVALID;
    }
    if ((uint64_t)clockHz < (uint64_t)baud * 16U) {
        return CLOCK_RANGE;
    }
    divisor = clockHz / baud;
    if ((uint64_t)(clockHz % baud) * 2U >= baud) {
        divisor++;
    }
    if (divisor > 65535U) {
        return CLOCK_RANGE;
    }
    denominator = (uint64_t)baud * divisor;
    next.divisor = (uint32_t)divisor;
    next.mantissa = (uint32_t)(divisor / 16U);
    next.fraction = (uint32_t)(divisor % 16U);
    next.brr = (uint32_t)divisor;
    next.achieved = ratio(clockHz, divisor);
    next.errorNum = (int64_t)clockHz - (int64_t)denominator;
    next.errorDen = denominator;
    *output = next;
    return CLOCK_OK;
}

/**
 * @brief Begin fixed up16->168 or down168->84 fixture.
 * @param[in] down,fault,limit Conditions.
 * @param[out] output Live output.
 * @return Status.
 */
ClockStatus clock_switch_begin(uint32_t down, ClockFault fault, uint32_t limit, ClockSwitch *output)
{
    ClockSwitch next = {0};
    /** Both fixtures declare available HSI and disabled PLLI2S, not measured hardware. **/
    if (output == NULL || down > 1U || fault < CLOCK_FAULT_NONE || fault > CLOCK_FAULT_OFF ||
        limit < 1U || limit > 3U) {
        return CLOCK_INVALID;
    }
    next.limit = limit;
    next.down = down;
    next.hclk = down != 0U ? 168000000U : 16000000U;
    next.scale = down != 0U ? 1U : 2U;
    next.ws = down != 0U ? 5U : 0U;
    next.apb1 = down != 0U ? 4U : 1U;
    next.apb2 = down != 0U ? 2U : 1U;
    next.pllOn = down;
    next.hseOn = down;
    next.fault = fault;
    next.source = down != 0U ? "PLL" : "HSI";
    next.event = "SEED";
    next.status = CLOCK_OK;
    *output = next;
    return CLOCK_OK;
}

/** @brief Explicit scripted fallback. @param[in,out] s Begun state. @param[in] status Failure. @return Failure. */
static ClockStatus fallback(ClockSwitch *s, ClockStatus status)
{
    /** Fake fallback has guaranteed HSI/SWS observation; real fallback can also fail. **/
    s->source = "HSI";
    s->hclk = 16000000U;
    s->apb1 = 16U;
    s->apb2 = 16U;
    s->terminal = 1U;
    s->status = status;
    s->event = "FAIL_SAFE_HSI16_CONFIRMED";
    return status;
}

/** @brief One bounded observation. @param[in,out] s Begun state. @param[in] fault,failure Script. @return Status. */
static ClockStatus observe(ClockSwitch *s, ClockFault fault, ClockStatus failure)
{
    /** Nonfault readiness arrives on observation2; attempts have a maximum of3. **/
    s->attempt++;
    if (s->fault != fault && s->attempt >= 2U) {
        s->attempt = 0U;
        s->phase++;
        return CLOCK_OK;
    }
    if (s->attempt >= s->limit) {
        return fallback(s, failure);
    }
    return CLOCK_OK;
}

/** @brief One fake request/observation. @param[in,out] state Previously begun state. @return Status. */
ClockStatus clock_switch_step(ClockSwitch *state)
{
    ClockSwitch *s = state;
    /** Metadata checks supplement, and cannot replace, the live-object caller contract. **/
    if (s == NULL || s->phase > 28U || s->limit < 1U || s->limit > 3U || s->down > 1U ||
        s->fault < CLOCK_FAULT_NONE || s->fault > CLOCK_FAULT_OFF || s->steps > 64U) {
        return CLOCK_INVALID;
    }
    if (s->terminal != 0U) {
        return CLOCK_DONE;
    }
    s->steps++;
    switch (s->phase) {
        case 0:
            s->event = "HSI_ENABLE_REQUEST";
            break;
        case 1:
            s->event = "HSIRDY_OBSERVED_AVAILABLE";
            break;
        case 2:
            s->apb1 = 16U;
            s->apb2 = 16U;
            s->event = "APB16_REQUEST";
            break;
        case 3:
            s->event = "APB16_READBACK";
            break;
        case 4:
            s->event = "SW_HSI_REQUEST";
            break;
        case 5:
            s->source = "HSI";
            s->hclk = 16000000U;
            s->event = "SWS_HSI_OBSERVED";
            break;
        case 6:
            s->pllOn = 0U;
            s->event = "PLL_OFF_REQUEST";
            break;
        case 7:
            s->event = "PLLRDY_CLEAR_OBSERVATION";
            return observe(s, CLOCK_FAULT_OFF, CLOCK_TIMEOUT_OFF);
        case 8:
            s->hseOn = 0U;
            s->event = "HSE_OFF_REQUEST";
            break;
        case 9:
            s->event = "HSERDY_CLEAR_OBSERVATION";
            return observe(s, CLOCK_FAULT_OFF, CLOCK_TIMEOUT_OFF);
        case 10:
            s->event = "HSE_MODE_WRITE_WHILE_OFF";
            break;
        case 11:
            s->hseOn = 1U;
            s->event = "HSE_ENABLE_REQUEST";
            break;
        case 12:
            s->event = "HSERDY_OBSERVATION";
            return observe(s, CLOCK_FAULT_HSE, CLOCK_TIMEOUT_HSE);
        case 13:
            s->scale = 1U;
            s->event = "PWR_CLOCK_VOS1_REQUEST";
            break;
        case 14:
            s->event = "F407_VOSRDY_OBSERVATION";
            return observe(s, CLOCK_FAULT_VOS, CLOCK_TIMEOUT_VOS);
        case 15:
            s->ws = 5U;
            s->event = "FLASH5_REQUEST";
            break;
        case 16:
            s->event = "FLASH5_READBACK";
            if (s->fault == CLOCK_FAULT_READBACK) {
                return fallback(s, CLOCK_READBACK);
            }
            break;
        case 17:
            if (s->pllOn != 0U || s->plli2sOn != 0U) {
                return fallback(s, CLOCK_INVALID);
            }
            s->event = "PLL_CONFIG_M8_N336_P2_OR4_Q7_WHILE_OFF";
            break;
        case 18:
            s->pllOn = 1U;
            s->event = "PLL_ENABLE_REQUEST";
            break;
        case 19:
            s->event = "PLLRDY_OBSERVATION";
            return observe(s, CLOCK_FAULT_PLL, CLOCK_TIMEOUT_PLL);
        case 20:
            s->event = "HPRE1_READBACK_APB16_HELD";
            break;
        case 21:
            s->event = "SW_PLL_REQUEST";
            break;
        case 22:
            s->event = "SWS_PLL_OBSERVATION";
            if (observe(s, CLOCK_FAULT_SWITCH, CLOCK_TIMEOUT_SWITCH) != CLOCK_OK) {
                return s->status;
            }
            if (s->attempt == 0U) {
                s->source = "PLL";
                s->hclk = s->down != 0U ? 84000000U : 168000000U;
            }
            return CLOCK_OK;
        case 23:
            s->apb1 = s->down != 0U ? 2U : 4U;
            s->apb2 = s->down != 0U ? 1U : 2U;
            s->event = "FINAL_APB_REQUEST";
            break;
        case 24:
            s->event = "FINAL_APB_READBACK";
            break;
        case 25:
            s->ws = s->down != 0U ? 2U : 5U;
            s->event = "FINAL_FLASH_REQUEST_AFTER_SWS";
            break;
        case 26:
            s->event = "FINAL_FLASH_READBACK";
            break;
        case 27:
            s->scale = s->down != 0U ? 2U : 1U;
            s->event = s->down != 0U ? "VOS2_REQUEST_AFTER_HCLK84" : "VOS1_RETAINED";
            break;
        case 28:
            s->event = "FINAL_F407_VOSRDY_OBSERVATION";
            if (observe(s, CLOCK_FAULT_VOS, CLOCK_TIMEOUT_VOS) != CLOCK_OK) {
                return s->status;
            }
            if (s->attempt == 0U) {
                s->phase = 28U;
                s->terminal = 1U;
                s->event = "SUCCESS_TARGET_CONFIRMED";
            }
            return CLOCK_OK;
        default:
            return CLOCK_INVALID;
    }
    s->phase++;
    return CLOCK_OK;
}

/** @brief Status name. @param[in] status Enum. @return Static string. */
const char *clock_status_name(ClockStatus status)
{
    static const char *const names[] = {"OK","INVALID","OVERFLOW","POLICY","DEVICE","FLASH",
        "INEXACT","RANGE","NO_EVENT","DONE","TIMEOUT_HSE","TIMEOUT_PLL","TIMEOUT_SWITCH",
        "READBACK","TIMEOUT_VOS","TIMEOUT_OFF"};
    /** Unsigned check covers negative enum casts. **/
    if ((unsigned int)status >= sizeof(names) / sizeof(names[0])) {
        return "UNKNOWN";
    }
    return names[status];
}

#ifdef CLOCK_PLAN_TEST
/** @brief Active expectation. @param[in] ok,label Expectation. @return 0/1. */
static int expect(int ok, const char *label)
{
    /** All fallible I/O is checked immediately, including flush. **/
    if (!ok) {
        if (fprintf(stderr, "FAIL unit09: %s\n", label) < 0) {
            return 0;
        }
        if (fflush(stderr) != 0) {
            return 0;
        }
        return 0;
    }
    return 1;
}

/** @brief Fixed arithmetic and failure fixtures. @param[in] None. @return 0/1. */
static int test_calculations(void)
{
    ClockRequest r = {8000000,8,336,2,7,1,4,2,3300,1,5,1,CLOCK_CRYSTAL};
    ClockPlan p = {0};
    ClockTick t = {0};
    ClockUart u = {0};
    /** Literal expectations come from independent worked cases. **/
    if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.input.num == 1000000U && p.input.den == 1U &&
        p.vco.num == 336000000U && p.hclk.num == 168000000U && p.hclk.den == 1U &&
        p.pclk1.num == 42000000U && p.pclk2.num == 84000000U && p.timer1.num == 84000000U &&
        p.q.num == 48000000U && p.minimumWs == 5U, "168/42/84 literal")) {
        return 0;
    }
    r.ws = 4U;
    if (!expect(clock_plan(&r,&p) == CLOCK_FLASH && p.hclk.num == 168000000U, "Flash rejection preserves")) {
        return 0;
    }
    r.ws = 5U;
    r.hz = UINT64_MAX;
    if (!expect(clock_plan(&r,&p) == CLOCK_OVERFLOW && p.hclk.num == 168000000U, "multiply guard")) {
        return 0;
    }
    if (!expect(clock_plan(NULL,&p) == CLOCK_INVALID && clock_plan(&r,NULL) == CLOCK_INVALID, "NULL guards")) {
        return 0;
    }
    if (!expect(clock_tick((ClockRatio){168000000,1},1000,&t) == CLOCK_OK &&
        t.count == 168000U && t.load == 167999U, "tick literal")) {
        return 0;
    }
    if (!expect(clock_tick((ClockRatio){16777216,1},1,&t) == CLOCK_OK && t.load == 16777215U &&
        clock_tick((ClockRatio){16777217,1},1,&t) == CLOCK_RANGE && t.load == 16777215U &&
        clock_tick((ClockRatio){1,1},1,&t) == CLOCK_NO_EVENT && t.load == 16777215U &&
        clock_tick((ClockRatio){1,1},2,&t) == CLOCK_RANGE &&
        clock_tick((ClockRatio){10,1},3,&t) == CLOCK_INEXACT &&
        clock_tick((ClockRatio){1,UINT64_MAX},2,&t) == CLOCK_OVERFLOW &&
        clock_tick((ClockRatio){2,1},1,&t) == CLOCK_OK && t.load == 1U, "tick boundary statuses")) {
        return 0;
    }
    if (!expect(clock_uart(42000000U,115200U,&u) == CLOCK_OK && u.divisor == 365U &&
        u.brr == 0x016DU && u.mantissa == 22U && u.fraction == 13U && u.achieved.num == 8400000U &&
        u.achieved.den == 73U && u.errorNum == -48000 && u.errorDen == 42048000U, "UART rational")) {
        return 0;
    }
    if (!expect(clock_uart(165U,10U,&u) == CLOCK_OK && u.divisor == 17U &&
        clock_uart(160U,10U,&u) == CLOCK_OK && u.divisor == 16U &&
        clock_uart(65535U,1U,&u) == CLOCK_OK && u.divisor == 65535U &&
        clock_uart(65536U,1U,&u) == CLOCK_RANGE && u.divisor == 65535U &&
        clock_uart(159U,10U,&u) == CLOCK_RANGE && u.divisor == 65535U &&
        clock_uart(1U,0U,&u) == CLOCK_INVALID && clock_uart(1U,1U,NULL) == CLOCK_INVALID, "UART bounds/tie")) {
        return 0;
    }
    return 1;
}

/** @brief Compare named report fields, never padding. @param[in] a,b Reports. @return 0/1. */
static int same_plan(const ClockPlan *a, const ClockPlan *b)
{
    const ClockRatio left[] = {a->input,a->vco,a->sys,a->hclk,a->pclk1,a->pclk2,a->timer1,a->timer2,a->q};
    const ClockRatio right[] = {b->input,b->vco,b->sys,b->hclk,b->pclk1,b->pclk2,b->timer1,b->timer2,b->q};
    /** Struct assignment need not preserve padding bytes. **/
    for (size_t i = 0U; i < 9U; i++) {
        if (left[i].num != right[i].num || left[i].den != right[i].den) {
            return 0;
        }
    }
    return a->minimumWs == b->minimumWs;
}

/** @brief Discrete domains, exact limits and rejected output snapshots. @param[in] None. @return 0/1. */
static int test_domains(void)
{
    const ClockRequest seed = {8000000,8,336,2,7,1,4,2,3300,1,5,1,CLOCK_CRYSTAL};
    const uint32_t ahb[] = {1,2,4,8,16,64,128,256,512};
    const uint32_t hclk[] = {168000000,84000000,42000000,21000000,10500000,2625000,1312500,656250,328125};
    const uint32_t apb[] = {1,2,4,8,16};
    const uint32_t pclk[] = {21000000,10500000,5250000,2625000,1312500};
    const uint32_t timer[] = {21000000,21000000,10500000,5250000,2625000};
    const uint32_t pllP[] = {2,4,6,8};
    const uint32_t sys[] = {168000000,84000000,56000000,42000000};
    const uint32_t flashN[] = {240,240,360,240,300,336};
    const uint32_t flashP[] = {8,4,4,2,2,2};
    ClockRequest r;
    ClockPlan p = {0};
    ClockPlan before;
    /** Literal tables cover every discrete alternative through the public interface. **/
    for (size_t i = 0U; i < 9U; i++) {
        r = seed;
        r.ahb = ahb[i];
        if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.hclk.num == hclk[i] && p.hclk.den == 1U,
            "all AHB alternatives")) {
            return 0;
        }
    }
    for (size_t i = 0U; i < 5U; i++) {
        r = seed;
        r.ahb = 8U;
        r.apb1 = apb[i];
        r.apb2 = apb[i];
        if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.pclk1.num == pclk[i] &&
            p.pclk2.num == pclk[i] && p.timer1.num == timer[i], "all APB alternatives")) {
            return 0;
        }
    }
    for (size_t i = 0U; i < 4U; i++) {
        r = seed;
        r.p = pllP[i];
        if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.sys.num == sys[i], "all PLLP alternatives")) {
            return 0;
        }
    }
    for (uint32_t q = 2U; q <= 15U; q++) {
        r = seed;
        r.q48 = 0U;
        r.q = q;
        before = p;
        if (!expect(clock_plan(&r,&p) == (q < 5U ? CLOCK_DEVICE : CLOCK_OK) &&
            (q >= 5U || same_plan(&p,&before)), "all PLLQ alternatives and75MHz bound")) {
            return 0;
        }
    }
    for (uint32_t ws = 0U; ws < 6U; ws++) {
        r = seed;
        r.n = flashN[ws];
        r.p = flashP[ws];
        r.ws = ws;
        r.q48 = 0U;
        if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.minimumWs == ws, "Flash exact boundary")) {
            return 0;
        }
        before = p;
        r.hz++;
        if (!expect(clock_plan(&r,&p) == (ws == 5U ? CLOCK_DEVICE : CLOCK_FLASH) && same_plan(&p,&before),
            "Flash above boundary preserves every field")) {
            return 0;
        }
    }
    r = seed;
    r.n = 288U;
    r.q = 6U;
    r.scale = 2U;
    r.ws = 4U;
    if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.hclk.num == 144000000U, "Scale2 equality")) {
        return 0;
    }
    before = p;
    r.hz++;
    if (!expect(clock_plan(&r,&p) == CLOCK_DEVICE && same_plan(&p,&before), "Scale2 above maximum")) {
        return 0;
    }
    r = seed;
    r.hz = 4194304U;
    r.m = 4U;
    r.n = 256U;
    r.ahb = 8U;
    r.q48 = 0U;
    if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.hclk.num == 16777216U, "full plan tick maximum")) {
        return 0;
    }
    r.hz = 16777217U;
    r.m = 16U;
    if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.hclk.num == 16777217U &&
        p.input.num == 16777217U && p.input.den == 16U, "rational intermediate preserved")) {
        return 0;
    }
    return 1;
}

/** @brief Initialized invalid requests preserve every output field. @param[in] None. @return 0/1. */
static int test_rejections(void)
{
    const ClockRequest seed = {8000000,8,336,2,7,1,4,2,3300,1,5,1,CLOCK_CRYSTAL};
    const ClockStatus expected[] = {CLOCK_INVALID,CLOCK_INVALID,CLOCK_INVALID,CLOCK_INVALID,
        CLOCK_INVALID,CLOCK_INVALID,CLOCK_INVALID,CLOCK_INVALID,CLOCK_INVALID,CLOCK_INVALID,
        CLOCK_INVALID,CLOCK_INVALID,CLOCK_INVALID,CLOCK_DEVICE,CLOCK_DEVICE,CLOCK_DEVICE,
        CLOCK_POLICY,CLOCK_POLICY,CLOCK_POLICY,CLOCK_POLICY,CLOCK_POLICY,CLOCK_DEVICE,
        CLOCK_DEVICE,CLOCK_DEVICE,CLOCK_OVERFLOW,CLOCK_FLASH,CLOCK_POLICY,CLOCK_DEVICE};
    ClockRequest cases[28];
    ClockPlan p = {0};
    ClockPlan before;
    /** Fault fixtures are full initialized copies, not invented addresses or spans. **/
    for (size_t i = 0U; i < 28U; i++) {
        cases[i] = seed;
    }
    cases[0].m = 0U;
    cases[1].m = 64U;
    cases[2].n = 49U;
    cases[3].n = 433U;
    cases[4].p = 3U;
    cases[5].q = 1U;
    cases[6].q = 16U;
    cases[7].ahb = 32U;
    cases[8].apb1 = 3U;
    cases[9].apb2 = 32U;
    cases[10].scale = 3U;
    cases[11].ws = 8U;
    cases[12].q48 = 2U;
    cases[13].apb1 = 2U;
    cases[14].apb2 = 1U;
    cases[15].scale = 2U;
    cases[16].mv = 2699U;
    cases[17].mv = 3601U;
    cases[18].n = 100U;
    cases[19].hz = 7999999U;
    cases[20].hz = 16000001U;
    cases[21].hz = 26000001U;
    cases[22].mode = CLOCK_HSI;
    cases[23].mode = (ClockSource)3;
    cases[24].hz = UINT64_MAX;
    cases[25].ws = 4U;
    cases[26].q = 6U;
    cases[27].hz = 0U;
    if (!expect(clock_plan(&seed,&p) == CLOCK_OK, "rejection accepted seed")) {
        return 0;
    }
    before = p;
    for (size_t i = 0U; i < 28U; i++) {
        if (!expect(clock_plan(&cases[i],&p) == expected[i] && same_plan(&p,&before),
            "rejected plan all named output fields preserved")) {
            return 0;
        }
    }
    return 1;
}

/** @brief Actual fake backend success and injected failures. @param[in] None. @return 0/1. */
static int test_switch(void)
{
    const ClockStatus failures[] = {CLOCK_OK,CLOCK_TIMEOUT_HSE,CLOCK_TIMEOUT_PLL,CLOCK_TIMEOUT_SWITCH,
        CLOCK_READBACK,CLOCK_TIMEOUT_VOS,CLOCK_TIMEOUT_OFF};
    /** Exercise both directions without fabricated pointers or a target instruction. **/
    for (uint32_t down = 0U; down < 2U; down++) {
        for (uint32_t f = 0U; f < 7U; f++) {
            ClockSwitch s;
            if (!expect(clock_switch_begin(down,(ClockFault)f,3U,&s) == CLOCK_OK, "begin")) {
                return 0;
            }
            for (uint32_t i = 0U; i < 64U && s.terminal == 0U; i++) {
                ClockStatus status = clock_switch_step(&s);
                if (!expect((status == CLOCK_OK || status == failures[f]) &&
                    s.hclk / s.apb1 <= 42000000U && s.hclk / s.apb2 <= 84000000U,
                    "step status and transient bus bounds")) {
                    return 0;
                }
            }
            if (!expect(s.terminal == 1U && s.steps < 50U && s.status == failures[f] &&
                s.hclk == (f != 0U ? 16000000U : down != 0U ? 84000000U : 168000000U), "terminal")) {
                return 0;
            }
            {
                uint32_t steps = s.steps;
                if (!expect(clock_switch_step(&s) == CLOCK_DONE && s.steps == steps, "bounded end")) {
                    return 0;
                }
            }
        }
    }
    return expect(clock_switch_step(NULL) == CLOCK_INVALID, "step NULL guard");
}

/** @brief Host validation, active with NDEBUG. @param[in] None. @return Nonzero on failure. */
int main(void)
{
    /** Never report buffered success before checking flush. **/
    if (!test_calculations()) {
        return 1;
    }
    if (!test_switch()) {
        return 1;
    }
    if (!test_domains()) {
        return 1;
    }
    if (!test_rejections()) {
        return 1;
    }
    if (puts("PASS unit09: rational clocks, tick boundaries, UART rounding, bounded up/down/fault switch") == EOF) {
        return 2;
    }
    if (fflush(stdout) != 0) {
        return 2;
    }
    return 0;
}
#endif
```

### README.txt · 完整文本 {#clock-source-README-txt}

<a href="../examples/clock-timebase/README.txt" download>下载README.txt</a>

```text
clock-timebase — original embedded-notes C11 teaching model, 2026

Files: clock_plan.h interface; clock_plan.c reusable implementation and optional
CLOCK_PLAN_TEST host entry. Original project work, no third-party authorship or
new third-party license grant is asserted. No vendor driver is bundled.

Prerequisite: an existing C11 compiler supporting uint32_t/uint64_t/int64_t.
From this directory (use .exe on Windows as appropriate):
  cc -std=c11 -Wall -Wextra -Wconversion -Wshadow -Werror -pedantic -DCLOCK_PLAN_TEST clock_plan.c -o clock-test
  ./clock-test
  cc -std=c11 -Wall -Wextra -Wconversion -Wshadow -Werror -pedantic -DCLOCK_PLAN_TEST -DNDEBUG clock_plan.c -o clock-ndebug
  ./clock-ndebug
  cc -std=c11 -Wall -Wextra -Wconversion -Wshadow -Werror -pedantic -c clock_plan.c -o clock_plan.o
Where a project requires mcu-build, put these exact commands in its approved
custom profiles and perform validate -> build --dry-run -> build. All author
compiles used that route; standalone commands here describe reproducible flags.
Expected success line:
PASS unit09: rational clocks, tick boundaries, UART rounding, bounded up/down/fault switch
Any failed expectation or output/flush failure exits nonzero; checks use no assert.

Without CLOCK_PLAN_TEST there is no main. Include clock_plan.h, compile/link
clock_plan.c with your own program. Check each status before using a new output.
clock_plan, clock_tick and clock_uart commit only on CLOCK_OK; all other statuses
preserve output fields. clock_switch_begin writes a complete initialized fake
state on OK; invalid arguments preserve it. clock_switch_step mutates a begun
state and can finish with a failure report; it does not roll back real hardware.
After terminal, step returns DONE without advancing. Normal readiness is second
observation, limit1..3. HSI availability and successful fallback observation are
script assumptions; failure ends HSI16MHz with APB/16, never accepted target.
Fixed up: HSI16/Scale2/WS0 -> HSE8 M8 N336 P2 Q7 / AHB1 APB4/2 /168MHz Scale1 WS5.
Fixed down: PLL168 Scale1 WS5 -> same HSE M/N with P4 /84MHz APB2/1 Scale2 WS2.
PLLI2S is explicitly disabled and no other consumer is present in both fixtures.

Caller contract: non-NULL pointers designate live, correctly typed initialized
real objects. Writable output must not overlap inputs. Begin is allowed on fresh
uninitialized storage because it does not read old fields; step requires begun
state. Single execution context, no reentry/concurrent access. Null checks do not
validate forged/dangling pointers, dishonest lengths, aliases or object lifetimes.
Tests use initialized real storage, not invalid-address execution. Reports are
compared by named fields, not structure padding.

Device/scope: STM32F407VG nominal internal-regulator planning, VDD2700..3600mV,
Scale1 HCLK<=168MHz, Scale2<=144MHz, PCLK1<=42MHz, PCLK2<=84MHz. Sources are HSE
crystal4..26MHz, bypass1..50MHz or nominal HSI exactly16MHz. Source electrical
waveform, temperature and supply footnotes still apply and are not validated.
Conservative shared-evidence teaching policy: PLL input1..2MHz, N192..432,
VCO192..432MHz. POLICY does NOT mean all excluded settings are physically invalid:
DS8626Rev12 March2026 has input0.95..2.10MHz/VCO100..432, HALv1.8.5 N50..432
(F411 exception min192), historical RM0090Rev5 Sep2013 has N/VCO minimum192.
Current official RM revision was not read. Discrete M2..63/P2,4,6,8/Q2..15;
AHB1,2,4,8,16,64,128,256,512; APB1,2,4,8,16. Q48=1 requires exact48MHz;
Q output is limited to DS maximum75MHz. Q48=0 reports an unused branch and grants no peripheral compliance.
Flash band2700..3600mV: HCLK up to30/60/90/120/150/168MHz requires0/1/2/3/4/5WS.
Calculate retains rational Hz, rejects overflow before multiply; bounded fields
make subsequent uint64_t products finite. Browser uses safe-integer Number input,
reports OVERFLOW before losing integer exactness; C exposes uint64_t sourceHz.

SysTick: caller supplies chosen source as positive rational Hz; F407 allows HCLK
or HCLK/8. Exact periodic count must be2..16777216, LOAD=count-1. Count1 encodes
LOAD0 but returns NO_EVENT, not an interrupt-every-clock promise. Zero or excess
returns RANGE; fractional count returns INEXACT with no rounded setting committed.
UART: uint32_t busHz/baud, OVER8=0; requested baud<=busHz/16 and rounded effective
divisor16..65535; nearest divisor ties upward. BRR=D, mantissa=D/16,fraction=D%16.
Achieved baud is a ratio; errorNum/errorDen=(actual-requested)/requested. No
universal2% receiver promise. UART PCLK1=42MHz differs from APB1 timer84MHz.

F407 VOS and VOSRDY are bit14 (RMRev5 pp138-139, pinned DeviceF4v2.6.10 header).
HALv1.8.5 F407 PWREx writes VOS and waits VOSRDY without PLL-off requirement for
that voltage operation. PLL coefficient/source changes separately require the
appropriate disabled PLL(s), HSEBYP only with HSE off. Lower HCLK before Scale1
to2; Scale2 to1 readiness before raising. The fake bridge exists for PLL rewrite.

This is nominal host arithmetic and scripted state only: no MMIO, no STM32 clock
driver, target startup, physical PLL lock, voltage/Flash behavior, oscillator
accuracy/jitter, UART waveform, hardware validation or USB compliance claim.
Record compiler identity, command/status, source hashes and fresh artifact hashes.
Host execution, browser checks, site build, review, publication and hardware are
separate evidence states. This unit is a local candidate pending root integration.
```

作者本次主机检查采用已有GCC13.1.0，经mcu-build自定义profile的validate→dry-run→build，严格C11、警告为错误，正常与NDEBUG实际运行、无main模块独立编译。输出失败或flush失败非零，不依赖assert。固定值、边界、错误保持和双方向故障轨迹分别检查；这不构成目标编译、硬件运行或物理打印验证。

## 独立十题：基础、故障与迁移 {#clock-practice-title}

每题条件独立，不依赖实验当前状态。先写结论和原因，再展开原生解析。普通打印展开全部解释后恢复原折叠；只打印题目隐藏答案、反馈与已解正文。无脚本仍可读完整正文及原生答案。
展开全部答案折叠全部答案只打印题目
### 01 · 基础：N不是总倍频 {#clock-question-01}

HSE8MHz、M8、N336、P2、Q7、AHB1、APB1÷4、APB2÷2，VDD3.3V、Scale1、WS5。PLL输入、VCO、SYSCLK/HCLK、PCLK1/2和Q支路分别多少？

展开本题原因

1、336、168/168、42/84、48MHz。N336乘在分频后的1MHz上，P/Q各从VCO分支。下一次先写每一级单位，避免把8MHz直接乘336。


### 02 · 基础：定时器与USART {#clock-question-02}

F407 HCLK168MHz、APB1÷4、APB2÷2，USART2普通总线源、定时器采用本章APB规则。USART2与APB1定时器输入分别多少？若APB1÷1且HCLK42MHz呢？

展开本题原因

前者42MHz与84MHz；后者两者都是42MHz，因为APB预分频=1不翻倍。×2属于定时器输入规则，不改变总线，也不传给USART。


### 03 · 基础：24位边界 {#clock-question-03}

SysTick选择HCLK168000000Hz，请求1000Hz周期；另有独立源16777216Hz请求1Hz。各写count/LOAD；第二种把源加1Hz会怎样？

展开本题原因

168000/167999；16777216/16777215。加1后的count16777217超24位周期上限，RANGE且旧输出保持。LOAD最大值与count最大值相差1。


### 04 · 故障：LOAD0 {#clock-question-04}

SysTick源1Hz、请求1Hz，理想count1。有人因LOAD=0能写入便承诺每秒中断；本页周期接口应返回什么？独立源2Hz请求1Hz又如何？

展开本题原因

前者NO_EVENT：LOAD0缺少正常1→0事件，不能承诺该周期；后者OK，count2、LOAD1，周期1秒。字段编码与可用周期事件不是同一结论。


### 05 · 故障：已写不等于已到 {#clock-question-05}

固定向上轨迹从HSI16/Scale2/WS0到PLL168/Scale1/WS5，正常ready在第2次观察成立，上限3。执行SW_PLL请求、第一次SWS观察、第二次SWS观察后，模型HCLK各多少？

展开本题原因

16、16、168MHz。写SW只表达请求，第一次观察未匹配，第二次SWS确认才记录目标；不能把请求后的等待描述成PLL168已成功。


### 06 · 故障：F407电压与PLL {#clock-question-06}

F407从PLL168MHz/Scale1/WS5降到84MHz/Scale2/WS2，HSI可用、PLLI2S关闭。先降Scale2是否正确？改VOS本身是否必须先关闭PLL？重新写PLLM/N/P/Q又如何？

展开本题原因

先降Scale2错误，应先确认HCLK降低，再放宽Flash并观察VOSRDY。F407 VOS操作可在运行中写并等待bit14 VOSRDY，不能复制其他家族停PLL要求；PLL字段重配另有停用条件，共享M/source还涉及PLLI2S。


### 07 · 故障：超时终点 {#clock-question-07}

固定假后端向上目标168MHz，HSERDY始终为0，最多观察3次，HSI与回退SWS保证可用。终点是什么？能说硬件总能安全回退吗？

展开本题原因

第3次观察返回TIMEOUT_HSE，轨迹终止于脚本确认HSI16、APB÷16，目标未成功；不能。回退保证属于这份脚本，真实HSI、SWS与供电都可能另行失败。


### 08 · 迁移：版本与政策 {#clock-question-08}

HSE8MHz/M8/N100/P4、AHB1、APB1÷1/APB2÷1、3.3V/Scale1/WS0、Q48=0。DSRev12 VCO下限100MHz，HALv1.8.5 N下限50；历史RMRev5下限192。本页返回POLICY能证明硬件非法吗？

展开本题原因

不能。VCO100MHz、SYSCLK25MHz在所列新资料数字域内；本页刻意选N/VCO下限192的共同教学子域，因此POLICY是模型范围。要做硬件配置还需匹配当前RM与全部电气条件，不改写历史版本。


### 09 · 迁移：UART取整与符号 {#clock-question-09}

USART2 PCLK1=42000000Hz，请求115200baud、OVER8=0、最近有效D且半数向上。D、尾数、小数、BRR和相对误差精确表达式是什么？TIM输入84MHz应代入吗？

展开本题原因

D365，尾数22，小数13/16，BRR0x016D；误差−48000/42048000≈−0.114155%，实际42000000/365。不能代入TIM84MHz；该误差只是一项量化预算，非通用2%保证。


### 10 · 迁移：非整除与精度 {#clock-question-10}

SysTick源10Hz请求3Hz周期，本页不取整。若另一个方案取count3或4，实际频率与相对请求误差各多少？若晶体参考本身偏+20ppm，理想PLL倍频能消除吗？

展开本题原因

本页INEXACT且输出保持。count3给10/3Hz、+11.111…%；count4给2.5Hz、−16.666…%。理想整数倍分频仍保留+20ppm相对误差；平均准确度不等于抖动，也不能代替测量。


隔一天换成HSE8/M4/N168的式子，先辨政策拒绝与算式相等；再独立重做一题超时、一题UART。一次选对不能推出长期掌握。卡住时可把“反馈N/M”“SWS观察”“VOSRDY家族条件”“LOAD0”或“波特误差分母”中的具体一点交给助手追问。

## 核对来源、版本与适用条件 {#clock-sources-title}

核对日期2026-10-17。图、推导、夹具、题目和主机代码为原创教学材料。先读推荐的器件资料，再按条件核对，不能把下载或排队当已读。当前官方RM0090未完成读取；这里明确使用历史Rev5，保留与较新DS/HAL的差异，不自称最新硬件配置工具。

[S1 · ST DS8626 Rev12，March2026](https://www.st.com/resource/en/datasheet/dm00037051.pdf)：实际查阅F407VG型号、§6.3.1表14/15供电与频率、§6.3.8表30/32来源域、§6.3.10表36 PLL电气域与脚注。首选阅读任务：从表36找出输入和VCO的范围，再把电气条件与本页POLICY写成两行。未检验实际供电、温度、晶体或波形。

[S22 · ST RM0090 DocID018909 Rev5，September2013，Keil制造商资料存档](https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf)：历史1705页；实际阅读§3.5.1pp80–81 Flash表11与升降频顺序、§5.4.1/.2pp138–139 F407 VOS/VOSRDY、§7.2p213 APB定时器/SysTick、§7.3pp220–226 HSEBYP/PLL/SW-SWS/分频、§30.3.3/.4pp956/959–960及§30.3.5p969、§30.6.3p989 UART。旧N/VCO192下限与DS/HAL版本差异已保留；旧p119 bit15文字错误不盖过实际bit14寄存器表。

[S2/S3/S5/S21/S25 · ST HALv1.8.5，commit b6f0ed3829f3829eb358a2e7417d80bba1a42db7](https://github.com/STMicroelectronics/stm32f4xx-hal-driver/tree/b6f0ed3829f3829eb358a2e7417d80bba1a42db7)：RCC头的N/M/P/Q条件，HAL_RCC_ClockConfig的Flash读回与SWS、临时APB保护；UART头/源的过采样16与PCLK选择；pwr_ex.c的F405/407专属分支与其他家族分支实际分别核对。F407分支写VOS并有限等待VOSRDY，不含该电压操作的PLL关闭前提。HAL注释低于144MHz与表最大144MHz分别保留，降频例子选84MHz。

[S24 · ST CMSIS DeviceF4 v2.6.10，commit 5f41fb29d22773896c780052bf61e47fc924d524](https://github.com/STMicroelectronics/cmsis-device-f4/blob/5f41fb29d22773896c780052bf61e47fc924d524/Include/stm32f407xx.h)：F407专用头VOS_Pos14、VOSRDY_Pos14、mask0x4000，与历史RM交叉核对；不是从F42x头猜测。实际未读硬件状态。

[S4 · ST PM0214 Rev10，March2020](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)：§4.5pp246–249，24位计数、HCLK/HCLK8选择、LOAD=N−1、LOAD0无正常事件；芯片集成条件仍需器件RCC资料。

[Matt Pocock teach](https://github.com/mattpocock/skills/blob/main/skills/productivity/teach/SKILL.md?plain=1)：用于知识先行、短成果和预测/回忆组织，不作为器件正确性的证明。

## 把名义计划交给下一段工程证据 {#clock-next-title}

本章把终端的时间基准从一个“168MHz”标签拆成有来源与条件的表、一个有限请求/观察轨迹和可运行的主机模型。单元06—09仍是本批本地候选，站点集成、浏览器、独立审阅和发布由整批流程分别验证；本页不声称目标硬件、波形或物理纸张已经验证。

课程终点仍为32个实质单元、八阶段证据和可回放终端；下一段10—14尚待完成，定时器从10开始。没有把未来课程链接成一个不存在的页面。
[上一章：静态内存、堆与调用栈预算](../learn/memory-budget.html)[本章打印速查](../learn/clock-timebase-reference.html)[阶段02地图](../learn/engineering-map.html#stage-02)[下一段：定时器与外设](../learn/engineering-map.html#stage-03)
