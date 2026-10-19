# 驱动错误与恢复速查 {#driver-recovery-reference}

本页为完整可搜索镜像；交互请打开同名独立阅读页。所有静态解释、原创图关系、完整答案、源版本和先决条件均保留。

<div class="content-section" id="recovery-overview" role="region" aria-labelledby="recovery-overview-title">

## 先核使用条件，再用速查 {#recovery-overview-title}


<p>同一采集终端的14速查；前置05/10/11/13。完整原因、原创图与十题见<a href="../learn/driver-recovery.html">正文</a>。这里所有数值都是原创value-only host政策，非HAL默认或物理恢复。无个人记录、硬件/纸张/WCET/吞吐/精度验证。每次调用有限不保证墙钟完成。</p>
</div>
<div class="content-section" id="recovery-diagnostics" role="region" aria-labelledby="recovery-diagnostics-title">

## 调用、事实与政策三层 {#recovery-diagnostics-title}


<p>RECOVERY_OK说明本次合法转移；snapshot category为IDLE/PENDING/READY/FAILED/QUARANTINED。BUSY、INVALID_ARGUMENT、BAD_STATE、TIME_REJECTED、TOKEN_EXHAUSTED、LOCKED等保持型拒绝不覆盖命名状态/输出。first/lastFailure保存cause、serviced phase、actual ADC status/phase、token、attempt、job/attempt年龄与uncertainty；cleanup/reason不覆盖。仅resultPresent读取新result，hasCommitted/committed仅历史。</p>
</div>
<div class="content-section" id="recovery-deadlines" role="region" aria-labelledby="recovery-deadlines-title">

## 3 / 20 / 5 / 100 / 20与相等过期 {#recovery-deadlines-title}


<p>最多3次总attempt（含初次）；每次20ms；匹配cleanup确认起等待5ms；接纳起100ms总期；cancel请求起20ms，包含于总期。顺序：全部参数/状态/input/time验证 → total≥100 → 当前cancel≥20或attempt≥20 → 重放资格/wait≥5 → 0..1 port action。READY/cleanup/stale均不能抢在期限前。接纳0动作；检测失败、取消接受、清理poll、重试start是不同调用。</p><div class="table-wrap" role="region" aria-label="独立边界例子，可横向滚动" tabindex="0"><table><caption>独立边界例子</caption><thead><tr><th scope="col">轨迹</th><th scope="col">结论</th></tr></thead><tbody><tr><td>start0/READY20</td><td>0动作，ATTEMPT_TIMEOUT，未接受新值</td></tr><tr><td>cancel21/cleanup41</td><td>cancel相等到期；隔离、ownership保留</td></tr><tr><td>cancel90/total100</td><td>total先于cancel10；隔离</td></tr><tr><td>cancel80/cleanup95/wait100</td><td>95时已释放；100总期限先于wait5，干净FAILED</td></tr><tr><td>cleanup22/wait26/27</td><td>26无start，27可一个start</td></tr></tbody></table></div>
</div>
<div class="content-section" id="recovery-timeline" role="region" aria-labelledby="recovery-timeline-title">

## 三次启动的固定核对表 {#recovery-timeline-title}


<div class="table-wrap" role="region" aria-label="服务观察，不是target时延，可横向滚动" tabindex="0"><table><caption>服务观察，不是target时延</caption><thead><tr><th scope="col">tick/ms</th><th scope="col">行为</th><th scope="col">attempt/token</th><th scope="col">actions</th></tr></thead><tbody><tr><td>0</td><td>接纳后另一次service START</td><td>1 / 1</td><td>1</td></tr><tr><td>20</td><td>ATTEMPT_DEADLINE → CANCEL_DUE</td><td>1 / 1</td><td>0</td></tr><tr><td>21</td><td>取消接受，仍拥有请求</td><td>1 / 1</td><td>1</td></tr><tr><td>22</td><td>匹配清理确认 → RETRY_WAIT</td><td>1 / 1</td><td>1</td></tr><tr><td>26</td><td>wait=4，不启动</td><td>1 / 1</td><td>0</td></tr><tr><td>27</td><td>wait=5，START</td><td>2 / 2</td><td>1</td></tr><tr><td>47</td><td>尝试到期</td><td>2 / 2</td><td>0</td></tr><tr><td>48</td><td>取消接受</td><td>2 / 2</td><td>1</td></tr><tr><td>49</td><td>清理确认</td><td>2 / 2</td><td>1</td></tr><tr><td>54</td><td>START</td><td>3 / 3</td><td>1</td></tr><tr><td>74</td><td>尝试到期</td><td>3 / 3</td><td>0</td></tr><tr><td>75</td><td>取消接受</td><td>3 / 3</td><td>1</td></tr><tr><td>76</td><td>清理确认 → ATTEMPTS_EXHAUSTED</td><td>3 / 3</td><td>1</td></tr><tr><td>77</td><td>终态，只复制状态</td><td>3 / 3</td><td>0</td></tr></tbody></table></div>
</div>
<div class="content-section" id="recovery-cleanup" role="region" aria-labelledby="recovery-cleanup-title">

## 资源释放与不可抹除的隔离 {#recovery-cleanup-title}


<p>cancel accepted→cleanup REQUESTED/resource OWNED。仅匹配cleanup confirmation→CONFIRMED/RELEASED。未确认的total/cancel期限→QUARANTINED/UNCONFIRMED，retain request/token，停止所有自动backend动作；submit/reset LOCKED，status/UART仍可用，不继续poll清理。已释放时total到期为干净FAILED。fresh init是新存储/新域/无旧活事件的前提，不是擦live quarantine入口。外部恢复另立合同；取消不撤销副作用。</p>
</div>
<div class="content-section" id="recovery-replay" role="region" aria-labelledby="recovery-replay-title">

## 重放资格必须同时满足 {#recovery-replay-title}


<p>已匹配清理 + wait≥5 + attempt&lt;3 + total&lt;100 + token可用 + 声明的replay-safe原因。READ/ASSIGN仅ATTEMPT_TIMEOUT/NACK/OVERRUN/LOST_REPLY；ARLO/PERMANENT停止。READ须稳定独占、无read-clear/FIFO；ASSIGN须相同已复制值。SAMPLE仅同输入host，原因ATTEMPT_TIMEOUT/ADC_BACKEND/ADC_TIMEOUT。INCREMENT从不自动重放：uncertain→UNSAFE_EFFECT；pre-effect→NOT_REPLAYABLE。失回复已提交counter0→1；独立盲重放再变2。1,000,000上限先拒绝效果。不能推广到硬件读写/线路恢复。</p>
</div>
<div class="content-section" id="recovery-tokens" role="region" aria-labelledby="recovery-tokens-title">

## 时间域与token域都有限 {#recovery-tokens-title}


<p>token正uint32 1..MAX，0表示未发；每start一个，严格递增，MAX后耗尽，不回绕。MAX−1 fixture只发两次，第二次清理后TOKEN_EXHAUSTED；reset不回拨。旧token completion只消费STALE，不提交、不释放当前请求。时间1tick=1ms，真实前向gap&lt;2^31是caller承诺；observed delta≥2^31先拒绝、全命名输出保持；等时合法、未见整圈不可检测。4294967290→4=10ms，→14=20ms先超时；终态年龄冻结。先widen累计，最大活动年龄2147483746可容于uint32。</p>
</div>
<div class="content-section" id="recovery-bounds" role="region" aria-labelledby="recovery-bounds-title">

## 固定工作、存储和对象契约 {#recovery-bounds-title}


<p>1 manager/1 backend/1 actual ADC；值复制，无retained caller payload指针、callbacks、堆、递归、sleep/等待循环。每service0..1 port、内部0..1 ADC lifecycle；3槽report未用清0；optional32行trace，第33行drop newest+typed result/drop计数，manager继续。七个uint32诊断饱和、attempted overflow置sticky flag，MAX seed只是有限测试。所有指针真实/live/typed，输出可写且与其余对象（含嵌套成员）不重叠；fresh init不读旧值，其余调用需已初始化、内部一致、独占单上下文非重入。metadata/null检查不验证forged/dangling/overlap/任意corruption。host .su/sizeof非目标最大栈。</p><p>FAKE register/counter/value≤1000000，READ/INCREMENT value0、adc字段0；ADC config fake seeds0，SAMPLE/value0经实际plan+quantize验证。config backend固定。NONE token0/causeNONE；其他事件positive token；FAIL只收相应模式cause，CONTRACT_FAULT内部生成。不可用事件不排队。clean terminal reset保留历史输出、producer committed、fake值、diagnostics、token史。</p>
</div>
<div class="content-section" id="recovery-terminal" role="region" aria-labelledby="recovery-terminal-title">

## 实际ADC与UART组合核对 {#recovery-terminal-title}


<p>实际adc_start + 三次独立adc_poll ACQUIRE/CONVERT/RESULT，从固定12bit/3300000/1650000µV请求得sample2048；report.phase为serviced相、state.phase为下一相。manager先timeout时ADC仍active：下次cancel-request仅接受、再下次active-only adc_cancel一次。producer error已inactive：后续cancel-poll只报保存事实，1 port/0 ADC calls，仍不得同次重试。异常producer return为有效CONTRACT_FAULT隔离，不能伪装保持型BAD_STATE或清理成功。</p><p>A5 01 02 03由4次真实uart_receive、一次真实uart_poll解析；commandPresent为新GET_STATUS，period100不变。应用另拷job，responsePresent只授权应用对象，无wire发送。每turn0..4字节/0..5 UART events +0..1 port action；独立component状态/reportValid无atomic rollback承诺。另fresh FAKE fixture在41隔离后42仍可status。浏览器JS活动不能代替此native证据。</p>
</div>
<div class="content-section" id="recovery-lab" role="region" aria-labelledby="recovery-lab-title">

## 下一次回忆与复核 {#recovery-lab-title}


<p>遮住正文表，独立写出cleanup22后的26/27、cancel21后的41与cleanup95后的100三个结果，再回正文核原因。学习并未因打开本页而被记录。遇到分歧可向agent提供tick/token/cause，请一起查先决条件。</p>
</div>
<div class="content-section" id="recovery-c" role="region" aria-labelledby="recovery-c-title">

## 按原目录下载；源码与说明完整一致 {#recovery-c-title}


<p>完整展示和可另存的真实终端consumer在<a href="../learn/driver-recovery.html#recovery-c">正文源码段</a>。以下native文件原样下载，借入依赖不可改名伪装14实现。现有工具通过mcu-build validate→dry-run→build，normal/NDEBUG分别编译七模块和重复header consumer、真实链接并执行，失败不运行stale artifact。没有安装升级。</p><ul><li><a href="../examples/driver-recovery/recovery.c" download>driver-recovery/recovery.c</a></li><li><a href="../examples/driver-recovery/recovery.h" download>driver-recovery/recovery.h</a></li><li><a href="../examples/driver-recovery/fake_sensor.c" download>driver-recovery/fake_sensor.c</a></li><li><a href="../examples/driver-recovery/fake_sensor.h" download>driver-recovery/fake_sensor.h</a></li><li><a href="../examples/driver-recovery/terminal.c" download>driver-recovery/terminal.c</a></li><li><a href="../examples/driver-recovery/terminal.h" download>driver-recovery/terminal.h</a></li><li><a href="../examples/driver-recovery/README.txt" download>driver-recovery/README.txt</a></li><li><a href="../examples/bounded-fifo/fifo.c" download>bounded-fifo/fifo.c（借入原文件）</a></li><li><a href="../examples/bounded-fifo/fifo.h" download>bounded-fifo/fifo.h（借入原文件）</a></li><li><a href="../examples/timer-pwm/time.c" download>timer-pwm/time.c（借入原文件）</a></li><li><a href="../examples/timer-pwm/time.h" download>timer-pwm/time.h（借入原文件）</a></li><li><a href="../examples/uart-framing/uart.c" download>uart-framing/uart.c（借入原文件）</a></li><li><a href="../examples/uart-framing/uart.h" download>uart-framing/uart.h（借入原文件）</a></li><li><a href="../examples/adc-sampling/adc.c" download>adc-sampling/adc.c（借入原文件）</a></li><li><a href="../examples/adc-sampling/adc.h" download>adc-sampling/adc.h（借入原文件）</a></li></ul>
</div>
<div class="content-section" id="recovery-practice" role="region" aria-labelledby="recovery-practice-title">

## 独立十题与全解析在正文 {#recovery-practice-title}


<p>本速查保留条件，不代替独立回忆。<a href="../learn/driver-recovery.html#recovery-practice">进入正文十题</a>，可只打印题目。普通打印展开说明后恢复原folds；实际打印与纸张仍需读者核验。</p>
</div>
<div class="content-section" id="recovery-sources" role="region" aria-labelledby="recovery-sources-title">

## 资料版本与限制 {#recovery-sources-title}


<ol class="source-list"><li><a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Src/stm32f4xx_hal_adc.c">ST HAL ADC，固定commit b6f0ed…</a>：研究者实际阅读HAL_ADC_PollForConversion与HAL_ADC_Stop；前者依赖HAL_GetTick，HAL_MAX_DELAY跳过期限，判定为elapsed&gt;Timeout并二次查flag。此处≥20是原创策略，非该HAL函数的替身；Stop还涉及injected转换，不能当私有regular-only恢复。</li><li><a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Src/stm32f4xx_hal_uart.c">同固定版本HAL UART</a>：实际有限阅读Receive、wait helper、IRQ错误分支和HAL_UART_AbortReceive_IT；特定接收abort的完成是callback，函数return不是完成。某些内部ORE路径被调用层flatten，故分类与原始detail应分开。不能推广到所有模式/版本；本例没有callback。</li><li><a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Src/stm32f4xx_hal_i2c.c">同固定版本HAL I2C</a>：研究者实际读wait/address helper、IsDeviceReady与DMAAbort。特定HAL_ERROR可由AF或timeout引起，需error bits；Trials是readiness probe的局部界限，非任意应用命令重放许可。READY handle不证明物理线路已恢复。</li><li><a href="https://www.st.com/resource/en/datasheet/dm00037051.pdf">DS8626 Rev12，March2026</a>与<a href="https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf">历史RM0090 Rev5，September2013</a>：13所选F407VG/LQFP100、假设wired VDDA=VREF+=3.3V、84MHz PCLK2÷4=21MHz的来源条件。当前DS有限文字已读；历史ADC页图由研究者看过，当前RM未获取、当前表格像素未核验，不是最新寄存器配置审计。</li><li><a href="https://www.st.com/resource/en/application_note/cd00211314-how-to-get-the-best-adc-accuracy-in-stm32-microcontrollers-stmicroelectronics.pdf">AN2834 Rev10，October2024</a>：有限error/settling文字阅读；末转移文字、图与数值冲突保留；典型4pF不是保证上限、源阻抗公式几何未目视。13的floor bins与本章固定2048是原创host算术，不是硬件精度证据。</li></ol><p>以上是研究者限定原文阅读的转述，不声称本章作者重新看过所有PDF像素或整本文档。历史RM、current DS/AN的text-only范围、最新RM/ADC silicon errata/板级参考/真实abort/采样/WCET仍有缺口；不重复下载装饰来源。I2C的ARLO、busy与物理bus-clear需实际ownership、其他controller排除、线状态、电源/复位权限及板级条件；本章不提供STOP/九脉冲/上电重置步骤。3/20/5/100/20、token域、quarantine与fake replay表全为原创教学政策。</p>
</div>
<div class="next-links"><a href="../learn/adc-sampling.html">上一章13：ADC输入条件</a><a href="../learn/driver-recovery-reference.html">本章可打印速查</a><a href="../learn/uart-framing.html">复习11：原始status帧</a><a href="../learn/interrupt-shared-data.html">下一单元15：异常、NVIC与共享数据</a></div>