# UART有界命令：条件与恢复 {#uart-framing-reference}

本页为完整可搜索镜像，交互请打开同名独立阅读页。所有器件事实、源版本、时间/所有权前提及完整静态推导仍适用。

## 先核对对象与观察条件 {#uart-ref-contract-title}

<p>C11，八位字节及精确uint类型；真实存活全字段初始化state，输出可写并与整个state及彼此不重叠；init可新存储，后续调用独占不可重入。单执行上下文，不是任务/ISR/DMA或并发SPSC；volatile不补同步。固定4槽、payload8、每poll≤4字节/≤5事件/≤1命令，无堆、等待、递归或隐藏重试。硬件未验证。</p><p>1tick=1ms；真实正向接受观察间隔&lt;2^31；模差≥2^31返回UART_TIME_REJECTED且队列/残帧/应用/报告/命令输出保持。完整未观察回绕不能探测。初始应用周期1..1000ms。</p>

## 帧与命令速查 {#uart-ref-grammar-title}

<p>原创协议A5 LEN(1..8) PAYLOAD[LEN] XOR(LEN及载荷)，SOF不参与；最长11字节，无转义/终止符/IDLE或read-call边界。SEEK → LENGTH → PAYLOAD → CHECKSUM；载荷A5只是数据，非法LEN或校验A5消费一次后回SEEK，不重扫。</p><p>opcode01须LEN3、小端u16周期1..1000ms；opcode02须LEN1，报告状态且不改周期。校验对不等于命令合法。A5 03 01 64 00 66→100ms；A5 01 02 03→状态；A5 03 01 A5 01 A6→421ms。校验正确的周期0、1001、未知opcode或错专属LEN仍拒绝。</p><p>XOR漏检：100ms载荷01 64 00改成01 65 01，仍校验66却变357ms；重排也保持XOR。语义检查排不了所有错误/伪帧，不提供认证、可靠交付或任意噪声下最终同步。</p>

## 20ms：先到期，再排空 {#uart-ref-timeout-title}

<p>timeout为parser/service观察的不活动期限，不是线缆到达间隔或硬件IDLE。SOF接受开始age，后续预期字节接受归0，SEEK噪声不计。每poll先更新观察，即使空队列也检查age≥20清残帧，再按新SEEK消费当前字节一次。19未到，20等号到期；4294967290→13为19，14累计20。</p><p>字节FIFO无时间戳，同次poll共享now。t0解析前缀A5 03 01 64，即使后缀00 66在t1线上到达，到t20才排空仍先超时、后缀当噪声；不能据此断言物理间隔。超时后当前A5可新起帧，FIFO新状态帧可同次产生TIMEOUT+四字节事件共5项。</p>

## 丢失、拒绝与新输出 {#uart-ref-loss-title}

<p>FIFO_FULL先由原fifo_push保持四槽与元数据，上层UART_LOSS明确丢弃队列/残帧并丢失败字节（即使A5），保留应用周期；后续新完整帧再恢复，不隐式重试。BAD_STATE是初始化元数据拒绝，不是内存修复。ORE是另一硬件丢失来源，不能精确数丢失字节。</p><p>uart_poll的report.commandPresent才授权读新命令；partial/reject/timeout/loss均不改调用者旧命令。已接受结果不能被本次更晚噪声覆盖。命令按值复制；status复制当前周期、不改应用。四计数到UINT32_MAX后饱和，再增标saturated，不默默回绕。</p>

## 公开接口与完整下载 {#uart-ref-api-title}

<p>uart_init(UartState*,uint16_t period,uint32_t now)；uart_receive(UartState*,uint16_t byte,UartIngress*)；uart_poll(UartState*,uint32_t now,UartReport*,UartCommand*)。字节先验0..255；真实对象/不重叠合同见头文件。状态UART_OK、UART_LOSS、UART_INVALID_ARGUMENT、UART_BAD_STATE、UART_TIME_REJECTED；只有LOSS是明确恢复变更，其余拒绝保持命名状态/输出。</p><div class="source-downloads"><a href="../examples/uart-framing/uart.c" download>下载uart.c</a><a href="../examples/uart-framing/uart.h" download>下载uart.h</a><a href="../examples/bounded-fifo/fifo.c" download>下载fifo.c</a><a href="../examples/bounded-fifo/fifo.h" download>下载fifo.h</a><a href="../examples/timer-pwm/time.c" download>下载time.c</a><a href="../examples/timer-pwm/time.h" download>下载time.h</a><a href="../examples/uart-framing/README.txt" download>下载复现README.txt</a></div><p>下载三同级目录及六份C/H和README；分别链接真实fifo.c/time.c，不包含.c、不复制ring。UART_TEST启用测试main，不定义时为模块；严格C11/正常/NDEBUG/独立调用者经现有mcu-build validate→dry-run→build，源码/头/工具/新产物哈希分开留证。主机栈记录和启发式不证明目标最大栈或时间。</p>

## 折叠回忆：离开实验再解释 {#uart-ref-check-title}

<p>seed周期100ms、phase已等状态帧校验，FIFO=03 00 A5 00。先预测本次命令和最终phase，再展开。</p><details id="uart-ref-answer"><summary>核对完整理由</summary>

<p>03完成状态命令，复制GET_STATUS100；00噪声、A5新起帧、最后00坏LEN回SEEK，但commandPresent仍真且不能覆盖新命令。预算4；旧帧首字节完成后只剩3，少于最短新帧4，故本次至多1命令。超时场景另可有1个预先事件，总容量5。</p>

</details>

<p>隔一天手算421ms与第五字节A5丢失路径，写明哪个是输入时间、哪个是服务观察。若卡住，向助手指出具体phase/字节/now；不记录答案或推测掌握。</p>

## 实际读过的原厂依据与缺口 {#uart-ref-sources-title}

<p>核对日期2026-10-17。协议、图、代码、固定轨迹、策略和练习为本项目原创教学材料，不冒充厂商推荐协议，也不复制付费课程。以下技术论点限定实际阅读版本与范围。</p><ul class="source-list">
<li><a href="https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf">ST RM0090 历史归档，DocID018909 Rev5，2013-09</a>：实际阅读F405/407时钟§7.2 p213、USART§30.3 pp948–959、mute p970、状态/控制§30.6 pp987–991，关键p950/955/956/987/988整页图像核查。支持选定USART字符、PCLK域、IDLE、RXNE/ORE和限定清除条件。<strong>首选阅读：</strong>先读§30.3.3与§30.6.1，解释一次DR读取为何也改变接收状态，再对照本章四层边界。历史手册不冒充当前生产寄存器规范。</li>
<li><a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Src/stm32f4xx_hal_uart.c">ST HAL UART v1.8.5固定提交实现</a>：实际读frame-format表与additional reception的一个帧时间IDLE解释；未声称完整IRQ/DMA驱动审计。M/PCE条件与非mute范围仍须保留。</li>
<li><a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Inc/stm32f4xx_hal_uart.h">同提交UART头文件</a>：实际读标志与清除宏/别名/注释。它不能替代历史手册PE额外RXNE条件，更不能变成新系列ICR通用写法。</li>
<li><a href="https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf">WG14 N1570，2011-04-12委员会草案</a>：实际重读§6.2.5p9、§6.3.1.1/6.3.1.3、§7.20.1.1，支持无符号模运算、提升与可选精确宽度类型；不冒充购买的最终ISO标准，不提供真实时间间隔保证。</li></ul>
<p><strong>资料缺口：</strong>本轮当前官方RM请求有界失败、0字节；当前对应条款未读，仍用明确历史版本。DS8626 Rev12部分文字已核查而相关表像素未核；特定硅版本完整勘误/电气条件未审计。本章未把未读链接装饰成已验证依据。主机行为与硬件、真实线缆时间、吞吐和实体纸张检查分别报告。</p>

## 返回完整推导与十题 {#uart-ref-next-title}

<p>下一批12–14仍待实现，阶段03未完成；研究与本地检查不等于正式发布、硬件或实体纸张验证。</p><div class="next-links"><a href="../learn/uart-framing.html">完整章节、实验与十题</a><a href="../learn/timer-pwm.html">上一章10</a><a href="../learn/bounded-fifo.html">复习05 FIFO</a><a href="../learn/engineering-map.html#stage-03">下一批与阶段地图</a></div>
