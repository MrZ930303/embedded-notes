# 异常、NVIC与共享数据 {#interrupt-shared-data}

## 先把“发生了”与“执行了”分开 {#irq-route-title}

<div id="irq-route">
<p>前置：<a href="./c-bits-registers.html">位与寄存器</a>、<a href="./reset-runtime.html">复位到运行时</a>、<a href="./memory-budget.html">栈与内存预算</a>、<a href="./timer-pwm.html">有限时间服务</a>和<a href="./uart-framing.html">UART有界解析</a>。同一个可升级采集终端开始用中断搬交元数据：先知道谁有资格执行，再知道共享值是否仍代表两次工作。向量存在、外设原因发生、NVIC使能、进入处理程序是不同事实。</p><p>本章路线：用四位分组手算一个编码；沿 cause/pending/active 链走一次事件；在三个IRQ内观察抢占和返回；最后用显式解释器复现丢更新并保存旧mask。每段先讲因果，再预测一个有界步骤，输出可解释的优先级与共享数据轨迹。浏览器重放是JS，下载的公共C是另一个实际链接验证的host模型；两者均不执行MMIO、真实ISR、线程或DMA。</p><p>单元15仍是本地候选；12–14已审源码已进入公开 main dafffcc；该次 CI/Pages 与线上验收由父任务另验。个人掌握、课程覆盖、原生测试、站点、发布、硬件与实体纸张是独立状态。无JS仍可读完整解释、图、固定手算、源码与折叠答案；手动展开后可普通打印。没有账户、分数、答案保存或个人学习记录。</p>
</div>

## 四位优先级：字段、逻辑值与寄存器字节 {#irq-encoding-title}

<div id="irq-encoding">
<p>具名STM32F407头声明__NVIC_PRIO_BITS=4；这是所选器件的四位，不是所有Cortex-M的统一常量。<a href="https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf">PM0214 Rev10 March2020</a> §2.3.5–.6 p41及§4.4.5 pp228–229说明数值越小越紧迫。先比较抢占字段，子优先级只给同组pending排序；同组active不能因更小的sub被抢占。</p><p>沿<a href="https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/CMSIS/Core/Include/core_cm4.h">固定CMSIS5.9.0 core_cm4.h</a> 的实际NVIC_EncodePriority算法，严格规划器先要求原始AIRCR.PRIGROUP g∈0..7，再算p=min(4,7−g)、s=4−p=max(0,g+4−7)。合法字段pre∈0..2^p−1、sub∈0..2^s−1，零位字段只接受0。逻辑值=pre×2^s+sub；硬件字节=逻辑值×16。CMSIS NVIC_SetPriority接收未移位逻辑值0..15，再把四位放进高半字节。</p><div class="table-wrap" role="region" tabindex="0" aria-label="原始g，可横向滚动"><table><thead><tr><th scope="col">原始g</th><th scope="col">抢占位p</th><th scope="col">子位s</th><th scope="col">可重建的字段域</th></tr></thead><tbody><tr><td>0</td><td>4</td><td>0</td><td>pre0..15 / sub0</td></tr><tr><td>1</td><td>4</td><td>0</td><td>pre0..15 / sub0</td></tr><tr><td>2</td><td>4</td><td>0</td><td>pre0..15 / sub0</td></tr><tr><td>3</td><td>4</td><td>0</td><td>pre0..15 / sub0</td></tr><tr><td>4</td><td>3</td><td>1</td><td>pre0..7 / sub0..1</td></tr><tr><td>5</td><td>2</td><td>2</td><td>pre0..3 / sub0..3</td></tr><tr><td>6</td><td>1</td><td>3</td><td>pre0..1 / sub0..7</td></tr><tr><td>7</td><td>0</td><td>4</td><td>pre0 / sub0..15</td></tr></tbody></table></div><p>正常手算g5/pre2/sub1：2抢占位、2子位，2×4+1=9，寄存器0x90。把0x90直接再传给NVIC_SetPriority不是逻辑9的另一种写法。边界g7/pre0/sub15→15/0xF0；g3/pre5/sub0→5/0x50。g0..3有效分割相同，却仍是四个不同的原始AIRCR值。</p><p>故障手算g5/pre4/sub0：2位只能0..3，所以本课严格接口返回INVALID_PRIORITY、旧输出保持；CMSIS原函数把g与字段掩码，4被截成0，会编码0，并不会返回这里的错误。拒绝越界是原创课程政策。空值、非有限、负数、小数、指数/十六进制文本和越界整数在浏览器先拒绝；C的uint32_t宽参数在运算/转换前检查。</p><div class="lab"><form id="encode-form" novalidate><div class="fields"><label class="field" for="encode-group">原始PRIGROUP g<input id="encode-group" type="text" inputmode="numeric" value="5"></label><label class="field" for="encode-pre">抢占字段pre<input id="encode-pre" type="text" inputmode="numeric" value="2"></label><label class="field" for="encode-sub">子字段sub<input id="encode-sub" type="text" inputmode="numeric" value="1"></label><label class="field" for="encode-prediction">先预测本次结果<select id="encode-prediction"><option value="">先选择预测</option><option value="INVALID_PRIORITY">拒绝字段，保留旧行</option><option value="OK">编码合法，产生新行</option></select></label></div><div class="controls"><button class="btn primary" id="encode-apply" type="submit" disabled>提交预测并执行</button><button class="btn" id="encode-reset" type="button">恢复种子</button></div><p class="pending" id="encode-pending" role="status">种子待应用；先预测，尚无已接受结果。</p><p id="encode-next">下一步由当前种子决定；先阅读固定手算。</p><p class="feedback" id="encode-feedback" role="status">本轮尚无结果。</p></form><div class="applied-result" id="encode-result" hidden><p id="encode-state">尚无已接受结果。</p></div></div>
</div>

## pending是锁存，active是正在承担的工作 {#irq-states-title}

<div id="irq-states">
<p><a href="https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf">PM0214 Rev10 March2020</a> §2.3 pp37–43及§4.3 pp210–218把inactive/pending/active/active+pending区分开。enabled是准入条件，不是这四态之一。外设状态与外设中断使能是请求来源层；NVIC使能、pending锁存、CPU mask又各在不同层。下面的外设使能箭头是概念关系，模型的PULSE/LEVEL已是调用者提供的请求，不模拟外设寄存器。</p><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="从原因到可执行资格，可横向滚动"><svg viewBox="0 0 780 340" role="img" aria-labelledby="irq-chain-caption"><defs><marker id="irq-chain-caption-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0 0 L0 6 L7 3Z" fill="#22664f"/></marker></defs><rect x="20" y="20" width="220" height="65" rx="7" fill="#eef2e9" stroke="#526359"/><text x="32" y="52">外设原因 cause</text><rect x="290" y="20" width="215" height="65" rx="7" fill="#eef2e9" stroke="#526359"/><text x="302" y="52">外设使能 / 请求</text><line x1="240" y1="52" x2="290" y2="52" stroke="#22664f" stroke-width="2" marker-end="url(#irq-chain-caption-arrow)"/><rect x="555" y="20" width="205" height="65" rx="7" fill="#eef2e9" stroke="#526359"/><text x="567" y="52">pending锁存</text><line x1="505" y1="52" x2="555" y2="52" stroke="#22664f" stroke-width="2" marker-end="url(#irq-chain-caption-arrow)"/><rect x="20" y="140" width="270" height="65" rx="7" fill="#eef2e9" stroke="#526359"/><text x="32" y="172">NVIC enable + CPU mask</text><rect x="345" y="140" width="210" height="65" rx="7" fill="#eef2e9" stroke="#526359"/><text x="357" y="172">按组 / sub / IRQ选</text><line x1="290" y1="172" x2="345" y2="172" stroke="#22664f" stroke-width="2" marker-end="url(#irq-chain-caption-arrow)"/><rect x="605" y="140" width="155" height="65" rx="7" fill="#eef2e9" stroke="#526359"/><text x="617" y="172">active栈</text><line x1="555" y1="172" x2="605" y2="172" stroke="#22664f" stroke-width="2" marker-end="url(#irq-chain-caption-arrow)"/><line x1="657" y1="85" x2="657" y2="120" stroke="#22664f" stroke-width="2" marker-end="url(#irq-chain-caption-arrow)"/><line x1="657" y1="120" x2="450" y2="140" stroke="#22664f" stroke-width="2" marker-end="url(#irq-chain-caption-arrow)"/><rect x="90" y="255" width="600" height="60" rx="7" fill="#d5e7b3" stroke="#526359"/><text x="102" y="287">清pending ≠ 清cause；返回时仍有level cause → 再pending</text></svg></div><figcaption id="irq-chain-caption">从原因到可执行资格。原创模型关系图；锁存保留“至少待服务一次”，不会记住任意多个脉冲；mask与disable改变准入，不删除既有pending、active或外设工作。模型显式LEVEL false仅清cause，不顺带清pending。</figcaption></figure><p>锁存保留“至少待服务一次”，不会记住任意多个脉冲；mask与disable改变准入，不删除既有pending、active或外设工作。模型显式LEVEL false仅清cause，不顺带清pending。</p><p>独立手算：禁用IRQ6，注入两次pulse，得到pending6=true、pulses6=2、entries6=0；选择仍无entry。使能后单独select只进入一次，pending被清，entries变1。两次请求合并为一个锁存，并非排了两个处理程序。active6时再pulse可得到active+pending；clear_pending只清pending，active栈不变。</p><p>另一个level手算：LEVEL6=true置cause及pending；select6清本次pending；clear_pending不清cause；显式return6时若cause仍真，再锁存pending。若先LEVEL6=false再return，就不因cause重新锁存。这里只提供有名的原因事件，不提供统一外设ack清法；真正寄存器的清除顺序必须查所选外设。NVIC清pending本身不证明物理原因已消除。</p>
</div>

## 组控制抢占，sub和IRQ号控制待选顺序 {#irq-selection-title}

<div id="irq-selection">
<p>模型仅容纳实际头文件中的EXTI0_IRQn=6、TIM3_IRQn=29、USART2_IRQn=38。这些标签确认枚举身份，不表示配置了对应外设。三个独立记录和最多三层active栈；被挂起的处理程序仍active，只有栈顶是current。已经active的同一个身份不能重复进入。</p><p>每个select扫描三个候选：enabled且pending且非active，先通过mask，再要求抢占字段严格小于当前active的group；thread没有active group。合格候选取最小group、再最小sub、再最小IRQ号。每次最多进入一个。return只弹一个栈顶，不同时选择新pending。配置group/priority时只允许全部inactive且not pending，防止把既有工作换一种解释。</p><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="g5的38/29/6嵌套时序，可横向滚动"><svg viewBox="0 0 780 340" role="img" aria-labelledby="irq-timing-caption"><defs><marker id="irq-timing-caption-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0 0 L0 6 L7 3Z" fill="#22664f"/></marker></defs><text x="20" y="30">时间向右；每个箭头是一轮显式调用，不会在return内自动选入</text><text x="20" y="90">38 g2/s3</text><rect x="165" y="55" width="120" height="52" rx="7" fill="#d5e7b3" stroke="#526359"/><text x="177" y="87">active</text><rect x="295" y="55" width="180" height="52" rx="7" fill="#eef2e9" stroke="#526359"/><text x="307" y="87">被29挂起</text><rect x="485" y="55" width="115" height="52" rx="7" fill="#d5e7b3" stroke="#526359"/><text x="497" y="87">恢复</text><text x="20" y="164">29 g1/s3</text><rect x="295" y="128" width="180" height="52" rx="7" fill="#d5e7b3" stroke="#526359"/><text x="307" y="160">进入 → 返回</text><text x="20" y="240">6 g2/s0</text><rect x="165" y="202" width="435" height="52" rx="7" fill="#eef2e9" stroke="#526359"/><text x="177" y="234">pending：sub0不能抢占同组38</text><rect x="625" y="202" width="135" height="52" rx="7" fill="#d5e7b3" stroke="#526359"/><text x="637" y="234">38返回后入</text><line x1="285" y1="112" x2="295" y2="128" stroke="#22664f" stroke-width="2" marker-end="url(#irq-timing-caption-arrow)"/><line x1="475" y1="128" x2="485" y2="112" stroke="#22664f" stroke-width="2" marker-end="url(#irq-timing-caption-arrow)"/><text x="20" y="310">stack [38] → [38,29] → [38] → [] → [6]</text></svg></div><figcaption id="irq-timing-caption">g5的38/29/6嵌套时序。原创模型关系图；g5中先38=(2,3)进入；6=(2,0)虽sub更小仍等待；29=(1,3)可抢占38。29返回恢复38；38返回后再独立select才进入6。</figcaption></figure><p>g5中先38=(2,3)进入；6=(2,0)虽sub更小仍等待；29=(1,3)可抢占38。29返回恢复38；38返回后再独立select才进入6。</p><p>正常字面顺序：pulse38→select38→pulse6→select NONE→pulse29→select29→return29→return38→select6。每一步区分事件和选择。边界：thread三者group/sub完全相同且pending，依IRQ号依次6、29、38，每次需要独立return。最大嵌套另设38group2、29group1、6group0，依次进入得到[38,29,6]；域里不存在第四个身份，同一身份也不能重入。</p><p>下面的有限事件表用同一个JS选择规则真实推进。选择场景后输入仍“待应用”，旧结果保留“已应用输入”标签；预测的是下一轮事件，CHANGED本身不表示新entry。到终点后多按不产生动作；重置才回种子。历史最多32复制行；第33行丢弃并计数，选择仍可继续，原生测试实际检查这一边界。</p><div class="lab"><form id="select-form" novalidate><div class="fields"><label class="field" for="select-scenario">有限场景<select id="select-scenario"><option value="nested">g5：同组等待与高组抢占</option><option value="disabled">禁用、双pulse与单entry</option><option value="level">level原因与return再pending</option><option value="tie">thread同字段按IRQ号</option><option value="depth">最多三层嵌套</option><option value="base">g3 BASEPRI阈值</option></select></label><label class="field" for="select-prediction">先预测本次结果<select id="select-prediction"><option value="">先选择预测</option><option value="NO_ENTRY">本轮选择无人进入</option><option value="ENTERED">本轮选择一人进入</option><option value="RETURNED">本轮返回一层活动</option><option value="CHANGED">本轮只改变输入事实</option></select></label></div><div class="controls"><button class="btn primary" id="select-apply" type="submit" disabled>提交预测并走一步</button><button class="btn" id="select-reset" type="button">恢复种子</button></div><p class="pending" id="select-pending" role="status">种子待应用；先预测，尚无已接受结果。</p><p id="select-next">下一步由当前种子决定；先阅读固定手算。</p><p class="feedback" id="select-feedback" role="status">本轮尚无结果。</p></form><div class="applied-result" id="select-result" hidden><p id="select-state">尚无已接受结果。</p></div></div>
</div>

## mask是准入条件，保存与恢复是调用者合同 {#irq-masks-title}

<div id="irq-masks">
<p><a href="https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf">PM0214 Rev10 March2020</a> §2.1.3 pp23–26、CPS p182、MSR p187及<a href="https://arm-software.github.io/CMSIS_5/Core/html/group__Core__Register__gr.html">CMSIS寄存器文档（页面自报5.6.0）</a>给出范围；机器实现另核固定5.9.0 cmsis_gcc.h。PRIMASK1阻止可配置优先级异常进入，包括这里的外部IRQ和可配置fault；它不取消active、不停止DMA/外设、不屏蔽NMI或HardFault。</p><div class="table-wrap" role="region" tabindex="0" aria-label="机制，可横向滚动"><table><thead><tr><th scope="col">机制</th><th scope="col">范围 / 表示</th><th scope="col">本页执行边界</th></tr></thead><tbody><tr><td>PRIMASK</td><td>0/1；屏蔽可配置异常进入</td><td>只模拟三条external IRQ</td></tr><tr><td>BASEPRI</td><td>0无阈值；非0为原始寄存器高半字节</td><td>仅g3接收0x10..0xF0；其余group只接收0</td></tr><tr><td>FAULTMASK</td><td>有效优先级到−1，连HardFault激活也可阻止；NMI仍可进入</td><td>仅静态比较，不执行fault架构</td></tr><tr><td>固定异常</td><td>NMI−2、HardFault−1；Reset特殊复位过程</td><td>不属于可配置0..15 IRQ域</td></tr></tbody></table></div><p>g3四位全作抢占位。BASEPRI raw0x50时逻辑4通过、5等待，仍须enabled/pending及当前组条件；raw0清阈值。__set_BASEPRI接原始字节，不像NVIC_SetPriority再次左移。本模型拒绝低半字节非0、越界、以及g5等带子级组的非0阈值，不发明全分组比较器。PRIMASK1在这个例子里让4/5都等待。mask变化从不顺带ack cause。</p><p>mask写入是特权操作；FAULTMASK通常在异常返回清除，NMI返回有例外，fault仍可能升级/lockup。完整Arm架构边缘未核；这里不运行NMI/HardFault/FAULTMASK/Reset模拟，也不提供在这些上下文随意改mask的脚本。</p><p>临界区成立要同时满足：所有冲突CPU上下文都被选定mask覆盖；区域和出口有界；进入前保存原mask并在每条出口恢复。独立手算saved0→inside1→exit0；saved1→inside1→exit1。错误的固定exit0会把调用者已有屏蔽解除。DMA/NMI/HardFault等未覆盖writer仍需独立所有权分析；一个计数临界区不自动形成完整DMA多字段快照。</p><div class="lab"><form id="mask-form" novalidate><div class="fields"><label class="field" for="mask-saved">进入前保存的PRIMASK<input id="mask-saved" type="text" inputmode="numeric" value="1"></label><label class="field" for="mask-prediction">先预测本次结果<select id="mask-prediction"><option value="">先选择预测</option><option value="0">退出恢复到0</option><option value="INVALID">输入不合法拒绝</option><option value="1">退出恢复到1</option></select></label></div><div class="controls"><button class="btn primary" id="mask-apply" type="submit" disabled>提交预测并执行</button><button class="btn" id="mask-reset" type="button">恢复种子</button></div><p class="pending" id="mask-pending" role="status">种子待应用；先预测，尚无已接受结果。</p><p id="mask-next">下一步由当前种子决定；先阅读固定手算。</p><p class="feedback" id="mask-feedback" role="status">本轮尚无结果。</p></form><div class="applied-result" id="mask-result" hidden><p id="mask-state">尚无已接受结果。</p></div></div>
</div>

## volatile没有把读、计算、写回合成一次操作 {#irq-rmw-title}

<div id="irq-rmw">
<p>counter++包含读取旧值、计算加1、写回。即便读写各自满足某个目标的单次访问条件，也不等于整个RMW不可分割。<a href="https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf">N1570 April2011公开委员会草案</a> §6.7.3/脚注134规定volatile访问按抽象机/实现合同处理，没有把RMW合成一个动作；它不是最终ISO文本。§5.1.2.4说明真实多线程普通对象data race会成为未定义行为。这里绝不用真实无保护线程去“保证得到1”。</p><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="丢更新与串行更新的因果对照，可横向滚动"><svg viewBox="0 0 780 340" role="img" aria-labelledby="irq-rmw-caption"><defs><marker id="irq-rmw-caption-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0 0 L0 6 L7 3Z" fill="#22664f"/></marker></defs><text x="24" y="30">显式单上下文事件；箭头表示模型动作，不是宿主并发执行</text><rect x="20" y="65" width="350" height="55" rx="7" fill="#eef2e9" stroke="#526359"/><text x="32" y="97">foreground READ x0 → local0</text><rect x="410" y="130" width="350" height="55" rx="7" fill="#d5e7b3" stroke="#526359"/><text x="422" y="162">IRQ READ0 → COMPUTE1 → WRITE1</text><line x1="370" y1="95" x2="410" y2="150" stroke="#22664f" stroke-width="2" marker-end="url(#irq-rmw-caption-arrow)"/><rect x="20" y="210" width="350" height="55" rx="7" fill="#eef2e9" stroke="#526359"/><text x="32" y="242">foreground COMPUTE1 → WRITE1</text><line x1="410" y1="165" x2="370" y2="235" stroke="#22664f" stroke-width="2" marker-end="url(#irq-rmw-caption-arrow)"/><text x="420" y="245">两次完成，x=1，lost=1</text><text x="24" y="315">串行对照：F READ/COMPUTE/WRITE1 → I READ1/COMPUTE/WRITE2 → x2</text></svg></div><figcaption id="irq-rmw-caption">丢更新与串行更新的因果对照。原创模型关系图；foreground保留的旧0并不会因IRQ写1自动更新；它的最终write1覆盖了IRQ的贡献。volatile不改变这条显式调度。串行两次完整增量才得到2。</figcaption></figure><p>foreground保留的旧0并不会因IRQ写1自动更新；它的最终write1覆盖了IRQ的贡献。volatile不改变这条显式调度。串行两次完整增量才得到2。</p><p>解释器只有foreground/IRQ两actor，各按READ→COMPUTE→WRITE→DONE推进，每次一步，共六步。丢更新字面序列F.READ0、I.READ0、I.COMPUTE1、I.WRITE1、F.COMPUTE1、F.WRITE1：最终1、完成2、lost1。串行F三步再I三步：最终2、lost0。重复READ、跳过COMPUTE、错误actor、终点后调用都在变更前拒绝；这不是抢占硬件的时间预测。</p><p>atomic_fetch_add对该原子对象提供原子RMW意义；relaxed不发布不相关字段。目标是否支持相应类型、宽度/对齐、库是否lock-free、最坏耗时与ISR约定仍未核。host支持不能证明目标ISR可用。compiler barrier只约束编译器重排；DMB约束显式内存访问顺序，DSB还等前序访问完成，ISB刷新指令取执行上下文。它们都不是互斥、缓存维护、缓冲容量或consumer完成信号；原子ready flag也不让DMA遵循C11线程同步。</p><div class="lab"><form id="rmw-form" novalidate><div class="fields"><label class="field" for="rmw-scenario">六步调度<select id="rmw-scenario"><option value="lost">交错：旧值覆盖</option><option value="serial">串行：完整增量</option></select></label><label class="field" for="rmw-prediction">先预测本次结果<select id="rmw-prediction"><option value="">先选择预测</option><option value="2">本轮后x为2</option><option value="0">本轮后x为0</option><option value="1">本轮后x为1</option></select></label></div><div class="controls"><button class="btn primary" id="rmw-apply" type="submit" disabled>提交预测并走一步</button><button class="btn" id="rmw-reset" type="button">恢复种子</button></div><p class="pending" id="rmw-pending" role="status">种子待应用；先预测，尚无已接受结果。</p><p id="rmw-next">下一步由当前种子决定；先阅读固定手算。</p><p class="feedback" id="rmw-feedback" role="status">本轮尚无结果。</p></form><div class="applied-result" id="rmw-result" hidden><p id="rmw-state">尚无已接受结果。</p></div></div>
</div>

## 有界模型、真实ISR与异常栈分开证明 {#irq-work-title}

<div id="irq-work">
<p>本模型每次只注入一个事实、进入一个IRQ或返回一层；没有handler callback、无限while(pending)、睡眠、printf或等待consumer。真实ISR的条件性策略是快照并按所选外设规则确认原因、发布有界元数据，再让前台处理。前台仍须明确最多K项、队列满政策、服务频率与诊断饱和。短代码看起来快，不能替代最大工作量和真实WCET证据。</p><p>沿单元07/08：异常入口保存、嵌套、被调用函数都会增加栈需求；基本帧、对齐、FP上下文和lazy preservation条件不同。PM0214 pp42–43的基本8word不是“每IRQ最大32bytes”。三层有限栈仅是模型身份容量，不是MCU栈预算。作者用GCC宿主.su和官方启发式栈扫描加人工固定存储/循环/调用检查；每函数宿主栈量不是目标或全程序最坏栈证明，硬件未执行。</p>
</div>

## 完整公共C、最小consumer与资源合同 {#irq-c-title}

<div id="irq-c">
<p>下载irq.c、irq.h、README.txt并放在同一目录。模块没有main；README提供可直接另存consumer.c的完整BEGIN/END文本、严格C11命令、运行方法和成功输出，不引用未提供的文件。原生作者验收实际从README抽取并分别编译链接normal/NDEBUG，也有更完整的独立字面caller。</p><p>所有对象必须是真实、存活、初始化的类型对象，由一个上下文独占且非重入；本模型不是ISR/DMA/task安全队列。fresh initializer只用于没有live owner或旧事件的新存储，它验证输入后初始化全部命名字段，不会读取未定旧值。输入、state、history、输出必须各有足够尺寸且互不重叠。NULL/枚举/范围及可检查元数据可以拒绝；伪造指针、悬空、假extent、任意内存破坏或别名不声称可检测。</p><p>非OK返回保留全部命名接受状态、计数、history和输出；报告只在本次OK时新鲜。SELECT返回OK/NO_ENTRY仍是新的零entry事实；旧report保留ENTERED不授权再次消费。active/pending/配置状态拒绝与合法的事实变化分开。count/data历史不拥有执行进度，unused stack/report rows按命名字段初始化。所有整数输入先在宽类型检查，再运算；没有堆、递归、睡眠、阻塞I/O、callback或无界扫描。</p><div class="table-wrap" role="region" tabindex="0" aria-label="公共操作 / 对象，可横向滚动"><table><thead><tr><th scope="col">公共操作 / 对象</th><th scope="col">固定容量或每次工作</th><th scope="col">输出/失败</th></tr></thead><tbody><tr><td>irq_encode / mask_roundtrip</td><td>常量算术；无循环</td><td>仅OK给新输出</td></tr><tr><td>irq_init / configure</td><td>恰好3优先级；初始化至多3记录</td><td>fresh不读旧字段；configure拒绝pending/active</td></tr><tr><td>irq_apply</td><td>校验至多3栈+3记录；select至多3候选；报告3记录</td><td>最多1entry或1return，非二者；拒绝保持</td></tr><tr><td>IrqModel</td><td>3线路、3 active身份、6个uint32诊断</td><td>pulses与entries独立，计数饱和</td></tr><tr><td>IrqHistory（可选）</td><td>32个复制IrqReport，count0..32</td><td>每accepted apply至多1行；row33丢行仍推进</td></tr><tr><td>RmwModel / step</td><td>2actor×3stage，共6步；无内部循环</td><td>OK新report；终点TERMINAL保持</td></tr><tr><td>诊断增量</td><td>UINT32_MAX−1→MAX/false；再尝试→MAX/true</td><td>sticky饱和不是精确总量或速率</td></tr></tbody></table></div>
</div>


### 完整 irq.h {#irq-source-irq-h}

[原生下载 irq.h](/examples/interrupt-shared-data/irq.h)

```text
/******************************************************************************
 * Copyright (C) 2024 EternalChip, Inc.(Gmbh) or its affiliates.
 *
 * All Rights Reserved.
 *
 * @file irq.h
 * @author OpenAI | R&D Dept. | EternalChip 立芯嵌入式
 * @brief Original, single-context host teaching models; no target instructions.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#ifndef INTERRUPT_SHARED_DATA_IRQ_H
#define INTERRUPT_SHARED_DATA_IRQ_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define IRQ_LINE_COUNT 3U
#define IRQ_HISTORY_CAPACITY 32U
#define IRQ_NONE 0U

/* All objects are exclusively owned, non-reentrant, live, typed and initialized.
 * Caller may inspect named fields but must not edit them. Fresh init requires
 * fresh storage with no live operation/old event. It does not read old bytes.
 * Every pointer names sufficient actual storage, alive through the call.
 * Inputs, state, optional history and writable outputs must be pairwise disjoint.
 * Null/domain/checkable metadata reject; dangling/forged pointers, caller aliasing
 * and arbitrary corruption cannot be detected. No heap, MMIO, threads or ISR.
 * Non-OK returns preserve all named fields, history and outputs. A report is fresh
 * ONLY on IRQ_OK; a retained report after rejection is historical, even if its
 * event says ENTERED. OK NO_ENTRY is fresh evidence of zero entry this call.
 */
typedef enum { IRQ_OK, IRQ_INVALID_ARGUMENT, IRQ_INVALID_PRIORITY, IRQ_BAD_STATE,
               IRQ_BUSY, IRQ_TERMINAL } IrqStatus;
typedef struct { uint32_t preempt; uint32_t sub; } IrqPriority;
typedef struct { uint32_t preemptBits; uint32_t subBits; uint32_t logical;
                 uint32_t registerByte; } IrqEncoding;
typedef struct { bool enabled; bool pending; bool active; bool cause;
                 IrqPriority priority; uint32_t pulses; uint32_t entries; } IrqLine;
typedef struct { uint32_t group; IrqLine lines[IRQ_LINE_COUNT];
                 uint32_t stack[IRQ_LINE_COUNT]; size_t depth;
                 uint32_t primask; uint32_t basepri; bool saturated; } IrqModel;
typedef enum { IRQ_ENABLE, IRQ_PULSE, IRQ_LEVEL, IRQ_CLEAR_PENDING,
               IRQ_SELECT, IRQ_RETURN, IRQ_MASKS } IrqOperation;
/* ENABLE/LEVEL: irq=6/29/38,value=0/1,extra=0. PULSE/CLEAR: value=extra=0.
 * MASKS: irq=0,value=PRIMASK0/1,extra=raw BASEPRI. SELECT/RETURN: all three0.
 * LEVEL supplies a cause fact, not an MMIO acknowledgement. False cause leaves
 * the pending latch unchanged. Return with cause true explicitly re-pends.
 */
typedef struct { IrqOperation operation; uint32_t irq; uint32_t value; uint32_t extra; } IrqCommand;
typedef enum { IRQ_CHANGED, IRQ_NO_ENTRY, IRQ_ENTERED, IRQ_RETURNED } IrqEvent;
typedef struct { IrqEvent event; uint32_t irq; size_t depth;
                 uint32_t enabledBits; uint32_t pendingBits;
                 uint32_t activeBits; uint32_t causeBits; } IrqReport;
/* Bits0/1/2 consistently identify IRQ6/29/38; unused stack/report slots are0.
 * History is optional caller-owned copied diagnostics, never execution storage.
 * First32 accepted apply calls append one row each. Row33+ drops only that row,
 * increments droppedRows saturating, and execution still advances. */
typedef struct { IrqReport rows[IRQ_HISTORY_CAPACITY]; size_t count;
                 uint32_t droppedRows; bool saturated; } IrqHistory;
typedef enum { RMW_READ, RMW_COMPUTE, RMW_WRITE, RMW_DONE } RmwStage;
typedef struct { uint32_t value; uint32_t readValue[2]; uint32_t computed[2];
                 RmwStage stage[2]; uint32_t steps; uint32_t completed; } RmwModel;
typedef struct { uint32_t value; uint32_t steps; uint32_t completed;
                 uint32_t lost; bool terminal; } RmwReport;
typedef struct { uint32_t saved; uint32_t inside; uint32_t restored; } IrqMaskRoundtrip;

/** @brief Strict four-bit planner; unlike CMSIS it rejects rather than masks.
 * @param[in] group0..7, preempt/sub allocated-width values.
 * @param[Out] output fresh only on IRQ_OK. @return IrqStatus. */
IrqStatus irq_encode(uint32_t group, uint32_t preempt, uint32_t sub, IrqEncoding *output);
/** @brief Fresh model init; lines enabled, no pending/active/cause/counters.
 * @param[in] priorities exactly3 valid values, copied; group0..7.
 * @param[Out] model fresh initialized storage. @return IrqStatus. */
IrqStatus irq_init(IrqModel *model, uint32_t group, const IrqPriority priorities[IRQ_LINE_COUNT]);
/** @brief Replace group/priorities only when all lines inactive and not pending.
 * @param[in] priorities3, group compatible with current mask.
 * @param[Out] model accepted state on OK. @return IrqStatus. */
IrqStatus irq_configure(IrqModel *model, uint32_t group, const IrqPriority priorities[IRQ_LINE_COUNT]);
/** @brief Apply one event, at most one entry OR one return; no handler execution.
 * @param[in] command complete and validated; model initialized.
 * @param[Out] report fresh on OK; optional history initialized, otherwise NULL.
 * @return IrqStatus. Rejection preserves every named object. */
IrqStatus irq_apply(IrqModel *model, const IrqCommand *command, IrqReport *report, IrqHistory *history);
/** @brief Fresh empty optional history, including every unused row.
 * @param[in] None. @param[Out] history fresh storage. @return IrqStatus. */
IrqStatus irq_history_init(IrqHistory *history);
/** @brief Saturate a diagnostic; sticky only after attempted increment at MAX.
 * @param[in] initialized disjoint objects. @param[Out] value and sticky flag.
 * @return IrqStatus. This standalone seam permits a finite near-MAX fixture. */
IrqStatus irq_diagnostic_increment(uint32_t *value, bool *saturated);
/** @brief Fresh two-actor RMW interpreter, x0, both actors at READ.
 * @param[in] None. @param[Out] model fresh storage. @return IrqStatus. */
IrqStatus rmw_init(RmwModel *model);
/** @brief Execute exactly the selected actor's next legal stage.
 * @param[in] actor0 foreground/1 IRQ, stage READ/COMPUTE/WRITE.
 * @param[Out] report fresh only on OK. @return IrqStatus. Six accepted steps max. */
IrqStatus rmw_step(RmwModel *model, uint32_t actor, RmwStage stage, RmwReport *report);
/** @brief Pure saved-mask illustration, never changes host interrupt state.
 * @param[in] saved0/1. @param[Out] output fresh on OK. @return IrqStatus. */
IrqStatus irq_mask_roundtrip(uint32_t saved, IrqMaskRoundtrip *output);

#endif
```

### 完整 irq.c {#irq-source-irq-c}

[原生下载 irq.c](/examples/interrupt-shared-data/irq.c)

```text
/******************************************************************************
 * Copyright (C) 2024 EternalChip, Inc.(Gmbh) or its affiliates.
 *
 * All Rights Reserved.
 *
 * @file irq.c
 * @author OpenAI | R&D Dept. | EternalChip 立芯嵌入式
 * @brief Original deterministic host IRQ and RMW teaching models.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#include "irq.h"

/** @brief Map the complete external IRQ domain to slots.
 * @param[in] irq external number. @param[Out] None. @return 0..2 or3. */
static size_t irq_index(uint32_t irq)
{
    /**
    * IRQ0 is deliberately not a configurable line in this model.
    **/
    switch (irq) {
        case 6U: return 0U;
        case 29U: return 1U;
        case 38U: return 2U;
        default: return IRQ_LINE_COUNT;
    }
}

/** @brief Resolve a validated slot. @param[in] index0..2.
 * @param[Out] None. @return External IRQ number. */
static uint32_t irq_number(size_t index)
{
    /**
    * This array is immutable; callers validate index before lookup.
    **/
    static const uint32_t numbers[IRQ_LINE_COUNT] = {6U, 29U, 38U};
    return numbers[index];
}

/** @brief Check the intentionally restricted threshold model.
 * @param[in] group, primask, basepri wide values. @param[Out] None. @return Validity. */
static bool irq_masks_valid(uint32_t group, uint32_t primask, uint32_t basepri)
{
    /**
    * Only g3 gives the all-preemption-bit BASEPRI example taught here.
    **/
    return primask <= 1U && basepri <= 240U && (basepri % 16U) == 0U &&
        (basepri == 0U || group == 3U);
}

/** @brief Validate all three priority fields before mutation.
 * @param[in] group and live priorities. @param[Out] None. @return Validity. */
static bool irq_priorities_valid(uint32_t group, const IrqPriority priorities[IRQ_LINE_COUNT])
{
    IrqEncoding encoding;
    size_t index;
    /**
    * Each planner output is local; rejection cannot leak a partial config.
    **/
    for (index = 0U; index < IRQ_LINE_COUNT; index++) {
        if (irq_encode(group, priorities[index].preempt, priorities[index].sub, &encoding) != IRQ_OK) {
            return false;
        }
    }
    return true;
}

/** @brief Check named initialized metadata, not arbitrary pointer validity.
 * @param[in] model initialized object. @param[Out] None. @return Validity. */
static bool irq_model_valid(const IrqModel *model)
{
    size_t index;
    IrqEncoding encoding;
    bool found[IRQ_LINE_COUNT] = {false, false, false};
    /**
    * The fixed stack must agree with active flags and strict nested groups.
    **/
    if (model->group > 7U || model->depth > IRQ_LINE_COUNT ||
        !irq_masks_valid(model->group, model->primask, model->basepri)) {
        return false;
    }
    for (index = 0U; index < model->depth; index++) {
        size_t slot = irq_index(model->stack[index]);
        if (slot == IRQ_LINE_COUNT || found[slot]) {
            return false;
        }
        if (index > 0U && model->lines[slot].priority.preempt >=
            model->lines[irq_index(model->stack[index - 1U])].priority.preempt) {
            return false;
        }
        found[slot] = true;
    }
    for (index = 0U; index < IRQ_LINE_COUNT; index++) {
        if (model->lines[index].active != found[index] ||
            irq_encode(model->group, model->lines[index].priority.preempt,
                       model->lines[index].priority.sub, &encoding) != IRQ_OK ||
            (index >= model->depth && model->stack[index] != IRQ_NONE)) {
            return false;
        }
    }
    return true;
}

/** @brief Strict planner. @param[in] group, preempt, sub.
 * @param[Out] output on OK only. @return IrqStatus. */
IrqStatus irq_encode(uint32_t group, uint32_t preempt, uint32_t sub, IrqEncoding *output)
{
    /**
    * Validate in the wide input type before assigning any output field.
    **/
    IrqEncoding result;
    if (output == NULL) {
        return IRQ_INVALID_ARGUMENT;
    }
    if (group > 7U) {
        return IRQ_INVALID_PRIORITY;
    }
    result.preemptBits = (group < 4U) ? 4U : 7U - group;
    result.subBits = 4U - result.preemptBits;
    if (preempt >= (UINT32_C(1) << result.preemptBits) || sub >= (UINT32_C(1) << result.subBits)) {
        return IRQ_INVALID_PRIORITY;
    }
    result.logical = (preempt << result.subBits) | sub;
    result.registerByte = result.logical << 4U;
    *output = result;
    return IRQ_OK;
}

/** @brief Fresh init without reading old storage. @param[in] group and priorities3.
 * @param[Out] model. @return IrqStatus. */
IrqStatus irq_init(IrqModel *model, uint32_t group, const IrqPriority priorities[IRQ_LINE_COUNT])
{
    IrqModel fresh = {0};
    size_t index;
    /**
    * The fresh-storage premise is a caller lifetime obligation.
    **/
    if (model == NULL || priorities == NULL) {
        return IRQ_INVALID_ARGUMENT;
    }
    if (!irq_priorities_valid(group, priorities)) {
        return IRQ_INVALID_PRIORITY;
    }
    fresh.group = group;
    for (index = 0U; index < IRQ_LINE_COUNT; index++) {
        fresh.lines[index].enabled = true;
        fresh.lines[index].priority = priorities[index];
    }
    *model = fresh;
    return IRQ_OK;
}

/** @brief Checked idle reconfiguration. @param[in] group, priorities3.
 * @param[Out] model on OK. @return IrqStatus. */
IrqStatus irq_configure(IrqModel *model, uint32_t group, const IrqPriority priorities[IRQ_LINE_COUNT])
{
    size_t index;
    /**
    * Existing pending state must never be reinterpreted under another split.
    **/
    if (model == NULL || priorities == NULL) {
        return IRQ_INVALID_ARGUMENT;
    }
    if (!irq_model_valid(model)) {
        return IRQ_BAD_STATE;
    }
    if (!irq_priorities_valid(group, priorities) || !irq_masks_valid(group, model->primask, model->basepri)) {
        return IRQ_INVALID_PRIORITY;
    }
    for (index = 0U; index < IRQ_LINE_COUNT; index++) {
        if (model->lines[index].pending || model->lines[index].active) {
            return IRQ_BUSY;
        }
    }
    model->group = group;
    for (index = 0U; index < IRQ_LINE_COUNT; index++) {
        model->lines[index].priority = priorities[index];
    }
    return IRQ_OK;
}

/** @brief Saturating diagnostic operation. @param[in] Initialized objects.
 * @param[Out] value, saturated. @return IrqStatus. */
IrqStatus irq_diagnostic_increment(uint32_t *value, bool *saturated)
{
    /**
    * Exactly reaching MAX is still exact; only a further attempt is clipped.
    **/
    if (value == NULL || saturated == NULL) {
        return IRQ_INVALID_ARGUMENT;
    }
    if (*value == UINT32_MAX) {
        *saturated = true;
    } else {
        (*value)++;
    }
    return IRQ_OK;
}

/** @brief Fresh history including unused slots. @param[in] None.
 * @param[Out] history. @return IrqStatus. */
IrqStatus irq_history_init(IrqHistory *history)
{
    size_t index;
    const IrqReport empty = {IRQ_CHANGED, IRQ_NONE, 0U, 0U, 0U, 0U, 0U};
    /**
    * Aggregate initialization initializes named members, not a padding promise.
    **/
    if (history == NULL) {
        return IRQ_INVALID_ARGUMENT;
    }
    for (index = 0U; index < IRQ_HISTORY_CAPACITY; index++) {
        history->rows[index] = empty;
    }
    history->count = 0U;
    history->droppedRows = 0U;
    history->saturated = false;
    return IRQ_OK;
}

/** @brief Validate a complete one-operation command. @param[in] model, command.
 * @param[Out] None. @return Validity. */
static bool irq_command_valid(const IrqModel *model, const IrqCommand *command)
{
    /**
    * Unused fields are required zero so typos cannot silently change meaning.
    **/
    switch (command->operation) {
        case IRQ_ENABLE:
        case IRQ_LEVEL:
            return irq_index(command->irq) < IRQ_LINE_COUNT && command->value <= 1U && command->extra == 0U;
        case IRQ_PULSE:
        case IRQ_CLEAR_PENDING:
            return irq_index(command->irq) < IRQ_LINE_COUNT && command->value == 0U && command->extra == 0U;
        case IRQ_MASKS:
            return command->irq == IRQ_NONE && irq_masks_valid(model->group, command->value, command->extra);
        case IRQ_SELECT:
        case IRQ_RETURN:
            return command->irq == IRQ_NONE && command->value == 0U && command->extra == 0U;
        default:
            return false;
    }
}

/** @brief Choose at most one eligible nonactive identity. @param[in] model valid.
 * @param[Out] None. @return Slot0..2 or3 for none. */
static size_t irq_candidate(const IrqModel *model)
{
    size_t index;
    size_t best = IRQ_LINE_COUNT;
    uint32_t activeGroup = 16U;
    /**
    * Same-group subpriority cannot preempt an active handler.
    **/
    if (model->primask != 0U) {
        return best;
    }
    if (model->depth > 0U) {
        activeGroup = model->lines[irq_index(model->stack[model->depth - 1U])].priority.preempt;
    }
    for (index = 0U; index < IRQ_LINE_COUNT; index++) {
        const IrqLine *line = &model->lines[index];
        if (!line->enabled || !line->pending || line->active || line->priority.preempt >= activeGroup ||
            (model->basepri != 0U && line->priority.preempt >= model->basepri / 16U)) {
            continue;
        }
        if (best == IRQ_LINE_COUNT || line->priority.preempt < model->lines[best].priority.preempt ||
            (line->priority.preempt == model->lines[best].priority.preempt &&
             line->priority.sub < model->lines[best].priority.sub)) {
            best = index;
        }
    }
    return best;
}

/** @brief Build copied current state flags. @param[in] model, event, irq.
 * @param[Out] None. @return Fully initialized report. */
static IrqReport irq_report(const IrqModel *model, IrqEvent event, uint32_t irq)
{
    IrqReport result = {IRQ_CHANGED, IRQ_NONE, 0U, 0U, 0U, 0U, 0U};
    size_t index;
    /**
    * Bit identities are fixed6/29/38, independent of current stack order.
    **/
    result.event = event;
    result.irq = irq;
    result.depth = model->depth;
    for (index = 0U; index < IRQ_LINE_COUNT; index++) {
        uint32_t bit = UINT32_C(1) << index;
        result.enabledBits |= model->lines[index].enabled ? bit : 0U;
        result.pendingBits |= model->lines[index].pending ? bit : 0U;
        result.activeBits |= model->lines[index].active ? bit : 0U;
        result.causeBits |= model->lines[index].cause ? bit : 0U;
    }
    return result;
}

/** @brief Perform one validated operation. @param[in] command, model initialized.
 * @param[Out] report fresh on OK, history optional. @return IrqStatus. */
IrqStatus irq_apply(IrqModel *model, const IrqCommand *command, IrqReport *report, IrqHistory *history)
{
    size_t index;
    IrqEvent event = IRQ_CHANGED;
    uint32_t identity = IRQ_NONE;
    /**
    * Complete preflight precedes every state, counter, output or history write.
    **/
    if (model == NULL || command == NULL || report == NULL) {
        return IRQ_INVALID_ARGUMENT;
    }
    if (!irq_model_valid(model) || (history != NULL && history->count > IRQ_HISTORY_CAPACITY)) {
        return IRQ_BAD_STATE;
    }
    if (!irq_command_valid(model, command)) {
        return IRQ_INVALID_ARGUMENT;
    }
    if (command->operation == IRQ_RETURN && model->depth == 0U) {
        return IRQ_BAD_STATE;
    }
    index = irq_index(command->irq);
    switch (command->operation) {
        case IRQ_ENABLE:
            model->lines[index].enabled = command->value != 0U;
            break;
        case IRQ_PULSE:
            model->lines[index].pending = true;
            if (irq_diagnostic_increment(&model->lines[index].pulses, &model->saturated) != IRQ_OK) {
                return IRQ_BAD_STATE;
            }
            break;
        case IRQ_LEVEL:
            model->lines[index].cause = command->value != 0U;
            if (command->value != 0U) {
                model->lines[index].pending = true;
            }
            break;
        case IRQ_CLEAR_PENDING:
            model->lines[index].pending = false;
            break;
        case IRQ_MASKS:
            model->primask = command->value;
            model->basepri = command->extra;
            break;
        case IRQ_SELECT:
            index = irq_candidate(model);
            event = IRQ_NO_ENTRY;
            if (index < IRQ_LINE_COUNT) {
                identity = irq_number(index);
                model->stack[model->depth++] = identity;
                model->lines[index].pending = false;
                model->lines[index].active = true;
                if (irq_diagnostic_increment(&model->lines[index].entries, &model->saturated) != IRQ_OK) {
                    return IRQ_BAD_STATE;
                }
                event = IRQ_ENTERED;
            }
            break;
        case IRQ_RETURN:
            identity = model->stack[--model->depth];
            model->stack[model->depth] = IRQ_NONE;
            index = irq_index(identity);
            model->lines[index].active = false;
            model->lines[index].pending = model->lines[index].pending || model->lines[index].cause;
            event = IRQ_RETURNED;
            break;
        default:
            break;
    }
    *report = irq_report(model, event, identity);
    if (history != NULL) {
        if (history->count < IRQ_HISTORY_CAPACITY) {
            history->rows[history->count++] = *report;
        } else if (irq_diagnostic_increment(&history->droppedRows, &history->saturated) != IRQ_OK) {
            return IRQ_BAD_STATE;
        }
    }
    return IRQ_OK;
}

/** @brief Fresh deterministic interpreter. @param[in] None.
 * @param[Out] model. @return IrqStatus. */
IrqStatus rmw_init(RmwModel *model)
{
    /**
    * No host volatile object or concurrent writer is involved.
    **/
    if (model == NULL) {
        return IRQ_INVALID_ARGUMENT;
    }
    *model = (RmwModel){0};
    return IRQ_OK;
}

/** @brief Execute a single legal actor stage. @param[in] actor, stage.
 * @param[Out] model and fresh report on OK. @return IrqStatus. */
IrqStatus rmw_step(RmwModel *model, uint32_t actor, RmwStage stage, RmwReport *report)
{
    /**
    * A six-step domain makes both interleavings defined and finite.
    **/
    if (model == NULL || report == NULL || actor > 1U || stage < RMW_READ || stage > RMW_WRITE) {
        return IRQ_INVALID_ARGUMENT;
    }
    if (model->value > 2U || model->steps > 6U || model->completed > 2U ||
        model->stage[0] < RMW_READ || model->stage[0] > RMW_DONE ||
        model->stage[1] < RMW_READ || model->stage[1] > RMW_DONE ||
        model->readValue[0] > 1U || model->readValue[1] > 1U ||
        model->computed[0] > 2U || model->computed[1] > 2U) {
        return IRQ_BAD_STATE;
    }
    if (model->steps == 6U) {
        return IRQ_TERMINAL;
    }
    if (model->stage[actor] != stage) {
        return IRQ_BAD_STATE;
    }
    switch (stage) {
        case RMW_READ:
            model->readValue[actor] = model->value;
            break;
        case RMW_COMPUTE:
            model->computed[actor] = model->readValue[actor] + 1U;
            break;
        case RMW_WRITE:
            model->value = model->computed[actor];
            model->completed++;
            break;
        default:
            break;
    }
    model->stage[actor] = (RmwStage)((uint32_t)stage + 1U);
    model->steps++;
    *report = (RmwReport){model->value, model->steps, model->completed,
        model->completed > model->value ? model->completed - model->value : 0U, model->steps == 6U};
    return IRQ_OK;
}

/** @brief Illustrate restoring caller mask. @param[in] saved0/1.
 * @param[Out] output on OK. @return IrqStatus. */
IrqStatus irq_mask_roundtrip(uint32_t saved, IrqMaskRoundtrip *output)
{
    /**
    * This is a pure contract example, never a host mask write.
    **/
    if (output == NULL || saved > 1U) {
        return IRQ_INVALID_ARGUMENT;
    }
    *output = (IrqMaskRoundtrip){saved, 1U, saved};
    return IRQ_OK;
}
```

### 完整 README.txt {#irq-source-README-txt}

[原生下载 README.txt](/examples/interrupt-shared-data/README.txt)

```text
Interrupt/shared-data host models, v1
===================================
Original single-context, non-reentrant host C11. No target NVIC/CMSIS/MMIO,
threads, actual ISR, DMA, heap, callbacks, waits or hardware timing claims.
Keep irq.h, irq.c and this README.txt in one directory. Save exactly the text
between BEGIN CONSUMER.C and END CONSUMER.C below as consumer.c (markers excluded).
The module has no main. The independent consumer includes the public header twice.

With an existing C11 compiler, from that directory:
  cc -std=c11 -Wall -Wextra -Werror -pedantic -fstack-usage -c irq.c -o irq.o
  cc -std=c11 -Wall -Wextra -Werror -pedantic -fstack-usage -c consumer.c -o consumer.o
  cc irq.o consumer.o -o consumer
  ./consumer
On Windows, name the linked output consumer.exe and run .\consumer.exe.
Repeat with -DNDEBUG in BOTH compile commands, distinct output names and linkage.
Do not run a previous executable if any compile/link failed. CHECK remains live
with NDEBUG. No target toolchain/atomic library/ISR guarantee follows from this.

The course's actual author/CI C experiments use existing mcu-build routing:
  node scripts/test-interrupt-shared-data.mjs --native --compiler <existing-cc> --python <existing-python> --router <existing-build_router.py> --output .scratch/interrupt-dma-throughput/native
Run that command from the repository root. Each production module, independent
caller and link goes through validate -> dry-run -> build profiles. Tool identities,
raw exit, diagnostics, fresh artifacts and input SHA-256 are recorded. Nothing is
installed. The same runner extracts THIS minimal consumer text and builds/runs it
as an additional separate normal/NDEBUG caller, rather than trusting a transcript.

Success output (exactly one line):
PASS minimal IRQ: logical9/raw0x90 lost1/serialized2 saved1/restored1

BEGIN CONSUMER.C
#include "irq.h"
#include "irq.h"
#include <stdio.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr, "FAIL %d: %s\n", __LINE__, #x); return 1; } } while (0)
int main(void)
{
    IrqEncoding encoding = {0U, 0U, 0U, 0U};
    IrqMaskRoundtrip mask = {0U, 0U, 0U};
    RmwModel lost;
    RmwModel serial;
    RmwReport report = {0U, 0U, 0U, 0U, false};
    const uint32_t actors[6] = {0U, 1U, 1U, 1U, 0U, 0U};
    const RmwStage stages[6] = {RMW_READ, RMW_READ, RMW_COMPUTE, RMW_WRITE, RMW_COMPUTE, RMW_WRITE};
    size_t index;
    CHECK(irq_encode(5U, 2U, 1U, &encoding) == IRQ_OK);
    CHECK(encoding.logical == 9U && encoding.registerByte == 144U);
    CHECK(rmw_init(&lost) == IRQ_OK && rmw_init(&serial) == IRQ_OK);
    for (index = 0U; index < 6U; index++) {
        CHECK(rmw_step(&lost, actors[index], stages[index], &report) == IRQ_OK);
    }
    CHECK(report.terminal && report.value == 1U && report.lost == 1U);
    for (index = 0U; index < 2U; index++) {
        CHECK(rmw_step(&serial, (uint32_t)index, RMW_READ, &report) == IRQ_OK);
        CHECK(rmw_step(&serial, (uint32_t)index, RMW_COMPUTE, &report) == IRQ_OK);
        CHECK(rmw_step(&serial, (uint32_t)index, RMW_WRITE, &report) == IRQ_OK);
    }
    CHECK(report.terminal && report.value == 2U && report.lost == 0U);
    CHECK(irq_mask_roundtrip(1U, &mask) == IRQ_OK && mask.inside == 1U && mask.restored == 1U);
    if (puts("PASS minimal IRQ: logical9/raw0x90 lost1/serialized2 saved1/restored1") < 0 || fflush(stdout) != 0) {
        return 2;
    }
    return 0;
}
END CONSUMER.C

Ownership and freshness
-----------------------
All state, input arrays/commands, optional history and output objects must be real,
live, sufficiently sized typed objects, pairwise disjoint and exclusively owned.
Fresh irq_init/rmw_init/history_init validate then write every named field without
reading indeterminate storage. Fresh storage has no live operation/owner/old event;
initialization is not a runtime test or erase permission for a violated lifetime.
Later operations require initialized objects. Callers inspect but do not edit named
model members. No claim of detecting forged/dangling pointers, false extents,
arbitrary corruption or aliasing. NULL/enum/domain/checkable metadata reject.
Only IRQ_OK gives a fresh output. All non-OK results, including IRQ_TERMINAL,
preserve every named state/diagnostic/history/output field. Retained reports are
historical. IRQ_OK + IRQ_NO_ENTRY freshly reports zero entries. No assert-dependent
validation; compare named members, not padding. Bool and uint32/size_t availability
follow C11 implementation support; no ABI-fixed sizeof promise.

Priority and external IRQ model
-------------------------------
Selected F407 has four priority bits. Raw g0/1/2/3 -> pre4/sub0; g4 -> 3/1;
g5 -> 2/2; g6 -> 1/3; g7 -> 0/4. Strict inputs reject before assignment;
CMSIS5.9.0 masks fields instead (g5/pre4/sub0 would mask to0).
Only EXTI0_IRQn6 / TIM3_IRQn29 / USART2_IRQn38 exist; fixed slot bits0/1/2.
Initial lines enabled; pending/active/cause false, counters/masks/depth/stack0.
irq_configure changes all three priorities/group only when none pending/active;
existing nonzero BASEPRI also requires g3. Counters/cause/enables remain unchanged.
irq_apply accepts exactly one complete command. SELECT enters at most one enabled,
pending, nonactive identity whose group is strictly more urgent than current.
Smallest group, then sub, then IRQ number wins. Same-group sub does not preempt.
Enter clears its pending latch. RETURN pops only the current top and never selects.
Persistent LEVEL cause relatches pending only at the explicit RETURN transition;
LEVEL false does not clear pending. PULSE is a request fact, coalesces pending and
increments injected-pulse diagnostics. CLEAR_PENDING does not clear cause/active.
ENABLE changes only enable. This fake does not acknowledge any physical peripheral.
MASKS requires irq0,value PRIMASK0/1,extra BASEPRI raw0 or upper-nibble0x10..0xF0.
Nonzero BASEPRI is supported only in g3; all other groups require0. PRIMASK blocks
these configurable entries; it does not cancel active work or stop DMA/NMI/HardFault.
Fault architecture and privileged target mask operations are not executed.

Fixed resource/work limits
--------------------------
IrqModel: 3 line records, 3 active identity slots, 6 pulse/entry uint32 diagnostics.
Planner/roundtrip: constant arithmetic. Init/configure validate exactly3 priorities.
Apply: check at most3 stack identities +3 line records; SELECT scans3 candidates;
report scans3 lines; at most1 entry OR1 return, no callback or automatic pending drain.
Optional IrqHistory: exactly32 copied IrqReport rows, count0..32, no execution owner.
One accepted apply appends at most1 row; row33+ is dropped, droppedRows increments
saturating, existing rows stay intact, execution continues. NULL disables history.
Init clears every unused named row/stack field. Config/encode/RMW do not append it.
Counters saturate: MAX-1 -> MAX with flag unchangedfalse; attempted next increment
staysMAX and sets stickytrue. Further increments remainMAX/true. Diagnostics no
longer yield exact totals/rates after saturation. irq_diagnostic_increment provides
a finite initialized near-MAX public test seam, not permission to edit live state.
RMW: 2 actors (0 foreground,1 IRQ), READ/COMPUTE/WRITE/DONE, exactly6 accepted
steps total, one step/call and no internal loop. Illegal/out-of-order/repeated stage
rejects preserving state/report. Completed6 -> IRQ_TERMINAL on any later legal call.
The two schedules above are explicit single-context interpretation, no real C race.
Saved-mask output is pure data:0->1->0 and1->1->1, no actual host mask operation.

Limits and primary evidence
----------------------------
volatile does not supply mutual exclusion or atomic RMW. Atomic fetch-add/relaxed,
compiler barriers, DMB/DSB/ISB, DMA ownership/cache visibility and capacity differ.
A bounded critical section covers only conflicting CPU contexts actually masked,
with saved-mask restoration; DMA/NMI/HardFault remain excluded writers.
Three model slots and host per-function .su/heuristics do not prove target WCET or
whole-stack budget. Basic/FP/alignment/lazy exception conditions prevent treating
32bytes as a maximum per interrupt. No hardware or physical paper was tested.
PM0214 Rev10 March2020 selected text; CMSIS5.9.0 pinned2b7495b8535bdcb306dac29b9ded4cfb679d7e5c;
DeviceF4 v2.6.10 pinned5f41fb29d22773896c780052bf61e47fc924d524; WG14 N1570 April2011 draft.
Researcher manual text/pixels retain their attribution; current official RM0090 is
unread, current PM/DS/AN pixels and current selected silicon errata/target contracts
remain gaps. Local candidate and native checks do not prove public release/mastery.
```
## 十个独立回忆与迁移题 {#irq-practice-title}

<div id="irq-practice">
<div class="practice-intro"><p>十题均有独立前提，无需当前活动状态。先遮住答案手算，再展开原因与下一检查。题页打印恰好十个完整题干，隐藏答案、反馈与其它解题；返回后恢复先前fold和body class，包括原本没有class属性的情况。</p><div class="notes-toolbar"><button class="btn" id="print-questions" type="button">只打印十个完整题干</button></div></div><article class="exercise" id="irq-exercise-01"><h3 id="irq-question-01">01 · 选定F407有4位优先级。原始g5/pre2/sub1的逻辑值和寄存器字节各是多少；0x90能当未移位CMSIS优先级吗？</h3><details class="exercise-answer" id="irq-answer-01"><summary>展开原因与下一检查</summary><p>g5分2抢占位/2子位，2×4+1=9，写入高半字节0x90。NVIC_SetPriority接未移位逻辑表示，不接已移位0x90。下一检查：查API参数表示，再从寄存器反推。</p></details></article><article class="exercise" id="irq-exercise-02"><h3 id="irq-question-02">02 · 4位/g5下提供pre4/sub0。严格模型与真实CMSIS掩码分别怎样处理？</h3><details class="exercise-answer" id="irq-answer-02"><summary>展开原因与下一检查</summary><p>2抢占位只允许0..3；严格模型INVALID_PRIORITY并保留输出。CMSIS会把4掩成0而编码0，故拒绝是课程政策。下一检查：核每个字段的分配位宽，包括零位字段。</p></details></article><article class="exercise" id="irq-exercise-03"><h3 id="irq-question-03">03 · g5 active38=(group2,sub3)，pending6=(group2,sub0)，都enabled且unmasked。6能进入吗；若29=(group1,sub3)也pending呢？</h3><details class="exercise-answer" id="irq-answer-03"><summary>展开原因与下一检查</summary><p>6同组不能抢占，sub更小只影响待选，故仍pending；29组1更紧迫，进入38之上。29显式返回恢复38，38再返回后另一次select才可进入6。下一检查：看current的group及独立return边界。</p></details></article><article class="exercise" id="irq-exercise-04"><h3 id="irq-question-04">04 · thread中6/29/38都pending且group/sub完全相同。另一个独立场景active6同时pending6，调用clear-pending。分别得到什么？</h3><details class="exercise-answer" id="irq-answer-04"><summary>展开原因与下一检查</summary><p>thread先选最小IRQ号6，这不是额外抢占规则；后续还要return再选29/38。独立场景只清pending6，active6继续。下一检查：分别检查active栈、pending位和外设cause。</p></details></article><article class="exercise" id="irq-exercise-05"><h3 id="irq-question-05">05 · disabled6接收两次pulse后再enabled。另一场景level cause跨越clear-pending及return仍asserted。能断言排了几次pulse、是否再pending？</h3><details class="exercise-answer" id="irq-answer-05"><summary>展开原因与下一检查</summary><p>pending是锁存，两pulse合成一个待服务条件，启用后只允许一次合格entry，并非两个排队服务。明确level模型return时仍有cause会再锁存；清NVIC pending不证明物理外设ack。下一检查：查所选外设原因清法。</p></details></article><article class="exercise" id="irq-exercise-06"><h3 id="irq-question-06">06 · g3、BASEPRI raw0x50，thread中逻辑4与5都enabled/pending。谁能进入；raw0与PRIMASK1各改变什么？</h3><details class="exercise-answer" id="irq-answer-06"><summary>展开原因与下一检查</summary><p>4通过阈值，5等待；raw0取消BASEPRI限制但仍需其它资格。PRIMASK1阻止这些可配置entry，均不停止DMA，也不能说PRIMASK挡住NMI/HardFault。下一检查：确认group、原始表示和mask覆盖范围。</p></details></article><article class="exercise" id="irq-exercise-07"><h3 id="irq-question-07">07 · x初始0，foreground读0；IRQ读0并写1；foreground最后写1。volatile能强制2吗；两次串行增量呢？</h3><details class="exercise-answer" id="irq-answer-07"><summary>展开原因与下一检查</summary><p>解释器最终1，foreground的旧读覆盖IRQ贡献；volatile没有把读/计算/写合成不可分割动作。串行两次完整增量得2。此为定义良好的fake交错，不是真实C race的确定结果。下一检查：列每个actor的local和stage。</p></details></article><article class="exercise" id="irq-exercise-08"><h3 id="irq-question-08">08 · 有界mask临界区进入前saved PRIMASK=1。退出应取何值；能排除DMA writer吗？</h3><details class="exercise-answer" id="irq-answer-08"><summary>展开原因与下一检查</summary><p>恢复1，保留调用者已屏蔽状态；固定enable会错误改变它。证明只覆盖真被该mask挡住的CPU冲突上下文，DMA/NMI/HardFault仍需另外分析。下一检查：枚举全部writer和每条退出路径。</p></details></article><article class="exercise" id="irq-exercise-09"><h3 id="irq-question-09">09 · DMA-ready旁加atomic计数与DMB，是否就证明整个buffer稳定和目标ISR lock-free？</h3><details class="exercise-answer" id="irq-answer-09"><summary>展开原因与下一检查</summary><p>原子RMW只针对指定对象；DMB只约束访问顺序，都不提供稳定buffer lease或让DMA参与C11同步。host atomics不能证明目标库、宽度、对齐及ISR耗时。下一检查：查block生命周期与目标工具链合同。</p></details></article><article class="exercise" id="irq-exercise-10"><h3 id="irq-question-10">10 · 三IRQ模型每call至多一entry或一return。能否据此证明ISR WCET，或每嵌套最多32bytes？</h3><details class="exercise-answer" id="irq-answer-10"><summary>展开原因与下一检查</summary><p>仅证明模型工作有限、身份深度≤3。编译器调用帧与异常basic/FP/alignment/lazy条件是额外需求；32bytes基本帧不是最大保证。下一检查：结合限定.su、调用路径和目标异常栈分析，硬件/全程序界尚未证。</p></details></article><div class="practice-intro"><p>隔天变值任务：把g5的6改为group0/sub2，先写出38/29/6新次序，再用活动之外的公共接口构造验证；保存mask从1改0后重新解释退出。可向助手追问：“为什么active+pending在这一轮没有重入？”这类具体问题比只问是否懂了更能定位原因。</p></div>
</div>

## 来源、实际阅读与未验证边界 {#irq-sources-title}

<div id="irq-sources">
<p>作者全文读取冻结规格、两个研究底稿及实际manifest，并按本地固定头检查三条IRQ与四位声明；下表的原手册文字/像素阅读归研究者，不能算成本作者重新目视。模型、图、严格拒绝、三IRQ域、g3阈值限制和六步调度均为原创课程政策。</p><div class="table-wrap" role="region" tabindex="0" aria-label="来源 / 版本，可横向滚动"><table><thead><tr><th scope="col">来源 / 版本</th><th scope="col">本章使用</th><th scope="col">实际阅读限定</th></tr></thead><tbody><tr><td>PM0214 Rev10 March2020</td><td>§2.1.3 pp23–26；§2.3 pp37–43；CPS182/MSR187；NVIC210–218；AIRCR228–229</td><td>研究者web文字；原PDF bytes/SHA缺失，相关像素未见</td></tr><tr><td>CMSIS5.9.0 固定commit2b7495b…</td><td>core_cm4 encode/setpriority；cmsis_gcc mask/barrier</td><td>本地固定源码；非全部头审计；寄存器网页单独自报5.6.0</td></tr><tr><td>DeviceF4 v2.6.10 commit5f41fb29…</td><td>F407 __NVIC_PRIO_BITS与IRQ6/29/38</td><td>已核具名头，不推及全Cortex-M</td></tr><tr><td>WG14 N1570 April12 2011</td><td>§5.1.2.4、§6.7.3、§7.17</td><td>公开委员会草案；研究者选定文字，不是最终ISO</td></tr><tr><td>历史RM0090 DocID018909 Rev5 September2013</td><td>邻章DMA/存储连接的来源边界</td><td>研究者仅目视60/73/305/310/319/321/329；当前官方RM仍未读</td></tr></tbody></table></div><p>固定来源：<a href="https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf">PM0214 Rev10 March2020</a>；<a href="https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/CMSIS/Core/Include/core_cm4.h">固定CMSIS5.9.0 core_cm4.h</a>；<a href="https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/CMSIS/Core/Include/cmsis_gcc.h">同commit cmsis_gcc.h</a>；<a href="https://github.com/STMicroelectronics/cmsis-device-f4/blob/5f41fb29d22773896c780052bf61e47fc924d524/Include/stm32f407xx.h">DeviceF4 v2.6.10 F407头</a>；<a href="https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf">N1570草案</a>；<a href="https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf">历史RM0090 Rev5</a>。</p><p>缺口保留：当前官方RM未读；当前DS/PM/AN相关像素除列明历史RM页外未见；web-only源原始字节/SHA缺失；具体silicon revision/current DMA/ADC errata、完整mask边缘、目标atomic/ISR/compiler、真实并发/placement/cache/停止时序/WCET、采样/线路/overrun与实体纸张均未验。旧GCC13.1 volatile页面只继承前批研究记录，本次未重读成功；当前主张由N1570与固定CMSIS支撑。</p><p>下一步<a href="./dma-ownership.html">16 DMA缓冲所有权</a>属于同批候选，尚待root整站激活；<a href="./throughput-overload.html">17吞吐与过载</a>须等16实际接口冻结后单独准入。源包边界不代表课程完成；<a href="../learn/engineering-map.html">32单元/八阶段地图</a>仍保留18–32待建设。</p>
</div>

