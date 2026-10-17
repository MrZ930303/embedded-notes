# 静态内存、堆与调用栈预算 {#memory-budget}

链接成功后，再为同时活着的对象和被打断的调用链留出空间。

## 给采集终端留下一张可解释的 RAM 预算 {#memory-overview-title}

<span id="memory-overview"></span>

<p>前置：已能解释有界 FIFO、C 对象的有效期和数组边界；了解编译、链接与复位后的 data 复制、BSS 清零。单元06、07提供构建/启动背景，本章的固定数字可独立复算。采集终端想同时保存配置、缓冲采样、格式化报文，链接成功以后，RAM 仍可能在一次嵌套调用或分配中不足。</p><p>本次小成果是一张容量1024字节的分区账、一条有限对象生命线，以及一份“在已声明路径和中断条件下”的栈结论。短路线：先做存储账 → 再做10步生命线 → 最后解释一条调用路径。每段都留下可检查的小纸条；源代码和证据放在末段。完整正文与静态答案不依赖 JavaScript。</p><p>本章为本地候选教材，页面模型和主机 C 验证各有自己的证据；未验证真实 MCU、实际水位、物理打印或设备 RAM 可达性。不保存作答、进度、分数或个人掌握记录。</p>

## 先分清存储期、装载地址与运行地址 {#memory-storage-title}

<span id="memory-storage"></span>

<p>静态存储期说明对象在整个程序执行期间存在；自动存储期跟随一次块/函数执行，动态分配对象从成功分配活到释放。语言层的“自动对象”不等于保证每个对象都在物理栈里：优化可能用寄存器或消除对象。C 也不保证堆向上、栈向下或两个区域天然相邻。</p><p>链接器把输入组织为输出节。常见嵌入式布局中，text 是指令，rodata 是只读常量；它们可在 Flash 执行/读取。data 的初值字节存于 Flash 的装载地址 LMA（Load Memory Address），运行时对象放在 RAM 的 VMA（Virtual Memory Address，这里即运行地址）。启动代码依据约定复制初值。BSS 为零初始化对象预留 RAM，启动/运行库负责清零；它通常不需要在 Flash 存一份等长的零字节。名称与布局是工具链约定，必须对照实际链接脚本。</p><figure id="memory-load-diagram"><div class="diagram-grid" role="img" aria-label="原创建模：Flash 装载字节与 RAM 运行区域分账，字节单位"><div class="diagram-row"><strong>Flash：text / rodata / data 初值</strong>指令与常量按选定布局驻留；data 初值复制到 RAM。BSS 的零填充由启动约定建立。</div><div class="diagram-row"><strong>RAM：data128 + BSS256</strong>data 占运行时128字节，同时可能有 Flash 初值；BSS 占 RAM256字节，不能因不占等长 Flash 而删去。</div><div class="diagram-row"><strong>RAM：heap256 + stack256 + guard128</strong>三个不重叠预留区；本图数字是教学夹具，不是 STM32 地址表。</div></div><figcaption>图例：横行是不同记账角色，不代表真实地址顺序。data 的装载副本与运行副本跨介质分别计数；同一 RAM arena 的 live 字节已包含在 reservation 内。</figcaption></figure><p>由图可重建两本账：Flash 账需指令、只读常量、data 初值及镜像头/对齐等；RAM 账需 data、BSS、arena 与 guard。节对齐、链接填充、保留区或 noinit 若存在要显式归属，不能把 map 的文件大小当 RAM 占用。GNU ld2.36 §3.1及§3.6.8.2给出 VMA/LMA 与 ROM→RAM 例子。Windows 主机输出格式与 ARM ELF 不同；本章的主机帧报告并不改变目标映像的布局。</p><p>map 是某一链接配置的放置报告：能核对静态地址和预留区，不能证明随后分配的生命期峰值、未知调用或中断最深嵌套。真实 MCU 还可能分多个 RAM bank，各 bank 的 CPU/DMA 访问权限不同；总字节够并不自动说明某外设可达。先留下成果：在自己的 map 上分别圈出 RAM 运行字节、Flash 装载字节和显式预留区，并写出配置版本。</p>

## 两层账：布局包络与 arena 内的活跃需求 {#memory-envelope-title}

<span id="memory-envelope"></span>

<p>reservation（预留）是先为一种用途圈定的容量；live demand（活跃需求）是在某时刻同时存在的对象或帧。包络只算不重叠区域：data+BSS+reserved heap+reserved stack+guard ≤ RAM容量。然后分别问 heap peak≤heap reservation、stack demand≤stack reservation。把 live heap 再加进包络会重复计算；也不能把 heap 内闲置字节直接借给一个边界固定的 stack。</p><div class="table-wrap" role="region" tabindex="0" aria-label="独立夹具：不含额外隐藏 padding，各区不重叠"><table><caption>独立夹具：不含额外隐藏 padding，各区不重叠</caption><thead><tr><th scope="col">项目</th><th scope="col">字节</th><th scope="col">含义</th></tr></thead><tbody><tr><td>data</td><td>128</td><td>运行时初始化数据</td></tr><tr><td>BSS</td><td>256</td><td>零初始化 RAM</td></tr><tr><td>heap reservation</td><td>256</td><td>动态对象的容量上限</td></tr><tr><td>stack reservation</td><td>256</td><td>路径/中断同时活跃帧的容量上限</td></tr><tr><td>guard</td><td>128</td><td>显式隔离/增长余量，不能当普通空闲</td></tr><tr><td>总计 / capacity</td><td>1024 / 1024</td><td>FITS，未分配给任何区域的余量为0</td></tr></tbody></table></div><p>逐步算：128+256=384；再加256得到640；再加256得到896；最后加128得到1024。等于容量是 FITS，意思是包含 guard 的布局放得下，绝不是额外还有128可随意花。guard 改为129时总数1025，EXCEEDS，超出1字节。若另加对齐，要另列并重新算，不能偷偷挪动夹具。</p><p>所有值是非负整数字节；C 使用 size_t，先验证再做算术。加法检查 right≤SIZE_MAX−left，乘法在乘数非零时检查 value≤SIZE_MAX/numerator。rational 上界使用 ceil(value×numerator/denominator)，分母必须非零；先检查乘积，再做商与余数，避免 product+denominator−1 再溢出。选定中间乘积放不下，即使约分后数学结果可表示，此接口也返回 OVERFLOW，并保持旧输出。</p><p>状态合同：FITS/EXCEEDS 是可表示的新数字结论；INVALID 是参数违反约定，OVERFLOW 是选定计算不可表示，UNKNOWN 是缺少证明所需边界。后三者不提供新数值报告，旧 accepted report 必须继续标为旧值。空容量配全零区域是 FITS；容量0但需求1是 EXCEEDS。</p>

## 从生命线求峰值，再看连续空间 {#memory-lifetimes-title}

<span id="memory-lifetimes"></span>

<p>动态对象的 lifetime（有效期）开始于成功分配、结束于释放；从此不能再通过旧引用访问。忘记释放让可回收空间长期被占，是泄漏；释放后继续访问是悬空引用，不能因字节暂时没变就说对象还活着。本章只用整数槽描述 lifetime，不创建或解引用悬空 C 指针。</p><p>本地模型是128字节 arena、最多8个命名槽、first-fit 连续分配。每次 payload 加声明的 overhead，再向 alignment 的倍数向上取整；alignment 必须是非零2的幂。固定轨迹 overhead0、alignment1，所以32字节 payload 恰占32。另一独立例子 overhead4、alignment8：payload5→9→16，两个同时活跃对象消耗32而非10。元数据对象位于模型自身，不偷偷算在 fictional arena 里。</p><figure id="memory-life-diagram"><div class="diagram-grid" role="img" aria-label="原创128字节生命线：A/C已释放，B/D仍活跃"><div class="diagram-row"><strong>偏移0..31：A已释放（32空）</strong>first-fit 可放不超过32字节的新连续块。</div><div class="diagram-row"><strong>偏移32..63：B活跃（32占用）</strong>B 隔开左洞与 C 的空洞，不能越过 B 拼接。</div><div class="diagram-row"><strong>偏移64..95：C已释放（32空）</strong>两洞总空闲64，但最大连续空闲32。</div><div class="diagram-row"><strong>偏移96..127：D活跃（32占用）</strong>申请连续48字节拒绝；释放 B 后0..95合成96字节洞。</div></div><figcaption>图例：区间为包含端点的字节偏移，空与占用通过文字区分。释放相邻区域隐式合并；非相邻洞不能被当作单块。本模型不压缩或移动活对象。</figcaption></figure><p>先把 A、B、C、D 各32依次分配，四者同时存活，因此峰值128。释放 A、C 后，活跃总量64，空闲总量64，最大连续洞32；E48仍不能分配。释放 B 后，三个相邻空段合并为96；E48成功后活跃 E48+D32=80，余下连续48，历史峰值仍128。整个过程中成功分配过的 payload 总和至少176，但176不是同时峰值。</p><div class="table-wrap" role="region" tabindex="0" aria-label="手算10步，拒绝第7步不改变已接受 arena 或报告"><table><caption>手算10步，拒绝第7步不改变已接受 arena 或报告</caption><thead><tr><th scope="col">步 / 事件</th><th scope="col">live 字节</th><th scope="col">total free</th><th scope="col">largest free</th><th scope="col">peak</th></tr></thead><tbody><tr><td>1 A=32</td><td>32</td><td>96</td><td>96</td><td>32</td></tr><tr><td>2 B=32</td><td>64</td><td>64</td><td>64</td><td>64</td></tr><tr><td>3 C=32</td><td>96</td><td>32</td><td>32</td><td>96</td></tr><tr><td>4 D=32</td><td>128</td><td>0</td><td>0</td><td>128</td></tr><tr><td>5 release A</td><td>96</td><td>32</td><td>32</td><td>128</td></tr><tr><td>6 release C</td><td>64</td><td>64</td><td>32</td><td>128</td></tr><tr><td>7 E=48</td><td>EXCEEDS；保持64</td><td>64</td><td>32</td><td>128</td></tr><tr><td>8 release B</td><td>32</td><td>96</td><td>96</td><td>128</td></tr><tr><td>9 E=48</td><td>80</td><td>48</td><td>48</td><td>128</td></tr><tr><td>10 release D</td><td>48</td><td>80</td><td>80</td><td>128</td></tr></tbody></table></div><p>这是有限声明工作负载，不能代表任意未来请求。arena256若要装同一128峰值，在该 trace 下有128余量；把 capacity 减到127，第四个32就会拒绝。总 free 是容量账，largest free 是连续性条件；二者必须一起保留。由旧的“堆与栈”图走到这里，关键变化是把“需要多少”拆为对象何时同时活着和它们能否连续摆下。完成成果：遮住表的数字，画出第6步的两个洞，再解释第7步拒绝为何不改变 peak。</p>

## 栈预算取可达路径最大值，再加有界打断 {#memory-stack-title}

<span id="memory-stack"></span>

<p>调用帧保存一次调用所需的局部对象、保存寄存器、溢出参数及对齐等。调用者尚未返回，调用者帧仍然活着；因此沿同一可达链相加。两个先后返回的兄弟函数不是同时活跃，取路径的最大值。编译器内联、尾调用、寄存器分配会改变实际帧，源代码局部数组长度本身不等于完整帧成本。</p><figure id="memory-path-diagram"><div class="diagram-grid" role="img" aria-label="原创有界调用树，所有成本为声明字节"><div class="diagram-row"><strong>公共入口 A80</strong>方案一 A80→B64→C32：80+64+32=176。</div><div class="diagram-row"><strong>互斥兄弟 D48</strong>方案二 A80→D48：80+48=128。B/C 路径返回后才走 D，不把两个路径累计为304。</div><div class="diagram-row"><strong>声明的中断总额64</strong>单栈模型上限=max(176,128)+64=240；stack reservation256，剩16。</div></div><figcaption>图例：箭头表示在前一帧仍活跃时调用；“互斥”是假定可达路径条件。64是完整 aggregate IRQ allowance，已含该模型声明的嵌套总额，不是 MCU 单次入栈常数。guard128在布局中另外预留，不能再从16里重复扣同一 guard。</figcaption></figure><p>完整手算：A80+B64=144，再加C32得176；兄弟路径128较小，所以选176。声明 IRQ 合计64时 demand240，stack256−240=16。若确有最多2层、每层完整 IRQ32，也得到64；若每层64且可嵌套2层，则是128，需求304，超256共48。只有证明了嵌套上限，乘法才有意义。</p><p>bounded recurrence 必须先给明确次数。接口的 repetitions 乘整条路径，作为保守声明：重复2次176且 IRQ32×2，总416。它没有递归执行，也没有自动推断哪一帧重复。递归次数未给（repetitions=0）、未知函数指针目标（known=false）或 IRQ 边界未给（irqKnown=false），一律 UNKNOWN；不把缺失帧算0，不拿旧240作为新安全结论。</p><p>AAPCS32 2025Q1，issue2025-04-07，§6.2.1.1/.2规定：SP始终4字节对齐，公开接口处8字节对齐。不能改写为“每条指令都要8字节”。Cortex-M4 PM0214 Rev10，§2.3.7 pp.42–44的基本异常硬件帧为8个32位字即32字节；还需按 CCR.STKALIGN 与实际对齐情况预算 padding，FP上下文启用/活跃及 lazy preservation 会影响扩展帧，处理函数自己的软件帧另算。AN316 V1.3 p.3按CONTROL.FPCA区分32与104字节自动保存，另按情况加4字节aligner；104−32=72字节的扩展保存区包含浮点寄存器等（图12），这仍不是handler总成本；不能把32或104当成所有中断的完整固定成本。</p><p>在 Cortex-M Thread 使用 PSP、Handler 使用 MSP 的配置中，第一次异常保存被打断上下文到当时使用的栈，处理函数在 MSP 上继续；后续嵌套通常继续消耗 MSP。任务 PSP 与系统 MSP 必须各自记账，不能把单栈 toy 的240直接贴给每个任务。本章不实现 RTOS 切换或寄存器写入。成果：写出路径条件、最大嵌套、每层组成与未知来源，任何一项缺失就先写 UNKNOWN。</p>

## 预测 → 应用：先验证布局，再核对有界路径 {#memory-lab-title}

<span id="memory-lab"></span>

<p>界面数字域是十进制非负安全整数0..9007199254740991；空、负数、小数、指数、十六进制、非有限文本先拒绝。这个域比64位 size_t 保守，页面不假装支持所有 C 输入。预留 data128、BSS256、heap256、stack256固定，编辑 guard/capacity；先预测再应用。编辑清除旧预测并标待应用，旧已接受输入和结果保留且单独标明。无效/溢出只显示失败原因，不能覆盖旧结果。</p><div class="lab"><form id="envelope-form" novalidate><div class="fields"><label class="field" for="envelope-capacity">RAM容量（字节）<input id="envelope-capacity" type="text" inputmode="numeric" value="1024"></label><label class="field" for="envelope-guard">guard预留（字节）<input id="envelope-guard" type="text" inputmode="numeric" value="128"></label><label class="field" for="envelope-prediction">预测本次返回状态<select id="envelope-prediction"><option value="">先选一个预测</option><option value="EXCEEDS">预算超过容量</option><option value="FITS">预算刚好能放</option><option value="UNKNOWN">边界仍然未知</option><option value="OVERFLOW">算术无法表示</option><option value="INVALID">输入不符约定</option></select></label></div><div class="controls"><button class="btn primary" id="envelope-apply" disabled>提交预测并应用</button><button type="button" class="btn" id="envelope-reset">重置1024种子</button></div><p id="envelope-pending" class="pending" role="status">待应用：尚未形成新结论。</p><p id="envelope-feedback" class="feedback" role="status">先作预测。</p></form><div id="envelope-result" class="applied-result" hidden><p id="envelope-state"></p></div></div><p>第二个活动使用已讲解的80/64/32与80/48两个互斥路径；stack reservation256固定。可选未知递归/未知目标/未知 IRQ。normal 时填写每层完整 IRQ 字节及最大层数；全为非负整数，未知状态与有效数字结论分开。重置还原normal、IRQ64、层数1，隐藏尚未赚得的读数。</p><div class="lab"><form id="stack-form" novalidate><div class="fields"><label class="field" for="stack-mode">已知性条件<select id="stack-mode"><option value="normal">路径与中断已声明</option><option value="recursion">递归次数尚未声明</option><option value="target">调用目标尚未声明</option><option value="irq">中断边界尚未声明</option></select></label><label class="field" for="stack-irq">每层完整IRQ成本（字节）<input id="stack-irq" type="text" inputmode="numeric" value="64"></label><label class="field" for="stack-nesting">最大IRQ嵌套层数<input id="stack-nesting" type="text" inputmode="numeric" value="1"></label><label class="field" for="stack-prediction">预测本次返回状态<select id="stack-prediction"><option value="">先选一个预测</option><option value="UNKNOWN">边界仍然未知</option><option value="OVERFLOW">算术无法表示</option><option value="INVALID">输入不符约定</option><option value="EXCEEDS">预算超过容量</option><option value="FITS">预算刚好能放</option></select></label></div><div class="controls"><button class="btn primary" id="stack-apply" disabled>提交预测并应用</button><button class="btn" type="button" id="stack-reset">重置有界种子</button></div><p id="stack-pending" class="pending" role="status">待应用：尚未形成新结论。</p><p id="stack-feedback" class="feedback" role="status">先作预测。</p></form><div id="stack-result" class="applied-result" hidden><p id="stack-state"></p></div></div>

## 按生命线走10步，每一步先预测 {#memory-replay-title}

<span id="memory-replay"></span>

<p>固定种子：arena128、overhead0、alignment1、八槽全空、peak0；A/B/C/D/E分别槽0/1/2/3/4。顺序：A32、B32、C32、D32、释放A、释放C、E48、释放B、E48、释放D。每次提交才揭示一行，失败不改变 arena。第10步后停止；重置清空日志、预测与已赚取读数。静态全表在前文，遮住后独立练习。</p><div class="lab"><p id="trace-operation">下一步1/10：A32</p><form id="trace-form" novalidate><div class="fields"><label class="field" for="trace-prediction">预测本次返回状态<select id="trace-prediction"><option value="">先选一个预测</option><option value="INVALID">输入不符约定</option><option value="OVERFLOW">算术无法表示</option><option value="UNKNOWN">边界仍然未知</option><option value="FITS">预算刚好能放</option><option value="EXCEEDS">预算超过容量</option></select></label></div><div class="controls"><button class="btn primary" id="trace-apply" disabled>提交预测走一步</button><button type="button" class="btn" id="trace-reset">重置空arena</button></div><p id="trace-pending" class="pending" role="status">待应用：先预测下一事件。</p><p id="trace-feedback" class="feedback" role="status">结果尚未揭示。</p></form><div id="trace-result" class="applied-result" hidden><p id="trace-state"></p><ol class="trace-list" id="trace-log" tabindex="0" aria-label="仅列已经应用的生命线步骤"></ol></div></div>

## 编译器帧、水位、map，各自回答哪一问 {#memory-evidence-title}

<span id="memory-evidence"></span>

<p>stack_probe.c 是本项目原创的安全三函数调用链，仅访问各自真实、初始化且有界的24/40/56字节局部数组；volatile使这些局部访问保留，不提供并发同步。没有递归、VLA、扫描或覆盖正在运行的栈，也没有目标寄存器操作。输入17的返回32，输入255返回270，这验证值计算；它不测量帧字节。</p><div class="table-wrap" role="region" tabindex="0" aria-label="实际证据与声明夹具分开"><table><caption>实际证据与声明夹具分开</caption><thead><tr><th scope="col">构建/条件</th><th scope="col">实际 .su 观察（字节）</th><th scope="col">可支持的结论</th></tr></thead><tbody><tr><td>MinGW GCC13.1.0，x86_64；C11，O0，fno-inline，fno-optimize-sibling-calls，fstack-usage</td><td>probe_leaf48 static；probe_middle96 static；stack_probe112 static</td><td>所选主机编译的逐函数帧报告</td></tr><tr><td>toy 路径成本</td><td>80、64、32及 aggregate IRQ64</td><td>声明路径上限240，不来自上行编译器数字</td></tr><tr><td>GNU Arm Embedded GCC10.3.1 20210824，Cortex-M4 Thumb soft-float；同O0/no-inline/no-tail-call/fstack-usage</td><td>probe_leaf40 static；probe_middle64 static；stack_probe80 static</td><td>仅交叉编译未链接对象，不是运行或全局上限</td></tr></tbody></table></div><p>GCC13.1 §3.19与10.3 §3.18说明 .su 每行给函数、字节与qualifier。static是固定帧；dynamic,bounded给动态调整在内的已知上界；只有dynamic时数字只覆盖有界部分。三行不是整程序调用树；编译器目标、选项、优化、内联、库函数、汇编与间接调用覆盖都影响能否组合。此 host 报告不能套用AAPCS32或当作MCU实测；也不能把48+96+112当成包含主程序、库、IRQ的全局最坏值。</p><p>high-water mark（水位）来自某次覆盖的执行观察。未走到的错误分支、最深中断、不同数据或未真正触写的预留区仍可能漏掉。Arm AN316 V1.3 January2025 pp.5–6对静态调用树与动态覆盖的限制、p.11对上下文切换余量的例子，解释为什么“跑了一天没碰 guard”也不能证明未来安全。map补放置证据，.su补编译帧信息，水位补已执行路径观察；缺失的边界要留 UNKNOWN。</p><p>默认沙箱的可选ARM工具启动曾失败（WinError623）；保留失败后，限定批准的执行上下文使用同一安装与router成功产出ARM对象和.su，未链接、未运行。此差异只说明执行上下文，不诊断安装损坏。主机与ARM报告的差异展示target/options必须记录；仍缺库、IRQ与完整调用图。没有安装、系统配置改变或硬件操作。本地 normal 与 NDEBUG 可执行测试、无main模块编译及安全probe运行均通过 mcu-build custom profile 的 validate→dry-run→build。实际主机测试覆盖等于/超过、最大可表示与溢出、两洞碎片、释放/拒绝保持、兄弟最大值、有界倍数和未知边界。无真实水位、硬件或物理纸张验证。</p>

## 完整 C11 接口：定义失败后谁能改变 {#memory-contract-title}

<span id="memory-contract"></span>

<p><a href="../examples/memory-budget/memory_budget.h" download>下载 memory_budget.h</a> · <a href="../examples/memory-budget/memory_budget.c" download>下载 memory_budget.c</a> · <a href="../examples/memory-budget/stack_probe.c" download>下载 stack_probe.c</a> · <a href="../examples/memory-budget/README.txt" download>下载 README.txt</a></p><p>这些源是本项目原创、与厂商无关的可复用教学模块；遵循适用LiXin风格，但不虚构 EternalChip 作者、版权或许可。使用已有C11编译器；仅 MEMORY_BUDGET_TEST 包含测试main，普通编译只有模块。stack_probe.c 仅 STACK_PROBE_TEST 开启运行检查。所有输出/报错和fflush都检查失败并返回非零；NDEBUG不移除检查。</p><p>调用者必须提供存活、真实且长度诚实的已初始化输入，输出可写且与输入/state不重叠；单上下文、不可重入。NULL会先被拒绝，但非空不等于有效；本接口不检测伪造/悬空指针、不诚实跨度或数据竞争。heap先init，以后仅由step修改；不接收任意损坏元数据。init不读旧heap内容。</p><div class="table-wrap" role="region" tabindex="0" aria-label="公开接口；返回MemoryStatus与前提同样属于接口"><table><caption>公开接口；返回MemoryStatus与前提同样属于接口</caption><thead><tr><th scope="col">接口</th><th scope="col">结果和成本</th></tr></thead><tbody><tr><td>memory_envelope(layout, report)</td><td>五个区域受检加法。FITS/EXCEEDS写used/remaining/excess；INVALID/OVERFLOW保持报告。</td></tr><tr><td>memory_scale_ceil(value,numerator,denominator,result)</td><td>分母非零、中间乘积可表示；FITS写向上取整值，其余保持。</td></tr><tr><td>memory_stack(paths,pathCount,irqBytes,irqNesting,irqKnown,capacity,report)</td><td>1..8路径，每路径1..16帧；先结构验证，再UNKNOWN，再受检计算。max路径加完整IRQ总额；FITS/EXCEEDS提交报告。</td></tr><tr><td>memory_heap_init(heap,capacity,overhead,alignment)</td><td>alignment非零2的幂；完整初始化八槽与peak，不分配payload。</td></tr><tr><td>memory_heap_step(heap,allocate,slot,payload,report)</td><td>槽0..7、分配payload>0且槽未活跃；释放必须活跃。最多八块的有限first-fit；失败保持heap与report，只有FITS提交。</td></tr></tbody></table></div><p>拒绝后看见旧报告，不是又得到一次成功：必须先读返回状态。heap EXCEEDS也保持旧report，因为没有新allocation；envelope/stack EXCEEDS则写新可表示的超额报告，因为计算本身已完成。UNKNOWN保持旧值并在界面显示缺少何种边界，不能将旧数值当新结论。C的计数上限只验证metadata，不承诺侦测任意内存损坏。</p><p>下方三份完整源及完整复现说明与原生下载字节一致。代码容器可用键盘聚焦横向滚动；搜索镜像保留全文。</p>

<details id="memory-source-memory_budget-h">
<summary>完整 memory_budget.h</summary>

```text
/******************************************************************************
 * @file memory_budget.h
 * @author Embedded Engineering Notes project
 * @brief Original bounded teaching model; no third-party ownership/license claim.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef MEMORY_BUDGET_H
#define MEMORY_BUDGET_H

#include <stdbool.h>
#include <stddef.h>

#define MEMORY_MAX_BLOCKS 8U
#define MEMORY_MAX_PATHS 8U
#define MEMORY_MAX_FRAMES 16U

typedef enum {
    MEMORY_FITS, MEMORY_EXCEEDS, MEMORY_INVALID, MEMORY_OVERFLOW, MEMORY_UNKNOWN
} MemoryStatus;

typedef struct {
    size_t capacity, dataBytes, bssBytes, heapBytes, stackBytes, guardBytes;
} MemoryLayout;

typedef struct {
    size_t used, remaining, excess;
} MemoryReport;

typedef struct {
    const size_t *frames;
    size_t frameCount, repetitions;
    bool known;
} MemoryPath;

typedef struct {
    size_t offset, span, payload;
    bool live;
} MemoryBlock;

typedef struct {
    size_t capacity, overhead, alignment, peak;
    MemoryBlock blocks[MEMORY_MAX_BLOCKS];
} MemoryHeap;

typedef struct {
    size_t live, peak, totalFree, largestFree;
} MemoryHeapReport;

/* All non-NULL pointers designate live, initialized real objects of the stated
 * extent; outputs/state/inputs must not overlap. No arbitrary pointer validation.
 * Single execution context, non-reentrant. Counts bounded by macros above.
 * FITS/EXCEEDS write numerical reports for envelope/stack; INVALID/OVERFLOW/UNKNOWN
 * preserve the entire output. Heap failures preserve heap AND report; only FITS
 * commits. A report used after failure is old accepted state, not a new result.
 */

/** @brief Check a non-overlapping RAM reservation envelope.
 * @param[in] layout Real initialized layout. @param[out] report Independent output.
 * @return FITS (including equality), EXCEEDS, INVALID or OVERFLOW. */
MemoryStatus memory_envelope(const MemoryLayout *layout, MemoryReport *report);

/** @brief Compute ceil(value*numerator/denominator) with checked intermediate.
 * @param[in] value,numerator,denominator size_t values; denominator must be nonzero.
 * @param[out] result Independent writable size_t. @return FITS/INVALID/OVERFLOW. */
MemoryStatus memory_scale_ceil(size_t value, size_t numerator, size_t denominator, size_t *result);

/** @brief Maximum sibling path plus bounded aggregate interrupt demand.
 * @param[in] paths Real path array; each known path has 1..16 frame costs.
 * repetitions=0 or known=false means UNKNOWN; irqKnown=false means UNKNOWN.
 * Repetitions multiply a whole path (explicit conservative bounded recurrence).
 * irqBytes is the complete per-nesting-level allowance, not a hardware constant.
 * @param[in] pathCount,irqBytes,irqNesting,irqKnown,capacity Declared model bounds.
 * @param[out] report Independent report. @return All five MemoryStatus values. */
MemoryStatus memory_stack(const MemoryPath *paths, size_t pathCount, size_t irqBytes,
                          size_t irqNesting, bool irqKnown, size_t capacity, MemoryReport *report);

/** @brief Initialize an integer first-fit arena without allocating host memory.
 * @param[out] heap Real writable object; old contents are not read.
 * @param[in] capacity,overhead,alignment Bytes; alignment is a power of two.
 * @return FITS/INVALID; INVALID preserves heap. */
MemoryStatus memory_heap_init(MemoryHeap *heap, size_t capacity, size_t overhead, size_t alignment);

/** @brief Allocate/release one of eight named slots with adjacent free-gap coalescing.
 * @param[in,out] heap Initialized only by init/step, no caller corruption.
 * @param[in] allocate true allocates; false releases a live slot.
 * @param[in] slot 0..7; payload positive for allocation, ignored for release.
 * @param[out] report Independent real output. No data pointers are returned.
 * @return FITS commits; EXCEEDS/INVALID/OVERFLOW preserve heap and report. */
MemoryStatus memory_heap_step(MemoryHeap *heap, bool allocate, size_t slot, size_t payload,
                             MemoryHeapReport *report);

#endif
```

</details>



<details id="memory-source-memory_budget-c">
<summary>完整 memory_budget.c</summary>

```text
/******************************************************************************
 * @file memory_budget.c
 * @author Embedded Engineering Notes project
 * @brief Original finite RAM model. LiXin style, truthful project provenance.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "memory_budget.h"
#include <stdint.h>

/** @brief Checked addition. @param[in] left,right Operands. @param[out] result Sum.
 * @return false on overflow, preserving result. */
static bool add_size(size_t left, size_t right, size_t *result)
{
    /** Subtract before addition so wrapping never occurs. **/
    if (right > SIZE_MAX - left) {
        return false;
    }
    *result = left + right;
    return true;
}

/** @brief Classify a representable total. @param[in] total,capacity Bytes.
 * @param[out] report Independent output. @return FITS/EXCEEDS. */
static MemoryStatus classify(size_t total, size_t capacity, MemoryReport *report)
{
    MemoryReport candidate = {total, 0U, 0U};
    /** Subtraction is taken only in its ordered branch. **/
    if (total > capacity) {
        candidate.excess = total - capacity;
        *report = candidate;
        return MEMORY_EXCEEDS;
    }
    candidate.remaining = capacity - total;
    *report = candidate;
    return MEMORY_FITS;
}

/** @brief Check static regions plus arenas plus guard. @param[in] layout Input.
 * @param[out] report Output. @return FITS/EXCEEDS/INVALID/OVERFLOW. */
MemoryStatus memory_envelope(const MemoryLayout *layout, MemoryReport *report)
{
    size_t total = 0U;
    /** Reject NULL before reading fields; caller establishes real object extents. **/
    if (layout == NULL || report == NULL) {
        return MEMORY_INVALID;
    }
    if (!add_size(layout->dataBytes, layout->bssBytes, &total) ||
        !add_size(total, layout->heapBytes, &total) ||
        !add_size(total, layout->stackBytes, &total) ||
        !add_size(total, layout->guardBytes, &total)) {
        return MEMORY_OVERFLOW;
    }
    return classify(total, layout->capacity, report);
}

/** @brief Checked rational ceiling. @param[in] value,numerator,denominator Operands.
 * @param[out] result Output. @return FITS/INVALID/OVERFLOW. */
MemoryStatus memory_scale_ceil(size_t value, size_t numerator, size_t denominator, size_t *result)
{
    size_t product;
    size_t quotient;
    /** This contract rejects even a reducible ratio if its selected product overflows. **/
    if (result == NULL || denominator == 0U) {
        return MEMORY_INVALID;
    }
    if (numerator != 0U && value > SIZE_MAX / numerator) {
        return MEMORY_OVERFLOW;
    }
    product = value * numerator;
    quotient = product / denominator;
    if (product % denominator != 0U && !add_size(quotient, 1U, &quotient)) {
        return MEMORY_OVERFLOW;
    }
    *result = quotient;
    return MEMORY_FITS;
}

/** @brief Bounded maximum path plus IRQ allowance. @param[in] paths Path array.
 * @param[in] pathCount,irqBytes,irqNesting,irqKnown,capacity Declared bounds.
 * @param[out] report Output. @return Named status, preserving invalid/unknown output. */
MemoryStatus memory_stack(const MemoryPath *paths, size_t pathCount, size_t irqBytes,
                          size_t irqNesting, bool irqKnown, size_t capacity, MemoryReport *report)
{
    size_t maximum = 0U;
    size_t interrupts;
    /** Structural validation precedes classification and all numerical work. **/
    if (paths == NULL || report == NULL || pathCount == 0U || pathCount > MEMORY_MAX_PATHS) {
        return MEMORY_INVALID;
    }
    for (size_t index = 0U; index < pathCount; ++index) {
        if (paths[index].frames == NULL || paths[index].frameCount == 0U ||
            paths[index].frameCount > MEMORY_MAX_FRAMES) {
            return MEMORY_INVALID;
        }
    }
    for (size_t index = 0U; index < pathCount; ++index) {
        if (!paths[index].known || paths[index].repetitions == 0U) {
            return MEMORY_UNKNOWN;
        }
    }
    if (!irqKnown) {
        return MEMORY_UNKNOWN;
    }
    for (size_t index = 0U; index < pathCount; ++index) {
        size_t path = 0U;
        for (size_t frame = 0U; frame < paths[index].frameCount; ++frame) {
            if (!add_size(path, paths[index].frames[frame], &path)) {
                return MEMORY_OVERFLOW;
            }
        }
        if (memory_scale_ceil(path, paths[index].repetitions, 1U, &path) != MEMORY_FITS) {
            return MEMORY_OVERFLOW;
        }
        if (path > maximum) {
            maximum = path;
        }
    }
    if (memory_scale_ceil(irqBytes, irqNesting, 1U, &interrupts) != MEMORY_FITS ||
        !add_size(maximum, interrupts, &maximum)) {
        return MEMORY_OVERFLOW;
    }
    return classify(maximum, capacity, report);
}

/** @brief Initialize a metadata-only arena. @param[out] heap State object.
 * @param[in] capacity,overhead,alignment Configuration. @return FITS/INVALID. */
MemoryStatus memory_heap_init(MemoryHeap *heap, size_t capacity, size_t overhead, size_t alignment)
{
    MemoryHeap candidate = {0};
    /** Power-of-two alignment gives aligned spans and starts from offset zero. **/
    if (heap == NULL || alignment == 0U || (alignment & (alignment - 1U)) != 0U) {
        return MEMORY_INVALID;
    }
    candidate.capacity = capacity;
    candidate.overhead = overhead;
    candidate.alignment = alignment;
    *heap = candidate;
    return MEMORY_FITS;
}

/** @brief Find first fitting gap and summarize all gaps. @param[in] heap Valid state.
 * @param[in] wanted Required contiguous span. @param[out] offset First fit or SIZE_MAX.
 * @param[out] report Live and free-space summary. @return None. */
static void heap_gaps(const MemoryHeap *heap, size_t wanted, size_t *offset, MemoryHeapReport *report)
{
    size_t cursor = 0U;
    MemoryHeapReport candidate = {0U, heap->peak, 0U, 0U};
    /** At most eight live blocks; find each next block without host allocation. **/
    *offset = SIZE_MAX;
    for (size_t pass = 0U; pass <= MEMORY_MAX_BLOCKS; ++pass) {
        size_t next = heap->capacity;
        size_t span = 0U;
        for (size_t index = 0U; index < MEMORY_MAX_BLOCKS; ++index) {
            const MemoryBlock *block = &heap->blocks[index];
            if (block->live && block->offset >= cursor && block->offset < next) {
                next = block->offset;
                span = block->span;
            }
        }
        if (next > cursor) {
            size_t gap = next - cursor;
            candidate.totalFree += gap;
            if (gap > candidate.largestFree) {
                candidate.largestFree = gap;
            }
            if (*offset == SIZE_MAX && gap >= wanted) {
                *offset = cursor;
            }
        }
        if (span == 0U) {
            break;
        }
        candidate.live += span;
        cursor = next + span;
    }
    *report = candidate;
}

/** @brief Commit one allocation/lifetime event. @param[in,out] heap Valid initialized state.
 * @param[in] allocate,slot,payload Event. @param[out] report Output. @return Named status. */
MemoryStatus memory_heap_step(MemoryHeap *heap, bool allocate, size_t slot, size_t payload,
                             MemoryHeapReport *report)
{
    MemoryHeap candidate;
    MemoryHeapReport summary;
    size_t offset;
    size_t span;
    /** Valid-state provenance is a caller precondition; NULL is still rejected first. **/
    if (heap == NULL || report == NULL || slot >= MEMORY_MAX_BLOCKS) {
        return MEMORY_INVALID;
    }
    candidate = *heap;
    if (allocate) {
        if (payload == 0U || candidate.blocks[slot].live) {
            return MEMORY_INVALID;
        }
        if (!add_size(payload, candidate.overhead, &span)) {
            return MEMORY_OVERFLOW;
        }
        if (span % candidate.alignment != 0U &&
            !add_size(span, candidate.alignment - span % candidate.alignment, &span)) {
            return MEMORY_OVERFLOW;
        }
        heap_gaps(&candidate, span, &offset, &summary);
        if (offset == SIZE_MAX) {
            return MEMORY_EXCEEDS;
        }
        candidate.blocks[slot] = (MemoryBlock){offset, span, payload, true};
    } else {
        if (!candidate.blocks[slot].live) {
            return MEMORY_INVALID;
        }
        candidate.blocks[slot] = (MemoryBlock){0U, 0U, 0U, false};
    }
    heap_gaps(&candidate, 0U, &offset, &summary);
    if (summary.live > candidate.peak) {
        candidate.peak = summary.live;
        summary.peak = summary.live;
    }
    *heap = candidate;
    *report = summary;
    return MEMORY_FITS;
}

#ifdef MEMORY_BUDGET_TEST
#include <stdio.h>
#include <string.h>

/** @brief Exercise rejection/report boundaries. @return Zero for the fixed expectations. */
static int test_numeric(void)
{
    MemoryLayout layout = {1024U, 128U, 256U, 256U, 256U, 129U};
    MemoryReport report = {777U, 777U, 777U};
    size_t scaled = 777U;
    const size_t frames[] = {80U, 64U, 32U};
    const size_t sibling[] = {80U, 48U};
    const size_t huge[] = {SIZE_MAX, 1U};
    MemoryPath paths[] = {{frames, 3U, 1U, true}, {sibling, 2U, 1U, true}};
    MemoryPath overCount[9] = {{NULL, 0U, 0U, false}};
    /** Literal expected values are independent of the production arithmetic. **/
    if (memory_envelope(&layout, &report) != MEMORY_EXCEEDS || report.used != 1025U ||
        report.excess != 1U || report.remaining != 0U) {
        return 1;
    }
    layout = (MemoryLayout){0U, 0U, 0U, 0U, 0U, 0U};
    if (memory_envelope(&layout, &report) != MEMORY_FITS || report.used != 0U) {
        return 1;
    }
    layout = (MemoryLayout){SIZE_MAX, SIZE_MAX, 0U, 0U, 0U, 0U};
    if (memory_envelope(&layout, &report) != MEMORY_FITS || report.used != SIZE_MAX) {
        return 1;
    }
    layout.guardBytes = 1U;
    if (memory_envelope(&layout, &report) != MEMORY_OVERFLOW || report.used != SIZE_MAX ||
        memory_envelope(NULL, &report) != MEMORY_INVALID || report.used != SIZE_MAX ||
        memory_envelope(&layout, NULL) != MEMORY_INVALID) {
        return 1;
    }
    if (memory_scale_ceil(7U, 3U, 2U, &scaled) != MEMORY_FITS || scaled != 11U ||
        memory_scale_ceil(SIZE_MAX, 1U, 1U, &scaled) != MEMORY_FITS || scaled != SIZE_MAX ||
        memory_scale_ceil(SIZE_MAX, 2U, 2U, &scaled) != MEMORY_OVERFLOW || scaled != SIZE_MAX ||
        memory_scale_ceil(0U, SIZE_MAX, 1U, &scaled) != MEMORY_FITS || scaled != 0U ||
        memory_scale_ceil(1U, 1U, 0U, &scaled) != MEMORY_INVALID || scaled != 0U ||
        memory_scale_ceil(1U, 1U, 1U, NULL) != MEMORY_INVALID) {
        return 1;
    }
    if (memory_stack(paths, 2U, 64U, 1U, true, 256U, &report) != MEMORY_FITS ||
        report.used != 240U || report.remaining != 16U ||
        memory_stack(paths, 2U, 64U, 1U, true, 240U, &report) != MEMORY_FITS ||
        report.remaining != 0U ||
        memory_stack(paths, 2U, 64U, 1U, true, 239U, &report) != MEMORY_EXCEEDS || report.excess != 1U) {
        return 1;
    }
    paths[0].repetitions = 2U;
    if (memory_stack(paths, 2U, 32U, 2U, true, 416U, &report) != MEMORY_FITS || report.used != 416U) {
        return 1;
    }
    paths[0].repetitions = 0U;
    if (memory_stack(paths, 2U, 64U, 1U, true, 256U, &report) != MEMORY_UNKNOWN || report.used != 416U) {
        return 1;
    }
    paths[0].repetitions = 1U;
    paths[1].known = false;
    if (memory_stack(paths, 2U, 64U, 1U, true, 256U, &report) != MEMORY_UNKNOWN || report.used != 416U) {
        return 1;
    }
    paths[1].known = true;
    if (memory_stack(paths, 2U, 64U, 1U, false, 256U, &report) != MEMORY_UNKNOWN || report.used != 416U ||
        memory_stack(NULL, 2U, 0U, 0U, true, 0U, &report) != MEMORY_INVALID ||
        memory_stack(paths, 0U, 0U, 0U, true, 0U, &report) != MEMORY_INVALID ||
        memory_stack(overCount, 9U, 0U, 0U, true, 0U, &report) != MEMORY_INVALID ||
        memory_stack(paths, 2U, 0U, 0U, true, 0U, NULL) != MEMORY_INVALID) {
        return 1;
    }
    paths[0] = (MemoryPath){NULL, 1U, 1U, true};
    if (memory_stack(paths, 2U, 0U, 0U, true, 0U, &report) != MEMORY_INVALID ||
        report.used != 416U || report.remaining != 0U || report.excess != 0U) {
        return 1;
    }
    paths[0].frames = huge;
    paths[0].frameCount = 2U;
    if (memory_stack(paths, 2U, 0U, 0U, true, SIZE_MAX, &report) != MEMORY_OVERFLOW || report.used != 416U) {
        return 1;
    }
    paths[0] = (MemoryPath){frames, 3U, SIZE_MAX, true};
    if (memory_stack(paths, 2U, 0U, 0U, true, SIZE_MAX, &report) != MEMORY_OVERFLOW || report.used != 416U) {
        return 1;
    }
    paths[0].repetitions = 1U;
    if (memory_stack(paths, 2U, SIZE_MAX, 2U, true, SIZE_MAX, &report) != MEMORY_OVERFLOW ||
        memory_stack(paths, 2U, SIZE_MAX, 1U, true, SIZE_MAX, &report) != MEMORY_OVERFLOW ||
        report.used != 416U) {
        return 1;
    }
    return 0;
}

/** @brief Exercise finite real metadata lifetime/fragmentation fixtures. @return Zero on match. */
static int test_heap(void)
{
    MemoryHeap heap;
    MemoryHeap before;
    MemoryHeapReport report = {777U, 777U, 777U, 777U};
    /** A,B,C,D are four disjoint live 32-byte spans in a 128-byte arena. **/
    if (memory_heap_init(&heap, 128U, 0U, 1U) != MEMORY_FITS) {
        return 1;
    }
    for (size_t index = 0U; index < 4U; ++index) {
        if (memory_heap_step(&heap, true, index, 32U, &report) != MEMORY_FITS ||
            heap.blocks[index].offset != index * 32U) {
            return 1;
        }
    }
    if (report.live != 128U || report.peak != 128U || report.totalFree != 0U ||
        memory_heap_step(&heap, false, 0U, 0U, &report) != MEMORY_FITS || report.live != 96U ||
        memory_heap_step(&heap, false, 2U, 0U, &report) != MEMORY_FITS || report.live != 64U ||
        report.totalFree != 64U || report.largestFree != 32U || report.peak != 128U) {
        return 1;
    }
    memcpy(&before, &heap, sizeof heap);
    if (memory_heap_step(&heap, true, 4U, 48U, &report) != MEMORY_EXCEEDS ||
        memcmp(&before, &heap, sizeof heap) != 0 || report.live != 64U || report.largestFree != 32U ||
        memory_heap_step(&heap, false, 0U, 0U, &report) != MEMORY_INVALID ||
        memory_heap_step(&heap, true, 1U, 1U, &report) != MEMORY_INVALID ||
        memory_heap_step(&heap, true, 8U, 1U, &report) != MEMORY_INVALID ||
        memory_heap_step(&heap, true, 4U, 0U, &report) != MEMORY_INVALID ||
        memory_heap_step(NULL, true, 4U, 1U, &report) != MEMORY_INVALID ||
        memory_heap_step(&heap, true, 4U, 1U, NULL) != MEMORY_INVALID ||
        memory_heap_init(&heap, 128U, 0U, 3U) != MEMORY_INVALID ||
        memcmp(&before, &heap, sizeof heap) != 0) {
        return 1;
    }
    if (memory_heap_step(&heap, false, 1U, 0U, &report) != MEMORY_FITS || report.largestFree != 96U ||
        memory_heap_step(&heap, true, 4U, 48U, &report) != MEMORY_FITS ||
        report.live != 80U || report.totalFree != 48U || report.largestFree != 48U || report.peak != 128U) {
        return 1;
    }
    if (memory_heap_init(&heap, 32U, 4U, 8U) != MEMORY_FITS ||
        memory_heap_step(&heap, true, 0U, 5U, &report) != MEMORY_FITS || report.live != 16U ||
        memory_heap_step(&heap, true, 1U, 5U, &report) != MEMORY_FITS || report.live != 32U) {
        return 1;
    }
    if (memory_heap_init(&heap, 127U, 0U, 1U) != MEMORY_FITS) {
        return 1;
    }
    for (size_t index = 0U; index < 3U; ++index) {
        if (memory_heap_step(&heap, true, index, 32U, &report) != MEMORY_FITS) {
            return 1;
        }
    }
    memcpy(&before, &heap, sizeof heap);
    if (memory_heap_step(&heap, true, 3U, 32U, &report) != MEMORY_EXCEEDS ||
        report.live != 96U || report.totalFree != 31U || report.largestFree != 31U ||
        report.peak != 96U || memcmp(&before, &heap, sizeof heap) != 0) {
        return 1;
    }
    if (memory_heap_init(&heap, 32U, 4U, 8U) != MEMORY_FITS ||
        memory_heap_step(&heap, true, 0U, 5U, &report) != MEMORY_FITS ||
        memory_heap_step(&heap, true, 1U, 5U, &report) != MEMORY_FITS) {
        return 1;
    }
    memcpy(&before, &heap, sizeof heap);
    if (memory_heap_step(&heap, true, 2U, 1U, &report) != MEMORY_EXCEEDS || report.live != 32U ||
        memcmp(&before, &heap, sizeof heap) != 0) {
        return 1;
    }
    if (memory_heap_init(&heap, 0U, 0U, 1U) != MEMORY_FITS ||
        memory_heap_step(&heap, true, 0U, 1U, &report) != MEMORY_EXCEEDS ||
        memory_heap_init(NULL, 0U, 0U, 1U) != MEMORY_INVALID ||
        memory_heap_init(&heap, 1U, 0U, 0U) != MEMORY_INVALID ||
        memory_heap_init(&heap, SIZE_MAX, 1U, 8U) != MEMORY_FITS ||
        memory_heap_step(&heap, true, 0U, SIZE_MAX, &report) != MEMORY_OVERFLOW ||
        memory_heap_init(&heap, SIZE_MAX, 0U, 8U) != MEMORY_FITS ||
        memory_heap_step(&heap, true, 0U, SIZE_MAX, &report) != MEMORY_OVERFLOW) {
        return 1;
    }
    return 0;
}

/** @brief Fixed independent equality oracle. @return Nonzero on failure or I/O error. */
int main(void)
{
    MemoryLayout layout = {1024U, 128U, 256U, 256U, 256U, 128U};
    MemoryReport report = {777U, 777U, 777U};
    /** Runtime checks remain active with NDEBUG. **/
    if (memory_envelope(&layout, &report) != MEMORY_FITS || report.used != 1024U ||
        report.remaining != 0U || report.excess != 0U) {
        if (fprintf(stderr, "FAIL envelope equality: expected FITS/1024/0/0\n") < 0) {
            return 2;
        }
        if (fflush(stderr) != 0) {
            return 2;
        }
        return 1;
    }
    if (test_numeric() != 0 || test_heap() != 0) {
        if (fprintf(stderr, "FAIL memory budget: numeric/path/heap boundary\n") < 0) {
            return 2;
        }
        if (fflush(stderr) != 0) {
            return 2;
        }
        return 1;
    }
    if (puts("PASS memory budget: envelope, rational, lifetime, fragmentation, "
             "maximum path, unknown, preservation") == EOF) {
        return 2;
    }
    if (fflush(stdout) != 0) {
        return 2;
    }
    return 0;
}
#endif
```

</details>



<details id="memory-source-stack_probe-c">
<summary>完整 stack_probe.c</summary>

```text
/******************************************************************************
 * @file stack_probe.c
 * @author Embedded Engineering Notes project
 * @brief Original safe bounded call chain for compiler -fstack-usage evidence.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include <stddef.h>
#include <stdint.h>

/** @brief Bounded leaf. @param[in] seed 0..255. @return Defined small sum. */
static unsigned probe_leaf(unsigned seed)
{
    volatile unsigned char local[24] = {0};
    /** Access only this live array, never active-stack fill/probing. **/
    local[0] = (unsigned char)seed;
    local[23] = 3U;
    return (unsigned)local[0] + (unsigned)local[23];
}

/** @brief Bounded middle frame. @param[in] seed 0..255. @return Defined small sum. */
static unsigned probe_middle(unsigned seed)
{
    volatile unsigned char local[40] = {0};
    unsigned child;
    /** The caller frame stays live across the ordinary child call. **/
    local[0] = 5U;
    child = probe_leaf(seed);
    return child + (unsigned)local[0];
}

/** @brief Root of a fixed three-function chain. @param[in] seed Any unsigned value.
 * @return Sum bounded by 270. No target, recursion, VLA or arbitrary pointer access. */
unsigned stack_probe(unsigned seed)
{
    volatile unsigned char local[56] = {0};
    unsigned child;
    /** Constrain the input before passing it to the fixed chain. **/
    local[55] = 7U;
    child = probe_middle(seed & 255U);
    return child + (unsigned)local[55];
}

#ifdef STACK_PROBE_TEST
#include <stdio.h>

/** @brief Execute only bounded initialized local arrays. @return Checked test status. */
int main(void)
{
    /** 17+3+5+7=32 is a literal value oracle, not a frame-size oracle. **/
    if (stack_probe(17U) != 32U || stack_probe(255U) != 270U) {
        if (fprintf(stderr, "FAIL bounded stack probe value\n") < 0) {
            return 2;
        }
        if (fflush(stderr) != 0) {
            return 2;
        }
        return 1;
    }
    if (puts("PASS bounded stack probe: 32 and 270; compiler frames are separate evidence") == EOF) {
        return 2;
    }
    if (fflush(stdout) != 0) {
        return 2;
    }
    return 0;
}
#endif
```

</details>



<details id="memory-source-README-txt">
<summary>完整 README.txt</summary>

```text
Memory budget: original bounded C11 teaching models
Embedded Engineering Notes project, 2026-10-17. No third-party authorship or
new license grant is asserted. Read the repository's applicable terms.

Files: memory_budget.h, memory_budget.c, stack_probe.c, README.txt.
Prerequisite: an existing C11 compiler; GCC is needed for -fstack-usage.
No board, MMIO, dynamic host allocator, recursion or active-stack scan is used.

Run from the directory containing all four files (Windows executables use .exe):
cc -std=c11 -Wall -Wextra -Werror -pedantic -DMEMORY_BUDGET_TEST memory_budget.c -o budget-test
./budget-test
cc -std=c11 -Wall -Wextra -Werror -pedantic -DMEMORY_BUDGET_TEST -DNDEBUG memory_budget.c -o budget-ndebug
./budget-ndebug
cc -std=c11 -Wall -Wextra -Werror -pedantic -c memory_budget.c -o memory_budget.o
gcc -std=c11 -Wall -Wextra -Werror -pedantic -O0 -fno-inline -fno-optimize-sibling-calls -fstack-usage -c stack_probe.c -o probe.o
gcc -std=c11 -Wall -Wextra -Werror -pedantic -O0 -fno-inline -fno-optimize-sibling-calls -DSTACK_PROBE_TEST stack_probe.c -o probe-test
./probe-test
arm-none-eabi-gcc -std=c11 -Wall -Wextra -Werror -pedantic -mcpu=cortex-m4 -mthumb -mfloat-abi=soft -O0 -fno-inline -fno-optimize-sibling-calls -fstack-usage -c stack_probe.c -o probe-arm.o

Stop immediately if any compile or execution returns nonzero. Never run a stale
executable after failure. Keep outputs in a fresh private directory if comparing
builds. An engineering workspace requiring mcu-build must configure these same
compiler argv as custom profiles and execute validate -> build --dry-run -> build.
The public commands describe arguments, not permission to bypass such a route.
This chapter's actual compilation uses that route; no helper compiles secretly.

Expected main summary:
PASS memory budget: envelope, rational, lifetime, fragmentation, maximum path, unknown, preservation
Expected probe summary:
PASS bounded stack probe: 32 and 270; compiler frames are separate evidence
Runtime checks and checked stdout/stderr flushing remain active with NDEBUG.

To reuse: include memory_budget.h, compile memory_budget.c without
MEMORY_BUDGET_TEST and link its object with your own caller. There is no main in
that build. Inputs/output/state must be real live objects of their truthful
extent, mutually non-overlapping. Functions are single-context, non-reentrant.
NULL checks cannot detect forged/dangling pointers, dishonest spans or races.
MemoryHeap must come from memory_heap_init, then only memory_heap_step may alter
its representation. Caller corruption is outside the contract. No payload
storage/pointer is returned: slots are integer metadata for eight named objects.

memory_envelope: data+BSS+reserved heap+reserved stack+guard, no live bytes added
again. FITS includes equality; EXCEEDS writes used/remaining=0/excess. INVALID
and OVERFLOW preserve report. All fields use size_t. Zero capacity/all-zero
reservation is permitted. Alignment/padding must already be in declared regions.

memory_scale_ceil: ceil(value*numerator/denominator). Denominator zero is INVALID.
The selected intermediate product must be representable; a reducible ratio can
still return OVERFLOW. Failure preserves result. Check before multiplication
and do not use (product+denominator-1)/denominator, which can overflow again.

memory_stack: 1..8 alternative paths, each 1..16 frame costs; max(sum(frames)*
repetitions)+irqBytes*irqNesting. All frame numbers are declared costs, not MCU
measurements. repetitions=0 or known=false, or irqKnown=false, returns UNKNOWN
and preserves report. Counts/pointers invalid -> INVALID first; then missing
bounds -> UNKNOWN; then checked arithmetic -> OVERFLOW; then FITS/EXCEEDS with
new report. A repeated path is a conservative bound for that whole sequence,
not automatic discovery of recursion depth. Complete IRQ cost includes selected
hardware frame, alignment, handler calls, optional FP state and nesting.

memory_heap_init: capacity may be zero; alignment must be a nonzero power of 2.
memory_heap_step: slot0..7, allocation positive payload and unused slot; release
requires live slot. span=round_up(payload+overhead, alignment); first-fit takes a
contiguous gap, adjacent free gaps implicitly coalesce. Allocator metadata itself
is outside this fictional arena; overhead is a declared per-allocation model.
Only FITS commits heap AND report; EXCEEDS/INVALID/OVERFLOW preserve both. Compare
named fields/bytes after a rejected transaction; a retained report is OLD state.

Independent fixtures:
1024=128data+256BSS+256heap+256stack+128guard, remaining0; guard129 ->1025, excess1.
Call path80+64+32=176; sibling80+48=128; maximum176, not304; IRQ64 ->240,
stack256 ->16 free. Repeated path twice with IRQ32*2 ->416. Unknown is not0.
Heap128/overhead0/alignment1: A32,B32,C32,D32 at0,32,64,96; releaseA thenC ->
64free but largest32; E48 rejects. ReleaseB ->96contiguous; E48 now succeeds,
live80/free48/peak128. With overhead4/alignment8, each payload5 consumes16.

Actual local host observation: MinGW GCC13.1.0 x86_64, strict flags above,
probe.o -O0 -fno-inline -fno-optimize-sibling-calls -fstack-usage:
probe_leaf48 static; probe_middle96 static; stack_probe112 static, bytes.
Line numbers/path prefixes in .su depend on source location. These are three
per-function compiler reports, not global worst-case, library coverage, target
measurement or high-water marks. Optional object-only cross-compilation using
GNU Arm Embedded GCC10.3.1 20210824, Cortex-M4 Thumb, soft float, same O0 and
no-inline/no-tail-call stack-usage flags: probe_leaf40 static, probe_middle64
static, stack_probe80 static. It produced an unlinked object, never executed.
The default sandbox first refused tool launch (WinError623); a scoped approved
execution context succeeded using the identical installed compiler and router.
That difference is execution-context evidence, not an installation diagnosis.
No install, system-setting change or hardware operation followed. A target
compiler report is still not target execution, runtime/library/IRQ coverage or
global worst-case proof. The optional ARM command needs an existing toolchain.

GCC10.3/13.1 .su qualifiers: static=fixed frame; dynamic,bounded=reported upper
bound including dynamic adjustments; dynamic without bounded=bounded part only.
Inspect target/options/inlining, call graph, libraries and interrupt nesting
before combining reports. The arithmetic toy costs80/64/32/64 are independent
of actual probe frames48/96/112. Do not substitute one evidence kind for another.
AAPCS32 2025Q1: SP mod4=0 at all times, mod8=0 at public interfaces. Cortex-M4
PM0214 Rev10 exception base frame is eight words (32 bytes); alignment and FP
extension depend on configuration/state, and handler software frames add more.
No actual target bound, stack watermark, physical print or hardware fit is proved.
```

</details>



## 十题：基础、故障与迁移 {#memory-practice-title}

<span id="memory-practice"></span>

<p class="practice-intro">每题输入与数字独立，先写理由再展开答案。普通打印展开全文后恢复原折叠；只打印题目保留全部题干数字并隐藏解析与活动结果，打印派发失败也恢复。无脚本可使用原生details答案；题目专用打印按钮需脚本。</p><div class="notes-toolbar"><button class="btn" id="expand-notes">展开全部答案</button><button class="btn" id="collapse-notes">折叠全部答案</button><button class="btn primary" id="print-questions">只打印题目</button></div><div id="recall-questions"><article class="exercise" id="memory-exercise-01"><h3 id="memory-question-01">01 · 基础：data有几本账</h3><p>假定text200与rodata40直接存于Flash；data初值128存于Flash、运行时复制RAM128；BSS256由启动清零；无其他头/padding。Flash字节与静态RAM字节各是多少？</p><details class="exercise-answer" id="memory-answer-01"><summary>展开本题原因</summary><p>Flash=200+40+128=368；静态RAM=128+256=384。BSS不需等长Flash零payload，不代表不用RAM。下一步分别写LMA和VMA角色。</p></details></article><article class="exercise" id="memory-exercise-02"><h3 id="memory-question-02">02 · 基础：精确边界</h3><p>RAM1024，data128、BSS256、heap预留256、stack预留256、guard128，各区不重叠且无额外padding。布局是否放得下、unreserved余量多少？guard改129会怎样？</p><details class="exercise-answer" id="memory-answer-02"><summary>展开本题原因</summary><p>原总1024，FITS、余量0。guard129→总1025，EXCEEDS1。guard已经在包络中，不能把128再花一次。</p></details></article><article class="exercise" id="memory-exercise-03"><h3 id="memory-question-03">03 · 故障：重复记账</h3><p>RAM1024，分区128data+256BSS+256heap+256stack+128guard。已知heap live128、stack demand240。有人再将128和240加到1024上判失败，哪里错？</p><details class="exercise-answer" id="memory-answer-03"><summary>展开本题原因</summary><p>128与240在已预留的256arena之内；布局仍1024。分开比较heap128≤256、stack240≤256；剩余arena容量不能无条件跨边界借用。</p></details></article><article class="exercise" id="memory-exercise-04"><h3 id="memory-question-04">04 · 基础：payload不是span</h3><p>假设arena32、每对象overhead4、alignment8向上取整；A与B的payload各5且同时活跃。两者总span、剩余空间多少？随后第三个payload1能否放下？</p><details class="exercise-answer" id="memory-answer-04"><summary>展开本题原因</summary><p>每个round_up(5+4,8)=16，总32，余0。第三个至少8，EXCEEDS；失败保持arena与旧报告。不要只加payload10。</p></details></article><article class="exercise" id="memory-exercise-05"><h3 id="memory-question-05">05 · 故障：64free为何拒绝48</h3><p>arena128，无overhead、alignment1。A/B/C/D各32占偏移0/32/64/96。释放A与C，B/D仍活。连续申请48会如何？再释放B后呢？</p><details class="exercise-answer" id="memory-answer-05"><summary>展开本题原因</summary><p>总空闲64、最大洞32，所以48拒绝，live64/peak128保持。释放B后0..95成96连续洞，48可放；新live80、空闲48、peak仍128。</p></details></article><article class="exercise" id="memory-exercise-06"><h3 id="memory-question-06">06 · 基础：兄弟路径</h3><p>已声明互斥链A80→B64→C32或A80→D48，最大aggregate IRQ64，单栈reservation256。已知边界齐全，需求与余量多少？若错误累计两路径会错在哪里？</p><details class="exercise-answer" id="memory-answer-06"><summary>展开本题原因</summary><p>max(176,128)+64=240，余16。兄弟不同时活跃；把两条完整路径相加还重复A。必须列可达同时帧。</p></details></article><article class="exercise" id="memory-exercise-07"><h3 id="memory-question-07">07 · 故障：中断层数改变</h3><p>路径成本176，最多2层IRQ且每层完整成本64，stack256；guard另在布局中。需求、超额多少？若最多层数完全未知，能返回FITS/0吗？</p><details class="exercise-answer" id="memory-answer-07"><summary>展开本题原因</summary><p>176+2×64=304，EXCEEDS48。层数未知应UNKNOWN，不是0或旧240；guard不改变这项算术前提。</p></details></article><article class="exercise" id="memory-exercise-08"><h3 id="memory-question-08">08 · 故障：数值和未知</h3><p>假设某实现SIZE_MAX=65535，原report.used=777。envelope的data65535、其他0、guard1；另一个stack请求递归次数未给。分别返回什么，used能否被改成0？</p><details class="exercise-answer" id="memory-answer-08"><summary>展开本题原因</summary><p>前者在加法前返回OVERFLOW；后者UNKNOWN。两者保持used777，它是旧报告，不能解释成新的安全数值。真实C用实际SIZE_MAX，本题65535是独立假定。</p></details></article><article class="exercise" id="memory-exercise-09"><h3 id="memory-question-09">09 · 迁移：ABI与异常</h3><p>限定AAPCS32 2025Q1和Cortex-M4 PM0214 Rev10。有人说“SP每条指令必须8字节对齐，而且中断总成本永远32”。两句话各缺什么条件？</p><details class="exercise-answer" id="memory-answer-09"><summary>展开本题原因</summary><p>ABI始终要求4，公开接口要求8。32只是基本8-word硬件帧，还需对齐/FP条件、处理函数帧与嵌套；Thread PSP与Handler MSP还应分别记账。</p></details></article><article class="exercise" id="memory-exercise-10"><h3 id="memory-question-10">10 · 迁移：证据不能替代边界</h3><p>主机GCC13.1.0/O0/no-inline/no-tail-call的.su为leaf48、middle96、root112，均static；目标map显示stack256，一次目标水位记录200。能据此证明所有未来目标路径≤256吗？</p><details class="exercise-answer" id="memory-answer-10"><summary>展开本题原因</summary><p>不能。host帧不是target帧；.su逐函数不含完整路径/库/IRQ证明；水位200只覆盖已执行条件。需要目标构建/调用覆盖/嵌套等边界，未齐全保持UNKNOWN。</p></details></article></div><p class="practice-intro">隔一天换成arena96、三个32对象、释放中间对象后申请40，重新画生命线；再将路径换为80+48与80+64+16，自己列前提后求最大。一次选对或读完不代表长期掌握。若卡住，请把“LMA/VMA分账”“live与reservation”“最大洞”“UNKNOWN与旧输出”中的具体困惑交给助手。</p>

## 核对版本与条款，先读哪一份 {#memory-sources-title}

<span id="memory-sources"></span>

<p>核对日期2026-10-17。以下primary clauses已作有界文本阅读；不把下载、排队条目或别人的硬件测试当本章验证。图、夹具、代码与问答均是项目原创教学内容；不复制私有/付费课程。</p><ul class="source-list"><li id="memory-source-aapcs"><a href="https://github.com/ARM-software/abi-aa/blob/c51addc3dc03e73a016a1e4edf25440bcac76431/aapcs32/aapcs32.rst#L1053">Arm AAPCS32 2025Q1，issue2025-04-07，固定commit c51addc3</a>：§6.2.1.1/.2的stack边界与4/8对齐。首选阅读任务：分别抄下“at all times”和“public interface”的条件，解释为何不能合并成一条8字节规则。</li><li id="memory-source-gcc"><a href="https://gcc.gnu.org/onlinedocs/gcc-13.1.0/gcc/Developer-Options.html#index-fstack-usage">GCC13.1 §3.19 Developer Options</a>及<a href="https://gcc.gnu.org/onlinedocs/gcc-10.3.0/gcc/Developer-Options.html#index-fstack-usage">GCC10.3 §3.18</a>：实际读取-fstack-usage全部qualifier段；只支持该编译器报告的含义。</li><li id="memory-source-pm"><a href="https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf">ST PM0214 Rev10 March2020</a>：Thread/Handler及CONTROL pp.17、25，§2.3.7 pp.42–44、Figure12，CCR.STKALIGN p.231及FPCCR pp.253–254的有界文本；本章读取这些异常/对齐/FP条件，不声称整册阅读或实际寄存器验证。</li><li id="memory-source-ld"><a href="https://www.sourceware.org/binutils/docs-2.36/ld.html#Output-Section-LMA">GNU ld2.36</a>：§3.1与§3.6.8.2，VMA/LMA与初始化例子；map/脚本解释是所选工具链条件。</li><li id="memory-source-an"><a href="https://documentation-service.arm.com/static/678f964827eda361ad4e5866?token=">Arm AN316 V1.3 January2025</a>：p.3自动保存的32/104字节与aligner条件、pp.5–6 static/dynamic analysis与p.11上下文余量，支持覆盖/调用树局限；没有把应用笔记示例当成目标结论。</li></ul>

## 把预算带到时钟与后续外设 {#memory-next-title}

<span id="memory-next"></span>

<p>先把本章三个成果附在采集终端设计旁：布局包络、有限生命线、可达最大调用路径及未知清单。下一章09继续时钟树、切换与时基；单元10才进入定时器，10—14为下一阶段。终点仍是32个实质单元、八阶段证据与可回放终端；本章并未完成整门课程。</p><div class="next-links"><a href="../learn/reset-runtime.html">上一章：从复位到C运行环境</a><a href="../learn/memory-budget-reference.html">本章打印速查</a><a href="../c-memory/heap-stack.html">专题桥接：堆与栈</a><a href="../learn/clock-timebase.html">下一章：时钟树、切换与时基</a><a href="../learn/engineering-map.html#stage-02">阶段02地图</a></div>
