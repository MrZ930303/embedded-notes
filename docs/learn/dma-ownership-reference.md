阶段04 · 单元16 · 同批本地候选

# DMA缓冲所有权速查 {#dma-ownership-reference}

## DMA所有权速查：使用前先核前提 {#dma-overview-title}

<div id="dma-overview"></div>

<p>用途：在一个升级式采集终端中，快速核对N4/16bit双块的可达/extent/寿命/owner与stop恢复。前提是实际live initialized typed objects、单上下文exclusive/non-reentrant、输出disjoint；host模型不能代替target DMA驱动。<a href="./dma-ownership.html">完整推导、活动与原始字面表</a>。</p>

## F407请求与item/byte {#dma-mapping-title}

<div id="dma-mapping"></div>

<p>终端要把 ADC 结果搬入内存时，先确定<strong>谁向哪个搬运资源发请求</strong>。选定 STM32F407 的历史 DMA1/2 各有8个 stream；channel 是某个 stream 的请求选择，不是该 stream 能并行服务8个外设。DMA stream 的软件 PL 有4级，同级以较小 stream 编号优先；NVIC priority 决定处理程序紧迫度，两者不是同一条仲裁链。提高完成 IRQ 紧迫度不会直接提高 DMA bus transfer 优先级。</p><p>具名 ADC1 的 DMA2 stream0或4/channel0 来自 <a href="https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf">RM0090 DocID018909 Rev5（September2013）§10/Table44 p305</a>，该页像素由研究者实际查看。AN4031 Rev3 的 Table1/2 标题限定 F427/437/429/439，不能替代这个 F407 mapping。DMA1 的 peripheral-port 拓扑不支持 memory-to-memory；历史模式限制还使 M2M 不用于 circular/direct/DBM。本章不配置 M2M，也不把这套布局推广到全部 STM32。</p><p>NDTR 的单位是<strong>数据项 item</strong>。DMA作flow-controller的历史 count 域为1..65535；寄存器0不服务事务，严格 planner拒绝0。固定 fixture每项16bit=2bytes，N=4，因此一块4×2=8bytes，两块数据16bytes。收到两项后 NDTR=4−2=2，而不是剩4bytes这一数值直接写进NDTR。width不同或FIFO packing/burst需要另一份条件，不能由此推导。</p>

## 目的域与对象的四道检查 {#dma-placement-title}

<div id="dma-placement"></div>

<p>地址只是数字。要允许写入，至少分别证明：所选DMA可达；本对象确有count×width字节；起始地址对齐；span不越域；数组在传输和消费期间都活着；此刻只有获准writer；读者能看到相应值。一个条件通过不会自动证明后面几个。</p><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="内存路径与对象权限分层，可横向滚动"><svg viewBox="0 0 800 308" role="img" aria-labelledby="dma-memory-caption"><rect x="8" y="12" width="244" height="56" rx="5" fill="#d5e7b3"/><text x="20" y="46">SRAM1 / SRAM2</text><path d="M258 40h28" stroke="#22664f" stroke-width="2"/><path d="M280 34l8 6-8 6" fill="none" stroke="#22664f" stroke-width="2"/><rect x="298" y="12" width="494" height="56" rx="5" fill="#eef2e9"/><text x="310" y="46">所选DMA memory path可达，仍须有对象extent</text><rect x="8" y="84" width="244" height="56" rx="5" fill="#d5e7b3"/><text x="20" y="118">CCM 0x10000000</text><path d="M258 112h28" stroke="#22664f" stroke-width="2"/><path d="M280 106l8 6-8 6" fill="none" stroke="#22664f" stroke-width="2"/><rect x="298" y="84" width="494" height="56" rx="5" fill="#eef2e9"/><text x="310" y="118">CPU D-bus可达，不等于本DMA path可达</text><rect x="8" y="156" width="244" height="56" rx="5" fill="#d5e7b3"/><text x="20" y="190">真实host数组 A/B</text><path d="M258 184h28" stroke="#22664f" stroke-width="2"/><path d="M280 178l8 6-8 6" fill="none" stroke="#22664f" stroke-width="2"/><rect x="298" y="156" width="494" height="56" rx="5" fill="#eef2e9"/><text x="310" y="190">C对象寿命与所有权；不使用假MCU地址</text><rect x="8" y="228" width="244" height="56" rx="5" fill="#d5e7b3"/><text x="20" y="262">numeric planner通过</text><path d="M258 256h28" stroke="#22664f" stroke-width="2"/><path d="M280 250l8 6-8 6" fill="none" stroke="#22664f" stroke-width="2"/><rect x="298" y="228" width="494" height="56" rx="5" fill="#eef2e9"/><text x="310" y="262">仅数字条件通过；不产生DMA写权限</text></svg></div><figcaption id="dma-memory-caption">内存路径与对象权限分层。原创关系图；箭头表示左侧条件支持右侧结论，各层条件不能互相替代。</figcaption></figure><p>历史RM Figure1 p60、§2.1.2–.5 与固定器件头给出 SRAM1 0x20000000..0x2001BFFF（112KiB）、SRAM2 0x2001C000..0x2001FFFF（16KiB）、CCM 0x10000000..0x1000FFFF（64KiB）。CCM只接选定CPU D-bus而不在这里的DMA memory path。SRAM1/2相邻也不把两个分配自动合并。这个限定结论来自研究者所见历史拓扑，不能用当前手册未读的标题把它升级。</p><div class="table-wrap" role="region" tabindex="0" aria-label="声明输入 N4/width2表，可横向滚动"><table><thead><tr><th>声明输入 N4/width2</th><th>独立检查</th><th>结果</th></tr></thead><tbody><tr><td>0x20000000，extent8</td><td>4×2=8、2byte对齐、span在SRAM1</td><td>OK/8bytes</td></tr><tr><td>CCM 0x10000000，extent8</td><td>不在选择的DMA目的域</td><td>BAD_REGION</td></tr><tr><td>0x20000001，extent8</td><td>奇数不能2byte对齐</td><td>BAD_ALIGNMENT</td></tr><tr><td>0x20000000，extent6</td><td>本对象6&lt;8</td><td>BAD_EXTENT</td></tr><tr><td>0x2001BFFC，extent4</td><td>4&lt;8且8byte span跨SRAM1边界</td><td>BAD_EXTENT</td></tr></tbody></table></div><p>`dma_check_placement`先用宽输入校验，再在已限制 count≤65535/width≤4 的域里乘法；最大262140bytes不会溢出uint32。以uint64做地址加跨度，检查一个selected region的上界；不先窄化非法输入。host fake使用自己的两数组，绝不将numeric MCU地址cast成host pointer。静态数组解决一种寿命问题，却不会自动授予DMA访问权或排除CONSUMER。活动地址用十进制，536870912=0x20000000；改为268435456=0x10000000预测域错误，再改为536870913预测对齐错误。</p>

## raw与safe不能混用完成时刻 {#dma-raw-title}

<div id="dma-raw"></div>

<p>先看<strong>raw DBM</strong>，不要先替硬件添加软件owner意识。原始fake在第四项自动切换M0/M1，CT表示当前目标，NDTR重新装4。HT在半数项到达目的端后置位，TC在传输完成后置位；锁存与IRQ使能又是不同层。没有哪一位表示“应用已经计算/提交了结果”。</p><div class="table-wrap" role="region" tabindex="0" aria-label="raw实际注入表，可横向滚动"><table><thead><tr><th>raw实际注入</th><th>目标数据/旗标</th><th>应用层可声称</th></tr></thead><tbody><tr><td>10、11</td><td>A[10,11,0,0]；CT=A/NDTR2/HT1/TC0</td><td>半数到达，不是处理半块</td></tr><tr><td>12、13</td><td>A[10,11,12,13]；CT=B/NDTR4/TC1</td><td>A完成，不是processed1</td></tr><tr><td>raw_hold(A)</td><td>软件保留A；raw writer不等待</td><td>是反例标记，不是安全lease</td></tr><tr><td>20、21、22、23</td><td>B[20,21,22,23]；CT=A/NDTR4</td><td>下一次会回写A</td></tr><tr><td>30</td><td>A[0]=30；ownershipViolation=true</td><td>旧完整快照遭到逻辑破坏</td></tr></tbody></table></div><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="raw自动回切与safe显式完成并排，可横向滚动"><svg viewBox="0 0 800 308" role="img" aria-labelledby="dma-ct-caption"><rect x="8" y="12" width="244" height="56" rx="5" fill="#d5e7b3"/><text x="20" y="46">raw item13到达</text><path d="M258 40h28" stroke="#22664f" stroke-width="2"/><path d="M280 34l8 6-8 6" fill="none" stroke="#22664f" stroke-width="2"/><rect x="298" y="12" width="494" height="56" rx="5" fill="#eef2e9"/><text x="310" y="46">自动A完成 → CT=B/NDTR4/TC1</text><rect x="8" y="84" width="244" height="56" rx="5" fill="#d5e7b3"/><text x="20" y="118">safe push13返回</text><path d="M258 112h28" stroke="#22664f" stroke-width="2"/><path d="M280 106l8 6-8 6" fill="none" stroke="#22664f" stroke-width="2"/><rect x="298" y="84" width="494" height="56" rx="5" fill="#eef2e9"/><text x="310" y="118">A仍WRITER/valid4 → NDTR0，未发布</text><rect x="8" y="156" width="244" height="56" rx="5" fill="#d5e7b3"/><text x="20" y="190">safe complete(A)</text><path d="M258 184h28" stroke="#22664f" stroke-width="2"/><path d="M280 178l8 6-8 6" fill="none" stroke="#22664f" stroke-width="2"/><rect x="298" y="156" width="494" height="56" rx="5" fill="#eef2e9"/><text x="310" y="190">A READY → CT=B/NDTR4/TC1</text><rect x="8" y="228" width="244" height="56" rx="5" fill="#d5e7b3"/><text x="20" y="262">safe begin_next</text><path d="M258 256h28" stroke="#22664f" stroke-width="2"/><path d="M280 250l8 6-8 6" fill="none" stroke="#22664f" stroke-width="2"/><rect x="298" y="228" width="494" height="56" rx="5" fill="#eef2e9"/><text x="310" y="262">FREE B取得新身份；没有自动写入item</text></svg></div><figcaption id="dma-ct-caption">raw自动回切与safe显式完成并排。原创关系图；箭头表示左侧条件支持右侧结论，各层条件不能互相替代。</figcaption></figure><p>真实DBM不会因为软件持有旧A而自动等release；晚消费者可能读到新旧混合数据。这里用顺序显式事件改变host数组，展示逻辑所有权违例，没有执行真实异步C data race。软件迟到不等于总线transfer error，可能没有TEIF或ADC OVR；缺少这些旗标也不能证明应用没丢数据。历史依据为 RM0090 Rev5 §10.3.8–.10/.17、§10.5.5–.9；未验证当前硅片勘误或真实停流延迟。</p><p>有限快照还会丢掉历史：不清HT/TC，注入8项（2块）得到 CT=A/NDTR4/HT1/TC1；注入16项（4块）也得到相同四字段。生成器 completed=2或4是已知注入oracle；观察一次TC的observedTc都只加1。再次读到未清TC仍不代表又完成一块。CT/NDTR不能恢复任意漏圈，descriptor也不会延长所指数组的稳定寿命。</p>

## lease、stop与recover核对 {#dma-lease-title}

<div id="dma-lease"></div>

<p>本课程的安全路径称 <strong>SAFE_STOP_ON_REUSE</strong>，是原创有限政策。每块走 FREE→WRITER（DMA-owned）→READY→CONSUMER→FREE。WRITER唯一可写，READY等待领用但不是FREE，CONSUMER只通过匹配lease作只读复制。partial error/user stop标INVALID，不能伪装成完整READY。恰好两descriptor对应两物理块，不能排出第三块。</p><p>`dma_claim`在至多两块中挑最小block ID的READY；有唯一outstanding lease时第二claim返回BUSY。lease携run/block/slot，不给裸指针；`dma_read`先检查匹配实例、CONSUMER、index&lt;valid，再只复制一个uint16；`dma_release`只释放同一lease。read四次是四次调用，不是隐藏的无限扫描。claim、release、TC都不证明业务计算已完成，copiedItems与released分开计数。</p><div class="table-wrap" role="region" tabindex="0" aria-label="safe真实公共调用表，可横向滚动"><table><thead><tr><th>safe真实公共调用</th><th>A / B owner</th><th>CT / NDTR / 关键事实</th></tr></thead><tbody><tr><td>init；start</td><td>WRITER / FREE</td><td>A/4；run1 block1；无样本</td></tr><tr><td>push10；push11</td><td>WRITER valid2 / FREE</td><td>A/2 HT1 TC0</td></tr><tr><td>push12；push13</td><td>WRITER valid4 / FREE</td><td>A/0 TC0，尚未供给complete</td></tr><tr><td>complete(exact A)</td><td>READY / FREE</td><td>B/4 TC1，completed1</td></tr><tr><td>claim；begin_next</td><td>CONSUMER / WRITER</td><td>唯一A lease；B block2，未写数据</td></tr><tr><td>push20..23；complete(exact B)</td><td>CONSUMER / READY</td><td>A/4，completed2</td></tr><tr><td>begin_next</td><td>CONSUMER / READY</td><td>LATE_REUSE，STOP_REQUESTED；无下一写</td></tr><tr><td>push30；recover</td><td>同前</td><td>NOT_RUNNING；BUSY；A[0]仍10</td></tr><tr><td>confirm_stop；recover</td><td>同前</td><td>STOP_CONFIRMED；仍有lease所以BUSY</td></tr><tr><td>read(A,0)；release(A)</td><td>FREE / READY</td><td>复制10；释放不改变停止事实</td></tr><tr><td>recover</td><td>FREE valid0 / FREE valid0</td><td>run2 IDLE；HT/TC0；NDTR4，nextBlock3</td></tr><tr><td>old complete；start</td><td>旧拒绝；新A WRITER</td><td>STALE_TOKEN；独立start分配block3</td></tr></tbody></table></div><p>最后一项、完整completion事实、软件观察/claim、下一reuse边界是四个不同事件。safe多出的complete/begin_next不是硬件配置步骤，也不能隐藏到动画里；表格逐一列出。begin_next在下一目标非FREE时请求停止并阻止下一次fake write，同时保留完整B和A的lease。真实TC ISR可能已经赶不上首个覆盖字节，本host事件边界不提供物理stop-before-overwrite证明。</p><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="停止确认与所有权释放是两把独立钥匙，可横向滚动"><svg viewBox="0 0 800 308" role="img" aria-labelledby="dma-stop-caption"><rect x="8" y="12" width="244" height="56" rx="5" fill="#d5e7b3"/><text x="20" y="46">LATE / TRANSFER / USER</text><path d="M258 40h28" stroke="#22664f" stroke-width="2"/><path d="M280 34l8 6-8 6" fill="none" stroke="#22664f" stroke-width="2"/><rect x="298" y="12" width="494" height="56" rx="5" fill="#eef2e9"/><text x="310" y="46">请求STOP；记录cause与partial valid</text><rect x="8" y="84" width="244" height="56" rx="5" fill="#d5e7b3"/><text x="20" y="118">后台确认尚未供给</text><path d="M258 112h28" stroke="#22664f" stroke-width="2"/><path d="M280 106l8 6-8 6" fill="none" stroke="#22664f" stroke-width="2"/><rect x="298" y="84" width="494" height="56" rx="5" fill="#eef2e9"/><text x="310" y="118">recover BUSY；status/read/release仍可用</text><rect x="8" y="156" width="244" height="56" rx="5" fill="#d5e7b3"/><text x="20" y="190">CONFIRMED + 活lease</text><path d="M258 184h28" stroke="#22664f" stroke-width="2"/><path d="M280 178l8 6-8 6" fill="none" stroke="#22664f" stroke-width="2"/><rect x="298" y="156" width="494" height="56" rx="5" fill="#eef2e9"/><text x="310" y="190">recover仍BUSY；必须matching release</text><rect x="8" y="228" width="244" height="56" rx="5" fill="#d5e7b3"/><text x="20" y="262">CONFIRMED + 无lease</text><path d="M258 256h28" stroke="#22664f" stroke-width="2"/><path d="M280 250l8 6-8 6" fill="none" stroke="#22664f" stroke-width="2"/><rect x="298" y="228" width="494" height="56" rx="5" fill="#eef2e9"/><text x="310" y="262">recover新run/IDLE；再独立start</text></svg></div><figcaption id="dma-stop-caption">停止确认与所有权释放是两把独立钥匙。原创关系图；箭头表示左侧条件支持右侧结论，各层条件不能互相替代。</figcaption></figure><p>TRANSFER error与LATE有不同cause/counter。RUNNING收到USER/TRANSFER时当前WRITER变INVALID，stopValid保留当时有效前缀（例如10、11后为2）；完整READY/CONSUMER仍准确保留。停止请求不是停止确认，不用超时或busy-wait捏造硬件已停。confirmed而无lease才能recover：丢弃旧READY并计discardedReady，清payload/有效长度/HT/TC/cause，分配下一run并回IDLE；NDTR=4不是0，新start独立。旧completion或lease不获得新数据权限。</p>

## 身份耗尽与固定资源 {#dma-identity-title}

<div id="dma-identity"></div>

<p>正身份有穷，不能靠“够大”省略耗尽合同。这里run和block是两个独立uint32正域，各1..4294967295；slot是0/1。normal init得到run1/nextRun2/nextBlock1，start取block1，begin_next取block2。recover只取新run，不回退nextBlock。每域最后MAX可使用，随后exhausted标志使需要下一身份的调用在任何转移/输出更新之前返回EXHAUSTED，绝不绕回0/1。</p><p>公开fresh fixture LAST_BLOCK直接把nextBlock种子设MAX：真实start、四push、complete、claim、read、release可以使用最后块；下一begin_next拒绝。经request/confirm/recover后block历史依然耗尽，新start仍拒绝。LAST_RUN种子run=MAX−1/nextRunMAX：一次recover到MAX可用，随后recover拒绝。COUNTER_EDGE只供诊断边界；没有内部编辑READY/allocator元数据假充公共测试。不同fresh对象的lifetime domain由caller隔离，token不可跨域；freshinit前须无旧事件，不能主张跨重建的全局唯一。</p><p>run或block为0返回INVALID_TOKEN；正的旧run、旧block、错实例返回STALE_TOKEN，slot≥2为INVALID_ARGUMENT。每种拒绝都保持所有named state、计数、history和输出；保留的旧report必须仍称历史。只有成功claim/read刷新各自输出；report型调用在OK及接受的LATE_REUSE/TRANSFER_ERROR时提供新metadata。null检查不等于能检测悬空指针、虚假extent、任意corruption或别名。</p><p>资源固定：两块各4×uint16、两descriptor、一个lease、32行copy history，关闭record仍有这块固定存储。有效mutating call最多记1行；read/status记0行。第33行只增加historyDropped，不阻塞生产/消费，已有32行保持。每次read最多复制1sample；claim最多看2块；recover最多清2块/8项，discardedReady最多加2；source完整table可见头注释及下文。所有unused items/history slots初始化为零；report的两descriptor每次完整初始化。</p><div class="table-wrap" role="region" tabindex="0" aria-label="诊断表，可横向滚动"><table><thead><tr><th>诊断</th><th>实际计量对象</th><th>不能替代</th></tr></thead><tbody><tr><td>completed</td><td>显式fake完成块数</td><td>物理完成数/processed</td></tr><tr><td>observedTc</td><td>软件看到TC latch的次数</td><td>精确历史圈数</td></tr><tr><td>copiedItems / released</td><td>成功复制sample / matching释放lease</td><td>业务处理成功块数</td></tr><tr><td>lateReuse / transferErrors</td><td>两种不同原因</td><td>统一硬件overflow</td></tr><tr><td>discardedReady / historyDropped</td><td>恢复discard块 / 丢诊断行</td><td>精确物理lost samples</td></tr></tbody></table></div><p>诊断按MAX−1→MAX且saturated=false，再尝试+1→MAX/true，之后保持MAX/true。shared sticky flag不指出哪一项截断，不允许用饱和总数算精确丢失率。identity耗尽是拒绝分配而非这种诊断饱和。host MinGW13.1 sizeof：State792B、Report116B、descriptor20B、token12B、raw40B、historyRow20B；目标ABI需重测。GCC .su与官方启发式检查仅证明本host编译/静态范围，不是ISR、嵌套exception/FP/lazy/alignment或whole-program最大栈证明。</p>

## 迁移与下游边界 {#dma-cache-title}

<div id="dma-cache"></div>

<p>所选F407有Flash-interface I-Code/D-Code acceleration，位置在Flash路径，不能因此说SRAM buffer有M7 L1 D-cache。<a href="https://www.st.com/resource/en/application_note/an4839-level-1-cache-on-stm32f7-series-and-stm32h7-series-stmicroelectronics.pdf">AN4839 Rev2（March2018）§2/§3.2</a>讨论F7/H7 Cortex-M7，是迁移边界，不是本页F407维护脚本。</p><p>迁移有cache的目标须逐个核：实际CPU/DMA可达域、MPU/memory attributes、cache启用状态、cache-line尺寸与对齐、相邻共享数据、CPU→DMA或DMA→CPU方向、目标编译器/ISR契约。没有这些条件就不能复制clean/invalidate序列。缓存可见性不替代C对象寿命，原子ready flag不自动让DMA遵守C11同步，DMB也不授予缓冲所有权。</p><p>把这章成果交给吞吐单元时，应先通过实际公共C claim/read/release取得四个真实复制值，再按样本单位送入有限队列；不能把block数冒充sample数，也不能把claim时间标成采样时间。本producer只存value，source序号/时间若需要必须在采样fake事件产生时另有有界metadata合同。第17单元只有在root冻结实际适配、工作量与metadata寿命后实现，同批候选链接不表示已发布。</p>

## 完整可复用公共C与原生下载 {#dma-native-title}

<div id="dma-native"></div>

<p>以下是完整实际公共生产C与头文件，显示内容解码后与原生下载逐字节一致；生产实现没有main。独立caller包含头两次，先分别编译dma.c与caller，再链接；CHECK在NDEBUG仍有效。完整可另存最小consumer与通用命令包含在README，所有原生依赖就在三项下载中。</p><div class="controls"><a class="btn" download href="/examples/dma-ownership/dma.c">下载 dma.c</a><a class="btn" download href="/examples/dma-ownership/dma.h">下载 dma.h</a><a class="btn" download href="/examples/dma-ownership/README.txt">下载 README.txt</a></div><p>strict C11 normal/NDEBUG、独立public-header-twice consumer、原文README复现和固定字面fixture是host行为证据；max production .su160B及official heuristic1C/26functions fail0/warn0不是目标最大栈。初始化用固定大小清零，恢复最多处理两块；没有heap、recursion、sleep、callback、blocking I/O或真实MMIO。</p>

### 完整 dma.h {#dma-source-h}

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file dma.h
 * @author embedded-notes contributors
 * @brief Fixed two-block host ownership model; no physical DMA is accessed.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_DMA_H
#define EMBEDDED_NOTES_DMA_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#if !defined(UINT16_MAX) || !defined(UINT32_MAX) || !defined(UINT64_MAX)
#error Exact-width uint16_t, uint32_t and uint64_t are required.
#endif

#define DMA_BLOCKS 2U
#define DMA_ITEMS 4U
#define DMA_HISTORY_ROWS 32U

typedef enum {
    DMA_OK=0, DMA_EMPTY, DMA_BUSY, DMA_INVALID_ARGUMENT, DMA_BAD_STATE,
    DMA_INVALID_TOKEN, DMA_STALE_TOKEN, DMA_EXHAUSTED, DMA_LATE_REUSE,
    DMA_TRANSFER_ERROR, DMA_NOT_RUNNING, DMA_BAD_REGION, DMA_BAD_ALIGNMENT,
    DMA_BAD_EXTENT
} DmaStatus;
typedef enum {
    DMA_FREE=0,
    DMA_WRITER,
    DMA_READY,
    DMA_CONSUMER,
    DMA_INVALID
} DmaOwner;
typedef enum {
    DMA_IDLE=0,
    DMA_RUNNING,
    DMA_BOUNDARY,
    DMA_STOP_REQUESTED,
    DMA_STOP_CONFIRMED
} DmaPhase;
typedef enum {
    DMA_CAUSE_NONE=0,
    DMA_CAUSE_USER,
    DMA_CAUSE_LATE,
    DMA_CAUSE_TRANSFER
} DmaCause;
typedef enum {
    DMA_FIXTURE_NORMAL=0, DMA_FIXTURE_LAST_BLOCK, DMA_FIXTURE_LAST_RUN, DMA_FIXTURE_COUNTER_EDGE
} DmaFixture;

typedef struct {
    uint64_t address;
    uint64_t allocatedBytes;
    uint32_t count;
    uint32_t widthBytes;
} DmaPlacement;
typedef struct {
    uint32_t run;
    uint32_t block;
    uint32_t slot;
} DmaToken;
typedef struct {
    DmaOwner owner;
    uint32_t valid;
    DmaToken token;
} DmaDescriptor;
typedef struct {
    DmaDescriptor descriptor;
    uint16_t items[DMA_ITEMS];
} DmaBlock;
typedef struct {
    uint32_t completed;
    uint32_t observedTc;
    uint32_t copiedItems;
    uint32_t released;
    uint32_t lateReuse;
    uint32_t transferErrors;
    uint32_t discardedReady;
    uint32_t historyDropped;
    bool saturated;
} DmaDiagnostics;
typedef struct {
    DmaStatus status;
    DmaPhase phase;
    uint32_t run;
    uint32_t slot;
    uint32_t valid;
} DmaHistoryRow;
typedef struct {
    DmaPhase phase;
    DmaCause cause;
    uint32_t run;
    uint32_t nextRun;
    uint32_t nextBlock;
    uint32_t current;
    uint32_t ndtr;
    uint32_t stopValid;
    bool runExhausted;
    bool blockExhausted;
    bool ht;
    bool tc;
    bool leasePresent;
    bool historyEnabled;
    DmaToken lease;
    DmaBlock blocks[DMA_BLOCKS];
    DmaDiagnostics diagnostics;
    size_t historyCount;
    DmaHistoryRow history[DMA_HISTORY_ROWS];
} DmaState;
typedef struct {
    DmaPhase phase;
    DmaCause cause;
    uint32_t run;
    uint32_t current;
    uint32_t ndtr;
    uint32_t stopValid;
    bool stopConfirmed;
    bool ht;
    bool tc;
    bool leasePresent;
    DmaToken lease;
    DmaDescriptor descriptors[DMA_BLOCKS];
    DmaDiagnostics diagnostics;
} DmaReport;
typedef struct {
    uint16_t items[DMA_BLOCKS][DMA_ITEMS];
    uint32_t current;
    uint32_t ndtr;
    uint32_t completed;
    uint32_t observedTc;
    bool ht;
    bool tc;
    bool held[DMA_BLOCKS];
    bool ownershipViolation;
    bool saturated;
} DmaRawState;

/*
 * All objects are real live initialized typed objects in one exclusive,
 * non-reentrant context. Outputs and input tokens/requests are disjoint from
 * state and each other. Never edit state metadata; fields are inspectable only.
 * No pointer is retained. Null checks cannot validate forged/dangling pointers,
 * false allocation extents, arbitrary corruption, or aliasing. No heap, MMIO,
 * callbacks, main, busy waiting, physical addresses or concurrency is executed.
 *
 * Fresh dma_init/dma_raw_init require fresh storage, no old live owner/events.
 * They do not inspect previous bytes and are not checked reset shortcuts.
 * All later calls require successfully initialized objects. Rejected arguments,
 * states, BUSY/EMPTY/EXHAUSTED and invalid/stale tokens preserve all state and
 * outputs, including history/diagnostics. Valid stop/errors intentionally change
 * state. DMA_OK and DMA_LATE_REUSE/DMA_TRANSFER_ERROR return a fresh report when
 * that call has a report argument; only successful claim/read refresh their
 * separate token/sample outputs. A retained old output is never a fresh result.
 *
 * SAFE_STOP_ON_REUSE is an original host policy. start allocates block A;
 * push writes exactly one item; after four pushes NDTR=0 but owner remains
 * WRITER and TC is not newly asserted. complete(token) is the distinct supplied
 * completion phase: it publishes READY and flips CT/NDTR. begin_next separately
 * checks reuse and allocates the next block, or requests stop before any write.
 * Hardware DBM does not execute this software-owner handshake.
 *
 * Identity domains are separate uint32_t positive run and block IDs, each
 * 1..UINT32_MAX, never wrapping/reused in this object's lifetime. init allocates
 * run1 (normal), leaves nextRun2/nextBlock1. start/begin_next allocate one block
 * ID; recover allocates one run ID, never rewinds block allocation. The last ID
 * is usable, sets its exhausted flag, and later allocation rejects preserving.
 * LAST_BLOCK starts nextBlock=UINT32_MAX, LAST_RUN starts run=MAX-1/nextRun=MAX.
 * COUNTER_EDGE initializes diagnostic totals MAX-1 with saturated=false.
 * These public fresh fixtures avoid editing live metadata to test limits.
 *
 * Token(run,block,slot) with run=0 or block=0 is INVALID_TOKEN. Slot>=2 is
 * INVALID_ARGUMENT. Positive wrong identities are STALE_TOKEN. No token from
 * another initialized domain may be supplied: fresh objects have distinct
 * caller-owned lifetime domains and do not promise globally unique IDs.
 * At most one lease: oldest READY block ID is claimed; read copies one uint16_t
 * at index<valid; release frees only that lease. Reads/releases remain available
 * during stop. complete old identity never publishes. Stop confirmation is a
 * supplied backend fact, independent of request, with no inferred physical stop.
 * recover requires confirmed stop and no lease, discards READY, clears all
 * lengths/flags/cause, establishes a new idle run; start is separate.
 *
 * Fixed resources: two arrays x4 uint16_t, two descriptors, one lease, optional
 * 32 copied history rows. At most one history row per successful mutating call;
 * row33 increments saturating historyDropped and never blocks progress. All
 * unused fields/slots initialize deterministically to zero/enum zero. Counters
 * reach MAX without setting saturation; an attempted increment at MAX sets it.
 * Read/status calls append no history; read increments copiedItems only.
 */

/** @brief Check numeric SRAM placement only; preserve bytes on rejection.
 * @param[in] request Count1..65535, width1/2/4, 32-bit address/extent.
 * @param[out] bytes Checked count*width; not host allocation/ownership proof.
 * @return DMA_OK or explicit argument/region/alignment/extent error. */
DmaStatus dma_check_placement(const DmaPlacement *request, uint32_t *bytes);
/** @brief Initialize fresh state using a public fixture.
 * @param[out] state Fresh writable object, no live old domain.
 * @param[in] fixture Named normal/last-ID/counter fixture.
 * @param[in] historyEnabled Enable optional fixed history.
 * @return DMA_OK or preserving DMA_INVALID_ARGUMENT. */
DmaStatus dma_init(DmaState *state, DmaFixture fixture, bool historyEnabled);
/** @brief Start idle run by allocating A; no item is written.
 * @param[in,out] state Initialized idle state.
 * @param[out] report Fresh copied metadata on success.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_start(DmaState *state, DmaReport *report);
/** @brief Write one checked 16-bit item into the current WRITER.
 * @param[in,out] state Running state with remaining items.
 * @param[in] sample Wide input validated before conversion.
 * @param[out] report Fresh metadata on success.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_push(DmaState *state, uint32_t sample, DmaReport *report);
/** @brief Supply completion for exactly the current full transfer token.
 * @param[in,out] state Full WRITER in running state.
 * @param[in] token Matching run/block/slot identity.
 * @param[out] report READY metadata, CT switched, NDTR4 on success.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_complete(DmaState *state, const DmaToken *token, DmaReport *report);
/** @brief At the fake reuse boundary allocate a FREE next block or request stop.
 * @param[in,out] state Boundary state; no data write occurs.
 * @param[out] report Fresh metadata for OK/LATE_REUSE.
 * @return DMA_OK/DMA_LATE_REUSE or preserving rejection. */
DmaStatus dma_begin_next(DmaState *state, DmaReport *report);
/** @brief Claim oldest READY, with at most one outstanding consumer.
 * @param[in,out] state Initialized state in any lifecycle phase.
 * @param[out] lease Copied identity refreshed only on DMA_OK.
 * @return DMA_OK/EMPTY/BUSY or preserving argument/state error. */
DmaStatus dma_claim(DmaState *state, DmaToken *lease);
/** @brief Copy one item through the matching lease; no retained pointer.
 * @param[in,out] state Initialized state; copiedItems diagnostic advances.
 * @param[in] lease Matching live token.
 * @param[in] index Index0..valid-1 checked in wide type.
 * @param[out] sample Refreshed only on DMA_OK.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_read(DmaState *state, const DmaToken *lease, uint32_t index, uint16_t *sample);
/** @brief Release only the matching outstanding lease, including during stop.
 * @param[in,out] state Initialized state.
 * @param[in] lease Matching live identity.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_release(DmaState *state, const DmaToken *lease);
/** @brief Supply user-stop or transfer-error cause; partial WRITER is INVALID.
 * @param[in,out] state Running/boundary state.
 * @param[in] cause USER or TRANSFER only.
 * @param[out] report Fresh initiating cause/partial length.
 * @return DMA_OK/DMA_TRANSFER_ERROR or preserving rejection. */
DmaStatus dma_request_stop(DmaState *state, DmaCause cause, DmaReport *report);
/** @brief Supply independent backend stop confirmation, without waiting.
 * @param[in,out] state Stop-requested state; lease is retained.
 * @param[out] report Fresh metadata on success.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_confirm_stop(DmaState *state, DmaReport *report);
/** @brief Recover confirmed stopped state only after matching lease release.
 * @param[in,out] state No outstanding consumer; allocators never rewind.
 * @param[out] report Fresh idle/new-run state, no automatic start.
 * @return DMA_OK/BUSY/EXHAUSTED or preserving rejection. */
DmaStatus dma_recover(DmaState *state, DmaReport *report);
/** @brief Observe current latches once and optionally clear both.
 * @param[in,out] state Initialized state; observedTc counts observations only.
 * @param[in] clear Clear latches after snapshot.
 * @param[out] report Fresh pre-clear flags and post-increment diagnostics.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_observe(DmaState *state, bool clear, DmaReport *report);
/** @brief Copy status in every valid phase; no mutation/history.
 * @param[in] state Initialized state.
 * @param[out] report Fresh metadata on success.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_status(const DmaState *state, DmaReport *report);
/** @brief Initialize fresh raw DBM counterexample; no safe ownership API.
 * @param[out] state Fresh raw storage.
 * @return DMA_OK or DMA_INVALID_ARGUMENT. */
DmaStatus dma_raw_init(DmaRawState *state);
/** @brief Write one raw item, automatically complete/switch after item4.
 * @param[in,out] state Initialized raw model, independent of safe producer.
 * @param[in] sample Wide checked16-bit value.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_raw_push(DmaRawState *state, uint32_t sample);
/** @brief Illustratively hold one completed raw block; raw writing still proceeds.
 * @param[in,out] state Initialized raw model.
 * @param[in] slot Completed non-current slot0/1.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_raw_hold(DmaRawState *state, uint32_t slot);
/** @brief Observe raw TC latch and optionally clear flags; no lap reconstruction.
 * @param[in,out] state Initialized raw model.
 * @param[in] clear Clear HT/TC after observation.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_raw_observe(DmaRawState *state, bool clear);

#endif
```

### 完整 dma.c {#dma-source-c}

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file dma.c
 * @author embedded-notes contributors
 * @brief Bounded host fake events and generation-checked copied leases.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#include "dma.h"
#include <string.h>

/** @brief Saturating diagnostic increment, not identity allocation.
 * @param[in,out] value Counter.
 * @param[in,out] saturated Sticky shared truncation indication.
 * @return None. */
static void dma_increment(uint32_t *value, bool *saturated)
{
    /**
    * Reaching MAX is exact; only the subsequent attempted increment truncates.
    **/
    if (*value==UINT32_MAX) {
        *saturated=true;
    } else {
        *value+=1U;
    }
}

/** @brief Validate checkable named metadata in fixed two-block state.
 * @param[in] state Initialized object; not arbitrary/indeterminate storage.
 * @return True when the declared domain holds. */
static bool dma_valid(const DmaState *state)
{
    size_t index;
    size_t consumers=0U;
    /**
    * These checks do not validate C object lifetime, pointer provenance or aliases.
    **/
    if (state==NULL || state->phase<DMA_IDLE || state->phase>DMA_STOP_CONFIRMED ||
        state->cause<DMA_CAUSE_NONE || state->cause>DMA_CAUSE_TRANSFER ||
        state->run==0U || state->nextRun==0U || state->nextBlock==0U || state->current>=DMA_BLOCKS ||
        state->ndtr>DMA_ITEMS || state->stopValid>DMA_ITEMS || state->historyCount>DMA_HISTORY_ROWS) {
        return false;
    }
    for (index=0U;index<DMA_BLOCKS;index++) {
        const DmaDescriptor *descriptor=&state->blocks[index].descriptor;
        if (descriptor->owner<DMA_FREE || descriptor->owner>DMA_INVALID || descriptor->valid>DMA_ITEMS ||
            descriptor->token.slot!=index ||
            (descriptor->owner!=DMA_FREE && (descriptor->token.run!=state->run || descriptor->token.block==0U))) {
            return false;
        }
        if ((descriptor->owner==DMA_FREE && descriptor->valid!=0U) ||
            ((descriptor->owner==DMA_READY || descriptor->owner==DMA_CONSUMER) && descriptor->valid!=DMA_ITEMS)) {
            return false;
        }
        if (descriptor->owner==DMA_CONSUMER) {
            consumers+=1U;
        }
    }
    if (consumers!=(state->leasePresent ? 1U : 0U)) {
        return false;
    }
    if (state->leasePresent && (state->lease.slot>=DMA_BLOCKS ||
        state->blocks[state->lease.slot].descriptor.owner!=DMA_CONSUMER ||
        state->lease.run!=state->run || state->lease.block==0U ||
        state->lease.block!=state->blocks[state->lease.slot].descriptor.token.block)) {
        return false;
    }
    if (state->phase==DMA_RUNNING && (state->blocks[state->current].descriptor.owner!=DMA_WRITER ||
        state->ndtr!=DMA_ITEMS-state->blocks[state->current].descriptor.valid)) {
        return false;
    }
    return true;
}

/** @brief Copy all report fields and both descriptors, never array padding.
 * @param[in] state Valid state.
 * @param[out] report Disjoint fresh report.
 * @return None. */
static void dma_report(const DmaState *state, DmaReport *report)
{
    size_t index;
    /**
    * Reports carry metadata only; copied sample reads use dma_read.
    **/
    *report=(DmaReport){0};
    report->phase=state->phase;
    report->cause=state->cause;
    report->run=state->run;
    report->current=state->current;
    report->ndtr=state->ndtr;
    report->stopValid=state->stopValid;
    report->stopConfirmed=state->phase==DMA_STOP_CONFIRMED;
    report->ht=state->ht;
    report->tc=state->tc;
    report->leasePresent=state->leasePresent;
    report->lease=state->lease;
    report->diagnostics=state->diagnostics;
    for (index=0U;index<DMA_BLOCKS;index++) {
        report->descriptors[index]=state->blocks[index].descriptor;
    }
}

/** @brief Append at most one copied row, without controlling progress.
 * @param[in,out] state Valid state.
 * @param[in] status Observable successful transition result.
 * @return None. */
static void dma_history(DmaState *state, DmaStatus status)
{
    /**
    * Row33 is dropped; existing rows and execution progress remain independent.
    **/
    if (state->historyEnabled) {
        if (state->historyCount<DMA_HISTORY_ROWS) {
            DmaHistoryRow *row=&state->history[state->historyCount];
            *row=(DmaHistoryRow){status,state->phase,state->run,state->current,
                state->blocks[state->current].descriptor.valid};
            state->historyCount+=1U;
        } else {
            dma_increment(&state->diagnostics.historyDropped,&state->diagnostics.saturated);
        }
    }
}

/** @brief Allocate one positive identity without wrap or reuse.
 * @param[in,out] next Last available ID remains stored at MAX.
 * @param[in,out] exhausted True after MAX was allocated.
 * @return Allocated positive ID; caller prechecks exhaustion. */
static uint32_t dma_allocate(uint32_t *next, bool *exhausted)
{
    uint32_t identity=*next;
    /**
    * Identity exhaustion is separate from saturating diagnostics.
    **/
    if (*next==UINT32_MAX) {
        *exhausted=true;
    } else {
        *next+=1U;
    }
    return identity;
}

/** @brief Prepare a known FREE current slot after exhaustion was checked.
 * @param[in,out] state Valid idle/boundary state.
 * @return None. */
static void dma_begin(DmaState *state)
{
    DmaBlock *block=&state->blocks[state->current];
    size_t index;
    /**
    * Clearing old payload is bounded; a new identity never extends old leases.
    **/
    block->descriptor.owner=DMA_WRITER;
    block->descriptor.valid=0U;
    block->descriptor.token=(DmaToken){state->run,
        dma_allocate(&state->nextBlock,&state->blockExhausted),state->current};
    for (index=0U;index<DMA_ITEMS;index++) {
        block->items[index]=0U;
    }
    state->ndtr=DMA_ITEMS;
    state->phase=DMA_RUNNING;
}

/** @brief Classify token syntax and instance identity.
 * @param[in] state Valid initialized state.
 * @param[in] token Real disjoint token.
 * @return DMA_OK or preserving token/argument error. */
static DmaStatus dma_token(const DmaState *state, const DmaToken *token)
{
    const DmaDescriptor *descriptor;
    /**
    * Zero is never an old positive identity and is classified separately.
    **/
    if (token==NULL || token->slot>=DMA_BLOCKS) {
        return DMA_INVALID_ARGUMENT;
    }
    if (token->run==0U || token->block==0U) {
        return DMA_INVALID_TOKEN;
    }
    descriptor=&state->blocks[token->slot].descriptor;
    if (token->run!=state->run || token->run!=descriptor->token.run ||
        token->block!=descriptor->token.block || descriptor->owner==DMA_FREE) {
        return DMA_STALE_TOKEN;
    }
    return DMA_OK;
}

/** @brief Check exactly the currently outstanding consumer lease.
 * @param[in] state Valid initialized state.
 * @param[in] lease Real token.
 * @return DMA_OK or preserving token rejection. */
static DmaStatus dma_lease(const DmaState *state, const DmaToken *lease)
{
    DmaStatus status=dma_token(state,lease);
    /**
    * Matching storage identity without CONSUMER ownership does not authorize access.
    **/
    if (status!=DMA_OK) {
        return status;
    }
    if (!state->leasePresent || state->blocks[lease->slot].descriptor.owner!=DMA_CONSUMER ||
        lease->run!=state->lease.run || lease->block!=state->lease.block || lease->slot!=state->lease.slot) {
        return DMA_STALE_TOKEN;
    }
    return DMA_OK;
}

/** @brief Validate numeric placement before multiplication/narrowing.
 * @param[in] request Declared numeric region/extent/count/width.
 * @param[out] bytes Fresh checked byte count on success only.
 * @return Explicit placement status. */
DmaStatus dma_check_placement(const DmaPlacement *request, uint32_t *bytes)
{
    uint64_t end;
    uint64_t limit;
    uint32_t countBytes;
    /**
    * SRAM1 and SRAM2 are distinct domains; adjacent memory is not an allocation.
    **/
    if (request==NULL || bytes==NULL || request->count==0U || request->count>65535U ||
        (request->widthBytes!=1U && request->widthBytes!=2U && request->widthBytes!=4U) ||
        request->address>UINT32_MAX || request->allocatedBytes>UINT32_MAX) {
        return DMA_INVALID_ARGUMENT;
    }
    if (request->address>=UINT64_C(0x20000000) && request->address<UINT64_C(0x2001c000)) {
        limit=UINT64_C(0x2001c000);
    } else if (request->address>=UINT64_C(0x2001c000) && request->address<UINT64_C(0x20020000)) {
        limit=UINT64_C(0x20020000);
    } else {
        return DMA_BAD_REGION;
    }
    if (request->address%request->widthBytes!=0U) {
        return DMA_BAD_ALIGNMENT;
    }
    countBytes=request->count*request->widthBytes;
    end=request->address+countBytes;
    if (request->allocatedBytes<countBytes || end>limit) {
        return DMA_BAD_EXTENT;
    }
    *bytes=countBytes;
    return DMA_OK;
}

/** @brief Initialize every named field without reading prior storage.
 * @param[out] state Genuinely fresh object.
 * @param[in] fixture Public finite edge fixture.
 * @param[in] historyEnabled Enable diagnostic rows.
 * @return DMA_OK or preserving DMA_INVALID_ARGUMENT. */
DmaStatus dma_init(DmaState *state, DmaFixture fixture, bool historyEnabled)
{
    size_t index;
    /**
    * Validation precedes the first write; reinitializing live ownership is forbidden.
    **/
    if (state==NULL || fixture<DMA_FIXTURE_NORMAL || fixture>DMA_FIXTURE_COUNTER_EDGE) {
        return DMA_INVALID_ARGUMENT;
    }
    /**
    * Every field is an integer/enum/bool or an array thereof, with valid zero bits.
    * Fixed-size clearing avoids a whole-state automatic compound-literal temporary.
    **/
    memset(state,0,sizeof(*state));
    state->run=fixture==DMA_FIXTURE_LAST_RUN ? UINT32_MAX-1U : 1U;
    state->nextRun=fixture==DMA_FIXTURE_LAST_RUN ? UINT32_MAX : 2U;
    state->nextBlock=fixture==DMA_FIXTURE_LAST_BLOCK ? UINT32_MAX : 1U;
    state->historyEnabled=historyEnabled;
    state->ndtr=DMA_ITEMS;
    for (index=0U;index<DMA_BLOCKS;index++) {
        state->blocks[index].descriptor.token.slot=(uint32_t)index;
    }
    if (fixture==DMA_FIXTURE_COUNTER_EDGE) {
        state->diagnostics=(DmaDiagnostics){UINT32_MAX-1U,UINT32_MAX-1U,UINT32_MAX-1U,
            UINT32_MAX-1U,UINT32_MAX-1U,UINT32_MAX-1U,UINT32_MAX-1U,UINT32_MAX-1U,false};
    }
    return DMA_OK;
}

/** @brief Start first transfer of an idle run.
 * @param[in,out] state Initialized idle object.
 * @param[out] report Disjoint output.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_start(DmaState *state, DmaReport *report)
{
    /**
    * The allocator precheck occurs before ownership or payload mutation.
    **/
    if (state==NULL || report==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->phase!=DMA_IDLE || state->leasePresent) {
        return DMA_BUSY;
    }
    if (state->blockExhausted) {
        return DMA_EXHAUSTED;
    }
    state->current=0U;
    dma_begin(state);
    dma_history(state,DMA_OK);
    dma_report(state,report);
    return DMA_OK;
}

/** @brief Write at most one supplied item; completion is a separate phase.
 * @param[in,out] state Initialized running object.
 * @param[in] sample Checked before narrowing.
 * @param[out] report Disjoint output.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_push(DmaState *state, uint32_t sample, DmaReport *report)
{
    DmaBlock *block;
    /**
    * No arrival after a stop request writes any block, even if a lease is retained.
    **/
    if (state==NULL || report==NULL || sample>UINT16_MAX) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->phase!=DMA_RUNNING) {
        return DMA_NOT_RUNNING;
    }
    block=&state->blocks[state->current];
    if (block->descriptor.owner!=DMA_WRITER || state->ndtr==0U) {
        return DMA_BAD_STATE;
    }
    block->items[block->descriptor.valid]=(uint16_t)sample;
    block->descriptor.valid+=1U;
    state->ndtr-=1U;
    if (state->ndtr==2U) {
        state->ht=true;
    }
    dma_history(state,DMA_OK);
    dma_report(state,report);
    return DMA_OK;
}

/** @brief Supply the separate full-block completion fact.
 * @param[in,out] state Full matching WRITER.
 * @param[in] token Exact current transfer token.
 * @param[out] report Disjoint output.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_complete(DmaState *state, const DmaToken *token, DmaReport *report)
{
    DmaStatus status;
    DmaBlock *block;
    /**
    * Check identity before phase so delayed old completions remain explicitly stale.
    **/
    if (state==NULL || report==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    status=dma_token(state,token);
    if (status!=DMA_OK) {
        return status;
    }
    if (state->phase!=DMA_RUNNING || token->slot!=state->current || state->ndtr!=0U) {
        return DMA_BAD_STATE;
    }
    block=&state->blocks[state->current];
    if (block->descriptor.owner!=DMA_WRITER || block->descriptor.valid!=DMA_ITEMS) {
        return DMA_BAD_STATE;
    }
    block->descriptor.owner=DMA_READY;
    state->tc=true;
    dma_increment(&state->diagnostics.completed,&state->diagnostics.saturated);
    state->current=1U-state->current;
    state->ndtr=DMA_ITEMS;
    state->phase=DMA_BOUNDARY;
    dma_history(state,DMA_OK);
    dma_report(state,report);
    return DMA_OK;
}

/** @brief Check reuse at an explicit fake boundary; do not write data.
 * @param[in,out] state Boundary object.
 * @param[out] report Fresh OK/late metadata.
 * @return DMA_OK/DMA_LATE_REUSE or preserving rejection. */
DmaStatus dma_begin_next(DmaState *state, DmaReport *report)
{
    /**
    * Lateness protects the next fake write, not a physical running stream.
    **/
    if (state==NULL || report==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->phase!=DMA_BOUNDARY) {
        return DMA_BAD_STATE;
    }
    if (state->blocks[state->current].descriptor.owner!=DMA_FREE) {
        state->phase=DMA_STOP_REQUESTED;
        state->cause=DMA_CAUSE_LATE;
        state->stopValid=0U;
        dma_increment(&state->diagnostics.lateReuse,&state->diagnostics.saturated);
        dma_history(state,DMA_LATE_REUSE);
        dma_report(state,report);
        return DMA_LATE_REUSE;
    }
    if (state->blockExhausted) {
        return DMA_EXHAUSTED;
    }
    dma_begin(state);
    dma_history(state,DMA_OK);
    dma_report(state,report);
    return DMA_OK;
}

/** @brief Claim the oldest of at most two READY instances.
 * @param[in,out] state Initialized object.
 * @param[out] lease Refreshed only on success.
 * @return DMA_OK/EMPTY/BUSY or preserving rejection. */
DmaStatus dma_claim(DmaState *state, DmaToken *lease)
{
    size_t index;
    size_t selected=DMA_BLOCKS;
    /**
    * One consumer is an explicit policy, independent of descriptor capacity.
    **/
    if (state==NULL || lease==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->leasePresent) {
        return DMA_BUSY;
    }
    for (index=0U;index<DMA_BLOCKS;index++) {
        if (state->blocks[index].descriptor.owner==DMA_READY &&
            (selected==DMA_BLOCKS || state->blocks[index].descriptor.token.block<
                state->blocks[selected].descriptor.token.block)) {
            selected=index;
        }
    }
    if (selected==DMA_BLOCKS) {
        return DMA_EMPTY;
    }
    state->blocks[selected].descriptor.owner=DMA_CONSUMER;
    state->lease=state->blocks[selected].descriptor.token;
    state->leasePresent=true;
    *lease=state->lease;
    dma_history(state,DMA_OK);
    return DMA_OK;
}

/** @brief Copy one authorized sample while preserving on invalid index/token.
 * @param[in,out] state Initialized object.
 * @param[in] lease Matching lease.
 * @param[in] index Wide item index.
 * @param[out] sample Copied16-bit result.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_read(DmaState *state, const DmaToken *lease, uint32_t index, uint16_t *sample)
{
    DmaStatus status;
    /**
    * No caller receives a pointer into reusable producer storage.
    **/
    if (state==NULL || sample==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    status=dma_lease(state,lease);
    if (status!=DMA_OK) {
        return status;
    }
    if (index>=state->blocks[lease->slot].descriptor.valid) {
        return DMA_INVALID_ARGUMENT;
    }
    *sample=state->blocks[lease->slot].items[index];
    dma_increment(&state->diagnostics.copiedItems,&state->diagnostics.saturated);
    return DMA_OK;
}

/** @brief Release only the matching consumer instance, including during stop.
 * @param[in,out] state Initialized object.
 * @param[in] lease Exact outstanding token.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_release(DmaState *state, const DmaToken *lease)
{
    DmaStatus status;
    /**
    * Releasing ownership does not confirm that the backend stopped.
    **/
    if (state==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    status=dma_lease(state,lease);
    if (status!=DMA_OK) {
        return status;
    }
    state->blocks[lease->slot].descriptor.owner=DMA_FREE;
    state->blocks[lease->slot].descriptor.valid=0U;
    state->leasePresent=false;
    state->lease=(DmaToken){0};
    dma_increment(&state->diagnostics.released,&state->diagnostics.saturated);
    dma_history(state,DMA_OK);
    return DMA_OK;
}

/** @brief Request user-stop or transfer-error with initiating partial length.
 * @param[in,out] state Running/boundary state.
 * @param[in] cause USER/TRANSFER only.
 * @param[out] report Fresh result on accepted request.
 * @return DMA_OK/DMA_TRANSFER_ERROR or preserving rejection. */
DmaStatus dma_request_stop(DmaState *state, DmaCause cause, DmaReport *report)
{
    DmaStatus status=cause==DMA_CAUSE_TRANSFER ? DMA_TRANSFER_ERROR : DMA_OK;
    /**
    * Valid complete READY blocks and an outstanding consumer remain accurately owned.
    **/
    if (state==NULL || report==NULL || (cause!=DMA_CAUSE_USER && cause!=DMA_CAUSE_TRANSFER)) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->phase!=DMA_RUNNING && state->phase!=DMA_BOUNDARY) {
        return DMA_BAD_STATE;
    }
    state->stopValid=0U;
    if (state->phase==DMA_RUNNING) {
        state->stopValid=state->blocks[state->current].descriptor.valid;
        state->blocks[state->current].descriptor.owner=DMA_INVALID;
    }
    state->phase=DMA_STOP_REQUESTED;
    state->cause=cause;
    if (cause==DMA_CAUSE_TRANSFER) {
        dma_increment(&state->diagnostics.transferErrors,&state->diagnostics.saturated);
    }
    dma_history(state,status);
    dma_report(state,report);
    return status;
}

/** @brief Supply independent confirmation; never infer it from stop intent.
 * @param[in,out] state Stop-requested state.
 * @param[out] report Fresh metadata.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_confirm_stop(DmaState *state, DmaReport *report)
{
    /**
    * A consumer lease survives backend confirmation until matching release.
    **/
    if (state==NULL || report==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->phase!=DMA_STOP_REQUESTED) {
        return DMA_BAD_STATE;
    }
    state->phase=DMA_STOP_CONFIRMED;
    dma_history(state,DMA_OK);
    dma_report(state,report);
    return DMA_OK;
}

/** @brief Recover only after both independent release conditions hold.
 * @param[in,out] state Confirmed stopped state without lease.
 * @param[out] report Fresh idle/new-run snapshot.
 * @return DMA_OK/BUSY/EXHAUSTED or preserving rejection. */
DmaStatus dma_recover(DmaState *state, DmaReport *report)
{
    size_t index;
    /**
    * Run allocation is checked before discarding any prior data or observations.
    **/
    if (state==NULL || report==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->phase!=DMA_STOP_CONFIRMED || state->leasePresent) {
        return DMA_BUSY;
    }
    if (state->runExhausted) {
        return DMA_EXHAUSTED;
    }
    state->run=dma_allocate(&state->nextRun,&state->runExhausted);
    for (index=0U;index<DMA_BLOCKS;index++) {
        if (state->blocks[index].descriptor.owner==DMA_READY) {
            dma_increment(&state->diagnostics.discardedReady,&state->diagnostics.saturated);
        }
        state->blocks[index]=(DmaBlock){0};
        state->blocks[index].descriptor.token.slot=(uint32_t)index;
    }
    state->phase=DMA_IDLE;
    state->cause=DMA_CAUSE_NONE;
    state->current=0U;
    state->ndtr=DMA_ITEMS;
    state->stopValid=0U;
    state->ht=false;
    state->tc=false;
    dma_history(state,DMA_OK);
    dma_report(state,report);
    return DMA_OK;
}

/** @brief Observe latches rather than reconstruct arbitrary missed history.
 * @param[in,out] state Initialized state.
 * @param[in] clear Clear both latches after copying.
 * @param[out] report Fresh pre-clear flags.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_observe(DmaState *state, bool clear, DmaReport *report)
{
    /**
    * Reobserving an uncleared TC is another observation, not another completion.
    **/
    if (state==NULL || report==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->tc) {
        dma_increment(&state->diagnostics.observedTc,&state->diagnostics.saturated);
    }
    dma_history(state,DMA_OK);
    dma_report(state,report);
    if (clear) {
        state->ht=false;
        state->tc=false;
    }
    return DMA_OK;
}

/** @brief Copy bounded metadata in every accepted lifecycle phase.
 * @param[in] state Initialized object.
 * @param[out] report Fresh output.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_status(const DmaState *state, DmaReport *report)
{
    /**
    * Status remains available while waiting for independent stop/release facts.
    **/
    if (state==NULL || report==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    dma_report(state,report);
    return DMA_OK;
}

/** @brief Initialize independent raw-counterexample storage.
 * @param[out] state Fresh raw object.
 * @return DMA_OK or preserving DMA_INVALID_ARGUMENT. */
DmaStatus dma_raw_init(DmaRawState *state)
{
    /**
    * The raw model never grants a safe consumer lease.
    **/
    if (state==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    *state=(DmaRawState){0};
    state->ndtr=DMA_ITEMS;
    return DMA_OK;
}

/** @brief Inject one raw transfer; fourth item auto-switches CT.
 * @param[in,out] state Initialized raw object.
 * @param[in] sample Wide checked16-bit input.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_raw_push(DmaRawState *state, uint32_t sample)
{
    uint32_t index;
    /**
    * This sequential fake explicitly demonstrates logical overwrite without a C race.
    **/
    if (state==NULL || sample>UINT16_MAX) {
        return DMA_INVALID_ARGUMENT;
    }
    if (state->current>=DMA_BLOCKS || state->ndtr==0U || state->ndtr>DMA_ITEMS) {
        return DMA_BAD_STATE;
    }
    index=DMA_ITEMS-state->ndtr;
    if (state->held[state->current]) {
        state->ownershipViolation=true;
    }
    state->items[state->current][index]=(uint16_t)sample;
    state->ndtr-=1U;
    if (state->ndtr==2U) {
        state->ht=true;
    }
    if (state->ndtr==0U) {
        state->tc=true;
        dma_increment(&state->completed,&state->saturated);
        state->current=1U-state->current;
        state->ndtr=DMA_ITEMS;
    }
    return DMA_OK;
}

/** @brief Retain an illustrative completed raw block; no writer enforcement.
 * @param[in,out] state Initialized raw object.
 * @param[in] slot Non-current completed slot.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_raw_hold(DmaRawState *state, uint32_t slot)
{
    /**
    * Raw DBM does not wait for this software-held marker.
    **/
    if (state==NULL || slot>=DMA_BLOCKS) {
        return DMA_INVALID_ARGUMENT;
    }
    if (state->current>=DMA_BLOCKS || state->ndtr==0U || state->ndtr>DMA_ITEMS) {
        return DMA_BAD_STATE;
    }
    if (slot==state->current || state->completed==0U) {
        return DMA_BAD_STATE;
    }
    state->held[slot]=true;
    return DMA_OK;
}

/** @brief Observe one raw latch, optionally clearing both flags.
 * @param[in,out] state Initialized raw object.
 * @param[in] clear Clear after observation.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_raw_observe(DmaRawState *state, bool clear)
{
    /**
    * An observed latch count is not the fake generator's injected completion count.
    **/
    if (state==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (state->current>=DMA_BLOCKS || state->ndtr==0U || state->ndtr>DMA_ITEMS) {
        return DMA_BAD_STATE;
    }
    if (state->tc) {
        dma_increment(&state->observedTc,&state->saturated);
    }
    if (clear) {
        state->ht=false;
        state->tc=false;
    }
    return DMA_OK;
}
```

## 十个独立回忆题 {#dma-practice-title}

<div id="dma-practice"></div>

<p class="practice-intro">以下十题各自带完整前提，不依赖活动当前状态。先离开页面回忆，再展开因果答案；普通题号链接保持答案折叠，直接 answer 深链只展开所需祖先。</p><article class="exercise" id="dma-exercise-01"><h3>01. 基础｜请求映射与两类优先级</h3><p class="question-stem">选定历史 F407 的 ADC1 请求可使用什么 DMA mapping？提高 NVIC 中断紧迫度会直接提高 DMA 总线仲裁级别吗？</p><details class="exercise-answer" id="dma-answer-01"><summary>展开因果答案与下一检查</summary><p>RM0090 Rev5 Table44 给 ADC1 为 DMA2 stream0 或4、channel0。每个控制器有8 streams，channel 是请求选择；同一 stream 不同时处理8个请求。DMA 的4级 PL 与同级较小 stream 编号仲裁，区别于 NVIC 选择处理程序的紧迫度。下一步应核具体器件请求表与实际 stream 配置，不能拿 AN4031 的 F42x 表替代 F407。</p></details></article><article class="exercise" id="dma-exercise-02"><h3>02. 基础｜四项与八字节</h3><p class="question-stem">A/B 两块各装 N4 个16bit item。一块需多少字节，两项后 NDTR 为多少？如果本对象只有6bytes 能否启动？</p><details class="exercise-answer" id="dma-answer-02"><summary>展开因果答案与下一检查</summary><p>16bit=2bytes，所以4×2=8bytes/块；两项后剩2items，NDTR=2。6bytes 只能容纳3项，必须在任何写入之前拒绝。NDTR 的 item 单位与分配 extent 的 byte 单位不同；下一检查是 width、count×width、对齐和本对象实际尺寸。</p></details></article><article class="exercise" id="dma-exercise-03"><h3>03. 故障｜可达域、对齐、extent</h3><p class="question-stem">三个 numeric destination 分别是 CCM0x10000000、SRAM1 的0x20000001、0x2001BFFC但本对象仅分配4bytes。都要求 N4/width2，分别哪里失败？</p><details class="exercise-answer" id="dma-answer-03"><summary>展开因果答案与下一检查</summary><p>CCM 在所选 DMA memory path 外；第二个地址奇数，不满足2byte对齐；第三个对象只有4bytes，小于8bytes，并且8byte span 会跨出所选 SRAM1 区域。SRAM2 相邻不能扩大一个对象的分配权。数值可表达、CPU可读和DMA可达是不同条件；host 从不解引用这些假 MCU 数字。</p></details></article><article class="exercise" id="dma-exercise-04"><h3>04. 基础｜raw完成与safe显式阶段</h3><p class="question-stem">raw 从 A 注入10、11、12、13后，HT/TC/CT/NDTR是什么，processed 必须为1吗？safe 的 push13 后又有何不同？</p><details class="exercise-answer" id="dma-answer-04"><summary>展开因果答案与下一检查</summary><p>raw 两项时 HT1/NDTR2，第四项自动完成 A[10,11,12,13]，TC1、CT=B、NDTR4。processed 没有由旗标证明。safe 的 push13 只得到 WRITER/valid4/NDTR0；必须另供 matching complete 才发布 READY、TC并切CT/NDTR，再由 begin_next 开始下一块。下一检查是区分模型及实际调用阶段，不能把未供给的完成当事实。</p></details></article><article class="exercise" id="dma-exercise-05"><h3>05. 故障｜同一快照的不同历史</h3><p class="question-stem">不清旗标地完成2块或4块后，均观察 CT=A/NDTR4/HT1/TC1。能从这个快照恢复精确历史完成数吗？</p><details class="exercise-answer" id="dma-answer-05"><summary>展开因果答案与下一检查</summary><p>不能。CT/NDTR 是有限当前状态，HT/TC 是单比特锁存，重复事件可以合并成同一个观察。fake生成器知道自己注入2或4块，这是独立oracle，不是观察者推断。下一检查应分开 injected completed 与 observedTc；单个快照不能恢复任意漏圈。</p></details></article><article class="exercise" id="dma-exercise-06"><h3>06. 故障｜held A与raw覆盖</h3><p class="question-stem">软件持有 A[10,11,12,13]，B 完成20..23，接下来源提供30。raw DBM 与 SAFE_STOP_ON_REUSE 分别会怎样？</p><details class="exercise-answer" id="dma-answer-06"><summary>展开因果答案与下一检查</summary><p>raw 自动返回 A，30可覆盖 A[0] 的10，并不等待软件 owner；软件迟到未必触发 DMA transfer-error 或 ADC overrun。safe 在显式 begin_next 复用边界发现 A 非FREE，返回 LATE_REUSE、请求停止，下一 fake push30 返回 NOT_RUNNING且不写入。此原创策略只保护该事件模型；不能证明真实 TC ISR 在首个覆盖字节之前来得及停流。</p></details></article><article class="exercise" id="dma-exercise-07"><h3>07. 故障｜旧实例并非新权限</h3><p class="question-stem">旧 lease 含 run/buffer/block generation，而同一物理数组后来装入新实例。旧 read、release、completion 可以做什么？零 token 呢？</p><details class="exercise-answer" id="dma-answer-07"><summary>展开因果答案与下一检查</summary><p>正旧身份返回 STALE_TOKEN并保持当前对象与输出，不能读新数据、释放新所有权或发布新块。run或block为0是 INVALID_TOKEN，slot≥2是参数错误。地址相同不代表实例相同；正身份不回绕/复用。下一检查是 actual token、owner、valid 和活 lease，不能只比较指针。</p></details></article><article class="exercise" id="dma-exercise-08"><h3>08. 故障｜请求、确认与未释放lease</h3><p class="question-stem">迟复用已经请求停止，但backend尚未确认；随后确认了，A仍有CONSUMER。recover何时才能成功，成功后会自动开始吗？</p><details class="exercise-answer" id="dma-answer-08"><summary>展开因果答案与下一检查</summary><p>确认之前 recover 返回 BUSY；确认但仍有lease也返回 BUSY。状态查询及匹配读取/释放仍可进行，release 不替代停止确认。两条件都满足后 recover 丢弃旧 READY，清两块valid、HT/TC和旧cause，获得下一正run，IDLE/NDTR4；start是单独动作。fresh init不能擦除活所有权。</p></details></article><article class="exercise" id="dma-exercise-09"><h3>09. 迁移｜最后正身份与诊断饱和</h3><p class="question-stem">公共 LAST_BLOCK fixture 让最后 uint32 正 block ID 被使用。后续分配可以回绕0/1，或在 recover 后重置成1吗？诊断达到MAX时又如何？</p><details class="exercise-answer" id="dma-answer-09"><summary>展开因果答案与下一检查</summary><p>不能。最后 MAX 可以完成/claim/read/release；下一次需要block身份的调用返回 EXHAUSTED并保持状态/输出。recover只分配run，不倒退block历史；LAST_RUN同理最后run一次可用后拒绝下一recover。诊断另用饱和规则：MAX−1加1得到MAX仍exact，再尝试加1才置sticky saturated，不把诊断规则用于身份回绕，也不能用截断总数算精确丢失率。</p></details></article><article class="exercise" id="dma-exercise-10"><h3>10. 迁移｜Flash accelerator与M7缓存</h3><p class="question-stem">看到 F407 Flash I/D-code cache 和 AN4839 的 M7 DMA维护例子，是否可把 clean/invalidate 代码直接复制到 F407 SRAM buffer？</p><details class="exercise-answer" id="dma-answer-10"><summary>展开因果答案与下一检查</summary><p>不成立。所选 F407 的 Flash-interface 加速并非 M7覆盖SRAM的L1 D-cache。迁移F7/H7须重新核具体DMA可达域、memory attributes、cache启用、line尺寸/对齐/相邻共享数据及方向，本文没有核出可复制的目标维护代码。可见性、寿命、所有权和C原子同步各需自己的依据。</p></details></article>

<p class="practice-intro retrieval-task">隔天先不看答案，保持 N4/width2：把 numeric placement 地址分别改为0x2001BFF8与0x2001BFFA，每个地址各给 extent8和extent6；先画8byte span、2byte对齐和单region边界，再写准入结论。另从 run1、STOP_REQUESTED、A=CONSUMER/B=READY且A lease未释放的字面状态，在纸上比较“先matching release后confirm_stop”和“先confirm_stop后matching release”，逐步列出 owner、lease、run及recover第一个可接受点；禁止用fresh init抹去live owner。写成一张条件/状态表，再用原公共接口核对。任务不改变safe固定四个uint16_t模型，不保存个人记录。</p>

## 实际来源与仍未验证的条件 {#dma-sources-title}

<div id="dma-sources"></div>

<p>本作者完整读取已冻结spec、两份研究交接与实际manifest；原始PDF/text/pixel履历归原研究者。本作者未重新目视供应商像素。历史RM研究者实际目视60/73/305/310/319/321/329七页，实际text范围按manifest限定，不称整本审计。current official RM仍未读；current DS/PM/AN相关pixels、选定硅片DMA/ADC current errata、真实放置/并发/缓存/backend stop/时序/WCET/物理采样、最大target栈与实体纸张均未验证。保持07/09既有时钟/PLL/current-table缺口，不用新章节掩盖。</p><ul class="source-list"><li><a href="https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf">RM0090 DocID018909 Rev5 September2013</a>：Figure1/3 pp60/73、§10.1–.5、Table44 p305、停止/错误pp319–320。原文件21509404B，SHA256 48454a026ae6f625801c403239d6d13536a3fc1ab0d8e39ca421b68b8dc408f8为研究manifest所载，非当前RM。</li><li><a href="https://github.com/STMicroelectronics/cmsis-device-f4/blob/5f41fb29d22773896c780052bf61e47fc924d524/Include/stm32f407xx.h">DeviceF4 v2.6.10固定F407 header</a>：器件及RAM基址有限符号阅读；不是全device审计。</li><li><a href="https://www.st.com/resource/en/application_note/an4031-using-the-stm32f2-stm32f4-and-stm32f7-series-dma-controller-stmicroelectronics.pdf">AN4031 DocID022648 Rev3 June2016</a>：§1.1、DBM §1.1.11、cache §4.10文字；mapping Table1/2不是F407证据；原PDF bytes/SHA缺失，文本snapshot的hash不得冒充origin PDF。</li><li><a href="https://www.st.com/resource/en/datasheet/dm00037051.pdf">DS8626 Rev12 March2026</a>：RAM/DMA §3.6–.10及p73的有限文字；没有当前表图像素验证。</li><li><a href="https://www.st.com/resource/en/application_note/an4839-level-1-cache-on-stm32f7-series-and-stm32h7-series-stmicroelectronics.pdf">AN4839 Rev2 March2018</a>：F7/H7 cache text，origin PDF bytes/SHA未得，不是F407 SRAM维护合同。</li><li><a href="https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf">WG14 N1570 April2011公开委员会草案</a>：类型/对象/unsigned/原子范围；不是最终ISO标准，也不替代目标DMA/ISR契约。</li></ul><p>raw/safe政策、有限阶段、身份分配器、字面fixture与原创图由本课程定义。正常/NDEBUG实际公共C独立编译/链接与README原文consumer已执行；JavaScript活动另有controller验证。作者浏览器/打印证据仅限本地候选，根任务再做完整站点与固定HEAD技术/teach/Spec/Standards审查。源代码可审查、Library交付、正式发布、硬件验收、个人掌握是不同状态。没有保存分数/答案或写个人学习记录。</p>

<div class="next-links"><a class="btn" href="./interrupt-shared-data.html">← 15 中断共享数据（同批候选）</a><a class="btn" href="./dma-ownership.html">完整章节</a><a class="btn" href="./throughput-overload.html">17 吞吐与过载（同批候选）→</a><a class="btn" href="../learn/engineering-map.html">32单元路线；18–32待完成</a></div>
