# UART字节到有界命令 {#uart-framing}

本页为完整可搜索镜像，交互请打开同名独立阅读页。所有器件事实、源版本、时间/所有权前提及完整静态推导仍适用。

## 从字节接收到有资格执行的命令 {#uart-overview-title}


<p>前置：已读<a href="../learn/bounded-fifo.html">05 四槽FIFO</a>和<a href="../learn/timer-pwm.html">10 定时器与非阻塞期限</a>，会区分容量、值复制、已初始化对象和采样时间。本章把同一个采集终端继续往前接：上位机发送“采样周期改为100ms”，终端一边做其他事，一边分段收取和验证。</p>
<p><strong>本章成果：</strong>你能解释六个字节为何分两次服务才成为一个命令，独立运行完整C11参考，并预测断流或队列满后的恢复。短路线：认清四层 → 手算一个帧 → 逐字节预测 → 查看失败条件 → 独立十题。每段交一个可核对的小结果，不用一次记完所有状态。</p>
<p>浏览器是原创确定性模型；主机C另行编译执行。源码不访问UART寄存器，不收发真实串口，不测波形、ISR延迟或电气容差。<strong>硬件未验证</strong>。课程覆盖不代表个人掌握，没有保存答案、分数或进度。</p>

## 先把字符、FIFO、应用帧与命令分开 {#uart-wire-title}


<p><strong>UART字符</strong>是一次硬件异步收发的位序列；<strong>FIFO字节</strong>是软件已复制的8位值；<strong>应用帧</strong>是协议定义的一组字节；<strong>命令</strong>是通过应用语义检查、允许交给业务层的新值。这四层不能互相代替。接收一次、读一次、RXNE或IDLE出现一次，都不是本协议的完成条件。</p>
<p>选定例子为STM32F407VG的USART2，继承09的条件名义PCLK1=42MHz，OVER8=0、M=0、PCE=0、一停止位。空闲线为高；起始位低，随后8个数据位和1个停止位，所以<strong>8N1每字符是1+8+1=10个位时间</strong>。数据位低位先传属于字符内部；后面应用u16字段的小端顺序属于字节之间，两个“顺序”不同。</p>
<figure><div class="flow-scroll" role="region" aria-label="原创位到值图：箭头表示接收流程；8N1每字符共10个位时间，图不按位宽绘制，也不代表实测波形。，可横向滚动" tabindex="0"><svg viewBox="0 0 780 165" role="img" aria-labelledby="uart-wire-figure-title"><title id="uart-wire-figure-title">原创位到值图：箭头表示接收流程；8N1每字符共10个位时间，图不按位宽绘制，也不代表实测波形。</title><rect class="box" x="20" y="30" width="160" height="100" rx="8"/><text x="100" y="68" text-anchor="middle">空闲与起始</text><text x="100" y="101" text-anchor="middle">1个起始位</text><path class="arrow" d="M182 80h25m-8-6 8 6-8 6"/><rect class="box" x="210" y="30" width="160" height="100" rx="8"/><text x="290" y="68" text-anchor="middle">字符数据</text><text x="290" y="101" text-anchor="middle">8个数据位</text><path class="arrow" d="M372 80h25m-8-6 8 6-8 6"/><rect class="box" x="400" y="30" width="160" height="100" rx="8"/><text x="480" y="68" text-anchor="middle">停止与下个</text><text x="480" y="101" text-anchor="middle">1个停止位</text><path class="arrow" d="M562 80h25m-8-6 8 6-8 6"/><rect class="box" x="590" y="30" width="160" height="100" rx="8"/><text x="670" y="68" text-anchor="middle">复制到FIFO</text><text x="670" y="101" text-anchor="middle">一个字节值</text></svg></div><figcaption>原创位到值图：箭头表示接收流程；8N1每字符共10个位时间，图不按位宽绘制，也不代表实测波形。</figcaption></figure>
<p>请求115200baud时，连续字符名义上限为115200/10=11520字符/s；一个字符约10/115200s=86.806µs，还未扣协议字节与空隙。09的BRR整数365名义实际波特率为42000000/365≈115068.493，字符约86.905µs。请求率与舍入后的名义率要分别标注；这些数值不保证FIFO能及时被服务。</p>
<p>四槽队列若连续不服务，在理想背靠背字符条件下四字节约占347µs（用请求率计算）；调度、硬件接收缓冲、已有占用和中断延迟仍须独立分析。这里没有用host调用证明无丢字节吞吐。</p>
<p>已读历史RM0090 Rev5 §30.3/§30.6：RXNE反映RDR有接收数据，读DR会消费/清除相应状态；ORE表示至少有数据丢失，不能给出精确丢失字节数。硬件ORE与软件fifo_push遇FULL是两条不同丢失路径。</p>
<details id="uart-hardware-scope"><summary>器件限定的IDLE与状态清除条件</summary>

<p>普通异步、启用接收器、非mute条件下，手册定义整帧1位的idle字符；固定HAL v1.8.5把IDLE接收描述为末字节后一个帧时间的不活动。它不认识本章SOF/LEN/XOR/opcode。mute唤醒时的规则不同，不能套用普通描述。</p><p>历史F407 SR/DR设计中，IDLE/ORE/NF/FE段落列出先读SR后读DR的清除序列；PE段落还带等待RXNE的额外条件及其读写限定。读DR有消费数据的副作用，不可复制成跨系列或IRQ/DMA环境通用清除函数。本章没有提供这种驱动。当前RM及特定硅版本完整勘误尚未审计；ES0182的USART IDLE条目适用表全N，不能当F407通用缺陷引用。</p>

</details>



## 原创帧契约与逐字节手算 {#uart-frame-title}


<p>本章自定义一个教学帧：<code>A5 LEN PAYLOAD[LEN] XOR</code>。SOF固定0xA5，LEN是一个字节，合法1..8；紧随LEN恰好有LEN个载荷字节，最后一个校验字节为<strong>LEN与所有载荷逐字节异或，SOF不参与</strong>。总长度LEN+3，最长11字节。没有终止符、转义或“读完一次就结束”的规则。这不是UART标准报文。</p>
<figure><div class="flow-scroll" role="region" aria-label="原创period100帧图：所有数值为十六进制字节；顺序箭头表示应用协议字段，完整6字节A5 03 01 64 00 66。，可横向滚动" tabindex="0"><svg viewBox="0 0 780 165" role="img" aria-labelledby="uart-frame-figure-title"><title id="uart-frame-figure-title">原创period100帧图：所有数值为十六进制字节；顺序箭头表示应用协议字段，完整6字节A5 03 01 64 00 66。</title><rect class="box" x="20" y="30" width="160" height="100" rx="8"/><text x="100" y="68" text-anchor="middle">SOF</text><text x="100" y="101" text-anchor="middle">A5，不计XOR</text><path class="arrow" d="M182 80h25m-8-6 8 6-8 6"/><rect class="box" x="210" y="30" width="160" height="100" rx="8"/><text x="290" y="68" text-anchor="middle">长度LEN</text><text x="290" y="101" text-anchor="middle">03：3个载荷</text><path class="arrow" d="M372 80h25m-8-6 8 6-8 6"/><rect class="box" x="400" y="30" width="160" height="100" rx="8"/><text x="480" y="68" text-anchor="middle">载荷</text><text x="480" y="101" text-anchor="middle">01 64 00</text><path class="arrow" d="M562 80h25m-8-6 8 6-8 6"/><rect class="box" x="590" y="30" width="160" height="100" rx="8"/><text x="670" y="68" text-anchor="middle">校验XOR</text><text x="670" y="101" text-anchor="middle">XOR=66</text></svg></div><figcaption>原创period100帧图：所有数值为十六进制字节；顺序箭头表示应用协议字段，完整6字节A5 03 01 64 00 66。</figcaption></figure>
<p>应用opcode01要求LEN=3：第一个载荷01，随后两个字节为小端u16周期。0x64+256×0x00=100ms；XOR：03⊕01=02，02⊕64=66，66⊕00=66。因此完整帧为<strong>A5 03 01 64 00 66</strong>。opcode02要求LEN=1，是状态请求：01⊕02=03，故<strong>A5 01 02 03</strong>。状态命令报告当前周期，自己不改变周期。</p>
<p>“载荷包含帧头”例子：<strong>A5 03 01 A5 01 A6</strong>。周期0x01A5=421ms；03⊕01⊕A5⊕01=A6。已在PAYLOAD状态时，A5按长度复制为数据，不能重启帧。反之在等待LEN时读到A5，它是非法长度165；这个字节只消费一次，拒绝后等后续新的A5，不能同时当起始符。校验位置读到A5也只消费一次。</p>
<p>一个长于4字节的合法帧并不要求队列同时放下全部帧：先入A5 03 01 64四字节、poll排空到解析器，再入00 66，下一poll完成。这利用解析器保留的有界部分状态，不扩大四槽FIFO。</p>

## 四个解析状态与四字节服务边界 {#uart-parser-title}


<p><strong>SEEK</strong>只寻找A5，其他值作噪声消费；A5成功后进入<strong>LENGTH</strong>。LEN合法才进入<strong>PAYLOAD</strong>，received从0数到LEN；每个字节写入payload[received]后递增，并更新XOR。收满才进入<strong>CHECKSUM</strong>，用下一字节比较一次，随后完成或拒绝，回SEEK。载荷数组固定8字节，没有扫描旧载荷、回溯、堆分配或等待后续字节。</p>
<figure><div class="flow-scroll" role="region" aria-label="原创状态图：箭头为各状态成功接受下一个预期字节；非法LEN、坏XOR、坏命令均消费当前字节后回SEEK，超时/丢失也清除残帧。，可横向滚动" tabindex="0"><svg viewBox="0 0 780 165" role="img" aria-labelledby="uart-parser-figure-title"><title id="uart-parser-figure-title">原创状态图：箭头为各状态成功接受下一个预期字节；非法LEN、坏XOR、坏命令均消费当前字节后回SEEK，超时/丢失也清除残帧。</title><rect class="box" x="20" y="30" width="160" height="100" rx="8"/><text x="100" y="68" text-anchor="middle">SEEK</text><text x="100" y="101" text-anchor="middle">A5 → 起帧</text><path class="arrow" d="M182 80h25m-8-6 8 6-8 6"/><rect class="box" x="210" y="30" width="160" height="100" rx="8"/><text x="290" y="68" text-anchor="middle">LENGTH</text><text x="290" y="101" text-anchor="middle">合法1..8</text><path class="arrow" d="M372 80h25m-8-6 8 6-8 6"/><rect class="box" x="400" y="30" width="160" height="100" rx="8"/><text x="480" y="68" text-anchor="middle">PAYLOAD</text><text x="480" y="101" text-anchor="middle">恰好LEN字节</text><path class="arrow" d="M562 80h25m-8-6 8 6-8 6"/><rect class="box" x="590" y="30" width="160" height="100" rx="8"/><text x="670" y="68" text-anchor="middle">CHECKSUM</text><text x="670" y="101" text-anchor="middle">匹配后验命令</text></svg></div><figcaption>原创状态图：箭头为各状态成功接受下一个预期字节；非法LEN、坏XOR、坏命令均消费当前字节后回SEEK，超时/丢失也清除残帧。</figcaption></figure>
<p>每次poll最多调用4次成功pop，空就返回，绝不在函数内等帧完成。最短合法命令帧为4字节，即状态请求。即便旧残帧在本次第1个字节完成，再接受另一帧还需至少4字节，本次只剩3字节，所以<strong>每poll至多一个新命令</strong>。这由最短帧长度和服务预算共同证明，并非“通常只来一个”。</p>
<p>结果保存事件数组5项：最多一个poll开始时TIMEOUT，加最多4个消费字节事件。新命令标志一旦置真，本次后续噪声或坏长度不能覆盖它。例如旧状态已等待状态帧校验，FIFO为03 00 A5 00：第1字节接受状态命令，第2是噪声，第3起新残帧，第4坏长度。仍返回该新状态命令，同时保留后续失败事件。</p>
<p>诊断accepted、rejected、timeouts、losses各为uint32，达到UINT32_MAX后保持最大值；再次试图增加会置粘性的saturated。它不是精确丢失字节数，也不是硬件统计。所有循环都有输入、4字节、8载荷或5事件的界限；有限工作不等于吞吐足够。</p>

## 先验帧，再验应用；XOR通过仍会出错 {#uart-command-title}


<p>帧校验仅回答“这组字节按本规则是否自洽”。应用另查：opcode01且LEN3才读后两个周期字节，组合成u16后须1..1000ms；opcode02且LEN1才是状态请求。其他opcode、专属长度不符、周期0或1001..65535均拒绝，保留上次应用周期与调用者命令输出。不能先读缺失字节再检查LEN。</p>
<p>校验正确但不支持：A5 01 03 02，因01⊕03=02仍通过XOR，opcode03却拒绝。周期0：A5 03 01 00 00 02，XOR正确而范围失败。周期1001：A5 03 01 E9 03 E8，同样是应用范围失败。接收、帧与命令的错误要分开报告，避免“校验正确所以执行”。</p>
<p>复制命令的值而非保存payload内部指针；后续队列/解析缓冲可被复用，调用者已经拿到自己的kind/periodMs。<code>report.commandPresent</code>才表示新输出：partial、噪声、拒绝、timeout或loss都不能把上次留下的对象当新命令。状态请求会复制当前周期作报告，不更新应用周期。</p>
<details id="uart-xor-limit"><summary>XOR为何漏检成对与重排变化？</summary>

<p>100ms载荷01 64 00的XOR配合LEN3为66。把两处同时翻转最低位，载荷成01 65 01，XOR仍为03⊕01⊕65⊕01=66，而周期变成0x0165=357ms，仍在合法范围。故A5 03 01 65 01 66会被接受。这是明确的漏检，不是实现bug。</p><p>XOR可交换，交换字段顺序也保持XOR；语义检查可能碰巧拒绝某个重排，但不能据此保证所有错误都被抓住。任意噪声还可能恰好组成合法帧和命令。这个教学协议不保证真实性、认证、可靠交付、所有错误检测或任意/恶意噪声下最终同步。生产CRC、序号、重传、转义和安全策略要另立需求，不能从一个通过的XOR推导出来。</p>

</details>



## 20ms是服务观察期限，先判断再排空 {#uart-timeout-title}


<p>选择20ms残帧不活动期限是本章软件策略，与硬件IDLE无关。1tick=1ms；poll的now是uint32观察。复用10的time_elapsed：显式模2^32差，观察差≥2^31拒绝；调用者还必须保证真实正向两次接受观察间隔&lt;2^31ms。相同观察值无法揭示整圈未观察回绕，软件没有多圈探测器。</p>
<p>SOF被解析接受时开始计age；每个后续预期字节被解析接受后age归0。SEEK噪声不创建残帧。每poll先用有效观察差更新age，即使队列空也检查；age≥20就记录TIMEOUT、丢弃部分帧回SEEK，然后才按现在状态处理FIFO各字节一次。没有旧后缀拼接。</p>
<figure><div class="flow-scroll" role="region" aria-label="原创期限图：时间为parser/service观察毫秒；20ms等号到期，超时发生于排空之前，箭头表示处理顺序而非线缆字节到达时刻。，可横向滚动" tabindex="0"><svg viewBox="0 0 780 165" role="img" aria-labelledby="uart-timeout-figure-title"><title id="uart-timeout-figure-title">原创期限图：时间为parser/service观察毫秒；20ms等号到期，超时发生于排空之前，箭头表示处理顺序而非线缆字节到达时刻。</title><rect class="box" x="20" y="30" width="160" height="100" rx="8"/><text x="100" y="68" text-anchor="middle">t=0ms</text><text x="100" y="101" text-anchor="middle">解析接受A5</text><path class="arrow" d="M182 80h25m-8-6 8 6-8 6"/><rect class="box" x="210" y="30" width="160" height="100" rx="8"/><text x="290" y="68" text-anchor="middle">t=19ms</text><text x="290" y="101" text-anchor="middle">空poll：age19</text><path class="arrow" d="M372 80h25m-8-6 8 6-8 6"/><rect class="box" x="400" y="30" width="160" height="100" rx="8"/><text x="480" y="68" text-anchor="middle">t=20ms</text><text x="480" y="101" text-anchor="middle">到期，清残帧</text><path class="arrow" d="M562 80h25m-8-6 8 6-8 6"/><rect class="box" x="590" y="30" width="160" height="100" rx="8"/><text x="670" y="68" text-anchor="middle">同次排空</text><text x="670" y="101" text-anchor="middle">新A5可起新帧</text></svg></div><figcaption>原创期限图：时间为parser/service观察毫秒；20ms等号到期，超时发生于排空之前，箭头表示处理顺序而非线缆字节到达时刻。</figcaption></figure>
<p>若t=0只解析A5，t=19空poll仍等LEN；t=20空poll必须超时。若t=20 FIFO恰为A5 01 02 03，同次先超时，再完整接受新状态命令；事件顺序TIMEOUT → START → LENGTH_ACCEPTED → PAYLOAD_ACCEPTED → COMMAND，共5项。若当前字节是旧后缀而非A5，它只会在SEEK当噪声消费。</p>
<p><strong>重要的观察限制：</strong>已有FIFO只存字节，没有线缆到达时间戳。所有在一次poll被取出的字节共用该poll的now。即使00 66在t=1ms就在线上到达，若A5 03 01 64在t=0被解析、后缀一直拖到t=20才排空，仍会先超时并丢弃这两个旧后缀。不能把它说成测到了20ms物理字节间隔。需要真实到达时限就须另立时间戳缓冲/硬件证据合同。</p>
<p>回绕例：4294967290时解析A5，13时差19仍保留；14时累计20到期。无字节poll仍推进lastObserved与age；不合法观察先拒绝，FIFO、解析器、应用周期、报告及命令输出全保持。这与合法TIMEOUT主动清残帧是不同结果。</p>

## 满队列后先报告丢失，再从后续新输入恢复 {#uart-loss-title}


<p>底层四槽FIFO保持05合同：满时fifo_push返回FIFO_FULL，原槽/元数据保持。UART上层随后选择明确恢复：报告UART_LOSS，丢弃队列全部四字节和解析残帧，保留应用周期；第5个失败字节即使是A5也被丢弃，不隐式重试。这个主动reset不属于底层push，不可把两层行为写成同一种“失败保持”。</p>
<p>例：已等LEN，队列又积了四个值；第五个A5触发FULL，上层丢弃四值与残帧。下一次空poll不会见到这个A5。只有后来重新送入完整A5 01 02 03并及时服务，才有新状态命令。已接受的周期100ms始终保留；并不承诺噪声一定能最终同步。</p>
<p>坏初始化元数据返回UART_BAD_STATE，与loss分开：不消费、不自作主张修复任意内存。所有对象须真实、存活、全字段初始化，输出与整个state及彼此不重叠；null检查不是地址有效性证明。单线程、单执行上下文、不可重入；不是任务/ISR/DMA安全或并发SPSC，volatile不能替代同步与所有权。</p>

## 预测实验：接收与服务是两个动作 {#uart-lab-title}


<p>先用手算完前面六字节帧，再做实验。初始化仅建立空队列、SEEK、应用周期100ms、now0；这不是新接收结果。receive只把当前字节复制到FIFO，poll才使用now并最多取四字节。这里两个草稿数值域都校验，poll不把byte当新到达；receive不把now当新的时间观察。更改草稿清空预测，并保留带“已应用输入”的旧状态。</p>
<p>尝试顺序：receive165，poll0，receive3/1/100，poll1，receive0/102，poll2。每次分别预测返回、解析状态和应用周期。需要丢失夹具时，连续receive五次而不poll，观察第五次LOSS。需要拒绝观察时，已有lastObserved0再poll2147483648。所有数值为十进制，165即0xA5。</p><p>独立阅读页提供预测→应用→因果反馈；控制器编辑清预测、保留带标签旧结果、拒绝不改接受状态、重置清结果，17步回放到末尾停止。JavaScript关闭可按本页完整静态轨迹与推导手算。</p>

## 17步固定回放：残帧到期与新命令同次出现 {#uart-trace-title}


<p>独立种子与上个实验分开，period=100、空FIFO、now0。只有提交预测才揭示下一步，最后17/17停止，重置清除日志和推导结果。固定回放让“接收调用”“排空调用”“帧完成”三种边界对照起来。</p>
<div class="table-wrap" role="region" aria-label="17步静态回放，可横向滚动" tabindex="0"><table><caption>完整可手算轨迹：receive十进制字节；poll时间ms</caption><thead><tr><th>步骤</th><th>动作</th><th>操作后phase/关键结果</th></tr></thead><tbody><tr><td>1–2</td><td>receive165；poll0</td><td>SEEK入队后LENGTH，起age0</td></tr><tr><td>3–6</td><td>receive3、1、100；poll1</td><td>PAYLOAD，LEN3/received2</td></tr><tr><td>7–9</td><td>receive0、102；poll2</td><td>SEEK，新SET_PERIOD100</td></tr><tr><td>10–12</td><td>receive165；poll3；空poll22</td><td>LENGTH，age0→19，未超时</td></tr><tr><td>13–16</td><td>receive165、1、2、3</td><td>队列满4，仍LENGTH；还没解析</td></tr><tr><td>17</td><td>poll23</td><td>先TIMEOUT，再新GET_STATUS100；SEEK，5事件</td></tr></tbody></table></div><p>独立阅读页提供预测→应用→因果反馈；控制器编辑清预测、保留带标签旧结果、拒绝不改接受状态、重置清结果，17步回放到末尾停止。JavaScript关闭可按本页完整静态轨迹与推导手算。</p>

## 完整C11参考：原FIFO与时间模块分别链接 {#uart-c-title}


<p>公开接口为uart_init、uart_receive、uart_poll。init可初始化真实新存储；后两者要求真实、存活、完整初始化并独占。所有输出可写且与state和彼此不重叠，任意伪造/悬空地址或禁止别名不是本模块能验证的条件。宽字节先验0..255再缩窄；周期先验范围再复制；命令不留内部指针。</p>
<p>state内含真实Fifo、8字节payload、四状态元数据、lastObserved/age、应用周期与四个饱和计数。服务通过time_elapsed检查观察差；实际fifo.c/time.c分别作为翻译单元链接，没有文本包含.c或第二份FIFO。候选状态用于拒绝保持；每poll最多4字节、5事件、1命令，无堆、递归、等待、回调、硬件I/O或隐藏重试。</p>
<p>uart_poll成功返回UART_OK，report.commandPresent才授权读取新command；即使该次后续有坏长度，它仍保留已接受命令。UART_TIME_REJECTED、UART_INVALID_ARGUMENT、UART_BAD_STATE保持每个命名状态/输出字段。uart_receive的UART_LOSS是明确丢弃动作，不保证队列保持；ingressReport分别给出FIFO_FULL、丢弃前count4及底层先保持的事实。</p>
<p>完整下载须保留examples下uart-framing、bounded-fifo、timer-pwm三个同级目录。下面六份源码与下载字节相同，README含编译、复用、路由和适用界限。定义UART_TEST才有main；不定义时仅模块。严格C11与NDEBUG检查保持同样失败语义，不依赖assert。</p><div class="source-downloads"><a href="../examples/uart-framing/uart.c" download>下载uart.c</a><a href="../examples/uart-framing/uart.h" download>下载uart.h</a><a href="../examples/bounded-fifo/fifo.c" download>下载fifo.c</a><a href="../examples/bounded-fifo/fifo.h" download>下载fifo.h</a><a href="../examples/timer-pwm/time.c" download>下载time.c</a><a href="../examples/timer-pwm/time.h" download>下载time.h</a><a href="../examples/uart-framing/README.txt" download>下载复现README.txt</a></div><details id="uart-source-uart-c"><summary>完整uart.c（与下载同字节）</summary>



```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file uart.c
 * @author embedded-notes contributors
 * @brief Bounded host parser for an original teaching frame; no wire driver.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "uart.h"
#ifdef UART_TEST
#include <stdio.h>
#endif

/**
 * @brief Discard framing continuity, retaining application and diagnostics.
 * @param[in,out] state Initialized private candidate.
 * @return None.
 */
static void uart_clear(UartState *state)
{
    /** Stale payload remains initialized scratch, never an accepted command. **/
    state->phase = UART_SEEK;
    state->length = 0U;
    state->received = 0U;
    state->checksum = 0U;
    state->age = 0U;
}

/**
 * @brief Validate named metadata using the original FIFO on a private copy.
 * @param[in] state Live fully initialized object.
 * @return True if checkable invariants hold.
 */
static bool uart_valid(const UartState *state)
{
    Fifo probe = state->queue;
    uint8_t ignored;
    FifoStatus status = fifo_pop(&probe, &ignored);

    /** No actual queued byte is consumed during validation. **/
    if ((status != FIFO_OK && status != FIFO_EMPTY) || state->applicationPeriod == 0U ||
        state->applicationPeriod > 1000U || state->age >= UART_TIMEOUT_MS) {
        return false;
    }
    switch (state->phase) {
        case UART_SEEK:
            return state->length == 0U && state->received == 0U && state->age == 0U;
        case UART_LENGTH:
            return state->length == 0U && state->received == 0U;
        case UART_PAYLOAD:
            return state->length >= 1U && state->length <= UART_PAYLOAD_CAPACITY &&
                state->received < state->length;
        case UART_CHECKSUM:
            return state->length >= 1U && state->length <= UART_PAYLOAD_CAPACITY &&
                state->received == state->length;
        default:
            return false;
    }
}

/**
 * @brief Saturate one diagnostic and expose attempted overflow.
 * @param[in,out] counter Private counter.
 * @param[in,out] saturated Private overflow indicator.
 * @return None.
 */
static void uart_increment(uint32_t *counter, bool *saturated)
{
    /** Diagnostic counts never silently wrap. **/
    if (*counter == UINT32_MAX) {
        *saturated = true;
    } else {
        *counter += 1U;
    }
}

/**
 * @brief Append one event inside the proven fixed bound.
 * @param[in,out] report Fresh private result with count below five.
 * @param[in] event One timeout or one event for one consumed byte.
 * @return None.
 */
static void uart_record(UartReport *report, UartEvent event)
{
    /** One initial timeout plus four byte events fits five slots. **/
    report->events[report->eventCount] = event;
    report->eventCount += 1U;
}

/**
 * @brief Validate command-specific length before optional fields.
 * @param[in] state Complete checksum-valid private frame.
 * @param[out] command Independent private command.
 * @return Whether a supported command was copied.
 */
static bool uart_decode(const UartState *state, UartCommand *command)
{
    uint16_t period;

    /** A correct checksum never bypasses application validation. **/
    if (state->length == 1U && state->payload[0] == 2U) {
        *command = (UartCommand){UART_GET_STATUS, state->applicationPeriod};
        return true;
    }
    if (state->length != 3U || state->payload[0] != 1U) {
        return false;
    }
    period = (uint16_t)((uint16_t)state->payload[1] | ((uint16_t)state->payload[2] << 8U));
    if (period == 0U || period > 1000U) {
        return false;
    }
    *command = (UartCommand){UART_SET_PERIOD, period};
    return true;
}

/**
 * @brief Consume a checksum once, including a checksum equal to A5.
 * @param[in,out] state Private candidate.
 * @param[in] byte Consumed checksum.
 * @param[in,out] report Private bounded report.
 * @param[out] command Copied command on acceptance.
 * @return None.
 */
static void uart_finish(UartState *state, uint8_t byte, UartReport *report, UartCommand *command)
{
    UartEvent event;

    /** Reject framing first, then reject unsupported application semantics. **/
    if (byte != state->checksum) {
        event = UART_BAD_CHECKSUM;
    } else if (!uart_decode(state, command)) {
        event = UART_BAD_COMMAND;
    } else {
        event = UART_COMMAND;
        report->commandPresent = true;
        if (command->kind == UART_SET_PERIOD) {
            state->applicationPeriod = command->periodMs;
        }
    }
    if (event == UART_COMMAND) {
        uart_increment(&state->diagnostics.accepted, &state->diagnostics.saturated);
    } else {
        uart_increment(&state->diagnostics.rejected, &state->diagnostics.saturated);
    }
    uart_record(report, event);
    uart_clear(state);
}

/**
 * @brief Consume one byte according to one current framing phase.
 * @param[in,out] state Private initialized candidate.
 * @param[in] byte One copied FIFO value.
 * @param[in,out] report Private bounded result.
 * @param[out] command Private output.
 * @return None.
 */
static void uart_byte(UartState *state, uint8_t byte, UartReport *report, UartCommand *command)
{
    /** Payload follows length, without marker rescans or backtracking. **/
    switch (state->phase) {
        case UART_SEEK:
            if (byte == 0xA5U) {
                state->phase = UART_LENGTH;
                uart_record(report, UART_START);
            } else {
                uart_record(report, UART_NOISE);
            }
            break;
        case UART_LENGTH:
            if (byte == 0U || byte > UART_PAYLOAD_CAPACITY) {
                uart_increment(&state->diagnostics.rejected, &state->diagnostics.saturated);
                uart_clear(state);
                uart_record(report, UART_BAD_LENGTH);
            } else {
                state->length = byte;
                state->checksum = byte;
                state->phase = UART_PAYLOAD;
                uart_record(report, UART_LENGTH_ACCEPTED);
            }
            break;
        case UART_PAYLOAD:
            state->payload[state->received] = byte;
            state->received += 1U;
            state->checksum ^= byte;
            state->phase = state->received == state->length ? UART_CHECKSUM : UART_PAYLOAD;
            uart_record(report, UART_PAYLOAD_ACCEPTED);
            break;
        case UART_CHECKSUM:
            uart_finish(state, byte, report, command);
            break;
        default:
            break;
    }
    state->age = 0U;
}

/**
 * @brief Advance a validated observation and expire before any byte drain.
 * @param[in,out] state Private initialized candidate.
 * @param[in] now Already validated observation.
 * @param[in] elapsed Checked delta below 2^31.
 * @param[in,out] report Fresh bounded private report.
 * @return None.
 */
static void uart_advance(UartState *state, uint32_t now, uint32_t elapsed, UartReport *report)
{
    /** Only the candidate changes; age sum <= 19 + 2147483647 fits uint64_t. **/
    state->lastObserved = now;
    if (state->phase != UART_SEEK) {
        uint64_t age = (uint64_t)state->age + (uint64_t)elapsed;
        if (age >= UART_TIMEOUT_MS) {
            uart_clear(state);
            uart_increment(&state->diagnostics.timeouts, &state->diagnostics.saturated);
            uart_record(report, UART_TIMEOUT);
        } else {
            state->age = (uint32_t)age;
        }
    }
}

/**
 * @brief Initialize deterministic fresh storage without reading old contents.
 * @param[in,out] state Writable real object, possibly fresh.
 * @param[in] initialPeriod Initial application period 1..1000 ms.
 * @param[in] now Initial observation.
 * @return Named status; invalid input preserves state.
 */
UartStatus uart_init(UartState *state, uint16_t initialPeriod, uint32_t now)
{
    UartState next = {0};
    FifoStatus status;

    /** Initialize the borrowed FIFO through its actual public interface. **/
    if (state == NULL || initialPeriod == 0U || initialPeriod > 1000U) {
        return UART_INVALID_ARGUMENT;
    }
    status = fifo_reset(&next.queue);
    if (status != FIFO_OK) {
        return UART_BAD_STATE;
    }
    next.applicationPeriod = initialPeriod;
    next.lastObserved = now;
    *state = next;
    return UART_OK;
}

#ifdef UART_TEST
/**
 * @brief Compare all diagnostics without padding assumptions.
 * @param[in] a Initialized diagnostics.
 * @param[in] b Initialized diagnostics.
 * @return True for equal named fields.
 */
static bool test_diagnostics(UartDiagnostics a, UartDiagnostics b)
{
    /** Saturation belongs to the externally observable diagnostic state. **/
    return a.accepted == b.accepted && a.rejected == b.rejected &&
        a.timeouts == b.timeouts && a.losses == b.losses && a.saturated == b.saturated;
}

/**
 * @brief Compare every named state field, including stale initialized bytes.
 * @param[in] a Real initialized state.
 * @param[in] b Real initialized state.
 * @return True for equality without reading padding.
 */
static bool test_state(const UartState *a, const UartState *b)
{
    size_t index;

    /** Failure preservation includes queue slots and parser scratch. **/
    if (a->phase != b->phase || a->length != b->length || a->received != b->received ||
        a->checksum != b->checksum || a->lastObserved != b->lastObserved || a->age != b->age ||
        a->applicationPeriod != b->applicationPeriod || a->queue.head != b->queue.head ||
        a->queue.tail != b->queue.tail || a->queue.count != b->queue.count ||
        !test_diagnostics(a->diagnostics, b->diagnostics)) {
        return false;
    }
    for (index = 0U; index < UART_PAYLOAD_CAPACITY; index += 1U) {
        if (a->payload[index] != b->payload[index]) {
            return false;
        }
    }
    for (index = 0U; index < FIFO_CAPACITY; index += 1U) {
        if (a->queue.slots[index] != b->queue.slots[index]) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Compare report fields and the entire initialized event array.
 * @param[in] a Initialized report.
 * @param[in] b Initialized report.
 * @return Named-field equality.
 */
static bool test_report(UartReport a, UartReport b)
{
    size_t index;

    /** Unused event slots remain part of the rejection snapshot. **/
    if (a.consumed != b.consumed || a.eventCount != b.eventCount ||
        a.commandPresent != b.commandPresent || !test_diagnostics(a.diagnostics, b.diagnostics)) {
        return false;
    }
    for (index = 0U; index < UART_EVENT_CAPACITY; index += 1U) {
        if (a.events[index] != b.events[index]) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Feed bounded chunks, using only public UART operations.
 * @param[in,out] state Initialized state.
 * @param[in] bytes Fixed independent literal input.
 * @param[in] count Number of real input bytes.
 * @param[in] chunk Chunk size 1..4.
 * @param[in,out] now Accepted service observation.
 * @param[out] report Last report.
 * @param[in,out] command Caller-owned copied result.
 * @return Whether every call succeeded and obeyed resource bounds.
 */
static bool test_feed(UartState *state, const uint8_t *bytes, size_t count, size_t chunk,
    uint32_t *now, UartReport *report, UartCommand *command)
{
    size_t at = 0U;

    /** This helper interleaves ingress and service; it never enqueues a whole long frame. **/
    while (at < count) {
        size_t taken = 0U;
        UartIngress ingress;
        while (taken < chunk && at < count) {
            if (uart_receive(state, bytes[at], &ingress) != UART_OK) {
                return false;
            }
            taken += 1U;
            at += 1U;
        }
        *now += 1U;
        if (uart_poll(state, *now, report, command) != UART_OK || report->consumed > 4U ||
            report->eventCount > 5U || state->queue.count != 0U) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Exercise hand-calculated complete command fixtures.
 * @param[in] None.
 * @return True for fixed period/status/marker/checksum-weakness outcomes.
 */
static bool test_commands(void)
{
    static const uint8_t frames[][6] = {
        {0xA5U, 3U, 1U, 0x64U, 0U, 0x66U},
        {0xA5U, 3U, 1U, 0xA5U, 1U, 0xA6U},
        {0xA5U, 3U, 1U, 1U, 0U, 3U},
        {0xA5U, 3U, 1U, 0xE8U, 3U, 0xE9U},
        {0xA5U, 3U, 1U, 0x65U, 1U, 0x66U}
    };
    static const uint16_t periods[] = {100U, 421U, 1U, 1000U, 357U};
    static const uint8_t status[] = {0xA5U, 1U, 2U, 3U};
    static const uint8_t coalesced[] = {0xA5U, 1U, 2U, 3U, 0xA5U, 1U, 2U, 3U};
    UartState state;
    UartReport report;
    UartCommand command = {UART_GET_STATUS, 777U};
    uint32_t now = 0U;
    size_t chunk;
    size_t frame;

    /** Expected checksums/periods are fixed worked literals, not parser-generated. **/
    for (chunk = 1U; chunk <= 4U; chunk += 1U) {
        if (uart_init(&state, 10U, now) != UART_OK) {
            return false;
        }
        for (frame = 0U; frame < 5U; frame += 1U) {
            if (!test_feed(&state, frames[frame], 6U, chunk, &now, &report, &command) ||
                !report.commandPresent || command.kind != UART_SET_PERIOD ||
                command.periodMs != periods[frame] || state.applicationPeriod != periods[frame]) {
                return false;
            }
        }
        if (!test_feed(&state, status, 4U, chunk, &now, &report, &command) ||
            !report.commandPresent || command.kind != UART_GET_STATUS ||
            command.periodMs != 357U || state.applicationPeriod != 357U) {
            return false;
        }
        if (!test_feed(&state, coalesced, 8U, 4U, &now, &report, &command) ||
            !report.commandPresent || state.diagnostics.accepted != 8U) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Reject literal grammar/checksum/application failures and recover later.
 * @param[in] None.
 * @return True on rejection preservation and fresh-frame acceptance.
 */
static bool test_invalid_frames(void)
{
    static const struct { uint8_t bytes[11]; size_t count; } rows[] = {
        {{0xA5U, 0U}, 2U}, {{0xA5U, 9U}, 2U}, {{0xA5U, 255U}, 2U},
        {{0xA5U, 0xA5U}, 2U},
        {{0xA5U, 1U, 2U, 0xA5U}, 4U},
        {{0xA5U, 1U, 0xA4U, 0xA5U}, 4U},
        {{0xA5U, 1U, 3U, 2U}, 4U},
        {{0xA5U, 1U, 1U, 0U}, 4U},
        {{0xA5U, 3U, 2U, 0U, 0U, 1U}, 6U},
        {{0xA5U, 3U, 1U, 0U, 0U, 2U}, 6U},
        {{0xA5U, 3U, 1U, 0xE9U, 3U, 0xE8U}, 6U},
        {{0xA5U, 3U, 1U, 0xFFU, 0xFFU, 2U}, 6U},
        {{0xA5U, 8U, 1U, 2U, 3U, 4U, 5U, 6U, 7U, 8U, 0U}, 11U}
    };
    static const uint8_t status[] = {0xA5U, 1U, 2U, 3U};
    UartState state;
    UartReport report;
    UartCommand command;
    uint32_t now = 0U;
    size_t index;

    /** LEN8 is a valid frame bound but unsupported command-specific length. **/
    for (index = 0U; index < sizeof rows / sizeof rows[0]; index += 1U) {
        command = (UartCommand){UART_SET_PERIOD, 555U};
        if (uart_init(&state, 100U, now) != UART_OK ||
            !test_feed(&state, rows[index].bytes, rows[index].count, 4U, &now, &report, &command) ||
            report.commandPresent || command.kind != UART_SET_PERIOD || command.periodMs != 555U ||
            state.applicationPeriod != 100U || state.phase != UART_SEEK ||
            state.diagnostics.rejected != 1U) {
            return false;
        }
        if (!test_feed(&state, status, 4U, 4U, &now, &report, &command) ||
            !report.commandPresent || command.kind != UART_GET_STATUS || command.periodMs != 100U) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Exercise simultaneous timeout/command and accepted-command preservation.
 * @param[in] None.
 * @return True if bounded event ordering and copied results survive later bytes.
 */
static bool test_event_order(void)
{
    static const uint8_t prefix[] = {0xA5U, 1U, 2U};
    static const uint8_t suffix[] = {3U, 0U, 0xA5U, 0U};
    static const uint8_t status[] = {0xA5U, 1U, 2U, 3U};
    UartState state;
    UartIngress ingress;
    UartReport report;
    UartCommand command = {UART_SET_PERIOD, 555U};
    uint32_t now = 0U;
    size_t index;

    /** One completion in byte1 leaves only three bytes: no second complete frame fits. **/
    if (uart_init(&state, 100U, now) != UART_OK ||
        !test_feed(&state, prefix, 3U, 4U, &now, &report, &command) ||
        !test_feed(&state, suffix, 4U, 4U, &now, &report, &command) ||
        !report.commandPresent || command.kind != UART_GET_STATUS || command.periodMs != 100U ||
        report.events[0] != UART_COMMAND || report.events[3] != UART_BAD_LENGTH) {
        return false;
    }
    if (uart_receive(&state, 0xA5U, &ingress) != UART_OK ||
        uart_poll(&state, 3U, &report, &command) != UART_OK) {
        return false;
    }
    for (index = 0U; index < 4U; index += 1U) {
        if (uart_receive(&state, status[index], &ingress) != UART_OK) {
            return false;
        }
    }
    return uart_poll(&state, 23U, &report, &command) == UART_OK && report.commandPresent &&
        report.consumed == 4U && report.eventCount == 5U && report.events[0] == UART_TIMEOUT &&
        report.events[4] == UART_COMMAND && state.diagnostics.timeouts == 1U;
}

/**
 * @brief Check exact timeout equality, late buffered suffix, age reset and wrap.
 * @param[in] None.
 * @return True for independent timeout fixtures.
 */
static bool test_timeout(void)
{
    static const uint8_t prefix[] = {0xA5U, 3U, 1U, 0x64U};
    UartState state;
    UartIngress ingress;
    UartReport report;
    UartCommand command = {UART_SET_PERIOD, 555U};
    uint32_t now = 0U;

    /** Buffered bytes carry no arrival timestamp and expire before delayed drain. **/
    if (uart_init(&state, 100U, 0U) != UART_OK ||
        !test_feed(&state, prefix, 4U, 4U, &now, &report, &command) ||
        uart_receive(&state, 0U, &ingress) != UART_OK ||
        uart_receive(&state, 0x66U, &ingress) != UART_OK ||
        uart_poll(&state, 20U, &report, &command) != UART_OK || state.age != 0U ||
        state.diagnostics.timeouts != 0U || !report.commandPresent || command.periodMs != 100U) {
        return false;
    }
    if (uart_init(&state, 100U, 0U) != UART_OK ||
        !test_feed(&state, prefix, 4U, 4U, &now, &report, &command)) {
        return false;
    }
    if (uart_receive(&state, 0U, &ingress) != UART_OK ||
        uart_receive(&state, 0x66U, &ingress) != UART_OK ||
        uart_poll(&state, now + 20U, &report, &command) != UART_OK ||
        report.commandPresent || report.events[0] != UART_TIMEOUT || state.phase != UART_SEEK ||
        state.applicationPeriod != 100U || command.periodMs != 100U) {
        return false;
    }
    if (uart_init(&state, 100U, UINT32_C(4294967290)) != UART_OK ||
        uart_receive(&state, 0xA5U, &ingress) != UART_OK ||
        uart_poll(&state, UINT32_C(4294967290), &report, &command) != UART_OK ||
        uart_poll(&state, 13U, &report, &command) != UART_OK || state.age != 19U ||
        uart_poll(&state, 14U, &report, &command) != UART_OK || state.phase != UART_SEEK ||
        report.events[0] != UART_TIMEOUT ||
        uart_poll(&state, 15U, &report, &command) != UART_OK || report.eventCount != 0U) {
        return false;
    }
    if (uart_receive(&state, 0xA5U, &ingress) != UART_OK ||
        uart_poll(&state, 16U, &report, &command) != UART_OK ||
        uart_receive(&state, 1U, &ingress) != UART_OK ||
        uart_poll(&state, 35U, &report, &command) != UART_OK || state.age != 0U ||
        uart_poll(&state, 54U, &report, &command) != UART_OK || state.age != 19U) {
        return false;
    }
    return true;
}

/**
 * @brief Check FIFO FULL preservation followed by explicit transport discard.
 * @param[in] None.
 * @return True when the failed A5 is dropped and later fresh frames recover.
 */
static bool test_loss(void)
{
    static const uint8_t status[] = {0xA5U, 1U, 2U, 3U};
    UartState state;
    UartIngress ingress;
    UartReport report;
    UartCommand command = {UART_SET_PERIOD, 555U};
    Fifo before;
    uint32_t now = 0U;
    size_t index;

    /** First demonstrate the borrowed FIFO contract without transport recovery. **/
    if (uart_init(&state, 100U, now) != UART_OK ||
        uart_receive(&state, 0xA5U, &ingress) != UART_OK ||
        uart_poll(&state, 0U, &report, &command) != UART_OK) {
        return false;
    }
    for (index = 0U; index < 4U; index += 1U) {
        if (uart_receive(&state, (uint16_t)index, &ingress) != UART_OK) {
            return false;
        }
    }
    before = state.queue;
    if (fifo_push(&state.queue, 0xA5U) != FIFO_FULL || state.queue.head != before.head ||
        state.queue.tail != before.tail || state.queue.count != before.count) {
        return false;
    }
    for (index = 0U; index < 4U; index += 1U) {
        if (state.queue.slots[index] != before.slots[index]) {
            return false;
        }
    }
    if (uart_receive(&state, 0xA5U, &ingress) != UART_LOSS ||
        ingress.fifoStatus != FIFO_FULL || ingress.queuedBeforeLoss != 4U ||
        !ingress.fullPreservedBeforeDiscard || state.queue.count != 0U || state.phase != UART_SEEK ||
        state.applicationPeriod != 100U || command.periodMs != 555U ||
        uart_poll(&state, 1U, &report, &command) != UART_OK || report.eventCount != 0U) {
        return false;
    }
    now = 1U;
    return test_feed(&state, status, 4U, 4U, &now, &report, &command) &&
        report.commandPresent && command.kind == UART_GET_STATUS && command.periodMs == 100U;
}

/**
 * @brief Reject independent initialized metadata fixtures through public calls.
 * @param[in] None.
 * @return Whether every named field remains preserved.
 */
static bool test_bad_metadata(void)
{
    static const UartState seed = {
        .queue = {{0xA5U, 0U, 0U, 0U}, 0U, 1U, 1U},
        .phase = UART_SEEK, .lastObserved = 10U, .applicationPeriod = 100U
    };
    static const UartReport saved = {2U, 1U, {UART_START}, true, {1U, 2U, 3U, 4U, true}};
    static const struct {
        UartPhase phase;
        size_t length;
        size_t received;
        uint32_t age;
        uint16_t period;
        size_t count;
    } rows[] = {
        {UART_SEEK, 0U, 0U, 0U, 100U, 5U}, {(UartPhase)99, 0U, 0U, 0U, 100U, 1U},
        {UART_SEEK, 0U, 0U, 20U, 100U, 1U}, {UART_SEEK, 9U, 0U, 0U, 100U, 1U},
        {UART_SEEK, 0U, 0U, 0U, 0U, 1U}, {UART_LENGTH, 1U, 0U, 0U, 100U, 1U},
        {UART_PAYLOAD, 0U, 0U, 0U, 100U, 1U}, {UART_PAYLOAD, 9U, 0U, 0U, 100U, 1U},
        {UART_PAYLOAD, 1U, 1U, 0U, 100U, 1U}, {UART_CHECKSUM, 1U, 0U, 0U, 100U, 1U},
        {UART_SEEK, 0U, 0U, 1U, 100U, 1U}, {UART_SEEK, 0U, 0U, 0U, 1001U, 1U}
    };
    size_t index;

    /** These are legal C objects with deliberately inconsistent named values. **/
    for (index = 0U; index < sizeof rows / sizeof rows[0]; index += 1U) {
        UartState state = seed;
        UartState bad;
        UartReport report = saved;
        UartIngress ingress = {FIFO_EMPTY, 3U, true};
        UartCommand command = {UART_SET_PERIOD, 555U};
        state.phase = rows[index].phase;
        state.length = rows[index].length;
        state.received = rows[index].received;
        state.age = rows[index].age;
        state.applicationPeriod = rows[index].period;
        state.queue.count = rows[index].count;
        bad = state;
        if (uart_poll(&state, 11U, &report, &command) != UART_BAD_STATE ||
            uart_receive(&state, 0U, &ingress) != UART_BAD_STATE ||
            !test_state(&state, &bad) || !test_report(report, saved) || command.periodMs != 555U ||
            ingress.fifoStatus != FIFO_EMPTY || ingress.queuedBeforeLoss != 3U ||
            !ingress.fullPreservedBeforeDiscard) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Check invalid observation/state/arguments before any accepted mutation.
 * @param[in] None.
 * @return True for named-field/output preservation.
 */
static bool test_rejection(void)
{
    UartState state;
    UartState before;
    UartReport report = {2U, 1U, {UART_START}, true, {1U, 2U, 3U, 4U, true}};
    UartReport saved = report;
    UartIngress ingress = {FIFO_EMPTY, 3U, true};
    UartCommand command = {UART_SET_PERIOD, 555U};

    /** Fault fixtures are real initialized objects, never arbitrary bad addresses. **/
    if (uart_init(&state, 100U, 10U) != UART_OK ||
        uart_receive(&state, 0xA5U, &ingress) != UART_OK) {
        return false;
    }
    before = state;
    if (uart_poll(&state, UINT32_C(2147483658), &report, &command) != UART_TIME_REJECTED ||
        !test_state(&state, &before) || !test_report(report, saved) || command.periodMs != 555U ||
        uart_init(&state, 0U, 0U) != UART_INVALID_ARGUMENT || !test_state(&state, &before) ||
        uart_init(&state, 1001U, 0U) != UART_INVALID_ARGUMENT || !test_state(&state, &before) ||
        uart_receive(&state, 256U, &ingress) != UART_INVALID_ARGUMENT ||
        !test_state(&state, &before) || uart_init(NULL, 100U, 0U) != UART_INVALID_ARGUMENT ||
        uart_receive(NULL, 0U, &ingress) != UART_INVALID_ARGUMENT ||
        uart_receive(&state, 0U, NULL) != UART_INVALID_ARGUMENT ||
        uart_poll(NULL, 11U, &report, &command) != UART_INVALID_ARGUMENT ||
        uart_poll(&state, 11U, NULL, &command) != UART_INVALID_ARGUMENT ||
        uart_poll(&state, 11U, &report, NULL) != UART_INVALID_ARGUMENT) {
        return false;
    }
    if (!test_state(&state, &before) || !test_report(report, saved)) {
        return false;
    }
    return uart_init(&state, 100U, 0U) == UART_OK &&
        uart_poll(&state, TIME_MAX_PERIOD, &report, &command) == UART_OK &&
        state.lastObserved == TIME_MAX_PERIOD && report.consumed == 0U &&
        uart_poll(&state, UINT32_C(4294967294), &report, &command) == UART_OK &&
        state.lastObserved == UINT32_C(4294967294) && command.periodMs == 555U;
}

/**
 * @brief Check observable saturation for every diagnostic and finite all-noise input.
 * @param[in] None.
 * @return True if no diagnostic wraps and work remains bounded.
 */
static bool test_saturation(void)
{
    static const uint8_t status[] = {0xA5U, 1U, 2U, 3U};
    static const uint8_t bad[] = {0xA5U, 0U};
    UartState state;
    UartIngress ingress;
    UartReport report;
    UartCommand command = {UART_SET_PERIOD, 555U};
    uint32_t now = 0U;
    size_t index;

    /** Counters may reach maximum; the next increment sets the sticky indicator. **/
    if (uart_init(&state, 100U, 0U) != UART_OK) {
        return false;
    }
    state.diagnostics.accepted = UINT32_MAX;
    state.diagnostics.rejected = UINT32_MAX;
    state.diagnostics.timeouts = UINT32_MAX;
    state.diagnostics.losses = UINT32_MAX;
    if (!test_feed(&state, status, 4U, 4U, &now, &report, &command) ||
        state.diagnostics.accepted != UINT32_MAX || !report.diagnostics.saturated) {
        return false;
    }
    state.diagnostics.saturated = false;
    if (!test_feed(&state, bad, 2U, 4U, &now, &report, &command) ||
        state.diagnostics.rejected != UINT32_MAX || !state.diagnostics.saturated) {
        return false;
    }
    state.diagnostics.saturated = false;
    if (
        uart_receive(&state, 0xA5U, &ingress) != UART_OK ||
        uart_poll(&state, now, &report, &command) != UART_OK ||
        uart_poll(&state, now + 20U, &report, &command) != UART_OK ||
        state.diagnostics.timeouts != UINT32_MAX || !state.diagnostics.saturated) {
        return false;
    }
    now += 20U;
    state.diagnostics.saturated = false;
    for (index = 0U; index < 5U; index += 1U) {
        UartStatus expected = index == 4U ? UART_LOSS : UART_OK;
        if (uart_receive(&state, 0U, &ingress) != expected) {
            return false;
        }
    }
    if (state.diagnostics.losses != UINT32_MAX || !state.diagnostics.saturated) {
        return false;
    }
    return true;
}

/**
 * @brief Exercise a fixed 1000-poll all-noise stream through public calls.
 * @param[in] None.
 * @return True if every call consumes four bytes without producing a command.
 */
static bool test_noise(void)
{
    static const uint8_t noise[] = {0U, 1U, 2U, 3U};
    UartState state;
    UartReport report;
    UartCommand command = {UART_SET_PERIOD, 555U};
    uint32_t now = 0U;
    size_t index;

    /** The workload is fixed rather than waiting for a condition to become true. **/
    if (uart_init(&state, 100U, now) != UART_OK) {
        return false;
    }
    for (index = 0U; index < 1000U; index += 1U) {
        if (!test_feed(&state, noise, 4U, 4U, &now, &report, &command) ||
            report.consumed != 4U || report.commandPresent || state.phase != UART_SEEK) {
            return false;
        }
    }
    return command.kind == UART_SET_PERIOD && command.periodMs == 555U;
}

/**
 * @brief Run active public-interface tests in normal and NDEBUG builds.
 * @param[in] None.
 * @return Zero only for all checks and successful output.
 */
int main(void)
{
    static const struct { const char *name; bool (*run)(void); } cases[] = {
        {"commands", test_commands}, {"invalid frames", test_invalid_frames},
        {"event order", test_event_order}, {"timeout", test_timeout},
        {"loss", test_loss}, {"rejection", test_rejection}, {"metadata", test_bad_metadata},
        {"saturation", test_saturation}, {"noise", test_noise}
    };
    size_t index;

    /** Tests use ordinary checks, not assert, and never touch hardware. **/
    for (index = 0U; index < sizeof cases / sizeof cases[0]; index += 1U) {
        if (!cases[index].run()) {
            if (fprintf(stderr, "FAIL UART case: %s\n", cases[index].name) < 0) {
                return 2;
            }
            return 1;
        }
    }
    if (puts("PASS UART: literals, fragments, events, timeout, loss, rejection, saturation, separate FIFO/time") < 0 ||
        fflush(stdout) != 0) {
        return 1;
    }
    if (printf("Host sizes: Fifo=%zu UartState=%zu UartReport=%zu UartIngress=%zu UartCommand=%zu Diagnostics=%zu\n",
        sizeof(Fifo), sizeof(UartState), sizeof(UartReport), sizeof(UartIngress),
        sizeof(UartCommand), sizeof(UartDiagnostics)) < 0 || fflush(stdout) != 0) {
        return 1;
    }
    return 0;
}
#endif

/**
 * @brief Queue a wide-validated byte, or discard continuity after FULL.
 * @param[in,out] state Live initialized exclusive state.
 * @param[in] byte Wide input checked before narrowing.
 * @param[out] report Disjoint writable ingress report.
 * @return Named status; UART_LOSS deliberately changes queue/parser.
 */
UartStatus uart_receive(UartState *state, uint16_t byte, UartIngress *report)
{
    UartState next;
    UartIngress result = {FIFO_OK, 0U, false};

    /** Candidate storage preserves every named field on checkable rejection. **/
    if (state == NULL || report == NULL || byte > UINT8_MAX) {
        return UART_INVALID_ARGUMENT;
    }
    if (!uart_valid(state)) {
        return UART_BAD_STATE;
    }
    next = *state;
    result.fifoStatus = fifo_push(&next.queue, (uint8_t)byte);
    if (result.fifoStatus == FIFO_FULL) {
        result.queuedBeforeLoss = next.queue.count;
        result.fullPreservedBeforeDiscard = true;
        if (fifo_reset(&next.queue) != FIFO_OK) {
            return UART_BAD_STATE;
        }
        uart_clear(&next);
        uart_increment(&next.diagnostics.losses, &next.diagnostics.saturated);
    } else if (result.fifoStatus != FIFO_OK) {
        return UART_BAD_STATE;
    }
    *state = next;
    *report = result;
    return result.fifoStatus == FIFO_FULL ? UART_LOSS : UART_OK;
}

/**
 * @brief Validate time, expire partial state, then drain at most four bytes.
 * @param[in,out] state Live initialized exclusive state.
 * @param[in] now Observation under the true-gap promise.
 * @param[out] report Disjoint writable finite report.
 * @param[out] command Disjoint output changed only on new command.
 * @return Named status; rejection preserves named state and outputs.
 */
UartStatus uart_poll(UartState *state, uint32_t now, UartReport *report, UartCommand *command)
{
    UartState next;
    UartReport result = {0};
    UartCommand accepted = {UART_GET_STATUS, 0U};
    uint32_t elapsed;
    uint8_t byte;
    size_t budget;

    /** Time validation precedes actual queue/parser/application mutation. **/
    if (state == NULL || report == NULL || command == NULL) {
        return UART_INVALID_ARGUMENT;
    }
    if (!uart_valid(state)) {
        return UART_BAD_STATE;
    }
    if (time_elapsed(state->lastObserved, now, &elapsed) != TIME_OK) {
        return UART_TIME_REJECTED;
    }
    next = *state;
    uart_advance(&next, now, elapsed, &result);
    for (budget = 0U; budget < FIFO_CAPACITY; budget += 1U) {
        FifoStatus status = fifo_pop(&next.queue, &byte);
        if (status == FIFO_EMPTY) {
            break;
        }
        if (status != FIFO_OK) {
            return UART_BAD_STATE;
        }
        uart_byte(&next, byte, &result, &accepted);
        result.consumed += 1U;
    }
    result.diagnostics = next.diagnostics;
    *state = next;
    *report = result;
    if (result.commandPresent) {
        *command = accepted;
    }
    return UART_OK;
}
```



</details>

<details id="uart-source-uart-h"><summary>完整uart.h（与下载同字节）</summary>



```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file uart.h
 * @author embedded-notes contributors
 * @brief Bounded byte FIFO to original framed commands; no UART registers.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_UART_H
#define EMBEDDED_NOTES_UART_H

#include "../bounded-fifo/fifo.h"
#include "../timer-pwm/time.h"
#include <stdbool.h>

#define UART_PAYLOAD_CAPACITY 8U
#define UART_EVENT_CAPACITY 5U
#define UART_TIMEOUT_MS 20U

typedef enum { UART_OK = 0, UART_INVALID_ARGUMENT, UART_BAD_STATE, UART_TIME_REJECTED, UART_LOSS } UartStatus;
typedef enum { UART_SEEK = 0, UART_LENGTH, UART_PAYLOAD, UART_CHECKSUM } UartPhase;
typedef enum { UART_SET_PERIOD = 1, UART_GET_STATUS = 2 } UartCommandKind;
typedef enum {
    UART_NOISE = 0, UART_START, UART_LENGTH_ACCEPTED, UART_PAYLOAD_ACCEPTED,
    UART_BAD_LENGTH, UART_BAD_CHECKSUM, UART_BAD_COMMAND, UART_COMMAND, UART_TIMEOUT
} UartEvent;

typedef struct { UartCommandKind kind; uint16_t periodMs; } UartCommand;
typedef struct {
    uint32_t accepted;
    uint32_t rejected;
    uint32_t timeouts;
    uint32_t losses;
    bool saturated;
} UartDiagnostics;
typedef struct {
    Fifo queue;
    UartPhase phase;
    uint8_t payload[UART_PAYLOAD_CAPACITY];
    size_t length;
    size_t received;
    uint8_t checksum;
    uint32_t lastObserved;
    uint32_t age;
    uint16_t applicationPeriod;
    UartDiagnostics diagnostics;
} UartState;
typedef struct {
    FifoStatus fifoStatus;
    size_t queuedBeforeLoss;
    bool fullPreservedBeforeDiscard;
} UartIngress;
typedef struct {
    size_t consumed;
    size_t eventCount;
    UartEvent events[UART_EVENT_CAPACITY];
    bool commandPresent;
    UartDiagnostics diagnostics;
} UartReport;

/*
 * C11 with eight-bit bytes and exact-width types required by both dependencies.
 * One tick = 1 ms. True forward gaps between accepted polls must be < 2^31 ms;
 * observed delta >= 2^31 is rejected. Unseen complete wraps cannot be detected.
 * Timeout is parser/service-observed inactivity, NOT wire interbyte timing.
 * Every byte drained in a poll shares now. Delayed drain can expire buffered data.
 *
 * All nonnull pointers name real, live, correctly typed, sufficiently sized
 * objects. Outputs are writable and disjoint from state and each other. Init
 * may receive fresh storage; later calls require all fields initialized and
 * exclusively owned. Do not externally modify metadata. Null checks do not
 * validate forged/dangling pointers or overlap. Single execution context,
 * non-reentrant; no ISR/DMA/task/concurrent SPSC safety. volatile is no repair.
 * No heap, recursion, waits, callbacks or hardware I/O. Poll consumes at most
 * four bytes, records at most five events and accepts at most one command.
 * Invalid argument/state/time leaves every named state/output field unchanged.
 * UART_LOSS is a deliberate valid transition: discard queue and partial parser,
 * drop the failed byte, preserve applicationPeriod. Later fresh input recovers.
 * Counters saturate at UINT32_MAX; attempted increments there set saturated.
 * Output command changes only when report.commandPresent is true. A status
 * command copies the current period, without changing applicationPeriod.
 */

/**
 * @brief Initialize fresh real storage without reading prior contents.
 * @param[in,out] state Writable object, possibly fresh.
 * @param[in] initialPeriod Application seed in 1..1000 ms.
 * @param[in] now Initial uint32 observation.
 * @return UART_OK or UART_INVALID_ARGUMENT; rejection preserves state.
 */
UartStatus uart_init(UartState *state, uint16_t initialPeriod, uint32_t now);

/**
 * @brief Queue one checked wide byte, or explicitly discard continuity on FULL.
 * @param[in,out] state Live initialized exclusive state.
 * @param[in] byte Value 0..255; rejected before narrowing otherwise.
 * @param[out] report Independent real writable ingress result.
 * @return UART_OK, UART_LOSS, UART_INVALID_ARGUMENT or UART_BAD_STATE.
 */
UartStatus uart_receive(UartState *state, uint16_t byte, UartIngress *report);

/**
 * @brief Check time/timeout before a bounded four-byte drain.
 * @param[in,out] state Live initialized exclusive state.
 * @param[in] now Forward observation under the true-gap promise.
 * @param[out] report Independent real writable finite event result.
 * @param[out] command Independent output, changed only for a new command.
 * @return UART_OK, UART_INVALID_ARGUMENT, UART_BAD_STATE or UART_TIME_REJECTED.
 */
UartStatus uart_poll(UartState *state, uint32_t now, UartReport *report, UartCommand *command);

#endif
```



</details>

<details id="uart-source-fifo-c"><summary>完整fifo.c（与下载同字节）</summary>



```c
/******************************************************************************
 * @file fifo.c
 * @brief Original, vendor-independent teaching example for embedded-notes.
 * @version V1.0 2026-10-17
 *
 * Contract: C11, eight-bit bytes and uint8_t. Four internal value slots.
 * Call fifo_reset on a real writable Fifo before push/pop; reset never reads
 * prior contents. All later calls require that same live initialized object.
 * head is next read, tail next write, count occupancy; callers do not edit them.
 * One thread, one execution context, non-reentrant: not task/ISR/DMA-safe,
 * not concurrent SPSC. volatile does not supply synchronization or atomicity.
 * Pop output must point to a live writable caller byte outside the Fifo object.
 * Null is rejected; arbitrary dangling/forged pointers and overlap are NOT
 * detected. Metadata checks apply to real fully initialized objects only.
 * Rejection preserves all fields and pop output. Success copies byte values.
 * Every operation is bounded: no allocation, blocking, wait or retry.
 * Define FIFO_TEST for the executable, omit it for the reusable module.
 * No hardware validation or target-specific synchronization is provided.
 *****************************************************************************/
#include "fifo.h"
#include <stdbool.h>
#ifdef FIFO_TEST
#include <stdio.h>
#endif
/**
 * @brief Check metadata before any slot access in an initialized object.
 * @param[in] queue Non-null live initialized object.
 * @return Whether ranges and occupancy relation agree.
 */
static bool fifo_valid(const Fifo *queue)
{
    /**
     * Bound the addition before checking the modulo relation.
     **/
    return queue->head < FIFO_CAPACITY && queue->tail < FIFO_CAPACITY &&
        queue->count <= FIFO_CAPACITY && (queue->head + queue->count) % FIFO_CAPACITY == queue->tail;
}
/**
 * @brief Establish an empty queue.
 * @param[in,out] queue Real writable queue object, or null.
 * @return FIFO_OK or FIFO_INVALID_ARGUMENT.
 */
FifoStatus fifo_reset(Fifo *queue)
{
    /**
     * Assign all fields without inspecting the object's prior contents.
     **/
    if (queue == NULL) {
        return FIFO_INVALID_ARGUMENT;
    }
    *queue = (Fifo){{0U, 0U, 0U, 0U}, 0U, 0U, 0U};
    return FIFO_OK;
}
/**
 * @brief Copy one value into a single-context initialized queue.
 * @param[in,out] queue Live initialized Fifo, or null.
 * @param[in] value Byte copied by value; no source pointer is retained.
 * @return FIFO_OK/FIFO_FULL/FIFO_INVALID_ARGUMENT/FIFO_BAD_STATE.
 */
FifoStatus fifo_push(Fifo *queue, uint8_t value)
{
    /**
     * Reject before reading a slot or changing metadata.
     **/
    if (queue == NULL) {
        return FIFO_INVALID_ARGUMENT;
    }
    if (!fifo_valid(queue)) {
        return FIFO_BAD_STATE;
    }
    if (queue->count == FIFO_CAPACITY) {
        return FIFO_FULL;
    }
    queue->slots[queue->tail] = value;
    queue->tail = (queue->tail + 1U) % FIFO_CAPACITY;
    queue->count += 1U;
    return FIFO_OK;
}
/**
 * @brief Copy the oldest value into a distinct caller-owned byte.
 * @param[in,out] queue Live initialized Fifo, or null.
 * @param[out] output Live writable byte outside queue, or null; overlap forbidden.
 * @return FIFO_OK/FIFO_EMPTY/FIFO_INVALID_ARGUMENT/FIFO_BAD_STATE.
 */
FifoStatus fifo_pop(Fifo *queue, uint8_t *output)
{
    /**
     * Null checks precede queue access; failure never writes output.
     **/
    if (queue == NULL || output == NULL) {
        return FIFO_INVALID_ARGUMENT;
    }
    if (!fifo_valid(queue)) {
        return FIFO_BAD_STATE;
    }
    if (queue->count == 0U) {
        return FIFO_EMPTY;
    }
    *output = queue->slots[queue->head];
    queue->head = (queue->head + 1U) % FIFO_CAPACITY;
    queue->count -= 1U;
    return FIFO_OK;
}
#ifdef FIFO_TEST
static unsigned int g_failures;
/**
 * @brief Keep test failures active with NDEBUG.
 * @param[in] condition Expected condition.
 * @param[in] label Fixed case name.
 * @return None.
 */
static void test_expect(bool condition, const char *label)
{
    /**
     * No assert is used for test acceptance.
     **/
    if (!condition) {
        g_failures += 1U;
        if (fprintf(stderr, "FAIL: %s\n", label) < 0) {
            g_failures += 1U;
        }
    }
}
/**
 * @brief Compare meaningful fields, never structure padding.
 * @param[in] left Initialized queue snapshot.
 * @param[in] right Initialized queue snapshot.
 * @return Whether every field is equal.
 */
static bool test_same(const Fifo *left, const Fifo *right)
{
    size_t index;
    /**
     * All four bytes include unused stale slots on rejection.
     **/
    if (left->head != right->head || left->tail != right->tail || left->count != right->count) {
        return false;
    }
    for (index = 0U; index < FIFO_CAPACITY; index += 1U) {
        if (left->slots[index] != right->slots[index]) {
            return false;
        }
    }
    return true;
}
/**
 * @brief Run independent literal rows including wrapped logical order.
 * @return None.
 */
static void test_fixed_trace(void)
{
    typedef struct {
        bool push;
        uint8_t value;
        FifoStatus status;
        size_t head;
        size_t tail;
        size_t count;
        uint8_t logical[4];
        uint8_t output;
    } TraceRow;
    static const TraceRow rows[] = {
        {true, 17U, FIFO_OK, 0U, 1U, 1U, {17U, 0U, 0U, 0U}, 165U},
        {true, 34U, FIFO_OK, 0U, 2U, 2U, {17U, 34U, 0U, 0U}, 165U},
        {true, 51U, FIFO_OK, 0U, 3U, 3U, {17U, 34U, 51U, 0U}, 165U},
        {true, 68U, FIFO_OK, 0U, 0U, 4U, {17U, 34U, 51U, 68U}, 165U},
        {true, 85U, FIFO_FULL, 0U, 0U, 4U, {17U, 34U, 51U, 68U}, 165U},
        {false, 0U, FIFO_OK, 1U, 0U, 3U, {34U, 51U, 68U, 0U}, 17U},
        {false, 0U, FIFO_OK, 2U, 0U, 2U, {51U, 68U, 0U, 0U}, 34U},
        {true, 85U, FIFO_OK, 2U, 1U, 3U, {51U, 68U, 85U, 0U}, 34U},
        {true, 102U, FIFO_OK, 2U, 2U, 4U, {51U, 68U, 85U, 102U}, 34U},
        {false, 0U, FIFO_OK, 3U, 2U, 3U, {68U, 85U, 102U, 0U}, 51U},
        {false, 0U, FIFO_OK, 0U, 2U, 2U, {85U, 102U, 0U, 0U}, 68U},
        {false, 0U, FIFO_OK, 1U, 2U, 1U, {102U, 0U, 0U, 0U}, 85U},
        {false, 0U, FIFO_OK, 2U, 2U, 0U, {0U, 0U, 0U, 0U}, 102U},
        {false, 0U, FIFO_EMPTY, 2U, 2U, 0U, {0U, 0U, 0U, 0U}, 102U}
    };
    Fifo queue;
    uint8_t output = 165U;
    size_t index;
    /**
     * Expected rows are worked constants, not generated by the ring logic.
     **/
    test_expect(fifo_reset(&queue) == FIFO_OK, "trace reset");
    for (index = 0U; index < sizeof rows / sizeof rows[0]; index += 1U) {
        const TraceRow *row = &rows[index];
        Fifo before = queue;
        size_t item;
        FifoStatus status = row->push ? fifo_push(&queue, row->value) : fifo_pop(&queue, &output);
        test_expect(status == row->status, "fixed trace status");
        test_expect(queue.head == row->head && queue.tail == row->tail && queue.count == row->count,
            "fixed trace metadata");
        test_expect(output == row->output, "fixed trace output");
        for (item = 0U; item < row->count; item += 1U) {
            test_expect(queue.slots[(row->head + item) % FIFO_CAPACITY] == row->logical[item],
                "fixed trace logical order");
        }
        if (row->status != FIFO_OK) {
            test_expect(test_same(&queue, &before), "rejection snapshot");
        }
    }
}
/**
 * @brief Test valid lifetime boundary and initialized corruption fixtures.
 * @return None.
 */
static void test_boundaries(void)
{
    Fifo queue;
    Fifo before;
    uint8_t output = 165U;
    uint8_t source = 17U;
    size_t index;
    static const Fifo corrupt[] = {
        {{1U, 2U, 3U, 4U}, 4U, 0U, 0U},
        {{1U, 2U, 3U, 4U}, 0U, 4U, 0U},
        {{1U, 2U, 3U, 4U}, 0U, 0U, 5U},
        {{1U, 2U, 3U, 4U}, 0U, 0U, 1U},
        {{1U, 2U, 3U, 4U}, 1U, 2U, 0U},
        {{1U, 2U, 3U, 4U}, SIZE_MAX, 0U, 0U},
        {{1U, 2U, 3U, 4U}, 0U, SIZE_MAX, 0U},
        {{1U, 2U, 3U, 4U}, 0U, 0U, SIZE_MAX}
    };
    /**
     * Reset can initialize an automatic object without inspecting old bytes.
     **/
    test_expect(fifo_reset(&queue) == FIFO_OK, "initial reset");
    before = queue;
    test_expect(fifo_reset(NULL) == FIFO_INVALID_ARGUMENT, "null reset");
    test_expect(fifo_push(NULL, 7U) == FIFO_INVALID_ARGUMENT, "null push");
    test_expect(fifo_pop(NULL, &output) == FIFO_INVALID_ARGUMENT, "null pop queue");
    test_expect(fifo_pop(&queue, NULL) == FIFO_INVALID_ARGUMENT, "null pop output");
    test_expect(fifo_pop(NULL, NULL) == FIFO_INVALID_ARGUMENT, "both null");
    test_expect(test_same(&queue, &before) && output == 165U, "null preservation");
    test_expect(fifo_pop(&queue, &output) == FIFO_EMPTY && output == 165U, "empty sentinel");
    test_expect(fifo_push(&queue, 0U) == FIFO_OK, "zero push");
    test_expect(fifo_push(&queue, UINT8_MAX) == FIFO_OK, "255 push");
    test_expect(fifo_pop(&queue, &output) == FIFO_OK && output == 0U, "zero pop");
    test_expect(fifo_pop(&queue, &output) == FIFO_OK && output == UINT8_MAX, "255 pop");
    test_expect(fifo_reset(&queue) == FIFO_OK, "copy reset");
    test_expect(fifo_push(&queue, source) == FIFO_OK, "copy push");
    source = 99U;
    test_expect(fifo_pop(&queue, &output) == FIFO_OK && output == 17U && source == 99U, "copy ownership");
    for (index = 0U; index < sizeof corrupt / sizeof corrupt[0]; index += 1U) {
        queue = corrupt[index];
        before = queue;
        output = 165U;
        test_expect(fifo_push(&queue, 9U) == FIFO_BAD_STATE, "corrupt push");
        test_expect(fifo_pop(&queue, &output) == FIFO_BAD_STATE, "corrupt pop");
        test_expect(test_same(&queue, &before) && output == 165U, "corrupt preservation");
        test_expect(fifo_reset(&queue) == FIFO_OK && queue.head == 0U && queue.tail == 0U && queue.count == 0U,
            "reset recovers initialized metadata");
    }
}
/**
 * @brief Compare many ring operations with a linear shifting oracle.
 * @return None.
 */
static void test_long_trace(void)
{
    Fifo queue;
    uint8_t expected[4] = {0U, 0U, 0U, 0U};
    size_t length = 0U;
    unsigned long step;
    uint8_t output = 165U;
    /**
     * This oracle shifts a list and has no head/tail or wrap calculation.
     **/
    test_expect(fifo_reset(&queue) == FIFO_OK, "long reset");
    for (step = 0UL; step < 20000UL; step += 1UL) {
        bool push = step % 11UL < 6UL;
        uint8_t value = (uint8_t)((step * 73UL + 19UL) % 256UL);
        uint8_t oldOutput = output;
        Fifo before = queue;
        FifoStatus expectedStatus = push ? (length == 4U ? FIFO_FULL : FIFO_OK) :
            (length == 0U ? FIFO_EMPTY : FIFO_OK);
        FifoStatus status = push ? fifo_push(&queue, value) : fifo_pop(&queue, &output);
        size_t item;
        test_expect(status == expectedStatus, "long status");
        if (expectedStatus == FIFO_OK && push) {
            expected[length] = value;
            length += 1U;
            test_expect(output == oldOutput, "push preserves output");
        } else if (expectedStatus == FIFO_OK) {
            test_expect(output == expected[0], "long oldest byte");
            length -= 1U;
            for (item = 0U; item < length; item += 1U) {
                expected[item] = expected[item + 1U];
            }
        } else {
            test_expect(test_same(&queue, &before) && output == oldOutput, "long rejection snapshot");
        }
        test_expect(queue.count == length && queue.head < 4U && queue.tail < 4U, "long bounds");
        for (item = 0U; item < length; item += 1U) {
            test_expect(queue.slots[(queue.head + item) % 4U] == expected[item], "long logical sequence");
        }
    }
}
/**
 * @brief Verify reset through the public interface.
 * @return Zero on success, nonzero on failure even under NDEBUG.
 */
int main(void)
{
    Fifo queue = {{9U, 9U, 9U, 9U}, 2U, 2U, 4U};
    const Fifo emptySeed = {{0U, 0U, 0U, 0U}, 0U, 0U, 0U};
    /**
     * Fixed expected seed is independent of the implementation.
     **/
    if (fifo_reset(&queue) != FIFO_OK || !test_same(&queue, &emptySeed)) {
        test_expect(false, "reset establishes empty seed");
        return 1;
    }
    test_fixed_trace();
    test_boundaries();
    test_long_trace();
    if (g_failures != 0U) {
        return 1;
    }
    if (puts("PASS FIFO: literal replay, boundaries, null, initialized corruption, snapshots, copy, 20000 steps") < 0) {
        return 1;
    }
    if (fflush(stdout) == EOF) {
        return 1;
    }
    return 0;
}
#endif
```



</details>

<details id="uart-source-fifo-h"><summary>完整fifo.h（与下载同字节）</summary>



```c
/******************************************************************************
 * @file fifo.h
 * @brief Original embedded-notes four-byte, single-context FIFO interface.
 * @version V1.0 2026-10-17
 *
 * C11, eight-bit bytes and uint8_t. Four internally owned byte values.
 * Reset a real writable Fifo before use; reset does not read prior contents.
 * Later operations require that same live initialized object. Callers must not
 * edit metadata. head is next read, tail next write, count occupancy.
 * Single thread, single execution context, non-reentrant; not task/ISR/DMA-safe
 * or concurrent SPSC. volatile supplies no synchronization or atomicity.
 * Pop output is a live writable caller byte outside the entire Fifo object.
 * Null is rejected, but forged/dangling pointers and overlap are not detected.
 * Metadata checks require real fully initialized objects. Rejection preserves
 * all fields and pop output. Success copies values; no pointer is retained.
 * Bounded operations: no allocation, blocking, waiting or retry.
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_BOUNDED_FIFO_H
#define EMBEDDED_NOTES_BOUNDED_FIFO_H

#include <limits.h>
#include <stddef.h>
#include <stdint.h>

#define FIFO_CAPACITY 4U
#if CHAR_BIT != 8 || !defined(UINT8_MAX)
#error "This example requires eight-bit bytes and uint8_t."
#endif

typedef enum {
    FIFO_OK,
    FIFO_FULL,
    FIFO_EMPTY,
    FIFO_INVALID_ARGUMENT,
    FIFO_BAD_STATE
} FifoStatus;

typedef struct {
    uint8_t slots[FIFO_CAPACITY];
    size_t head;
    size_t tail;
    size_t count;
} Fifo;

/**
 * @brief Establish an empty queue without reading prior contents.
 * @param[in,out] queue Real writable queue object, or null.
 * @return FIFO_OK or FIFO_INVALID_ARGUMENT.
 */
FifoStatus fifo_reset(Fifo *queue);

/**
 * @brief Copy one value into a single-context initialized queue.
 * @param[in,out] queue Live initialized Fifo, or null.
 * @param[in] value Byte copied by value; validate wider inputs before narrowing.
 * @return FIFO_OK/FIFO_FULL/FIFO_INVALID_ARGUMENT/FIFO_BAD_STATE.
 */
FifoStatus fifo_push(Fifo *queue, uint8_t value);

/**
 * @brief Copy the oldest value into a distinct caller-owned byte.
 * @param[in,out] queue Live initialized Fifo, or null.
 * @param[out] output Live writable byte outside the entire queue, or null.
 * @return FIFO_OK/FIFO_EMPTY/FIFO_INVALID_ARGUMENT/FIFO_BAD_STATE.
 */
FifoStatus fifo_pop(Fifo *queue, uint8_t *output);

#endif
```



</details>

<details id="uart-source-time-c"><summary>完整time.c（与下载同字节）</summary>



```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file time.c
 * @author embedded-notes contributors
 * @brief Constant-work periodic release policy; host model, no hardware access.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "time.h"
#include <stddef.h>
#ifdef TIME_TEST
#include <stdio.h>
#endif

/**
 * @brief Initialize a periodic phase at now without reading old storage.
 * @param[in,out] state Writable object, possibly fresh.
 * @param[in] period Positive period below the half range.
 * @param[in] now Initial tick sample.
 * @return Named status; failure leaves state unchanged.
 */
TimeStatus time_init(TimeState *state, uint32_t period, uint32_t now)
{
    /** Validate first; do not inspect indeterminate old contents. **/
    if (state == NULL || period == 0U || period > TIME_MAX_PERIOD) {
        return TIME_INVALID_ARGUMENT;
    }
    state->period = period;
    state->lastObserved = now;
    state->remainder = 0U;
    return TIME_OK;
}

/**
 * @brief Check the observed modulo difference, not the unseen true elapsed time.
 * @param[in] then Last accepted sample.
 * @param[in] now New forward sample under the documented real-gap promise.
 * @param[out] elapsed Writable independent output, preserved on rejection.
 * @return Named status; no side effects on failure.
 */
TimeStatus time_elapsed(uint32_t then, uint32_t now, uint32_t *elapsed)
{
    uint32_t delta;

    /** The conversion also preserves modulo32 semantics after integer promotion. **/
    if (elapsed == NULL) {
        return TIME_INVALID_ARGUMENT;
    }
    delta = (uint32_t)(now - then);
    if (delta >= TIME_HALF_RANGE) {
        return TIME_GAP_REJECTED;
    }
    *elapsed = delta;
    return TIME_OK;
}

/**
 * @brief Cross any number of releases with a single finite arithmetic step.
 * @param[in,out] state Initialized valid state; disjoint from report.
 * @param[in] now Next tick sample under the caller's real-gap promise.
 * @param[out] report Copy-by-value result; one work item at most.
 * @return Named status; all state/report fields preserved on failure.
 */
TimeStatus time_service(TimeState *state, uint32_t now, TimeReport *report)
{
    uint32_t delta;
    uint64_t total;
    TimeReport next;
    TimeStatus status;

    /** Validate every checkable premise before committing accepted phase. **/
    if (state == NULL || report == NULL) {
        return TIME_INVALID_ARGUMENT;
    }
    if (state->period == 0U || state->period > TIME_MAX_PERIOD || state->remainder >= state->period) {
        return TIME_BAD_STATE;
    }
    status = time_elapsed(state->lastObserved, now, &delta);
    if (status != TIME_OK) {
        return status;
    }
    total = (uint64_t)state->remainder + (uint64_t)delta;
    /** total <= 4294967293; releases <= 2147483647 for every valid period. **/
    next.releases = (uint32_t)(total / state->period);
    next.remainder = (uint32_t)(total % state->period);
    next.elapsed = delta;
    next.work = next.releases != 0U;
    next.missed = next.work ? next.releases - 1U : 0U;
    state->lastObserved = now;
    state->remainder = next.remainder;
    *report = next;
    return TIME_OK;
}

#ifdef TIME_TEST
/**
 * @brief Compare every named field instead of reading structure padding.
 * @param[in] left Initialized state.
 * @param[in] right Initialized state.
 * @return True exactly when all named fields agree.
 */
static bool same_state(TimeState left, TimeState right)
{
    /** Padding bytes are not part of the state preservation contract. **/
    return left.period == right.period && left.lastObserved == right.lastObserved &&
        left.remainder == right.remainder;
}

/**
 * @brief Compare all public report values without padding assumptions.
 * @param[in] left Initialized report.
 * @param[in] right Initialized report.
 * @return True when every named report field agrees.
 */
static bool same_report(TimeReport left, TimeReport right)
{
    /** This check stays active when NDEBUG is defined. **/
    return left.work == right.work && left.missed == right.missed && left.releases == right.releases &&
        left.elapsed == right.elapsed && left.remainder == right.remainder;
}

/**
 * @brief Execute literal normal/late/wrap fixtures through public calls.
 * @param[in] None.
 * @return True on all independently specified outcomes.
 */
static bool test_trace(void)
{
    TimeState state;
    TimeReport report;
    const uint32_t now[] = {109U, 110U, 145U, 145U};
    const uint32_t missed[] = {0U, 0U, 2U, 0U};
    const uint32_t remainder[] = {9U, 0U, 5U, 5U};
    const bool work[] = {false, true, true, false};
    size_t index;

    /** Expected rows come from hand-counted period boundaries 110/120/130/140. **/
    if (time_init(&state, 10U, 100U) != TIME_OK) {
        return false;
    }
    for (index = 0U; index < 4U; index++) {
        if (time_service(&state, now[index], &report) != TIME_OK || report.work != work[index] ||
            report.missed != missed[index] || report.remainder != remainder[index]) {
            return false;
        }
    }
    return time_init(&state, 10U, UINT32_C(4294967290)) == TIME_OK &&
        time_service(&state, 4U, &report) == TIME_OK && report.work && report.elapsed == 10U &&
        report.releases == 1U && report.missed == 0U && report.remainder == 0U;
}

/**
 * @brief Execute bounded maximum and half-range equality cases.
 * @param[in] None.
 * @return True on all fixed boundary outcomes.
 */
static bool test_bounds(void)
{
    TimeState state;
    TimeReport report;
    uint32_t elapsed = 77U;

    /** The maximum total is 2147483646 + 2147483647, not uint32_t wrap. **/
    if (time_init(&state, TIME_MAX_PERIOD, 0U) != TIME_OK ||
        time_service(&state, UINT32_C(2147483646), &report) != TIME_OK || report.work ||
        time_service(&state, UINT32_C(4294967293), &report) != TIME_OK || !report.work ||
        report.missed != 0U || report.remainder != UINT32_C(2147483646)) {
        return false;
    }
    if (time_init(&state, 1U, 0U) != TIME_OK ||
        time_service(&state, TIME_MAX_PERIOD, &report) != TIME_OK || !report.work ||
        report.missed != UINT32_C(2147483646) || report.remainder != 0U) {
        return false;
    }
    return time_elapsed(0U, TIME_MAX_PERIOD, &elapsed) == TIME_OK && elapsed == TIME_MAX_PERIOD &&
        time_elapsed(0U, TIME_HALF_RANGE, &elapsed) == TIME_GAP_REJECTED && elapsed == TIME_MAX_PERIOD;
}

/**
 * @brief Exercise only initialized real objects on every checkable rejection.
 * @param[in] None.
 * @return True if failure preserves all named accepted state/report fields.
 */
static bool test_rejection(void)
{
    TimeState state = {10U, 100U, 5U};
    TimeState before = state;
    TimeReport report = {true, 17U, 18U, 19U, 20U};
    TimeReport saved = report;
    const uint32_t badPeriods[] = {0U, TIME_HALF_RANGE, UINT32_MAX};
    size_t index;

    /** Invalid initialized metadata is testable; forged pointers are not. **/
    for (index = 0U; index < 3U; index++) {
        if (time_init(&state, badPeriods[index], 0U) != TIME_INVALID_ARGUMENT || !same_state(state, before)) {
            return false;
        }
    }
    if (time_init(NULL, 10U, 0U) != TIME_INVALID_ARGUMENT ||
        time_elapsed(0U, 1U, NULL) != TIME_INVALID_ARGUMENT ||
        time_service(NULL, 0U, &report) != TIME_INVALID_ARGUMENT || !same_report(report, saved) ||
        time_service(&state, 0U, NULL) != TIME_INVALID_ARGUMENT || !same_state(state, before) ||
        time_service(&state, UINT32_C(2147483748), &report) != TIME_GAP_REJECTED ||
        !same_state(state, before) || !same_report(report, saved)) {
        return false;
    }
    state.remainder = state.period;
    before = state;
    if (time_service(&state, 110U, &report) != TIME_BAD_STATE || !same_state(state, before) ||
        !same_report(report, saved)) {
        return false;
    }
    state.period = 0U;
    before = state;
    return time_service(&state, 110U, &report) == TIME_BAD_STATE && same_state(state, before) &&
        same_report(report, saved);
}

/**
 * @brief Run active host checks and propagate output failure without assert.
 * @param[in] None.
 * @return Zero only when all checks and output complete successfully.
 */
int main(void)
{
    /** This optional main is excluded from reusable module compilation. **/
    if (!test_trace() || !test_bounds() || !test_rejection()) {
        return 1;
    }
    if (puts("PASS time: literal trace, wrap, bounds, rejection preservation") < 0 || fflush(stdout) != 0) {
        return 1;
    }
    return 0;
}
#endif
```



</details>

<details id="uart-source-time-h"><summary>完整time.h（与下载同字节）</summary>



```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file time.h
 * @author embedded-notes contributors
 * @brief Checked modulo32 observations and bounded periodic host policy.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_TIME_H
#define EMBEDDED_NOTES_TIME_H

#include <stdbool.h>
#include <stdint.h>

#if !defined(UINT32_MAX) || !defined(UINT64_MAX)
#error Exact-width uint32_t and uint64_t are required.
#endif

#define TIME_MAX_PERIOD UINT32_C(2147483647)
#define TIME_HALF_RANGE UINT32_C(2147483648)

typedef enum {
    TIME_OK = 0,
    TIME_INVALID_ARGUMENT,
    TIME_BAD_STATE,
    TIME_GAP_REJECTED
} TimeStatus;

typedef struct {
    uint32_t period;
    uint32_t lastObserved;
    uint32_t remainder;
} TimeState;

typedef struct {
    bool work;
    uint32_t missed;
    uint32_t releases;
    uint32_t elapsed;
    uint32_t remainder;
} TimeReport;

/*
 * Unit fixture: one tick = one millisecond. The caller promises a true forward
 * gap < 2^31 ticks between accepted observations. Equal samples cannot reveal
 * unseen complete wraps. Rejection of observed delta >= 2^31 is not a detector
 * of every violated real-gap promise. No signed-cast time ordering is used.
 *
 * All nonnull pointers must name real, live, correctly typed objects. Output
 * objects must be writable and disjoint from all other objects in the call.
 * init may receive fresh storage; other state calls require initialized fields.
 * Nonnull checking cannot validate dangling/forged pointers or false extents.
 * Single execution context, exclusive ownership, non-reentrant. No MMIO, heap,
 * callbacks, recursion, sleeps, retry or catch-up loops. Every operation has
 * constant work/storage. Failure preserves all named state and output fields.
 */

/**
 * @brief Initialize fresh storage without reading its prior contents.
 * @param[in,out] state Real writable object; no old initialization required.
 * @param[in] period Period 1..TIME_MAX_PERIOD ticks.
 * @param[in] now Initial observation, any uint32_t value.
 * @return TIME_OK or TIME_INVALID_ARGUMENT; failure preserves named fields.
 */
TimeStatus time_init(TimeState *state, uint32_t period, uint32_t now);

/**
 * @brief Return checked modulo32 difference under the caller's true-gap promise.
 * @param[in] then Last accepted observation.
 * @param[in] now Next forward observation.
 * @param[out] elapsed Real writable uint32_t; unchanged on failure.
 * @return TIME_OK, TIME_INVALID_ARGUMENT or TIME_GAP_REJECTED.
 */
TimeStatus time_elapsed(uint32_t then, uint32_t now, uint32_t *elapsed);

/**
 * @brief Advance phase once; report at most one work item and exact missed count.
 * @param[in,out] state Initialized period in range, remainder strictly < period.
 * @param[in] now Next observation under the true-gap promise.
 * @param[out] report Real writable object disjoint from state; no old read.
 * @return TIME_OK, TIME_INVALID_ARGUMENT, TIME_BAD_STATE or TIME_GAP_REJECTED.
 */
TimeStatus time_service(TimeState *state, uint32_t now, TimeReport *report);

#endif
```



</details>

<p>本地已安装GCC13.1.0经mcu-build自定义profile的validate→dry-run→build：严格正常/NDEBUG测试、三个独立模块和重复头文件调用者分别通过；完整字面夹具、分段、边界、拒绝快照、丢失、饱和与1000个四噪声poll实际执行。实际计数与源码哈希记录在本批证据，最终集成还需根全检与双轴审查，不能用本段替代它们。</p><p>主机-fstack-usage按函数记录加启发式/人工检查，仅说明当前编译器构建的局部情况；没有目标最大调用栈、运行时间、并发或硬件证明。</p>

## 独立十题：基础、故障与迁移 {#uart-practice-title}

<div class="practice-intro"><p>先离开活动状态再作答；每题完整自含，不依赖你刚才点了什么。基础解释、故障定位与迁移交错。隔一天更换数字重做，检验能否推导而非记住按钮位置。</p><div class="notes-toolbar"><button class="btn" id="print-questions" type="button">只打印十题</button></div></div><div class="exercise" id="uart-question-01">

### 01 基础｜115200为什么不是每秒115200个字节？ {#uart-question-01-title}

<p>给定普通8N1、无间隙、请求115200baud，不考虑软件瓶颈。一个字符占几个位时间，名义字符率和字符时间是多少？</p><details class="exercise-answer" id="uart-answer-01"><summary>展开完整解答与理由</summary>

<p>起始1+数据8+停止1=10个位时间；115200/10=11520字符/s，10/115200≈86.806µs/字符。这是请求速率下的名义值，未扣协议字段、空隙和实际分频误差，更不证明软件无丢失。</p>

</details>

</div><div class="exercise" id="uart-question-02">

### 02 基础｜手算一个周期命令 {#uart-question-02-title}

<p>帧A5 03 01 64 00 66，所有字节十六进制。解释六字节角色、XOR覆盖、周期，并说明何时才允许应用。</p><details class="exercise-answer" id="uart-answer-02"><summary>展开完整解答与理由</summary>

<p>A5起始不计XOR；LEN03声明3载荷；01是设周期opcode；64 00小端为100；03⊕01⊕64⊕00=66。收齐校验且命令LEN3、opcode01、周期1..1000均成立后，才复制SET_PERIOD100并标记新命令。</p>

</details>

</div><div class="exercise" id="uart-question-03">

### 03 基础｜帧长超过FIFO怎么办？ {#uart-question-03-title}

<p>容量4，初始空。完整六字节帧A5 03 01 64 00 66要接收成功，给出一个不触发FULL的分段顺序；说明载荷在哪里保留。</p><details class="exercise-answer" id="uart-answer-03"><summary>展开完整解答与理由</summary>

<p>先依次receive前四字节，poll排空最多4字节，到PAYLOAD且received2；再receive00和66，下一poll完成。保留部分载荷的是8字节解析器与LEN/received/XOR，不是让四槽FIFO容纳六字节。每调用不等待未来输入。</p>

</details>

</div><div class="exercise" id="uart-question-04">

### 04 故障｜A5在三个位置的角色 {#uart-question-04-title}

<p>分别在PAYLOAD、等待LEN、CHECKSUM读到A5。以421ms帧A5 03 01 A5 01 A6说明，哪些位置能重新起帧？</p><details class="exercise-answer" id="uart-answer-04"><summary>展开完整解答与理由</summary>

<p>PAYLOAD的A5是普通值，周期0x01A5=421，XOR为A6；等待LEN的A5是非法165，拒绝后消费一次，不能同时起帧；CHECKSUM的A5只作校验比较一次，匹配或拒绝都回SEEK。只有以后在SEEK读到的新A5才起帧，没有旧字节重扫。</p>

</details>

</div><div class="exercise" id="uart-question-05">

### 05 故障｜XOR正确仍拒绝 {#uart-question-05-title}

<p>已接受周期100ms、调用者命令对象仍是旧值。输入A5 03 01 E9 03 E8，XOR正确。应用周期和commandPresent应怎样，为什么不能只验XOR？</p><details class="exercise-answer" id="uart-answer-05"><summary>展开完整解答与理由</summary>

<p>小端0x03E9=1001超过1000，因此BAD_COMMAND、commandPresent=false，应用周期100与调用者旧命令字段保持。XOR只说明本规则校验自洽，不授予应用权限；还须专属长度、opcode和范围检查，且先查长度再读字段。</p>

</details>

</div><div class="exercise" id="uart-question-06">

### 06 故障｜19/20与回绕等号 {#uart-question-06-title}

<p>1tick=1ms；4294967290时刚解析A5，后续队列空。13和14各poll一次，真实两次观察间隔满足小于2^31。何时到期？同次若有新A5可怎样？</p><details class="exercise-answer" id="uart-answer-06"><summary>展开完整解答与理由</summary>

<p>模2^32从4294967290到13为19，仍LENGTH且age19；再到14增加1，累计20，先TIMEOUT回SEEK。随后排空若当前为A5，可仅处理一次起新帧。空poll也检查超时。若真实停顿有未见整圈，两个值不能识别，不能省略真间隔前提。</p>

</details>

</div><div class="exercise" id="uart-question-07">

### 07 迁移｜缓冲后缀与线上时间 {#uart-question-07-title}

<p>t=0解析A5 03 01 64，00 66实际t=1就在线上到达并进入字节FIFO，但服务一直到t=20才poll。无到达时间戳。会得到周期命令吗，能否据结果断言线上间隔20ms？</p><details class="exercise-answer" id="uart-answer-07"><summary>展开完整解答与理由</summary>

<p>不会。先用parser/service观察age20判到期并清残帧，后缀00 66在SEEK只作噪声，旧周期保留，无新命令。所有本poll字节共用now20；结果反映服务不及时，不是测得线间间隔。需要真实到达时限须另设计时间戳数据路径并验证硬件，不能从字节值恢复时间。</p>

</details>

</div><div class="exercise" id="uart-question-08">

### 08 故障｜第五个A5是否自动保留 {#uart-question-08-title}

<p>已在LENGTH，软件FIFO积满4字节，第5字节A5被receive。分别描述底层FIFO、UART上层、应用周期和下次空poll；后来怎样恢复？</p><details class="exercise-answer" id="uart-answer-08"><summary>展开完整解答与理由</summary>

<p>fifo_push先返回FULL并保持四字节及元数据；上层返回LOSS并明确清队列/残帧，失败A5也丢掉，不重试；已接受应用周期保持，下次空poll没有这个A5可解析。后来重新完整输入新帧并及时服务可恢复。此政策不保证任意噪声下最终同步，也不等同任意坏内存修复。</p>

</details>

</div><div class="exercise" id="uart-question-09">

### 09 迁移｜XOR通过能证明真实吗？ {#uart-question-09-title}

<p>100ms载荷01 64 00换成01 65 01，LEN仍3且校验66不变。求新周期并推导为何语义检查、重排拒绝或一次成功重同步仍不能证明完整性、认证或可靠恢复。</p><details class="exercise-answer" id="uart-answer-09"><summary>展开完整解答与理由</summary>

<p>03⊕01⊕65⊕01仍66，新小端周期0x0165=357ms仍合法，所以会接受错误命令。XOR对调换顺序也不敏感；语义检查只能排除部分值域，任意噪声仍可能形成合法帧。一次碰巧恢复不证明真实消息身份、所有错误都检测到或任意/恶意流最终恢复；生产CRC、安全、序号和重传需另立合同。</p>

</details>

</div><div class="exercise" id="uart-question-10">

### 10 迁移｜一次调用的工作与事件上限 {#uart-question-10-title}

<p>旧状态已等待状态帧校验，FIFO为03 00 A5 00（十六进制）。为什么应仍报告新状态命令？若另一个场景是在timeout前已有残帧，FIFO为A5 01 02 03，同次最多多少事件、多少新命令？</p><details class="exercise-answer" id="uart-answer-10"><summary>展开完整解答与理由</summary>

<p>前一场景第1字节03完成状态命令，随后噪声00、新A5、坏LEN00不能覆盖它；commandPresent保持真，命令值复制独立。后一场景timeout事件先出现，再4字节各一个事件，至多5项并接受一个状态命令。每poll预算4；即使旧帧第1字节完成，再完整最短帧还要4字节，只剩3，因此至多一个。饱和诊断保持UINT32_MAX并标saturated，有限工作不证明持续输入不丢失。</p>

</details>

</div>

## 版本、原厂依据与保留的缺口 {#uart-sources-title}

<p>核对日期2026-10-17。协议、图、代码、固定轨迹、策略和练习为本项目原创教学材料，不冒充厂商推荐协议，也不复制付费课程。以下技术论点限定实际阅读版本与范围。</p><ul class="source-list">
<li><a href="https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf">ST RM0090 历史归档，DocID018909 Rev5，2013-09</a>：实际阅读F405/407时钟§7.2 p213、USART§30.3 pp948–959、mute p970、状态/控制§30.6 pp987–991，关键p950/955/956/987/988整页图像核查。支持选定USART字符、PCLK域、IDLE、RXNE/ORE和限定清除条件。<strong>首选阅读：</strong>先读§30.3.3与§30.6.1，解释一次DR读取为何也改变接收状态，再对照本章四层边界。历史手册不冒充当前生产寄存器规范。</li>
<li><a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Src/stm32f4xx_hal_uart.c">ST HAL UART v1.8.5固定提交实现</a>：实际读frame-format表与additional reception的一个帧时间IDLE解释；未声称完整IRQ/DMA驱动审计。M/PCE条件与非mute范围仍须保留。</li>
<li><a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Inc/stm32f4xx_hal_uart.h">同提交UART头文件</a>：实际读标志与清除宏/别名/注释。它不能替代历史手册PE额外RXNE条件，更不能变成新系列ICR通用写法。</li>
<li><a href="https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf">WG14 N1570，2011-04-12委员会草案</a>：实际重读§6.2.5p9、§6.3.1.1/6.3.1.3、§7.20.1.1，支持无符号模运算、提升与可选精确宽度类型；不冒充购买的最终ISO标准，不提供真实时间间隔保证。</li></ul>
<p><strong>资料缺口：</strong>本轮当前官方RM请求有界失败、0字节；当前对应条款未读，仍用明确历史版本。DS8626 Rev12部分文字已核查而相关表像素未核；特定硅版本完整勘误/电气条件未审计。本章未把未读链接装饰成已验证依据。主机行为与硬件、真实线缆时间、吞吐和实体纸张检查分别报告。</p>

## 带着有界数据流继续采集终端 {#uart-next-title}


<p>本章新增的是字节→帧→命令的受限流程，不是实物通信验收。先返回10复核真实观察间隔和有限服务，再用本章速查定位拒绝原因。下一批12 I2C/SPI、13 ADC误差、14驱动故障仍待实现，研究不代表已交付，阶段03未完成。</p>
<p>如果卡住，可直接问助手：“A5为什么此时只是数据”“20ms到底观察了谁”“FULL之后哪一层清队列”或“XOR正确为什么不可信”，带上具体字节、phase和now，继续推导。</p>
<div class="next-links"><a href="../learn/timer-pwm.html">上一章10：定时器与期限</a><a href="../learn/uart-framing-reference.html">本章可打印速查</a><a href="../learn/bounded-fifo.html">复习05 FIFO</a><a href="../learn/engineering-map.html#stage-03">下一批与阶段地图</a></div>
