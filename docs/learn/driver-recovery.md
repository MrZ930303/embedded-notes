# 驱动错误、超时与恢复 {#driver-recovery}

本页为完整可搜索镜像；交互请打开同名独立阅读页。所有静态解释、原创图关系、完整答案、源版本和先决条件均保留。

<div class="content-section" id="recovery-overview" role="region" aria-labelledby="recovery-overview-title">

## 同一个采集终端，故障时仍能回答状态 {#recovery-overview-title}



<p>前置：05的值复制与四槽FIFO、10的checked modulo32时间、11的commandPresent、13的候选采样与READY。本章继续做同一个可升级采集终端：传感器尚未完成时，上位机仍能问“现在怎么样”；失败不能把主循环锁在等待里。</p>
<p><strong>完成本章后：</strong>你能用phase、原始cause、服务观察年龄、attempt、cleanup和uncertainty解释一次失败；手推三次启动的固定时间线；运行真实UART+ADC主机C组合；说明为什么未确认清理时必须隔离。短路线分四次小胜利：区分返回与事实 → 手推20/5/100/20ms → 拒绝一次危险重放 → 在隔离后查询status。每段先在纸上写一个判断，再用活动核对。</p>
<p>这是原创协作式host模型：每次调用立即返回，接纳不做后端动作，每service至多一个port action。浏览器JavaScript与另行编译运行的C是两类证据。没有MMIO、HAL调用、真实串口、物理abort或总线恢复；调度/WCET、采样精度、硬件、实体纸张均未验证。没有保存答案、分数、个人掌握状态。</p>
</div>
<div class="content-section" id="recovery-diagnostics" role="region" aria-labelledby="recovery-diagnostics-title">

## 先回答“发生了什么”，再回答“决定怎么办” {#recovery-diagnostics-title}



<p>传感器请求尚在进行时返回PENDING，是正常进度；另一个请求接纳返回BUSY，是已有工作占用；INVALID_ARGUMENT表示输入不在契约域；TIME_REJECTED表示本次观察的模差不可信。它们不能都写成“驱动失败”。后端NACK、ARBITRATION_LOST、OVERRUN、PERMANENT、LOST_REPLY以及实际ADC_BACKEND/ADC_TIMEOUT又是不同起因。</p>
<p>把<strong>调用是否被接受</strong>和<strong>任务的结果分类</strong>分成两层：合法发生的超时、错误和清理转移，C调用返回RECOVERY_OK，report.snapshot再说PENDING/READY/FAILED/QUARANTINED。参数、状态或时间拒绝才返回保持型调用错误，不改命名状态、诊断和输出。不要把有效的超时转移当作“函数什么都没做”。</p>
<p>firstFailure只锁存本任务第一次起因，lastFailure只随另一次尝试失败更新。它们拷贝cause、被服务/失败的backend phase、actual ADC status/phase、token、attempt、jobAgeMs、attemptAgeMs和sideEffectUncertain。cleanup和最终reason不覆盖这些记录。例：20ms检测ATTEMPT_TIMEOUT，21ms取消接受，41ms最终CANCEL_TIMEOUT隔离；原始cause仍是ATTEMPT_TIMEOUT@20ms，而不是被“取消超时”替换。</p>
<div class="table-wrap" role="region" aria-label="两个不同的问题，可横向滚动" tabindex="0"><table><caption>两个不同的问题</caption><thead><tr><th scope="col">字段/结果</th><th scope="col">回答的问题</th><th scope="col">下一步</th></tr></thead><tbody><tr><td>RECOVERY_BUSY</td><td>新请求为何没有接纳</td><td>查询已有任务；不要覆盖它</td></tr><tr><td>PENDING + ACTIVE</td><td>当前任务等什么</td><td>再让出主循环，提供下一次有限服务</td></tr><tr><td>firstFailure/lastFailure</td><td>何时、哪一相、哪次尝试先失败</td><td>查原始条件，保留历史输出</td></tr><tr><td>reason=ATTEMPTS_EXHAUSTED</td><td>管理策略为何终止</td><td>已清理，允许checked reset</td></tr><tr><td>QUARANTINED + UNCONFIRMED</td><td>未释放的请求现在归谁</td><td>管理器继续持有；只查询，不复用</td></tr></tbody></table></div>
</div>
<div class="content-section" id="recovery-deadlines" role="region" aria-labelledby="recovery-deadlines-title">

## 手推四个预算：截止相等就过期 {#recovery-deadlines-title}



<p>本章策略是<strong>总共最多3次尝试</strong>，每次20ms；确认清理之后等待5ms再试；从接纳起总预算100ms；取消请求发出之后20ms内必须确认清理。取消时间包含在100ms中，不为任务追加20ms。3次attempt是最大值，初次也算一次；它不表示“再重试三次”，总期限也可能让后续尝试根本没有机会。</p>
<p>每次有效服务先用真实time_elapsed检查时间，再推进适用年龄。顺序固定：<strong>total≥100 → 当前cancel≥20或attempt≥20 → retry等待与资格 → 至多一次后端动作</strong>。等号属于过期。一条READY若在start0的now20才被服务，先检测attempt年龄20，0动作、0新结果；不能因为它“看起来成功”而绕过期限。</p>
<p>短预测一：start0、timeout20、cancel21、cleanup22，26ms能重新start吗？不能：26−22=4ms；27−22=5ms才允许一次新start。等待从匹配cleanup确认的<strong>服务观察</strong>起算，不从错误或取消接受算。检查phase和cleanup后，再做减法。</p>
<figure><div class="flow-scroll" role="region" aria-label="原创服务判定顺序：先验证再按优先级选择，绝不在一次服务中连续执行两个port动作，可横向滚动" tabindex="0"><svg viewBox="0 0 760 150" role="img" aria-labelledby="recovery-order-figure"><title id="recovery-order-figure">原创服务判定顺序：先验证再按优先级选择，绝不在一次服务中连续执行两个port动作</title><rect x="15" y="25" width="170" height="105" rx="8" fill="#eef2e9" stroke="#aabaad"/><text x="100" y="65" text-anchor="middle">验证与时间</text><text x="100" y="100" text-anchor="middle">拒绝则保持</text><path d="M186 78h12m-5-5 5 5-5 5" stroke="#22664f" fill="none"/><rect x="200" y="25" width="170" height="105" rx="8" fill="#eef2e9" stroke="#aabaad"/><text x="285" y="65" text-anchor="middle">总期限100</text><text x="285" y="100" text-anchor="middle">先于其他期限</text><path d="M371 78h12m-5-5 5 5-5 5" stroke="#22664f" fill="none"/><rect x="385" y="25" width="170" height="105" rx="8" fill="#eef2e9" stroke="#aabaad"/><text x="470" y="65" text-anchor="middle">当前期限</text><text x="470" y="100" text-anchor="middle">cancel/attempt20</text><path d="M556 78h12m-5-5 5 5-5 5" stroke="#22664f" fill="none"/><rect x="570" y="25" width="170" height="105" rx="8" fill="#eef2e9" stroke="#aabaad"/><text x="655" y="65" text-anchor="middle">资格与动作</text><text x="655" y="100" text-anchor="middle">最多一个port</text></svg></div><figcaption>箭头是判定顺序，不是四次后端调用。总期限和当前期限成立时，本次backendActions=0；回包不被消费。</figcaption></figure>
<p>独立总期限例子：start0，timeout20，故意直到90才服务取消请求；100时totalAge=100、cancelAge=10，仍先因TOTAL_TIMEOUT隔离。另一个独立例子为cancel80、cleanup95（取消年龄15，合法），99时wait4、100时wait5与total100同时成立；由于已释放，终止为<strong>干净FAILED/TOTAL_TIMEOUT</strong>，没有第二次start。不能把三次尝试的时间线删几行，就当成这两个不同实验。</p>
</div>
<div class="content-section" id="recovery-timeline" role="region" aria-labelledby="recovery-timeline-title">

## 从0走到76：第三次失败后没有第四次 {#recovery-timeline-title}



<p>下面是独立手算的READ超时例子：寄存器77，操作无副作用；所有cleanup确认都由明确的fake输入提供。接纳0时attempt=0、actions=0；同为0的另一次service才发start。deadline行没有调用poll；检测失败与请求取消也分两次服务。失败全程不写调用者结果对象。请先数start行，再看动作列：只有0、27、54三行。</p>
<div class="table-wrap" role="region" aria-label="独立固定轨迹（1tick=1ms），可横向滚动" tabindex="0"><table><caption>独立固定轨迹（1tick=1ms）</caption><thead><tr><th scope="col">观察tick/ms</th><th scope="col">行为与下一phase</th><th scope="col">attempt / token</th><th scope="col">port actions</th></tr></thead><tbody><tr><td>0</td><td>接纳后另一次service START</td><td>1 / 1</td><td>1</td></tr><tr><td>20</td><td>ATTEMPT_DEADLINE → CANCEL_DUE</td><td>1 / 1</td><td>0</td></tr><tr><td>21</td><td>取消接受，仍拥有请求</td><td>1 / 1</td><td>1</td></tr><tr><td>22</td><td>匹配清理确认 → RETRY_WAIT</td><td>1 / 1</td><td>1</td></tr><tr><td>26</td><td>wait=4，不启动</td><td>1 / 1</td><td>0</td></tr><tr><td>27</td><td>wait=5，START</td><td>2 / 2</td><td>1</td></tr><tr><td>47</td><td>尝试到期</td><td>2 / 2</td><td>0</td></tr><tr><td>48</td><td>取消接受</td><td>2 / 2</td><td>1</td></tr><tr><td>49</td><td>清理确认</td><td>2 / 2</td><td>1</td></tr><tr><td>54</td><td>START</td><td>3 / 3</td><td>1</td></tr><tr><td>74</td><td>尝试到期</td><td>3 / 3</td><td>0</td></tr><tr><td>75</td><td>取消接受</td><td>3 / 3</td><td>1</td></tr><tr><td>76</td><td>清理确认 → ATTEMPTS_EXHAUSTED</td><td>3 / 3</td><td>1</td></tr><tr><td>77</td><td>终态，只复制状态</td><td>3 / 3</td><td>0</td></tr></tbody></table></div>
<p>22、49、76各自只做一次cancel-poll和清理确认，不顺便start；27、54是后续独立服务。原始firstFailure保持attempt1@20ms，lastFailure最后为attempt3@74ms。任务终止观察年龄是76ms，后来的77ms状态查询不把它改成77。这里的年龄不是示波器量到的墙钟响应。</p>
</div>
<div class="content-section" id="recovery-cleanup" role="region" aria-labelledby="recovery-cleanup-title">

## 取消接受，为什么还不能复用资源？ {#recovery-cleanup-title}



<p>取消请求返回“已接受”，只说明管理器记下了取消意图。旧请求和token仍归backend wrapper持有，cleanup=REQUESTED、resource=OWNED；还不能把同一对象拿去开始另一个操作。本例虽只有值拷贝、没有借入caller buffer，这个所有权约束仍适用，避免把“无指针”误当成“可并行复用”。</p>
<p>下一次匹配cancel-poll得到CLEANUP_CONFIRMED，才把wrapper request/token释放。fake只有匹配CLEANUP_DONE会确认；WAIT/READY/FAIL并不确认，旧token也不确认。actual ADC若仍active，该次调用真实adc_cancel一次；若前一次producer error已让ADC inactive，则仅报告保存的localReleased事实，0次ADC调用。后者仍是<strong>一个port action</strong>，不能因此偷做同次重试。</p>
<figure><div class="flow-scroll" role="region" aria-label="原创所有权图：取消接受与清理确认是两个不同观察，确认前不能重用，可横向滚动" tabindex="0"><svg viewBox="0 0 760 150" role="img" aria-labelledby="recovery-owner-figure"><title id="recovery-owner-figure">原创所有权图：取消接受与清理确认是两个不同观察，确认前不能重用</title><rect x="15" y="25" width="170" height="105" rx="8" fill="#eef2e9" stroke="#aabaad"/><text x="100" y="65" text-anchor="middle">错误已记录</text><text x="100" y="100" text-anchor="middle">仍持有request</text><path d="M186 78h12m-5-5 5 5-5 5" stroke="#22664f" fill="none"/><rect x="200" y="25" width="170" height="105" rx="8" fill="#eef2e9" stroke="#aabaad"/><text x="285" y="65" text-anchor="middle">取消已接受</text><text x="285" y="100" text-anchor="middle">OWNED/REQUESTED</text><path d="M371 78h12m-5-5 5 5-5 5" stroke="#22664f" fill="none"/><rect x="385" y="25" width="170" height="105" rx="8" fill="#eef2e9" stroke="#aabaad"/><text x="470" y="65" text-anchor="middle">匹配清理确认</text><text x="470" y="100" text-anchor="middle">RELEASED</text><path d="M556 78h12m-5-5 5 5-5 5" stroke="#22664f" fill="none"/><rect x="570" y="25" width="170" height="105" rx="8" fill="#eef2e9" stroke="#aabaad"/><text x="655" y="65" text-anchor="middle">再等待5ms</text><text x="655" y="100" text-anchor="middle">才考虑重试</text></svg></div><figcaption>取消没有撤销远端副作用。确认仅证明所选纯host后端释放了本地生命周期；真实设备/线路需另立证据。</figcaption></figure>
<p>短预测二：cancel21，41时恰好收到CLEANUP_DONE，会被接受吗？不会：cancelAge=20先到期，进入终态QUARANTINED/CANCEL_TIMEOUT、resource=UNCONFIRMED，仍保留请求所有权。本次和以后都不再做任何自动backend动作；晚到成功、清理事件都不能解锁。status与UART照常可用。</p>
<p>对已初始化对象，submit/reset在隔离时返回LOCKED。fresh init则有另一个先决条件：真正的新存储、新token域，且没有任何旧操作或事件仍指向该域；它不能读取不定旧值来检测违规，也不授权覆盖live quarantine。不能用“重新初始化成功”证明隔离可恢复。本批不实现后续外部清理/复用协议。</p>
</div>
<div class="content-section" id="recovery-replay" role="region" aria-labelledby="recovery-replay-title">

## 丢了回复，不等于没有执行：counter1与盲重放2 {#recovery-replay-title}



<p>设独占fakeCounter初值0，INCREMENT在READY或COMMIT_LOST_REPLY处理时恰好加1。失回包路径已经把counter变为1，却没有新输出；管理器记录LOST_REPLY、uncertain=true，随后照样先清理。确认后以UNSAFE_EFFECT终止，不自动发第二次start。超时或取消不能把counter减回0。</p>
<p>独立的盲重放反例再次执行同一递增，counter变成2。两者的不同不在“重试次数够不够”，而在第一次效果是否能够排除。NACK在本fake被声明为pre-effect，INCREMENT也仍以NOT_REPLAYABLE停止；它没有任何自动重放原因。counter已到1,000,000时先拒绝效果为PERMANENT，不绕回0。</p>
<p>READ的安全性依赖<strong>独占稳定fakeRegister、没有read-clear/FIFO/外部写者</strong>；ASSIGN是向独占寄存器重复写相同的已复制值；SAMPLE是相同已复制输入的value-only host转换、无远端命令。这些模型条件成立才使用下表。真实读清零状态、出队读取、开门/扣款等不能继承本表。</p>
<div class="table-wrap" role="region" aria-label="本章封闭重放表：所有失败先清理，可横向滚动" tabindex="0"><table><caption>本章封闭重放表：所有失败先清理</caption><thead><tr><th scope="col">操作</th><th scope="col">清理后可重放的原始cause</th><th scope="col">其他终止</th></tr></thead><tbody><tr><td>READ / ASSIGN</td><td>ATTEMPT_TIMEOUT、NACK、OVERRUN、LOST_REPLY</td><td>ARLO或PERMANENT→PERMANENT_ERROR</td></tr><tr><td>SAMPLE</td><td>ATTEMPT_TIMEOUT、ADC_BACKEND、ADC_TIMEOUT</td><td>非法接纳拒绝；内部异常→CONTRACT_FAULT隔离</td></tr><tr><td>INCREMENT</td><td>无</td><td>不确定→UNSAFE_EFFECT；pre-effect→NOT_REPLAYABLE</td></tr></tbody></table></div>
<p>可重放还必须同时满足cleanup已确认、attempt&lt;3、token可用、wait≥5、total&lt;100。任何一个条件缺失都不能start。ARLO的名字不授权发STOP；本wrapper所有权说的是本地request/token，不是物理总线线缆。</p>
<div class="lab" id="effect-lab"><h3>短预测：回复缺失之后保留什么？</h3><p>独占counter初值0，INCREMENT已提交后丢回复，随后取消与清理确认。安全管理器不会重放。</p><label for="effect-prediction">预测最终counter</label><div class="controls"></div><label> 显式查看独立盲重放反例（不是管理器选项）</label><p class="feedback" id="effect-feedback" role="status" aria-live="polite"></p><p class="applied-result" id="effect-result" hidden></p></div>
</div>
<div class="content-section" id="recovery-tokens" role="region" aria-labelledby="recovery-tokens-title">

## token不是永不耗尽的魔法：旧完成必须有归属 {#recovery-tokens-title}



<p>每个start发放一个正uint32 token，域为1..4,294,967,295；0表示尚未发放。只有匹配当前token的READY含新值，才可提交。token1失败、清理22后，token2在27启动；28的READY(token1)只消耗一次poll action，报告STALE，既不写输出也不释放token2的操作。47即使再给旧READY，attempt期限仍先到期，0动作、不消费该输入。</p>
<p>不回绕、不复用才是这条保护的寿命条件。独立有限fixture从MAX−1=4,294,967,294开始：第一次用MAX−1，第二次用MAX；第二次清理后直接TOKEN_EXHAUSTED，只有2次start，没有token0或第三次start。checked reset保留nextToken与exhausted；之后submit先拒绝TOKEN_EXHAUSTED，保持已有状态与历史输出。firstToken=MAX也可只成功使用它一次。</p>
<p>fresh新域必须保证旧域事件和操作再不会出现，不能拿新对象隐藏隔离旧域。普通调用者不可复制一个live owner后把副本也运行；否则两个“独占”owner会使token与资源语义失效。</p>
</div>
<div class="content-section" id="recovery-bounds" role="region" aria-labelledby="recovery-bounds-title">

## 有限工作与有限存储，要逐项数出来 {#recovery-bounds-title}



<p>每次service返回完整的三槽事件report，unused slots确定为0。成功顺序为POLLED→COMMITTED→TERMINAL；清理为CANCEL_POLLED→CLEANUP→RETRY_WAIT或TERMINAL；stale为POLLED→STALE；deadline先记期限事件再终态（attempt到期只记ATTEMPT_DEADLINE）。没有分支发第四项。实现的容量检查防止越界；原生测试同时核对精确顺序与上限。</p>
<div class="table-wrap" role="region" aria-label="固定资源与工作账本，可横向滚动" tabindex="0"><table><caption>固定资源与工作账本</caption><thead><tr><th scope="col">对象/调用</th><th scope="col">固定界限</th><th scope="col">达到边界后的可观察结果</th></tr></thead><tbody><tr><td>Manager/backend/ADC</td><td>各1个；已复制request、candidate、committed、first/last failure</td><td>无job队列、无caller payload指针</td></tr><tr><td>service / admission</td><td>0..1 port action；0..1 ADC lifecycle call / 接纳0动作</td><td>不会在内部等待或循环重试</td></tr><tr><td>report</td><td>3 events，未用槽清零</td><td>每种轨迹保持固定顺序</td></tr><tr><td>可选diagnostic trace</td><td>32份report，建议调用者static存储</td><td>第33行drop newest，TRACE_DROPPED+drop计数；任务继续</td></tr><tr><td>七个manager诊断</td><td>uint32饱和，attempted overflow置sticky saturated</td><td>seed=MAX有限fixture验证，不做数十亿次循环</td></tr><tr><td>terminal turn</td><td>UART 0..4字节/0..5 events + job 0..1动作</td><td>不是wire吞吐、WCET或不丢字节承诺</td></tr></tbody></table></div>
<p>时间由已有time_elapsed另行链接：1tick=1ms；caller承诺真实前向相邻观察间隔&lt;2^31。模差≥2^31拒绝，所有命名组件与输出保持；相等观察合法但不增长年龄，两个相同数值也检测不了暗中整圈回绕。例4294967290→4是10ms，→14时年龄20，先过期。非法fixture last10→2147483658恰好差2^31，拒绝不推进动作计数。</p>
<p>累计年龄先widen再加。有效活动jobAge此前&lt;100，最大接受delta=2147483647，和≤2147483746，uint32可存；终态年龄冻结。数字期限只有在时间推进、服务继续被调度时才最终触发；有限每调用工作即使时间停住仍成立，却不保证墙钟完成。host sizeof、每函数.su、启发式扫描均不是目标最大栈预算。</p>
</div>
<div class="content-section" id="recovery-terminal" role="region" aria-labelledby="recovery-terminal-title">

## 真实UART与真实ADC如何在一个turn里相遇 {#recovery-terminal-title}



<p>原生terminal.c嵌入实际冻结的UartState和RecoveryState：turn先调用一次真实uart_poll，再一次recovery_service；UART的GET_STATUS只复制当前period，应用随后独立recovery_status拷贝job快照。它没有修改UART grammar，也没有凭空捏造parser accepted对象。</p>
<p>手算查询帧：A5是SOF，LEN=01，payload opcode=02，XOR=01⊕02=03，所以A5 01 02 03恰好4字节。依次经过真实uart_receive四次后，一次poll能排完，report.commandPresent=true；period100ms保持100ms。response.periodMs与response.job是应用层值对象，并非本例发送出去的线缆报文。</p>
<p>ADC模式只接受SAMPLE，并由实际adc_plan与adc_quantize先验证。固定复制请求为bits12、sampleCycles15、divider4、referenceUv3300000、inputUv1650000。turn0 start调用adc_start；后面三个独立ADC_ADVANCE poll分别服务ACQUIRE、CONVERT、RESULT，实际AdcReport.sample在最后返回2048。前一个pending turn可同时解析上述4字节查询，应用快照仍是PENDING，没有制造采样。</p>
<p>另一次job在manager20ms期限先到时，ADC仍active；独立cancel-request只接受，后续cancel-poll才调用active-only adc_cancel一次。若早先adc_poll已返回BACKEND_ERROR并active=false，后续cancel-poll仅报告保存的localReleased事实，1 port action/0 ADC calls。两条路径均保留此前已提交sample2048、原始failure及manager历史输出。producer report.phase是被服务/失败的相；producer state.phase是下一相，不能颠倒。</p>
<figure><div class="flow-scroll" role="region" aria-label="原创应用组合图：UART与job分别受理，应用只复制状态；非整turn原子回滚，可横向滚动" tabindex="0"><svg viewBox="0 0 760 150" role="img" aria-labelledby="recovery-app-figure"><title id="recovery-app-figure">原创应用组合图：UART与job分别受理，应用只复制状态；非整turn原子回滚</title><rect x="15" y="25" width="170" height="105" rx="8" fill="#eef2e9" stroke="#aabaad"/><text x="100" y="65" text-anchor="middle">4字节输入</text><text x="100" y="100" text-anchor="middle">实际uart_receive</text><path d="M186 78h12m-5-5 5 5-5 5" stroke="#22664f" fill="none"/><rect x="200" y="25" width="170" height="105" rx="8" fill="#eef2e9" stroke="#aabaad"/><text x="285" y="65" text-anchor="middle">一次uart_poll</text><text x="285" y="100" text-anchor="middle">commandPresent</text><path d="M371 78h12m-5-5 5 5-5 5" stroke="#22664f" fill="none"/><rect x="385" y="25" width="170" height="105" rx="8" fill="#eef2e9" stroke="#aabaad"/><text x="470" y="65" text-anchor="middle">一次job service</text><text x="470" y="100" text-anchor="middle">0..1 port动作</text><path d="M556 78h12m-5-5 5 5-5 5" stroke="#22664f" fill="none"/><rect x="570" y="25" width="170" height="105" rx="8" fill="#eef2e9" stroke="#aabaad"/><text x="655" y="65" text-anchor="middle">应用状态拷贝</text><text x="655" y="100" text-anchor="middle">period + job</text></svg></div><figcaption>原生实验通过实际C公共接口；下面浏览器活动使用独立JavaScript解释模型。两者都没有进行wire传输。</figcaption></figure>
<p>顶层null/input-shape错误先拒绝并保持整个turn的对象。独立组件已合法dispatch后则报告各自status与reportValid，不作跨组件回滚。原生有限例中UART已建立另一个合法观察域，能解析status，而manager恰因模差2^31拒绝；UART的已完成动作保留，manager保持原状态，应用仍可拷贝action-free snapshot。只能读取各自valid的report；responsePresent与resultPresent各授权一个不同输出。</p>
<p>真实ADC的host cancel是同步本地释放，不能诚实模拟任意延迟的物理abort。因此隔离后status实验使用<strong>另一个fresh FAKE terminal</strong>执行cancel21→41；42再喂A5 01 02 03，真实parser成功、period100、job QUARANTINED，backend action计数不增。它不覆写前一ADC或隔离对象、不改变既有backend kind。</p>
</div>
<div class="content-section" id="recovery-lab" role="region" aria-labelledby="recovery-lab-title">

## 先预测，再推进一个真实活动处理器 {#recovery-lab-title}



<p>下方是内存中的原创JavaScript状态机与已有JS UART帧模型组合，不执行C，不接硬件。固定轨迹只提供时间/外部事件，状态与结果由实际model/service handler计算。先写下一phase；正确和错误都会消费预测；编辑会清空预测并标为待应用。reset清活动结果和32行历史、建立独立fixture，不是给原生live quarantine解锁。</p>
<div class="lab"><div class="fields"><div class="field"><label for="recovery-scenario">独立有限场景</label></div><div class="field"><label for="recovery-now">下一次观察 / ms（可改写）</label></div><div class="field"><label for="recovery-prediction">预测本次之后的phase</label></div><div class="field"><label for="recovery-query"> 本turn喂入4字节status帧</label></div></div><p class="pending" id="recovery-pending"></p><div class="controls"></div><p id="recovery-state" role="status" aria-live="polite"></p><p class="feedback" id="recovery-feedback" role="status" aria-live="polite"></p><p class="applied-result" id="recovery-result" hidden></p><pre id="recovery-history" role="region" aria-label="最多32行的服务观察历史，可横向滚动" tabindex="0">尚未服务。</pre></div>
<p>不运行JavaScript时，可直接用上面的完整0→76表和21→41/90→100/95→100手算例检验。终态snapshot可能保留历史committed；只有本次resultPresent才是新结果。短预测三：第二次服务为WAIT而result对象里仍存2048，能当新样本吗？不能，先看fresh位，再查其原标签。</p>
</div>
<div class="content-section" id="recovery-interface" role="region" aria-labelledby="recovery-interface-title">

## 可复用C接口：先决条件也是接口的一部分 {#recovery-interface-title}



<p>下载时保留examples/下的兄弟目录。recovery.h列出完整封闭枚举、值类型、固定storage及manager/trace接口；fake_sensor.h提供固定FAKE/actual ADC port；terminal.h提供实际UART的应用组合。没有callbacks、union别名、堆、sleep、递归、阻塞等待或隐含测试main。所有实现分别编译、链接，绝不include一个.c。</p>
<p>所有非空指针必须指向真实、活着、类型正确的对象；输出可写且与每个其他call object（包括嵌套成员）不重叠。fresh initializer不检查旧不定成员；以后对象必须已初始化、内部一致、单上下文独占且不可重入。null/metadata检查不能验证forged/dangling pointer、虚假容量、重叠或任意内存破坏。不要制造这类非法指针“测试安全”。</p>
<p>config backend固定；firstToken为正uint32，diagnosticSeed可用0..MAX（正常为0，MAX只是有限饱和fixture）；fake register/counter种子0..1000000，ADC模式两种子必须0。FAKE只收READ/ASSIGN/INCREMENT，adc字段全0，READ/INCREMENT的value=0；ASSIGN value≤1000000。ADC只收SAMPLE/value0，经实际plan与quantize验证。submit只在IDLE接纳，拷贝request，0动作；clean terminal先reset，隔离LOCKED。</p>
<p>NONE输入token0/causeNONE；其他输入token必须为正。只有FAIL可携带模式允许的cause；CONTRACT_FAULT只由内部产生。ADC_ADVANCE仅ADC；READY/COMMIT_LOST_REPLY仅FAKE，后者仅ASSIGN/INCREMENT；CLEANUP_DONE仅FAKE cancel-poll有释放意义。形状合法而当前无对应poll的事件不保留、inputConsumed=false。对poll检查过的显式事件只消费一次；NONE隐式当前WAIT而consumed=false。</p>
<p>unexpected producer return在合法dispatch之后属于有效CONTRACT_FAULT隔离，保留输出和wrapper所有权，停止后续自动动作；不能谎称保持型BAD_STATE，也不能伪造清理确认。可检查的坏metadata则在dispatch前返回保持型BAD_STATE。checked reset只清当前job/failure/age等，保留committed、actual ADC committed、fake值、七个diagnostics和token分配史；status不观察时间、不做动作。</p>
<p>原生验证使用strict C11、-Wall -Wextra -Werror -pedantic，在normal与NDEBUG下保持live失败检查；七个模块分别编译，独立consumer重复包含所有七种header，链接真实FIFO/time/UART/ADC；并运行literal轨迹、32/33行、MAX种子、时间拒绝的所有命名字段比较。host栈启发式与.su仅给维护者线索，不是目标最大栈、ISR并发或硬件结论。参考README可用已有工具重现；所有AgentHub构建实验必须经mcu-build validate→dry-run→build。</p>
</div>
<div class="content-section" id="recovery-c" role="region" aria-labelledby="recovery-c-title">

## 完整可下载原生源码与独立运行方法 {#recovery-c-title}


<p>以下15份展示都来自对应native下载的完整文件字节，借入8个C/H保持各自目录与作者归属；没有复制成14的新实现。README包含可另存的完整main及通用重现步骤。源码阅读区可键盘横向滚动。</p><ul><li><a href="../examples/driver-recovery/recovery.c" download>driver-recovery/recovery.c</a></li><li><a href="../examples/driver-recovery/recovery.h" download>driver-recovery/recovery.h</a></li><li><a href="../examples/driver-recovery/fake_sensor.c" download>driver-recovery/fake_sensor.c</a></li><li><a href="../examples/driver-recovery/fake_sensor.h" download>driver-recovery/fake_sensor.h</a></li><li><a href="../examples/driver-recovery/terminal.c" download>driver-recovery/terminal.c</a></li><li><a href="../examples/driver-recovery/terminal.h" download>driver-recovery/terminal.h</a></li><li><a href="../examples/driver-recovery/README.txt" download>driver-recovery/README.txt</a></li><li><a href="../examples/bounded-fifo/fifo.c" download>bounded-fifo/fifo.c（借入原文件）</a></li><li><a href="../examples/bounded-fifo/fifo.h" download>bounded-fifo/fifo.h（借入原文件）</a></li><li><a href="../examples/timer-pwm/time.c" download>timer-pwm/time.c（借入原文件）</a></li><li><a href="../examples/timer-pwm/time.h" download>timer-pwm/time.h（借入原文件）</a></li><li><a href="../examples/uart-framing/uart.c" download>uart-framing/uart.c（借入原文件）</a></li><li><a href="../examples/uart-framing/uart.h" download>uart-framing/uart.h（借入原文件）</a></li><li><a href="../examples/adc-sampling/adc.c" download>adc-sampling/adc.c（借入原文件）</a></li><li><a href="../examples/adc-sampling/adc.h" download>adc-sampling/adc.h（借入原文件）</a></li></ul><details class="source-code" id="source-driver-recovery-recovery-c"><summary>完整 driver-recovery/recovery.c</summary>

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file recovery.c
 * @author embedded-notes contributors
 * @brief Closed bounded host recovery; no hardware operation.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "recovery.h"
#include "fake_sensor.h"
#include "../timer-pwm/time.h"

/**
 * @brief valid config: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_config(const RecoveryConfig *config)
{
    /** Respect the finite domain before dispatch or state publication. **/
    return config != NULL && config->backend >= RECOVERY_BACKEND_FAKE &&
        config->backend <= RECOVERY_BACKEND_ADC && config->firstToken != 0U &&
        config->fakeRegister <= RECOVERY_FAKE_MAX_VALUE && config->fakeCounter <= RECOVERY_FAKE_MAX_VALUE &&
        (config->backend != RECOVERY_BACKEND_ADC || (config->fakeRegister == 0U && config->fakeCounter == 0U));
}
/**
 * @brief valid request: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_request(RecoveryBackendKind kind, const RecoveryRequest *request)
{
    /** Respect the finite domain before dispatch or state publication. **/
    AdcPlan plan;
    uint16_t code;
    if (request == NULL || request->operation < RECOVERY_READ || request->operation > RECOVERY_SAMPLE) {
        return false;
    }
    if (kind == RECOVERY_BACKEND_ADC) {
        return request->operation == RECOVERY_SAMPLE && request->value == 0U &&
            adc_plan(&request->adc, &plan) == ADC_OK && adc_quantize(&request->adc, &code) == ADC_OK;
    }
    return request->operation != RECOVERY_SAMPLE &&
        (request->operation == RECOVERY_ASSIGN ? request->value <= RECOVERY_FAKE_MAX_VALUE : request->value == 0U) &&
        request->adc.bits == 0U && request->adc.sampleCycles == 0U && request->adc.divider == 0U &&
        request->adc.referenceUv == 0U && request->adc.inputUv == 0U;
}
/**
 * @brief valid input: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_input(RecoveryBackendKind kind, RecoveryOperation operation, const RecoveryInput *input)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (input == NULL || input->kind < RECOVERY_INPUT_NONE || input->kind > RECOVERY_INPUT_ADC_ADVANCE) {
        return false;
    }
    if (input->kind == RECOVERY_INPUT_NONE) {
        return input->token == 0U && input->cause == RECOVERY_CAUSE_NONE;
    }
    if (input->token == 0U) {
        return false;
    }
    if (input->kind == RECOVERY_INPUT_FAIL) {
        return kind == RECOVERY_BACKEND_ADC ? input->cause == RECOVERY_CAUSE_ADC_BACKEND :
            (input->cause >= RECOVERY_CAUSE_NACK && input->cause <= RECOVERY_CAUSE_LOST_REPLY);
    }
    if (input->cause != RECOVERY_CAUSE_NONE) {
        return false;
    }
    if (kind == RECOVERY_BACKEND_ADC) {
        return input->kind == RECOVERY_INPUT_WAIT || input->kind == RECOVERY_INPUT_ADC_ADVANCE;
    }
    return input->kind != RECOVERY_INPUT_ADC_ADVANCE &&
        (input->kind != RECOVERY_INPUT_COMMIT_LOST_REPLY ||
            operation == RECOVERY_ASSIGN || operation == RECOVERY_INCREMENT);
}
/**
 * @brief valid backend: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_backend(const RecoveryBackend *backend)
{
    /** Respect the finite domain before dispatch or state publication. **/
    AdcPlan plan;
    bool active;
    if (backend->kind < RECOVERY_BACKEND_FAKE || backend->kind > RECOVERY_BACKEND_ADC ||
        backend->phase < RECOVERY_BACKEND_IDLE || backend->phase > RECOVERY_BACKEND_CANCEL_POLL ||
        backend->fakeRegister > RECOVERY_FAKE_MAX_VALUE || backend->fakeCounter > RECOVERY_FAKE_MAX_VALUE ||
        backend->lastAdcStatus < ADC_OK || backend->lastAdcStatus > ADC_CANCELLED ||
        backend->lastAdcPhase < ADC_IDLE || backend->lastAdcPhase > ADC_TERMINAL ||
        (backend->requestOwned && backend->token == 0U) ||
        (backend->cancelAccepted && !backend->requestOwned) ||
        !valid_request(backend->kind, &backend->request)) {
        return false;
    }
    active = backend->adc.phase >= ADC_ACQUIRE && backend->adc.phase <= ADC_RESULT;
    if ((backend->kind == RECOVERY_BACKEND_FAKE && active) ||
        (backend->cancelAccepted && backend->phase != RECOVERY_BACKEND_CANCEL_POLL)) {
        return false;
    }
    return backend->adc.phase >= ADC_IDLE && backend->adc.phase <= ADC_TERMINAL &&
        backend->adc.status >= ADC_OK && backend->adc.status <= ADC_CANCELLED &&
        backend->adc.active == active && (!active || backend->adc.status == ADC_PENDING) &&
        backend->adc.elapsedMs <= ADC_DEADLINE_MS && backend->adc.committed <= 4095U &&
        adc_plan(&backend->adc.request, &plan) == ADC_OK &&
        backend->adc.candidate < (UINT32_C(1) << backend->adc.request.bits);
}

/**
 * @brief increment: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void increment(uint32_t *counter, bool *saturated)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (*counter == UINT32_MAX) {
        *saturated = true;
    } else {
        *counter += 1U;
    }
}
/**
 * @brief valid failure: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_failure(const RecoveryFailure *failure)
{
    /** Respect the finite domain before dispatch or state publication. **/
    return failure->cause >= RECOVERY_CAUSE_NONE && failure->cause <= RECOVERY_CAUSE_CONTRACT_FAULT &&
        failure->phase >= RECOVERY_BACKEND_IDLE && failure->phase <= RECOVERY_BACKEND_CANCEL_POLL &&
        failure->adcStatus >= ADC_OK && failure->adcStatus <= ADC_CANCELLED &&
        failure->adcPhase >= ADC_IDLE && failure->adcPhase <= ADC_TERMINAL && failure->attempt <= 3U &&
        (!failure->present || (failure->cause != RECOVERY_CAUSE_NONE && failure->token != 0U));
}
/**
 * @brief valid state: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_state(const RecoveryState *state)
{
    /** Respect the finite domain before dispatch or state publication. **/
    const RecoverySnapshot *s = &state->snapshot;
    bool ownedPhase = s->phase == RECOVERY_ACTIVE || s->phase == RECOVERY_CANCEL_DUE ||
        s->phase == RECOVERY_CANCELLING || s->category == RECOVERY_CATEGORY_QUARANTINED;
    if (s->category != RECOVERY_CATEGORY_QUARANTINED && state->backend.kind == RECOVERY_BACKEND_ADC &&
        state->backend.requestOwned && state->backend.localReleased == state->backend.adc.active) {
        return false;
    }
    if (s->phase > RECOVERY_IDLE && s->phase < RECOVERY_TERMINAL &&
        (s->category != RECOVERY_CATEGORY_PENDING || s->reason != RECOVERY_REASON_NONE || s->jobAgeMs >= 100U)) {
        return false;
    }
    if ((s->phase == RECOVERY_ACTIVE && (s->attemptAgeMs >= 20U || s->attempt == 0U ||
            state->backend.cancelAccepted || s->cleanup != RECOVERY_CLEANUP_NOT_REQUIRED)) ||
        (s->phase == RECOVERY_CANCELLING && (s->cancelAgeMs >= 20U ||
            s->cleanup != RECOVERY_CLEANUP_REQUESTED)) ||
        (s->phase == RECOVERY_RETRY_WAIT && (s->waitAgeMs >= 5U || s->attempt >= 3U ||
            s->cleanup != RECOVERY_CLEANUP_CONFIRMED)) ||
        (s->phase == RECOVERY_CANCEL_DUE && (!s->lastFailure.present ||
            s->cleanup != RECOVERY_CLEANUP_REQUIRED)) ||
        (s->phase == RECOVERY_TERMINAL && s->reason == RECOVERY_REASON_NONE) ||
        (s->token != 0U && s->token != state->backend.token) ||
        (!state->tokenExhausted && state->nextToken <= state->backend.token)) {
        return false;
    }
    return valid_backend(&state->backend) && state->nextToken != 0U &&
        (!state->tokenExhausted || state->nextToken == UINT32_MAX) &&
        valid_request(state->backend.kind, &state->request) &&
        s->phase >= RECOVERY_IDLE && s->phase <= RECOVERY_TERMINAL &&
        s->category >= RECOVERY_CATEGORY_IDLE && s->category <= RECOVERY_CATEGORY_QUARANTINED &&
        s->reason >= RECOVERY_REASON_NONE && s->reason <= RECOVERY_REASON_CONTRACT_FAULT &&
        state->afterCleanup >= RECOVERY_REASON_NONE && state->afterCleanup <= RECOVERY_REASON_CONTRACT_FAULT &&
        s->resource >= RECOVERY_RELEASED && s->resource <= RECOVERY_UNCONFIRMED &&
        s->cleanup >= RECOVERY_CLEANUP_NOT_REQUIRED && s->cleanup <= RECOVERY_CLEANUP_CONFIRMED &&
        s->committed.kind >= RECOVERY_VALUE_NONE && s->committed.kind <= RECOVERY_VALUE_SAMPLE &&
        s->committed.fakeValue <= RECOVERY_FAKE_MAX_VALUE && s->committed.sample <= 4095U &&
        s->attempt <= RECOVERY_MAX_ATTEMPTS && ownedPhase == state->backend.requestOwned &&
        (s->resource != RECOVERY_RELEASED) == state->backend.requestOwned &&
        (s->phase != RECOVERY_CANCELLING || state->backend.cancelAccepted) &&
        (s->phase != RECOVERY_IDLE || (s->category == RECOVERY_CATEGORY_IDLE && s->attempt == 0U)) &&
        (s->phase != RECOVERY_TERMINAL || s->category >= RECOVERY_CATEGORY_READY) &&
        valid_failure(&s->firstFailure) && valid_failure(&s->lastFailure);
}
/**
 * @brief recovery init: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_init(RecoveryState *state, const RecoveryConfig *config, uint32_t now)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoveryState next = {0};
    RecoveryCall call;
    if (state == NULL || !valid_config(config)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    call = recovery_backend_init(&next.backend, config, now);
    if (call != RECOVERY_OK) {
        return call;
    }
    next.request = next.backend.request;
    next.nextToken = config->firstToken;
    next.lastObserved = now;
    next.snapshot.diagnostics = (RecoveryDiagnostics){config->diagnosticSeed,config->diagnosticSeed,
        config->diagnosticSeed,config->diagnosticSeed,config->diagnosticSeed,config->diagnosticSeed,
        config->diagnosticSeed,false};
    *state = next;
    return RECOVERY_OK;
}
/**
 * @brief recovery submit: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_submit(RecoveryState *state, const RecoveryRequest *request, uint32_t now)
{
    /** Respect the finite domain before dispatch or state publication. **/
    uint32_t delta;
    if (state == NULL || request == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (!valid_state(state)) {
        return RECOVERY_BAD_STATE;
    }
    if (state->snapshot.category == RECOVERY_CATEGORY_QUARANTINED) {
        return RECOVERY_LOCKED;
    }
    if (state->snapshot.phase != RECOVERY_IDLE) {
        return state->snapshot.phase == RECOVERY_TERMINAL ? RECOVERY_BAD_STATE : RECOVERY_BUSY;
    }
    if (!valid_request(state->backend.kind, request)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (time_elapsed(state->lastObserved, now, &delta) != TIME_OK) {
        return RECOVERY_TIME_REJECTED;
    }
    if (state->tokenExhausted) {
        return RECOVERY_TOKEN_EXHAUSTED;
    }
    state->lastObserved = now;
    state->request = *request;
    state->snapshot.phase = RECOVERY_START_DUE;
    state->snapshot.category = RECOVERY_CATEGORY_PENDING;
    increment(&state->snapshot.diagnostics.acceptedJobs, &state->snapshot.diagnostics.saturated);
    return RECOVERY_OK;
}
/**
 * @brief recovery status: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_status(const RecoveryState *state, RecoverySnapshot *snapshot)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (state == NULL || snapshot == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (!valid_state(state)) {
        return RECOVERY_BAD_STATE;
    }
    *snapshot = state->snapshot;
    return RECOVERY_OK;
}
/**
 * @brief recovery reset: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_reset(RecoveryState *state)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoverySnapshot next = {0};
    if (state == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (!valid_state(state)) {
        return RECOVERY_BAD_STATE;
    }
    if (state->snapshot.category == RECOVERY_CATEGORY_QUARANTINED) {
        return RECOVERY_LOCKED;
    }
    if (state->snapshot.phase != RECOVERY_IDLE && state->snapshot.phase != RECOVERY_TERMINAL) {
        return RECOVERY_BUSY;
    }
    if (state->backend.requestOwned || state->snapshot.resource != RECOVERY_RELEASED) {
        return RECOVERY_BAD_STATE;
    }
    next.hasCommitted = state->snapshot.hasCommitted;
    next.committed = state->snapshot.committed;
    next.diagnostics = state->snapshot.diagnostics;
    state->snapshot = next;
    state->afterCleanup = RECOVERY_REASON_NONE;
    return RECOVERY_OK;
}
/**
 * @brief event add: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void event_add(RecoveryReport *report, RecoveryEvent event)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (report->eventCount < RECOVERY_EVENT_CAPACITY) {
        report->events[report->eventCount] = event;
        report->eventCount += 1U;
    }
    /** Every caller has a proved three-event bound; a fourth never writes memory. **/
}
/**
 * @brief finish: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void finish(RecoveryState *state, RecoveryReason reason, RecoveryReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoverySnapshot *s = &state->snapshot;
    s->phase = RECOVERY_TERMINAL;
    s->reason = reason;
    s->category = reason == RECOVERY_REASON_SUCCEEDED ? RECOVERY_CATEGORY_READY :
        (state->backend.requestOwned ? RECOVERY_CATEGORY_QUARANTINED : RECOVERY_CATEGORY_FAILED);
    if (state->backend.requestOwned) {
        s->resource = RECOVERY_UNCONFIRMED;
        increment(&s->diagnostics.quarantines, &s->diagnostics.saturated);
    } else {
        s->resource = RECOVERY_RELEASED;
    }
    increment(&s->diagnostics.completedJobs, &s->diagnostics.saturated);
    event_add(report, RECOVERY_EVENT_TERMINAL);
}
/**
 * @brief record failure: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void record_failure(RecoveryState *state, RecoveryCause cause, RecoveryBackendPhase phase,
    AdcStatus adcStatus, AdcPhase adcPhase, bool uncertain)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoverySnapshot *s = &state->snapshot;
    RecoveryFailure failure = {true,cause,phase,adcStatus,adcPhase,s->token,s->attempt,
        s->jobAgeMs,s->attemptAgeMs,uncertain};
    if (!s->firstFailure.present) {
        s->firstFailure = failure;
    }
    s->lastFailure = failure;
    s->sideEffectUncertain = s->sideEffectUncertain || uncertain;
    s->phase = RECOVERY_CANCEL_DUE;
    s->cleanup = RECOVERY_CLEANUP_REQUIRED;
}
/**
 * @brief replay reason: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static RecoveryReason replay_reason(const RecoveryState *state)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoveryCause cause = state->snapshot.lastFailure.cause;
    RecoveryOperation op = state->request.operation;
    bool replayable = cause == RECOVERY_CAUSE_ATTEMPT_TIMEOUT ||
        (op == RECOVERY_SAMPLE ? cause == RECOVERY_CAUSE_ADC_BACKEND || cause == RECOVERY_CAUSE_ADC_TIMEOUT :
        cause == RECOVERY_CAUSE_NACK || cause == RECOVERY_CAUSE_OVERRUN || cause == RECOVERY_CAUSE_LOST_REPLY);
    if (op == RECOVERY_INCREMENT) {
        return state->snapshot.sideEffectUncertain ? RECOVERY_REASON_UNSAFE_EFFECT : RECOVERY_REASON_NOT_REPLAYABLE;
    }
    if (!replayable) {
        return RECOVERY_REASON_PERMANENT_ERROR;
    }
    if (state->snapshot.attempt >= RECOVERY_MAX_ATTEMPTS) {
        return RECOVERY_REASON_ATTEMPTS_EXHAUSTED;
    }
    return state->tokenExhausted ? RECOVERY_REASON_TOKEN_EXHAUSTED : RECOVERY_REASON_NONE;
}
/**
 * @brief advance: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void advance(RecoveryState *state, uint32_t delta)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoverySnapshot *s = &state->snapshot;
    if (s->phase == RECOVERY_IDLE || s->phase == RECOVERY_TERMINAL) {
        return;
    }
    s->jobAgeMs = (uint32_t)((uint64_t)s->jobAgeMs + delta);
    if (s->phase == RECOVERY_ACTIVE) {
        s->attemptAgeMs = (uint32_t)((uint64_t)s->attemptAgeMs + delta);
    } else if (s->phase == RECOVERY_CANCELLING) {
        s->cancelAgeMs = (uint32_t)((uint64_t)s->cancelAgeMs + delta);
    } else if (s->phase == RECOVERY_RETRY_WAIT) {
        s->waitAgeMs = (uint32_t)((uint64_t)s->waitAgeMs + delta);
    }
}
/**
 * @brief deadline: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool deadline(RecoveryState *state, RecoveryReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoverySnapshot *s = &state->snapshot;
    if (s->phase == RECOVERY_IDLE || s->phase == RECOVERY_TERMINAL) {
        return false;
    }
    if (s->jobAgeMs >= RECOVERY_TOTAL_MS) {
        event_add(report, RECOVERY_EVENT_TOTAL_DEADLINE);
        finish(state, RECOVERY_REASON_TOTAL_TIMEOUT, report);
    } else if (s->phase == RECOVERY_CANCELLING && s->cancelAgeMs >= RECOVERY_CANCEL_MS) {
        event_add(report, RECOVERY_EVENT_CANCEL_DEADLINE);
        finish(state, RECOVERY_REASON_CANCEL_TIMEOUT, report);
    } else if (s->phase == RECOVERY_ACTIVE && s->attemptAgeMs >= RECOVERY_ATTEMPT_MS) {
        bool uncertain = state->request.operation == RECOVERY_ASSIGN || state->request.operation == RECOVERY_INCREMENT;
        record_failure(state, RECOVERY_CAUSE_ATTEMPT_TIMEOUT, state->backend.phase,
            state->backend.lastAdcStatus, state->backend.adc.phase, uncertain);
        event_add(report, RECOVERY_EVENT_ATTEMPT_DEADLINE);
    } else {
        return false;
    }
    return true;
}
/**
 * @brief take action: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void take_action(RecoveryState *state, uint32_t now, const RecoveryInput *input,
    RecoveryReport *report, RecoveryBackendReport *port, RecoveryCall *call)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoverySnapshot *s = &state->snapshot;
    bool matching = input->kind == RECOVERY_INPUT_NONE || input->token == s->token;
    report->backendActions = 1U;
    increment(&s->diagnostics.backendActions, &s->diagnostics.saturated);
    switch (s->phase) {
        case RECOVERY_START_DUE:
            s->token = state->nextToken;
            if (state->nextToken == UINT32_MAX) {
                state->tokenExhausted = true;
            } else {
                state->nextToken += 1U;
            }
            s->attempt += 1U;
            s->attemptAgeMs = 0U;
            s->waitAgeMs = 0U;
            s->cancelAgeMs = 0U;
            s->cleanup = RECOVERY_CLEANUP_NOT_REQUIRED;
            increment(&s->diagnostics.issuedAttempts, &s->diagnostics.saturated);
            event_add(report, RECOVERY_EVENT_STARTED);
            report->producerCalls = state->backend.kind == RECOVERY_BACKEND_ADC ? 1U : 0U;
            *call = recovery_backend_start(&state->backend, &state->request, s->token, now, port);
            s->phase = RECOVERY_ACTIVE;
            break;
        case RECOVERY_ACTIVE:
            event_add(report, RECOVERY_EVENT_POLLED);
            report->inputConsumed = input->kind != RECOVERY_INPUT_NONE;
            report->producerCalls = state->backend.kind == RECOVERY_BACKEND_ADC && matching ? 1U : 0U;
            *call = recovery_backend_poll(&state->backend, now, input, port);
            break;
        case RECOVERY_CANCEL_DUE:
            event_add(report, RECOVERY_EVENT_CANCEL_REQUESTED);
            *call = recovery_backend_cancel_request(&state->backend, s->token, now, port);
            s->phase = RECOVERY_CANCELLING;
            s->cancelAgeMs = 0U;
            s->cleanup = RECOVERY_CLEANUP_REQUESTED;
            break;
        case RECOVERY_CANCELLING:
            event_add(report, RECOVERY_EVENT_CANCEL_POLLED);
            report->inputConsumed = input->kind != RECOVERY_INPUT_NONE;
            report->producerCalls = state->backend.kind == RECOVERY_BACKEND_ADC &&
                matching && !state->backend.localReleased ? 1U : 0U;
            *call = recovery_backend_cancel_poll(&state->backend, now, input, port);
            break;
        default:
            *call = RECOVERY_BAD_STATE;
            break;
    }
}
/**
 * @brief apply port: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void apply_port(RecoveryState *state, const RecoveryBackendReport *port,
    RecoveryReport *report, RecoveryValue *result)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoverySnapshot *s = &state->snapshot;
    s->resource = port->resource;
    if (port->status == RECOVERY_PORT_STALE) {
        increment(&s->diagnostics.staleEvents, &s->diagnostics.saturated);
        event_add(report, RECOVERY_EVENT_STALE);
    } else if (port->status == RECOVERY_PORT_FAILED) {
        record_failure(state, port->cause, port->phase, port->adcStatus, port->adcPhase,
            port->sideEffectUncertain);
        if (port->cause == RECOVERY_CAUSE_CONTRACT_FAULT) {
            finish(state, RECOVERY_REASON_CONTRACT_FAULT, report);
        }
    } else if (port->status == RECOVERY_PORT_READY && port->valuePresent) {
        s->committed = port->value;
        s->hasCommitted = true;
        *result = port->value;
        report->resultPresent = true;
        event_add(report, RECOVERY_EVENT_COMMITTED);
        finish(state, RECOVERY_REASON_SUCCEEDED, report);
    } else if (port->status == RECOVERY_PORT_CLEANUP_CONFIRMED) {
        RecoveryReason reason = replay_reason(state);
        s->cleanup = RECOVERY_CLEANUP_CONFIRMED;
        event_add(report, RECOVERY_EVENT_CLEANUP);
        state->afterCleanup = reason;
        if (reason != RECOVERY_REASON_NONE) {
            finish(state, reason, report);
        } else {
            s->phase = RECOVERY_RETRY_WAIT;
            s->waitAgeMs = 0U;
            event_add(report, RECOVERY_EVENT_RETRY_WAIT);
        }
    }
}
/**
 * @brief recovery service: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_service(RecoveryState *state, uint32_t now, const RecoveryInput *input,
    RecoveryReport *report, RecoveryValue *result)
{
    /** Respect the finite domain before dispatch or state publication. **/
    uint32_t delta;
    RecoveryBackendReport port = {0};
    RecoveryCall call = RECOVERY_OK;
    RecoveryReport next = {0};
    if (state == NULL || input == NULL || report == NULL || result == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (!valid_state(state)) {
        return RECOVERY_BAD_STATE;
    }
    if (!valid_input(state->backend.kind, state->request.operation, input)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (time_elapsed(state->lastObserved, now, &delta) != TIME_OK) {
        return RECOVERY_TIME_REJECTED;
    }
    state->lastObserved = now;
    increment(&state->snapshot.diagnostics.serviceCalls, &state->snapshot.diagnostics.saturated);
    advance(state, delta);
    if (!deadline(state, &next)) {
        if (state->snapshot.phase == RECOVERY_RETRY_WAIT && state->snapshot.waitAgeMs >= RECOVERY_RETRY_MS) {
            if (state->tokenExhausted) {
                event_add(&next, RECOVERY_EVENT_TOKEN_EXHAUSTED);
                finish(state, RECOVERY_REASON_TOKEN_EXHAUSTED, &next);
            } else {
                state->snapshot.phase = RECOVERY_START_DUE;
            }
        }
        if (state->snapshot.phase >= RECOVERY_START_DUE && state->snapshot.phase <= RECOVERY_CANCELLING) {
            take_action(state, now, input, &next, &port, &call);
            if (call != RECOVERY_OK) {
                port.status = RECOVERY_PORT_FAILED;
                port.cause = RECOVERY_CAUSE_CONTRACT_FAULT;
                port.phase = state->backend.phase;
                port.resource = RECOVERY_UNCONFIRMED;
            }
            apply_port(state, &port, &next, result);
        }
    }
    next.snapshot = state->snapshot;
    *report = next;
    return RECOVERY_OK;
}
/**
 * @brief recovery trace init: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_trace_init(RecoveryTrace *trace, uint32_t droppedSeed)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (trace == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    trace->count = 0U;
    trace->dropped = droppedSeed;
    trace->saturated = false;
    for (size_t index = 0U; index < RECOVERY_TRACE_CAPACITY; index += 1U) {
        trace->rows[index] = (RecoveryReport){0};
    }
    return RECOVERY_OK;
}
/**
 * @brief recovery trace append: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_trace_append(RecoveryTrace *trace, const RecoveryReport *report, RecoveryTraceResult *result)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (trace == NULL || report == NULL || result == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (trace->count > RECOVERY_TRACE_CAPACITY || report->eventCount > RECOVERY_EVENT_CAPACITY ||
        report->backendActions > 1U || report->producerCalls > 1U) {
        return RECOVERY_BAD_STATE;
    }
    if (trace->count == RECOVERY_TRACE_CAPACITY) {
        increment(&trace->dropped, &trace->saturated);
        *result = RECOVERY_TRACE_DROPPED;
    } else {
        trace->rows[trace->count] = *report;
        trace->count += 1U;
        *result = RECOVERY_TRACE_STORED;
    }
    return RECOVERY_OK;
}
```

</details>
<details class="source-code" id="source-driver-recovery-recovery-h"><summary>完整 driver-recovery/recovery.h</summary>

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file recovery.h
 * @author embedded-notes contributors
 * @brief Fixed-domain recovery manager, diagnostics and optional trace.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_RECOVERY_H
#define EMBEDDED_NOTES_RECOVERY_H
#include "../adc-sampling/adc.h"
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

#define RECOVERY_MAX_ATTEMPTS 3U
#define RECOVERY_ATTEMPT_MS 20U
#define RECOVERY_RETRY_MS 5U
#define RECOVERY_TOTAL_MS 100U
#define RECOVERY_CANCEL_MS 20U
#define RECOVERY_EVENT_CAPACITY 3U
#define RECOVERY_TRACE_CAPACITY 32U
#define RECOVERY_FAKE_MAX_VALUE UINT32_C(1000000)

typedef uint32_t RecoveryToken; /* 1..UINT32_MAX; zero means no token. */
typedef enum {
    RECOVERY_OK = 0, RECOVERY_INVALID_ARGUMENT, RECOVERY_BAD_STATE,
    RECOVERY_BUSY, RECOVERY_TIME_REJECTED, RECOVERY_TOKEN_EXHAUSTED, RECOVERY_LOCKED
} RecoveryCall;
typedef enum { RECOVERY_BACKEND_FAKE = 0, RECOVERY_BACKEND_ADC } RecoveryBackendKind;
typedef enum {
    RECOVERY_READ = 0, RECOVERY_ASSIGN, RECOVERY_INCREMENT, RECOVERY_SAMPLE
} RecoveryOperation;
typedef enum {
    RECOVERY_IDLE = 0, RECOVERY_START_DUE, RECOVERY_ACTIVE, RECOVERY_CANCEL_DUE,
    RECOVERY_CANCELLING, RECOVERY_RETRY_WAIT, RECOVERY_TERMINAL
} RecoveryPhase;
typedef enum {
    RECOVERY_CATEGORY_IDLE = 0, RECOVERY_CATEGORY_PENDING, RECOVERY_CATEGORY_READY,
    RECOVERY_CATEGORY_FAILED, RECOVERY_CATEGORY_QUARANTINED
} RecoveryCategory;
typedef enum {
    RECOVERY_REASON_NONE = 0, RECOVERY_REASON_SUCCEEDED, RECOVERY_REASON_ATTEMPTS_EXHAUSTED,
    RECOVERY_REASON_TOTAL_TIMEOUT, RECOVERY_REASON_CANCEL_TIMEOUT, RECOVERY_REASON_UNSAFE_EFFECT,
    RECOVERY_REASON_NOT_REPLAYABLE, RECOVERY_REASON_PERMANENT_ERROR, RECOVERY_REASON_TOKEN_EXHAUSTED,
    RECOVERY_REASON_CONTRACT_FAULT
} RecoveryReason;
typedef enum { RECOVERY_RELEASED = 0, RECOVERY_OWNED, RECOVERY_UNCONFIRMED } RecoveryResource;
typedef enum {
    RECOVERY_CLEANUP_NOT_REQUIRED = 0, RECOVERY_CLEANUP_REQUIRED,
    RECOVERY_CLEANUP_REQUESTED, RECOVERY_CLEANUP_CONFIRMED
} RecoveryCleanup;
typedef enum {
    RECOVERY_CAUSE_NONE = 0, RECOVERY_CAUSE_ATTEMPT_TIMEOUT, RECOVERY_CAUSE_NACK,
    RECOVERY_CAUSE_ARBITRATION_LOST, RECOVERY_CAUSE_OVERRUN, RECOVERY_CAUSE_PERMANENT,
    RECOVERY_CAUSE_LOST_REPLY, RECOVERY_CAUSE_ADC_BACKEND, RECOVERY_CAUSE_ADC_TIMEOUT,
    RECOVERY_CAUSE_CONTRACT_FAULT
} RecoveryCause;
typedef enum {
    RECOVERY_BACKEND_IDLE = 0, RECOVERY_BACKEND_START, RECOVERY_BACKEND_FAKE_EXECUTE,
    RECOVERY_BACKEND_ADC_ACQUIRE, RECOVERY_BACKEND_ADC_CONVERT, RECOVERY_BACKEND_ADC_RESULT,
    RECOVERY_BACKEND_CANCEL_REQUEST, RECOVERY_BACKEND_CANCEL_POLL
} RecoveryBackendPhase;
typedef enum {
    RECOVERY_INPUT_NONE = 0, RECOVERY_INPUT_WAIT, RECOVERY_INPUT_READY, RECOVERY_INPUT_FAIL,
    RECOVERY_INPUT_COMMIT_LOST_REPLY, RECOVERY_INPUT_CLEANUP_DONE, RECOVERY_INPUT_ADC_ADVANCE
} RecoveryInputKind;
typedef enum {
    RECOVERY_PORT_PENDING = 0, RECOVERY_PORT_READY, RECOVERY_PORT_FAILED,
    RECOVERY_PORT_CANCEL_ACCEPTED, RECOVERY_PORT_CLEANUP_CONFIRMED, RECOVERY_PORT_STALE
} RecoveryPortStatus;
typedef enum { RECOVERY_VALUE_NONE = 0, RECOVERY_VALUE_FAKE, RECOVERY_VALUE_SAMPLE } RecoveryValueKind;
typedef enum {
    RECOVERY_EVENT_STARTED = 0, RECOVERY_EVENT_POLLED, RECOVERY_EVENT_CANCEL_REQUESTED,
    RECOVERY_EVENT_CANCEL_POLLED, RECOVERY_EVENT_STALE, RECOVERY_EVENT_ATTEMPT_DEADLINE,
    RECOVERY_EVENT_TOTAL_DEADLINE, RECOVERY_EVENT_CANCEL_DEADLINE, RECOVERY_EVENT_CLEANUP,
    RECOVERY_EVENT_RETRY_WAIT, RECOVERY_EVENT_COMMITTED, RECOVERY_EVENT_TERMINAL,
    RECOVERY_EVENT_TOKEN_EXHAUSTED
} RecoveryEvent;

typedef struct {
    RecoveryOperation operation;
    uint32_t value;
    AdcRequest adc;
} RecoveryRequest;
typedef struct {
    RecoveryBackendKind backend;
    RecoveryToken firstToken;
    uint32_t diagnosticSeed;
    uint32_t fakeRegister;
    uint32_t fakeCounter;
} RecoveryConfig;
typedef struct {
    RecoveryInputKind kind;
    RecoveryToken token;
    RecoveryCause cause;
} RecoveryInput;
typedef struct {
    RecoveryValueKind kind;
    uint32_t fakeValue;
    uint16_t sample;
} RecoveryValue;
typedef struct {
    bool present;
    RecoveryCause cause;
    RecoveryBackendPhase phase;
    AdcStatus adcStatus;
    AdcPhase adcPhase;
    RecoveryToken token;
    uint32_t attempt;
    uint32_t jobAgeMs;
    uint32_t attemptAgeMs;
    bool sideEffectUncertain;
} RecoveryFailure;
typedef struct {
    uint32_t acceptedJobs;
    uint32_t issuedAttempts;
    uint32_t serviceCalls;
    uint32_t backendActions;
    uint32_t staleEvents;
    uint32_t completedJobs;
    uint32_t quarantines;
    bool saturated;
} RecoveryDiagnostics;
typedef struct {
    RecoveryPortStatus status;
    RecoveryToken token;
    RecoveryBackendPhase phase;
    RecoveryCause cause;
    AdcStatus adcStatus;
    AdcPhase adcPhase;
    RecoveryResource resource;
    bool localReleased;
    bool sideEffectUncertain;
    bool valuePresent;
    RecoveryValue value;
} RecoveryBackendReport;
typedef struct {
    RecoveryBackendKind kind;
    RecoveryRequest request;
    RecoveryToken token;
    RecoveryBackendPhase phase;
    uint32_t lastObserved;
    bool requestOwned;
    bool cancelAccepted;
    bool localReleased;
    bool effectApplied;
    uint32_t fakeRegister;
    uint32_t fakeCounter;
    AdcStatus lastAdcStatus;
    AdcPhase lastAdcPhase;
    AdcState adc;
} RecoveryBackend;
typedef struct {
    RecoveryPhase phase;
    RecoveryCategory category;
    RecoveryReason reason;
    RecoveryToken token;
    uint32_t attempt;
    uint32_t jobAgeMs;
    uint32_t attemptAgeMs;
    uint32_t cancelAgeMs;
    uint32_t waitAgeMs;
    RecoveryResource resource;
    RecoveryCleanup cleanup;
    bool sideEffectUncertain;
    RecoveryFailure firstFailure;
    RecoveryFailure lastFailure;
    bool hasCommitted;
    RecoveryValue committed;
    RecoveryDiagnostics diagnostics;
} RecoverySnapshot;
typedef struct {
    RecoverySnapshot snapshot;
    size_t backendActions; /* 0..1, includes fact-only cancel-poll. */
    size_t producerCalls; /* 0..1 lifecycle-changing adc_* calls. */
    bool inputConsumed;
    size_t eventCount; /* 0..3; unused slots deterministic zero. */
    RecoveryEvent events[RECOVERY_EVENT_CAPACITY];
    bool resultPresent; /* Fresh this call only. */
} RecoveryReport;
typedef struct {
    RecoveryBackend backend;
    RecoveryRequest request;
    RecoverySnapshot snapshot;
    RecoveryReason afterCleanup;
    RecoveryToken nextToken;
    bool tokenExhausted;
    uint32_t lastObserved;
} RecoveryState;
typedef struct {
    RecoveryReport rows[RECOVERY_TRACE_CAPACITY];
    size_t count;
    uint32_t dropped;
    bool saturated;
} RecoveryTrace;
typedef enum { RECOVERY_TRACE_STORED = 0, RECOVERY_TRACE_DROPPED } RecoveryTraceResult;

/* Value-only C11 host model; no hardware, callbacks, heap, recursion or waits.
 * Single exclusive non-reentrant context. All nonnull pointers name real live
 * correctly typed objects. Outputs are writable and disjoint from every other
 * call object, including nested members. Ordinary callers never edit metadata
 * or copy a live owner into another executable owner. Named checks cannot detect
 * forged pointers, dishonest extents, overlap or arbitrary memory corruption.
 * Fresh init requires fresh storage AND a fresh token domain without outstanding
 * operations/events. It never authorizes overwriting a live quarantine. Later
 * calls require initialized consistent objects. Rejections preserve every named
 * state/output field. Backend failures are valid OK transitions with typed cause.
 * 1 tick=1ms; true forward observation gaps <2^31 ticks are a caller promise.
 * Observed delta>=2^31 rejects before mutation; equal observations are valid;
 * unseen whole wraps cannot be detected. Scheduling/time progress is required.
 * Admission copies values with zero actions. Service <=1 port action and <=1 ADC
 * lifecycle call. Cancel accepted retains ownership; separate matching cleanup
 * releases. Quarantine halts all actions and rejects submit/reset with LOCKED.
 * Only report.resultPresent permits consuming the separate new result; otherwise
 * that output remains unchanged. Snapshot committed is explicitly historical.
 * Token domain 1..UINT32_MAX never wraps/reuses, including across checked reset.
 * backend/report phase is serviced work; backend/ADC state phase is next work.
 * Terminal ages freeze. status is action-free and does not advance observations.
 */
/**
 * @brief recovery_init: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_init(RecoveryState *state, const RecoveryConfig *config, uint32_t now);

/**
 * @brief recovery_submit: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_submit(RecoveryState *state, const RecoveryRequest *request, uint32_t now);

/**
 * @brief recovery_service: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_service(RecoveryState *state, uint32_t now, const RecoveryInput *input,
    RecoveryReport *report, RecoveryValue *result);

/**
 * @brief recovery_status: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_status(const RecoveryState *state, RecoverySnapshot *snapshot);

/**
 * @brief recovery_reset: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_reset(RecoveryState *state);

/**
 * @brief recovery_trace_init: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_trace_init(RecoveryTrace *trace, uint32_t droppedSeed);

/**
 * @brief recovery_trace_append: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_trace_append(RecoveryTrace *trace, const RecoveryReport *report,
    RecoveryTraceResult *result);

#endif
```

</details>
<details class="source-code" id="source-driver-recovery-fake_sensor-c"><summary>完整 driver-recovery/fake_sensor.c</summary>

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file fake_sensor.c
 * @author embedded-notes contributors
 * @brief Closed bounded host recovery; no hardware operation.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "fake_sensor.h"
#include "../timer-pwm/time.h"

/**
 * @brief valid config: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_config(const RecoveryConfig *config)
{
    /** Respect the finite domain before dispatch or state publication. **/
    return config != NULL && config->backend >= RECOVERY_BACKEND_FAKE &&
        config->backend <= RECOVERY_BACKEND_ADC && config->firstToken != 0U &&
        config->fakeRegister <= RECOVERY_FAKE_MAX_VALUE && config->fakeCounter <= RECOVERY_FAKE_MAX_VALUE &&
        (config->backend != RECOVERY_BACKEND_ADC || (config->fakeRegister == 0U && config->fakeCounter == 0U));
}
/**
 * @brief valid request: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_request(RecoveryBackendKind kind, const RecoveryRequest *request)
{
    /** Respect the finite domain before dispatch or state publication. **/
    AdcPlan plan;
    uint16_t code;
    if (request == NULL || request->operation < RECOVERY_READ || request->operation > RECOVERY_SAMPLE) {
        return false;
    }
    if (kind == RECOVERY_BACKEND_ADC) {
        return request->operation == RECOVERY_SAMPLE && request->value == 0U &&
            adc_plan(&request->adc, &plan) == ADC_OK && adc_quantize(&request->adc, &code) == ADC_OK;
    }
    return request->operation != RECOVERY_SAMPLE &&
        (request->operation == RECOVERY_ASSIGN ? request->value <= RECOVERY_FAKE_MAX_VALUE : request->value == 0U) &&
        request->adc.bits == 0U && request->adc.sampleCycles == 0U && request->adc.divider == 0U &&
        request->adc.referenceUv == 0U && request->adc.inputUv == 0U;
}
/**
 * @brief valid input: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_input(RecoveryBackendKind kind, RecoveryOperation operation, const RecoveryInput *input)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (input == NULL || input->kind < RECOVERY_INPUT_NONE || input->kind > RECOVERY_INPUT_ADC_ADVANCE) {
        return false;
    }
    if (input->kind == RECOVERY_INPUT_NONE) {
        return input->token == 0U && input->cause == RECOVERY_CAUSE_NONE;
    }
    if (input->token == 0U) {
        return false;
    }
    if (input->kind == RECOVERY_INPUT_FAIL) {
        return kind == RECOVERY_BACKEND_ADC ? input->cause == RECOVERY_CAUSE_ADC_BACKEND :
            (input->cause >= RECOVERY_CAUSE_NACK && input->cause <= RECOVERY_CAUSE_LOST_REPLY);
    }
    if (input->cause != RECOVERY_CAUSE_NONE) {
        return false;
    }
    if (kind == RECOVERY_BACKEND_ADC) {
        return input->kind == RECOVERY_INPUT_WAIT || input->kind == RECOVERY_INPUT_ADC_ADVANCE;
    }
    return input->kind != RECOVERY_INPUT_ADC_ADVANCE &&
        (input->kind != RECOVERY_INPUT_COMMIT_LOST_REPLY ||
            operation == RECOVERY_ASSIGN || operation == RECOVERY_INCREMENT);
}
/**
 * @brief valid backend: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_backend(const RecoveryBackend *backend)
{
    /** Respect the finite domain before dispatch or state publication. **/
    AdcPlan plan;
    bool active;
    if (backend->kind < RECOVERY_BACKEND_FAKE || backend->kind > RECOVERY_BACKEND_ADC ||
        backend->phase < RECOVERY_BACKEND_IDLE || backend->phase > RECOVERY_BACKEND_CANCEL_POLL ||
        backend->fakeRegister > RECOVERY_FAKE_MAX_VALUE || backend->fakeCounter > RECOVERY_FAKE_MAX_VALUE ||
        backend->lastAdcStatus < ADC_OK || backend->lastAdcStatus > ADC_CANCELLED ||
        backend->lastAdcPhase < ADC_IDLE || backend->lastAdcPhase > ADC_TERMINAL ||
        (backend->requestOwned && backend->token == 0U) ||
        (backend->cancelAccepted && !backend->requestOwned) ||
        !valid_request(backend->kind, &backend->request)) {
        return false;
    }
    active = backend->adc.phase >= ADC_ACQUIRE && backend->adc.phase <= ADC_RESULT;
    if ((backend->kind == RECOVERY_BACKEND_FAKE && active) ||
        (backend->cancelAccepted && backend->phase != RECOVERY_BACKEND_CANCEL_POLL)) {
        return false;
    }
    return backend->adc.phase >= ADC_IDLE && backend->adc.phase <= ADC_TERMINAL &&
        backend->adc.status >= ADC_OK && backend->adc.status <= ADC_CANCELLED &&
        backend->adc.active == active && (!active || backend->adc.status == ADC_PENDING) &&
        backend->adc.elapsedMs <= ADC_DEADLINE_MS && backend->adc.committed <= 4095U &&
        adc_plan(&backend->adc.request, &plan) == ADC_OK &&
        backend->adc.candidate < (UINT32_C(1) << backend->adc.request.bits);
}

/**
 * @brief adc phase: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static RecoveryBackendPhase adc_phase(AdcPhase phase)
{
    /** Respect the finite domain before dispatch or state publication. **/
    switch (phase) {
        case ADC_ACQUIRE: return RECOVERY_BACKEND_ADC_ACQUIRE;
        case ADC_CONVERT: return RECOVERY_BACKEND_ADC_CONVERT;
        case ADC_RESULT: return RECOVERY_BACKEND_ADC_RESULT;
        default: return RECOVERY_BACKEND_IDLE;
    }
}
/**
 * @brief port report: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void port_report(const RecoveryBackend *backend, RecoveryBackendPhase phase, RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    *report = (RecoveryBackendReport){0};
    report->status = RECOVERY_PORT_PENDING;
    report->token = backend->token;
    report->phase = phase;
    report->adcStatus = backend->lastAdcStatus;
    report->adcPhase = backend->lastAdcPhase;
    report->resource = backend->requestOwned ? RECOVERY_OWNED : RECOVERY_RELEASED;
    report->localReleased = backend->localReleased;
}
/**
 * @brief release port: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void release_port(RecoveryBackend *backend, RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    backend->requestOwned = false;
    backend->cancelAccepted = false;
    backend->localReleased = true;
    backend->phase = RECOVERY_BACKEND_IDLE;
    report->resource = RECOVERY_RELEASED;
    report->localReleased = true;
}
/**
 * @brief contract fault: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void contract_fault(RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    report->status = RECOVERY_PORT_FAILED;
    report->cause = RECOVERY_CAUSE_CONTRACT_FAULT;
    report->resource = RECOVERY_UNCONFIRMED;
    report->localReleased = false;
}
/**
 * @brief recovery backend init: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_backend_init(RecoveryBackend *backend, const RecoveryConfig *config, uint32_t now)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoveryBackend next = {0};
    if (backend == NULL || !valid_config(config)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    next.kind = config->backend;
    next.lastObserved = now;
    next.localReleased = true;
    next.fakeRegister = config->fakeRegister;
    next.fakeCounter = config->fakeCounter;
    next.request.operation = config->backend == RECOVERY_BACKEND_ADC ? RECOVERY_SAMPLE : RECOVERY_READ;
    if (config->backend == RECOVERY_BACKEND_ADC) {
        next.request.adc = (AdcRequest){12U,15U,4U,3300000U,1650000U};
    }
    if (adc_init(&next.adc) != ADC_OK) {
        return RECOVERY_BAD_STATE;
    }
    *backend = next;
    return RECOVERY_OK;
}
/**
 * @brief recovery backend start: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_backend_start(RecoveryBackend *backend, const RecoveryRequest *request,
    RecoveryToken token, uint32_t now, RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    AdcStatus status = ADC_OK;
    if (backend == NULL || report == NULL || token == 0U) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (!valid_backend(backend)) {
        return RECOVERY_BAD_STATE;
    }
    if (backend->requestOwned) {
        return RECOVERY_BUSY;
    }
    if (token <= backend->token || !valid_request(backend->kind, request)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    backend->request = *request;
    backend->token = token;
    backend->lastObserved = now;
    backend->requestOwned = true;
    backend->localReleased = false;
    backend->cancelAccepted = false;
    backend->effectApplied = false;
    backend->phase = RECOVERY_BACKEND_FAKE_EXECUTE;
    if (backend->kind == RECOVERY_BACKEND_ADC) {
        status = adc_start(&backend->adc, &backend->request.adc, now);
        backend->lastAdcStatus = status;
        backend->lastAdcPhase = backend->adc.phase;
        backend->phase = adc_phase(backend->adc.phase);
    }
    port_report(backend, RECOVERY_BACKEND_START, report);
    if (backend->kind == RECOVERY_BACKEND_ADC && status != ADC_PENDING) {
        contract_fault(report);
    }
    return RECOVERY_OK;
}
/**
 * @brief check poll: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static RecoveryCall check_poll(const RecoveryBackend *backend, uint32_t now, const RecoveryInput *input,
    const RecoveryBackendReport *report, bool cancelling)
{
    /** Respect the finite domain before dispatch or state publication. **/
    uint32_t delta;
    if (backend == NULL || report == NULL || input == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (backend->kind == RECOVERY_BACKEND_ADC && backend->requestOwned &&
        backend->localReleased == backend->adc.active) {
        return RECOVERY_BAD_STATE;
    }
    if (!valid_backend(backend) || !backend->requestOwned || backend->cancelAccepted != cancelling) {
        return RECOVERY_BAD_STATE;
    }
    if (!valid_input(backend->kind, backend->request.operation, input)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    return time_elapsed(backend->lastObserved, now, &delta) == TIME_OK ? RECOVERY_OK : RECOVERY_TIME_REJECTED;
}
/**
 * @brief stale: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool stale(const RecoveryBackend *backend, const RecoveryInput *input, RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (input->kind != RECOVERY_INPUT_NONE && input->token != backend->token) {
        report->status = RECOVERY_PORT_STALE;
        return true;
    }
    return false;
}
/**
 * @brief fake poll: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void fake_poll(RecoveryBackend *backend, const RecoveryInput *input, RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (input->kind == RECOVERY_INPUT_FAIL) {
        report->status = RECOVERY_PORT_FAILED;
        report->cause = input->cause;
        report->sideEffectUncertain = backend->request.operation != RECOVERY_READ &&
            (input->cause == RECOVERY_CAUSE_LOST_REPLY || input->cause == RECOVERY_CAUSE_OVERRUN);
        return;
    }
    if (input->kind != RECOVERY_INPUT_READY && input->kind != RECOVERY_INPUT_COMMIT_LOST_REPLY) {
        return;
    }
    if (backend->request.operation == RECOVERY_INCREMENT && backend->fakeCounter == RECOVERY_FAKE_MAX_VALUE) {
        report->status = RECOVERY_PORT_FAILED;
        report->cause = RECOVERY_CAUSE_PERMANENT;
        return;
    }
    if (backend->request.operation == RECOVERY_ASSIGN) {
        backend->fakeRegister = backend->request.value;
    } else if (backend->request.operation == RECOVERY_INCREMENT) {
        backend->fakeCounter += 1U;
    }
    backend->effectApplied = true;
    if (input->kind == RECOVERY_INPUT_COMMIT_LOST_REPLY) {
        report->status = RECOVERY_PORT_FAILED;
        report->cause = RECOVERY_CAUSE_LOST_REPLY;
        report->sideEffectUncertain = true;
        return;
    }
    report->status = RECOVERY_PORT_READY;
    report->valuePresent = true;
    report->value.kind = RECOVERY_VALUE_FAKE;
    report->value.fakeValue = backend->request.operation == RECOVERY_INCREMENT ?
        backend->fakeCounter : backend->fakeRegister;
    release_port(backend, report);
}
/**
 * @brief poll adc: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static void poll_adc(RecoveryBackend *backend, uint32_t now, const RecoveryInput *input,
    RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    AdcReport actual;
    AdcEvent event = input->kind == RECOVERY_INPUT_ADC_ADVANCE ? ADC_EVENT_ADVANCE :
        (input->kind == RECOVERY_INPUT_FAIL ? ADC_EVENT_FAIL : ADC_EVENT_WAIT);
    AdcStatus status = adc_poll(&backend->adc, now, event, &actual);
    backend->lastAdcStatus = status;
    if (status != ADC_PENDING && status != ADC_READY && status != ADC_BACKEND_ERROR && status != ADC_TIMEOUT) {
        contract_fault(report);
        return;
    }
    backend->lastAdcPhase = actual.phase;
    report->adcStatus = status;
    report->adcPhase = actual.phase;
    report->phase = adc_phase(actual.phase);
    backend->phase = adc_phase(backend->adc.phase);
    if (status == ADC_PENDING) {
        return;
    }
    backend->localReleased = true;
    report->localReleased = true;
    if (status == ADC_READY && actual.samplePresent) {
        report->status = RECOVERY_PORT_READY;
        report->valuePresent = true;
        report->value.kind = RECOVERY_VALUE_SAMPLE;
        report->value.sample = actual.sample;
        release_port(backend, report);
    } else if (status == ADC_BACKEND_ERROR || status == ADC_TIMEOUT) {
        report->status = RECOVERY_PORT_FAILED;
        report->cause = status == ADC_TIMEOUT ? RECOVERY_CAUSE_ADC_TIMEOUT : RECOVERY_CAUSE_ADC_BACKEND;
    } else {
        contract_fault(report);
    }
}
/**
 * @brief recovery backend poll: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_backend_poll(RecoveryBackend *backend, uint32_t now, const RecoveryInput *input,
    RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoveryCall call = check_poll(backend, now, input, report, false);
    if (call != RECOVERY_OK) {
        return call;
    }
    backend->lastObserved = now;
    port_report(backend, backend->phase, report);
    if (!stale(backend, input, report)) {
        if (backend->kind == RECOVERY_BACKEND_ADC) {
            poll_adc(backend, now, input, report);
        } else {
            fake_poll(backend, input, report);
        }
    }
    return RECOVERY_OK;
}
/**
 * @brief recovery backend cancel request: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_backend_cancel_request(RecoveryBackend *backend, RecoveryToken token,
    uint32_t now, RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    uint32_t delta;
    if (backend == NULL || report == NULL || token == 0U) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (!valid_backend(backend) || !backend->requestOwned || backend->cancelAccepted) {
        return RECOVERY_BAD_STATE;
    }
    if (time_elapsed(backend->lastObserved, now, &delta) != TIME_OK) {
        return RECOVERY_TIME_REJECTED;
    }
    backend->lastObserved = now;
    port_report(backend, RECOVERY_BACKEND_CANCEL_REQUEST, report);
    if (token != backend->token) {
        report->status = RECOVERY_PORT_STALE;
        return RECOVERY_OK;
    }
    backend->cancelAccepted = true;
    backend->phase = RECOVERY_BACKEND_CANCEL_POLL;
    report->status = RECOVERY_PORT_CANCEL_ACCEPTED;
    return RECOVERY_OK;
}
/**
 * @brief recovery backend cancel poll: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_backend_cancel_poll(RecoveryBackend *backend, uint32_t now, const RecoveryInput *input,
    RecoveryBackendReport *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    AdcReport actual;
    RecoveryCall call = check_poll(backend, now, input, report, true);
    if (call != RECOVERY_OK) {
        return call;
    }
    backend->lastObserved = now;
    port_report(backend, RECOVERY_BACKEND_CANCEL_POLL, report);
    if (stale(backend, input, report)) {
        return RECOVERY_OK;
    }
    if (backend->kind == RECOVERY_BACKEND_ADC && !backend->localReleased) {
        AdcStatus status = adc_cancel(&backend->adc, &actual);
        backend->lastAdcStatus = status;
        if (status != ADC_CANCELLED) {
            contract_fault(report);
            return RECOVERY_OK;
        }
        backend->lastAdcPhase = actual.phase;
        report->adcStatus = status;
        report->adcPhase = actual.phase;
    }
    if (backend->kind == RECOVERY_BACKEND_ADC || input->kind == RECOVERY_INPUT_CLEANUP_DONE) {
        release_port(backend, report);
        report->status = RECOVERY_PORT_CLEANUP_CONFIRMED;
    }
    return RECOVERY_OK;
}
```

</details>
<details class="source-code" id="source-driver-recovery-fake_sensor-h"><summary>完整 driver-recovery/fake_sensor.h</summary>

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file fake_sensor.h
 * @author embedded-notes contributors
 * @brief Closed FAKE / actual ADC backend port; no callback injection.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_FAKE_SENSOR_H
#define EMBEDDED_NOTES_FAKE_SENSOR_H
#include "recovery.h"
/* Value-only C11 host model; no hardware, callbacks, heap, recursion or waits.
 * Single exclusive non-reentrant context. All nonnull pointers name real live
 * correctly typed objects. Outputs are writable and disjoint from every other
 * call object, including nested members. Ordinary callers never edit metadata
 * or copy a live owner into another executable owner. Named checks cannot detect
 * forged pointers, dishonest extents, overlap or arbitrary memory corruption.
 * Fresh init requires fresh storage AND a fresh token domain without outstanding
 * operations/events. It never authorizes overwriting a live quarantine. Later
 * calls require initialized consistent objects. Rejections preserve every named
 * state/output field. Backend failures are valid OK transitions with typed cause.
 * 1 tick=1ms; true forward observation gaps <2^31 ticks are a caller promise.
 * Observed delta>=2^31 rejects before mutation; equal observations are valid;
 * unseen whole wraps cannot be detected. Scheduling/time progress is required.
 * Admission copies values with zero actions. Service <=1 port action and <=1 ADC
 * lifecycle call. Cancel accepted retains ownership; separate matching cleanup
 * releases. Quarantine halts all actions and rejects submit/reset with LOCKED.
 * Only report.resultPresent permits consuming the separate new result; otherwise
 * that output remains unchanged. Snapshot committed is explicitly historical.
 * Token domain 1..UINT32_MAX never wraps/reuses, including across checked reset.
 * backend/report phase is serviced work; backend/ADC state phase is next work.
 * Terminal ages freeze. status is action-free and does not advance observations.
 */
/* Direct backend tests use a separate fresh fixture, never a manager-owned port.
 * Each call is one port action even when it only reports a saved local-release
 * fact. Start requires a strictly greater token after release and starts a new
 * time domain. Poll/cancel calls check time; stale events make zero ADC calls.
 * Fake seeds/value 0..1000000; ADC configuration requires zero fake seeds.
 * FAKE READ/INCREMENT value=0; fake ADC fields all zero. ADC accepts only SAMPLE
 * validated by actual adc_plan/adc_quantize. NONE token0/causeNONE maps to WAIT.
 * Other input tokens positive; only FAIL supplies the mode-appropriate cause.
 */
/**
 * @brief recovery_backend_init: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_backend_init(RecoveryBackend *backend, const RecoveryConfig *config, uint32_t now);

/**
 * @brief recovery_backend_start: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_backend_start(RecoveryBackend *backend, const RecoveryRequest *request,
    RecoveryToken token, uint32_t now, RecoveryBackendReport *report);

/**
 * @brief recovery_backend_poll: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_backend_poll(RecoveryBackend *backend, uint32_t now,
    const RecoveryInput *input, RecoveryBackendReport *report);

/**
 * @brief recovery_backend_cancel_request: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_backend_cancel_request(RecoveryBackend *backend, RecoveryToken token,
    uint32_t now, RecoveryBackendReport *report);

/**
 * @brief recovery_backend_cancel_poll: checked finite operation under the contract above.
 * @param[in,out] See named parameters; all call objects must be disjoint.
 * @return Typed call status; rejected calls preserve every named field.
 */
RecoveryCall recovery_backend_cancel_poll(RecoveryBackend *backend, uint32_t now,
    const RecoveryInput *input, RecoveryBackendReport *report);

#endif
```

</details>
<details class="source-code" id="source-driver-recovery-terminal-c"><summary>完整 driver-recovery/terminal.c</summary>

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file terminal.c
 * @author embedded-notes contributors
 * @brief Closed bounded host recovery; no hardware operation.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "terminal.h"
#include "fake_sensor.h"

/**
 * @brief valid config: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_config(const RecoveryConfig *config)
{
    /** Respect the finite domain before dispatch or state publication. **/
    return config != NULL && config->backend >= RECOVERY_BACKEND_FAKE &&
        config->backend <= RECOVERY_BACKEND_ADC && config->firstToken != 0U &&
        config->fakeRegister <= RECOVERY_FAKE_MAX_VALUE && config->fakeCounter <= RECOVERY_FAKE_MAX_VALUE &&
        (config->backend != RECOVERY_BACKEND_ADC || (config->fakeRegister == 0U && config->fakeCounter == 0U));
}
/**
 * @brief valid input: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_input(RecoveryBackendKind kind, RecoveryOperation operation, const RecoveryInput *input)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (input == NULL || input->kind < RECOVERY_INPUT_NONE || input->kind > RECOVERY_INPUT_ADC_ADVANCE) {
        return false;
    }
    if (input->kind == RECOVERY_INPUT_NONE) {
        return input->token == 0U && input->cause == RECOVERY_CAUSE_NONE;
    }
    if (input->token == 0U) {
        return false;
    }
    if (input->kind == RECOVERY_INPUT_FAIL) {
        return kind == RECOVERY_BACKEND_ADC ? input->cause == RECOVERY_CAUSE_ADC_BACKEND :
            (input->cause >= RECOVERY_CAUSE_NACK && input->cause <= RECOVERY_CAUSE_LOST_REPLY);
    }
    if (input->cause != RECOVERY_CAUSE_NONE) {
        return false;
    }
    if (kind == RECOVERY_BACKEND_ADC) {
        return input->kind == RECOVERY_INPUT_WAIT || input->kind == RECOVERY_INPUT_ADC_ADVANCE;
    }
    return input->kind != RECOVERY_INPUT_ADC_ADVANCE &&
        (input->kind != RECOVERY_INPUT_COMMIT_LOST_REPLY ||
            operation == RECOVERY_ASSIGN || operation == RECOVERY_INCREMENT);
}
/**
 * @brief recovery terminal init: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_terminal_init(RecoveryTerminal *terminal, const RecoveryConfig *config,
    uint16_t initialPeriod, uint32_t now)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoveryTerminal next = {0};
    RecoveryCall call;
    if (terminal == NULL || initialPeriod == 0U || initialPeriod > 1000U || !valid_config(config)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    call = recovery_init(&next.job, config, now);
    if (call != RECOVERY_OK) {
        return call;
    }
    if (uart_init(&next.uart, initialPeriod, now) != UART_OK) {
        return RECOVERY_BAD_STATE;
    }
    *terminal = next;
    return RECOVERY_OK;
}
/**
 * @brief recovery terminal receive: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
UartStatus recovery_terminal_receive(RecoveryTerminal *terminal, uint16_t byte, UartIngress *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (terminal == NULL) {
        return UART_INVALID_ARGUMENT;
    }
    return uart_receive(&terminal->uart, byte, report);
}
/**
 * @brief recovery terminal turn: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_terminal_turn(RecoveryTerminal *terminal, uint32_t now,
    const RecoveryInput *input, RecoveryTurnReport *report, RecoveryValue *result,
    RecoveryStatusResponse *response)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoveryTurnReport next = {0};
    RecoverySnapshot snapshot;
    UartCommand command;
    if (terminal == NULL || report == NULL || result == NULL || response == NULL || input == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (!valid_input(terminal->job.backend.kind, terminal->job.request.operation, input)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    next.uartStatus = uart_poll(&terminal->uart, now, &next.uart, &command);
    next.uartReportValid = next.uartStatus == UART_OK;
    next.jobStatus = recovery_service(&terminal->job, now, input, &next.job, result);
    next.jobReportValid = next.jobStatus == RECOVERY_OK;
    if (next.uartReportValid && next.uart.commandPresent && command.kind == UART_GET_STATUS &&
        recovery_status(&terminal->job, &snapshot) == RECOVERY_OK) {
        *response = (RecoveryStatusResponse){command.periodMs,snapshot};
        next.responsePresent = true;
    }
    *report = next;
    return RECOVERY_OK;
}
```

</details>
<details class="source-code" id="source-driver-recovery-terminal-h"><summary>完整 driver-recovery/terminal.h</summary>

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file terminal.h
 * @author embedded-notes contributors
 * @brief Actual UART plus recovery application status composition.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_RECOVERY_TERMINAL_H
#define EMBEDDED_NOTES_RECOVERY_TERMINAL_H
#include "recovery.h"
#include "../uart-framing/uart.h"
typedef struct {
    UartState uart;
    RecoveryState job;
} RecoveryTerminal;
typedef struct {
    uint16_t periodMs;
    RecoverySnapshot job;
} RecoveryStatusResponse;
typedef struct {
    UartStatus uartStatus;
    RecoveryCall jobStatus;
    bool uartReportValid;
    bool jobReportValid;
    UartReport uart;
    RecoveryReport job;
    bool responsePresent;
} RecoveryTurnReport;

/* Value-only C11 host model; no hardware, callbacks, heap, recursion or waits.
 * Single exclusive non-reentrant context. All nonnull pointers name real live
 * correctly typed objects. Outputs are writable and disjoint from every other
 * call object, including nested members. Ordinary callers never edit metadata
 * or copy a live owner into another executable owner. Named checks cannot detect
 * forged pointers, dishonest extents, overlap or arbitrary memory corruption.
 * Fresh init requires fresh storage AND a fresh token domain without outstanding
 * operations/events. It never authorizes overwriting a live quarantine. Later
 * calls require initialized consistent objects. Rejections preserve every named
 * state/output field. Backend failures are valid OK transitions with typed cause.
 * 1 tick=1ms; true forward observation gaps <2^31 ticks are a caller promise.
 * Observed delta>=2^31 rejects before mutation; equal observations are valid;
 * unseen whole wraps cannot be detected. Scheduling/time progress is required.
 * Admission copies values with zero actions. Service <=1 port action and <=1 ADC
 * lifecycle call. Cancel accepted retains ownership; separate matching cleanup
 * releases. Quarantine halts all actions and rejects submit/reset with LOCKED.
 * Only report.resultPresent permits consuming the separate new result; otherwise
 * that output remains unchanged. Snapshot committed is explicitly historical.
 * Token domain 1..UINT32_MAX never wraps/reuses, including across checked reset.
 * backend/report phase is serviced work; backend/ADC state phase is next work.
 * Terminal ages freeze. status is action-free and does not advance observations.
 */
/* Supply at most four receive calls between turns. A turn polls UART once,
 * then manager once. Independent component rejections do not roll back work
 * already completed by the other component. Only responsePresent permits reading
 * the response output: an application copy, not a transmitted wire packet. */
/**
 * @brief Checked terminal composition under the contracts above.
 * @param[in,out] Named disjoint real initialized objects; init requires fresh storage.
 * @return Typed status; turn captures independent component statuses.
 */
RecoveryCall recovery_terminal_init(RecoveryTerminal *terminal, const RecoveryConfig *config,
    uint16_t initialPeriod, uint32_t now);
/**
 * @brief Checked terminal composition under the contracts above.
 * @param[in,out] Named disjoint real initialized objects; init requires fresh storage.
 * @return Typed status; turn captures independent component statuses.
 */
UartStatus recovery_terminal_receive(RecoveryTerminal *terminal, uint16_t byte, UartIngress *report);
/**
 * @brief Checked terminal composition under the contracts above.
 * @param[in,out] Named disjoint real initialized objects; init requires fresh storage.
 * @return Typed status; turn captures independent component statuses.
 */
RecoveryCall recovery_terminal_turn(RecoveryTerminal *terminal, uint32_t now,
    const RecoveryInput *input, RecoveryTurnReport *report, RecoveryValue *result,
    RecoveryStatusResponse *response);

#endif
```

</details>
<details class="source-code" id="source-driver-recovery-README-txt"><summary>完整 driver-recovery/README.txt</summary>

```text
Original embedded-notes C11 cooperative host example. No third-party ownership claimed.
Preserve examples/ sibling layout. Owned: driver-recovery/recovery.c/.h,
fake_sensor.c/.h, terminal.c/.h. Borrowed unchanged actual sources/headers:
bounded-fifo/fifo.c/.h, timer-pwm/time.c/.h, uart-framing/uart.c/.h,
adc-sampling/adc.c/.h. No textual .c inclusion, test main, callbacks or hardware.

From a repository checkout with existing Node, C compiler, Python and mcu-build:
node scripts/test-driver-recovery.mjs --native --compiler <existing-gcc> --python <existing-python> --router <existing-build_router.py>
Without --native, the repeatable runner uses pure Node to verify the actual
JavaScript model/controller, exact source/mirror/download bytes and print scripts;
it does not probe C tools, create C artifacts or exit an importing aggregate.
With --native, it validates a custom profile, dry-runs it, then builds every experiment
through mcu-build. It separately compiles seven actual modules and a consumer
that includes every header twice, links and runs normal and NDEBUG checks.
Raw return/log/profile/tool/source/header/fresh-artifact SHA records stay in
.scratch/protocol-acquisition/c-evidence. Any nonzero status is failure; never run
a stale executable. No installation or upgrade is required or authorized.

For a standalone download, save the complete consumer below as consumer.c in
examples/. Underlying existing-compiler command form (use .exe on Windows):
cc -std=c11 -Wall -Wextra -Werror -pedantic -I. -Itimer-pwm -c bounded-fifo/fifo.c -o fifo.o
Repeat the same strict compile form for time.c, uart.c, adc.c, recovery.c,
fake_sensor.c, terminal.c and consumer.c, with their actual paths. Link the eight
separate .o objects: cc fifo.o time.o uart.o adc.o recovery.o fake_sensor.o terminal.o consumer.o -o terminal-demo
Repeat the whole build with -DNDEBUG and run both fresh outputs.
On AgentHub EVERY compile/preprocess/assemble/link/binary experiment, including
these underlying forms, MUST use an existing mcu-build custom profile:
python <existing-skill>/scripts/build_router.py validate --config <profile.toml>
python <existing-skill>/scripts/build_router.py build --config <profile.toml> --dry-run
python <existing-skill>/scripts/build_router.py build --config <profile.toml>
Set explicit existing tool, workspace, command array, log and fresh artifacts.

One exclusive initialized manager, backend and actual ADC; no retained caller
payload pointer. All nonnull pointers real/live/typed, outputs writable/disjoint
from every other call object including nested members. Fresh init requires new
storage AND token domain with no old live operation/event. Never overwrite a live
quarantine or copy an owner to run twice. Null/metadata checks cannot verify
forged pointers, overlap or arbitrary corruption. Single context, non-reentrant.

FAKE seeds/register/counter/value max1000000. ADC mode fake seeds must be0.
FAKE READ/INCREMENT value0 and ADC fields0; ASSIGN repeats copied same value.
ADC SAMPLE value0 validated by actual adc_plan and adc_quantize. Config backend
fixed for lifetime. firstToken1..UINT32_MAX; never wrap/reuse even across reset.
MAX-1 is a public finite near-exhaustion fixture; diagnosticSeedMAX is a synthetic
saturation fixture, normal seed0. NONE token0/causeNONE; explicit inputs positive
token and mode-appropriate kind/cause. Unused or unpolled input is not queued.

Admission0 actions/attempt0. Service0..1 port action/0..1 ADC lifecycle call.
Total3 attempts,20ms each,5ms wait AFTER confirmed cleanup,100ms total,20ms
cancel within total. Equality expires; precedence validation/time -> total ->
current cancel/attempt -> retry eligibility/wait -> one action. True forward gap
<2^31 ticks is a caller promise, 1tick=1ms. Observed delta>=2^31 rejects before
named mutations; equal time valid, unseen full wraps not detected. Terminal ages
freeze; timeout completion requires time progress and scheduling.

Cancel accepted != cleanup confirmed. Active actual ADC cancels only on later
cancel-poll, exactly one adc_cancel; prior producer error already inactive is
released by later fact-only cancel-poll with0 ADC calls but still1 port action.
Manager keeps wrapper ownership until that confirmation. Deadline before release
quarantines/retains request/token; no later backend actions, submit/reset LOCKED,
status available. Fresh init cannot erase live quarantine. No physical abort or
remote-effect undo. Unexpected producer return after valid dispatch is a valid
CONTRACT_FAULT quarantine, not preserving BAD_STATE or fabricated cleanup.

Call errors preserve every named state/output. Valid failures transition with
RECOVERY_OK and typed snapshot. Only report.resultPresent authorizes separate
fresh result; otherwise unchanged. Historical committed/first+last failure stay
explicit. cleanup/terminal reason never overwrites original cause/phase/age/token.
reset clears job metadata but preserves diagnostics/token history/fake values/
manager committed and actual ADC committed. status is action-free, ages unadvanced.

READ/ASSIGN replay only declared timeout/NACK/OVERRUN/LOST_REPLY after cleanup;
READ stable exclusive register, no read-clear/FIFO. SAMPLE same copied host input
replays timeout/ADC_BACKEND/ADC_TIMEOUT. INCREMENT never auto-replays: lost reply
counter1 -> UNSAFE_EFFECT; independent blind replay counter2. All failures first
cleanup; no universal hardware read/write safety or GPIO bus recovery is implied.

Three event slots; zero unused slots. Optional32-report static trace drops newest
row33 with TRACE_DROPPED plus saturated dropped count; manager continues. Seven
uint32 diagnostics saturate with sticky attempted-overflow flag. No heap, growing
history, recursion, sleeps, callbacks, unbounded waits or catch-up loop.

Actual UART status A5 01 02 03, period100 unchanged. Scheduler supplies at most4
ingress calls per turn; turn calls actual uart_poll once before job service.
Application response copies post-service snapshot, not a new wire packet. Top-level
argument/input-shape rejection preserves whole turn; independent component statuses
and report-valid flags do NOT promise atomic rollback. resultPresent and
responsePresent authorize different outputs. All static source matches downloads.

Native and JavaScript evidence are separate. Host .su/sizeof/heuristic/manual
review do not establish target maximum stack, electrical recovery, accuracy,
WCET, throughput, hardware, physical paper, personal mastery or publication.

Complete standalone actual UART+ADC public-interface consumer:
#include "driver-recovery/terminal.h"
#include <stdio.h>
int main(void)
{
    RecoveryTerminal terminal;
    RecoveryConfig config={RECOVERY_BACKEND_ADC,1U,0U,0U,0U};
    RecoveryRequest request={RECOVERY_SAMPLE,0U,{12U,15U,4U,3300000U,1650000U}};
    RecoveryInput none={RECOVERY_INPUT_NONE,0U,RECOVERY_CAUSE_NONE};
    RecoveryInput advance={RECOVERY_INPUT_ADC_ADVANCE,1U,RECOVERY_CAUSE_NONE};
    RecoveryTurnReport turn;
    RecoveryStatusResponse response;
    RecoveryValue value={0};
    UartIngress ingress;
    const uint16_t bytes[]={165U,1U,2U,3U};
    if(recovery_terminal_init(&terminal,&config,100U,0U)!=RECOVERY_OK ||
       recovery_submit(&terminal.job,&request,0U)!=RECOVERY_OK ||
       recovery_terminal_turn(&terminal,0U,&none,&turn,&value,&response)!=RECOVERY_OK) {return 1;}
    for(size_t i=0U;i<4U;i++) {
        if(recovery_terminal_receive(&terminal,bytes[i],&ingress)!=UART_OK) {return 1;}
    }
    if(recovery_terminal_turn(&terminal,0U,&advance,&turn,&value,&response)!=RECOVERY_OK ||
       !turn.uartReportValid || !turn.uart.commandPresent || !turn.responsePresent ||
       response.periodMs!=100U || response.job.category!=RECOVERY_CATEGORY_PENDING) {return 1;}
    for(uint32_t tick=1U;tick<=2U;tick++) {
        if(recovery_terminal_turn(&terminal,tick,&advance,&turn,&value,&response)!=RECOVERY_OK ||
           !turn.jobReportValid || turn.job.backendActions>1U || turn.job.producerCalls>1U) {return 1;}
    }
    if(!turn.job.resultPresent || value.sample!=2048U) {return 1;}
    if(puts("PASS actual UART status100 while ADC pending; actual sample2048")<0 || fflush(stdout)!=0) {return 1;}
    return 0;
}
```

</details>
<details class="source-code" id="source-bounded-fifo-fifo-c"><summary>完整 bounded-fifo/fifo.c · 借入原件</summary>

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
<details class="source-code" id="source-bounded-fifo-fifo-h"><summary>完整 bounded-fifo/fifo.h · 借入原件</summary>

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
<details class="source-code" id="source-timer-pwm-time-c"><summary>完整 timer-pwm/time.c · 借入原件</summary>

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
<details class="source-code" id="source-timer-pwm-time-h"><summary>完整 timer-pwm/time.h · 借入原件</summary>

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
<details class="source-code" id="source-uart-framing-uart-c"><summary>完整 uart-framing/uart.c · 借入原件</summary>

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
<details class="source-code" id="source-uart-framing-uart-h"><summary>完整 uart-framing/uart.h · 借入原件</summary>

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
<details class="source-code" id="source-adc-sampling-adc-c"><summary>完整 adc-sampling/adc.c · 借入原件</summary>

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file adc.c
 * @author embedded-notes contributors
 * @brief Checked floor bins and finite host conversion, no hardware access.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "adc.h"
#include "time.h"
#include <stddef.h>

/**
 * @brief Validate the quantizer's finite arithmetic domain before shifting.
 * @param[in] request Real request.
 * @return True for supported bits and reference/input values.
 */
static bool valid_values(const AdcRequest *request)
{
    /** A small arithmetic voltage is not a hardware reference qualification. **/
    return request != NULL &&
        (request->bits == 6U || request->bits == 8U || request->bits == 10U || request->bits == 12U) &&
        request->referenceUv > 0U && request->referenceUv <= ADC_MAX_REFERENCE_UV &&
        request->inputUv <= request->referenceUv;
}

/**
 * @brief Quantize exact floor bins with top-end clipping.
 * @param[in] request Finite values.
 * @param[out] code Disjoint preserved-on-rejection result.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_quantize(const AdcRequest *request, uint16_t *code)
{
    uint32_t levels;
    uint64_t raw;

    /** Maximum product is 14745600000, so widen before multiplying. **/
    if (!valid_values(request) || code == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    levels = UINT32_C(1) << request->bits;
    raw = (uint64_t)request->inputUv * levels / request->referenceUv;
    if (raw >= levels) {
        raw = levels - 1U;
    }
    *code = (uint16_t)raw;
    return ADC_OK;
}

/**
 * @brief Validate supported fixed-clock timing and arithmetic request values.
 * @param[in] request Real request.
 * @param[out] plan Disjoint writable output.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_plan(const AdcRequest *request, AdcPlan *plan)
{
    uint32_t cycles;
    uint32_t divider;

    /** Divisor two is supported by hardware but exceeds this selected bound. **/
    if (!valid_values(request) || plan == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    cycles = request->sampleCycles;
    divider = request->divider;
    if ((divider != 2U && divider != 4U && divider != 6U && divider != 8U) ||
        (cycles != 3U && cycles != 15U && cycles != 28U && cycles != 56U && cycles != 84U &&
        cycles != 112U && cycles != 144U && cycles != 480U)) {
        return ADC_INVALID_ARGUMENT;
    }
    if (ADC_PCLK2_HZ / divider > UINT32_C(36000000)) {
        return ADC_INVALID_ARGUMENT;
    }
    plan->adcHz = ADC_PCLK2_HZ / divider;
    plan->totalCycles = cycles + request->bits;
    return ADC_OK;
}

/**
 * @brief Return an exact fraction for one named reconstruction convention.
 * @param[in] request Real request.
 * @param[in] code Validated code.
 * @param[in] endpoint Use endpoint interpolation when true.
 * @param[out] value Disjoint result.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_reconstruct(const AdcRequest *request, uint32_t code, bool endpoint, AdcRational *value)
{
    uint32_t levels;

    /** Input is irrelevant to reconstruction; only its declared domain is checked. **/
    if (!valid_values(request) || value == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    levels = UINT32_C(1) << request->bits;
    if (code >= levels) {
        return ADC_INVALID_ARGUMENT;
    }
    value->numeratorUv = (uint64_t)code * request->referenceUv;
    value->denominator = endpoint ? levels - 1U : levels;
    return ADC_OK;
}

/**
 * @brief Initialize every named field without reading fresh storage.
 * @param[out] state Real fresh writable object.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_init(AdcState *state)
{
    const AdcState empty = {{12U, 15U, 4U, 3300000U, 0U}, ADC_IDLE, ADC_OK, 0U, 0U, 0U, 0U, false, false};

    /** Fresh means no previous operation may still be live in this storage. **/
    if (state == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    *state = empty;
    return ADC_OK;
}

/**
 * @brief Check initialized metadata without claiming arbitrary memory validation.
 * @param[in] state Real initialized object.
 * @return True for the module's finite state invariants.
 */
static bool valid_state(const AdcState *state)
{
    AdcPlan plan;
    bool phaseActive;

    /** Public structs aid teaching; callers must not manufacture arbitrary states. **/
    if (state->phase < ADC_IDLE || state->phase > ADC_TERMINAL || state->status < ADC_OK ||
        state->status > ADC_CANCELLED || state->elapsedMs > ADC_DEADLINE_MS || state->committed > 4095U) {
        return false;
    }
    phaseActive = state->phase == ADC_ACQUIRE || state->phase == ADC_CONVERT || state->phase == ADC_RESULT;
    if (state->active != phaseActive || (state->active && state->status != ADC_PENDING)) {
        return false;
    }
    return adc_plan(&state->request, &plan) == ADC_OK &&
        state->candidate < (UINT32_C(1) << state->request.bits);
}

/**
 * @brief Admit one validated copied request without changing the committed sample.
 * @param[in,out] state Initialized object.
 * @param[in] request Request to copy.
 * @param[in] now Start tick.
 * @return ADC_PENDING or a preserving rejection.
 */
AdcStatus adc_start(AdcState *state, const AdcRequest *request, uint32_t now)
{
    AdcPlan plan;

    /** Busy precedes inspection of the proposed request, and start establishes time. **/
    if (state == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    if (!valid_state(state)) {
        return ADC_BAD_STATE;
    }
    if (state->active) {
        return ADC_BUSY;
    }
    if (adc_plan(request, &plan) != ADC_OK) {
        return ADC_INVALID_ARGUMENT;
    }
    state->request = *request;
    state->phase = ADC_ACQUIRE;
    state->status = ADC_PENDING;
    state->lastObserved = now;
    state->elapsedMs = 0U;
    state->candidate = 0U;
    state->active = true;
    return ADC_PENDING;
}

/**
 * @brief Return a bounded terminal report and release pure-host candidate state.
 * @param[in,out] state Valid initialized operation.
 * @param[in] status Terminal category.
 * @param[in] phase Serviced or failed phase.
 * @param[out] report Disjoint writable report.
 * @return The terminal category.
 */
static AdcStatus finish(AdcState *state, AdcStatus status, AdcPhase phase, AdcReport *report)
{
    /** Only READY may replace the last committed sample. **/
    if (status == ADC_READY) {
        state->committed = state->candidate;
        state->hasSample = true;
    }
    state->candidate = 0U;
    state->active = false;
    state->phase = ADC_TERMINAL;
    state->status = status;
    report->status = status;
    report->phase = phase;
    report->elapsedMs = state->elapsedMs;
    report->samplePresent = status == ADC_READY;
    report->sample = state->committed;
    return status;
}

/**
 * @brief Advance one phase after validated time, preserving old sample until READY.
 * @param[in,out] state Initialized active object.
 * @param[in] now Next time observation.
 * @param[in] event Supplied finite backend event.
 * @param[out] report Disjoint report, unchanged for rejected calls.
 * @return Named category, at most one phase of work.
 */
AdcStatus adc_poll(AdcState *state, uint32_t now, AdcEvent event, AdcReport *report)
{
    uint32_t delta;
    AdcPhase phase;
    uint16_t code;

    /** Check every rejection before observing or changing the active operation. **/
    if (state == NULL || report == NULL ||
        (event != ADC_EVENT_WAIT && event != ADC_EVENT_ADVANCE && event != ADC_EVENT_FAIL)) {
        return ADC_INVALID_ARGUMENT;
    }
    if (!valid_state(state) || !state->active) {
        return ADC_BAD_STATE;
    }
    if (time_elapsed(state->lastObserved, now, &delta) != TIME_OK) {
        return ADC_TIME_REJECTED;
    }
    phase = state->phase;
    state->lastObserved = now;
    if (delta >= ADC_DEADLINE_MS - state->elapsedMs) {
        state->elapsedMs = ADC_DEADLINE_MS;
        return finish(state, ADC_TIMEOUT, phase, report);
    }
    state->elapsedMs += delta;
    if (event == ADC_EVENT_FAIL) {
        return finish(state, ADC_BACKEND_ERROR, phase, report);
    }
    if (event == ADC_EVENT_ADVANCE) {
        if (phase == ADC_RESULT) {
            return finish(state, ADC_READY, phase, report);
        }
        if (phase == ADC_CONVERT) {
            if (adc_quantize(&state->request, &code) != ADC_OK) {
                return finish(state, ADC_BACKEND_ERROR, phase, report);
            }
            state->candidate = code;
        }
        state->phase = phase == ADC_ACQUIRE ? ADC_CONVERT : ADC_RESULT;
    }
    *report = (AdcReport){ADC_PENDING, phase, state->elapsedMs, false, state->committed};
    return ADC_PENDING;
}

/**
 * @brief Synchronously cancel only the active value-only host operation.
 * @param[in,out] state Real initialized active state.
 * @param[out] report Disjoint writable result.
 * @return ADC_CANCELLED, ADC_INVALID_ARGUMENT or ADC_BAD_STATE.
 */
AdcStatus adc_cancel(AdcState *state, AdcReport *report)
{
    /** No hardware or external buffer exists in this fake cleanup contract. **/
    if (state == NULL || report == NULL) {
        return ADC_INVALID_ARGUMENT;
    }
    if (!valid_state(state) || !state->active) {
        return ADC_BAD_STATE;
    }
    return finish(state, ADC_CANCELLED, state->phase, report);
}
```

</details>
<details class="source-code" id="source-adc-sampling-adc-h"><summary>完整 adc-sampling/adc.h · 借入原件</summary>

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file adc.h
 * @author embedded-notes contributors
 * @brief Checked floor bins and finite value-only host ADC transaction.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_ADC_H
#define EMBEDDED_NOTES_ADC_H

#include <stdbool.h>
#include <stdint.h>

#if !defined(UINT32_MAX) || !defined(UINT64_MAX)
#error Exact-width uint32_t and uint64_t are required.
#endif

#define ADC_DEADLINE_MS UINT32_C(20)
#define ADC_PCLK2_HZ UINT32_C(84000000)
#define ADC_MAX_REFERENCE_UV UINT32_C(3600000)

typedef enum {
    ADC_OK = 0, ADC_PENDING, ADC_READY, ADC_BUSY, ADC_INVALID_ARGUMENT,
    ADC_BAD_STATE, ADC_TIME_REJECTED, ADC_BACKEND_ERROR, ADC_TIMEOUT, ADC_CANCELLED
} AdcStatus;

typedef enum {
    ADC_IDLE = 0, ADC_ACQUIRE, ADC_CONVERT, ADC_RESULT, ADC_TERMINAL
} AdcPhase;

typedef enum {
    ADC_EVENT_WAIT = 0, ADC_EVENT_ADVANCE, ADC_EVENT_FAIL
} AdcEvent;

typedef struct {
    uint32_t bits;
    uint32_t sampleCycles;
    uint32_t divider;
    uint32_t referenceUv;
    uint32_t inputUv;
} AdcRequest;

typedef struct {
    uint32_t adcHz;
    uint32_t totalCycles;
} AdcPlan;

typedef struct {
    uint64_t numeratorUv;
    uint32_t denominator;
} AdcRational;

typedef struct {
    AdcStatus status;
    AdcPhase phase;
    uint32_t elapsedMs;
    bool samplePresent;
    uint16_t sample;
} AdcReport;

typedef struct {
    AdcRequest request;
    AdcPhase phase;
    AdcStatus status;
    uint32_t lastObserved;
    uint32_t elapsedMs;
    uint16_t candidate;
    uint16_t committed;
    bool hasSample;
    bool active;
} AdcState;

/*
 * Value-only original host model, no MMIO/HAL/IRQ/DMA, caller buffer retention,
 * callbacks, allocation, recursion, sleep or blocking loops. Single exclusive
 * non-reentrant context. Every nonnull pointer names a real live correctly typed
 * object; outputs are writable and disjoint from every other call object.
 * Fresh init never reads old storage; all other state calls require an object
 * initialized by adc_init. Never initialize over a live operation. Named-field
 * checks cannot validate forged/dangling pointers or arbitrary corruption.
 *
 * Quantizer domain: bits 6/8/10/12; reference 1..3600000 uV; input 0..reference.
 * This arithmetic domain is not a legal hardware voltage specification.
 * Plan: fixed PCLK2=84MHz, assumed F407VG/LQFP100 wired VDDA=VREF+=3.3V,
 * selected 36MHz ADC bound; dividers 2/4/6/8, but 2 is rejected at this PCLK2.
 * Sample cycles 3/15/28/56/84/112/144/480. Total cycles = sample + bits.
 *
 * Time uses separately linked unit10 time_elapsed: 1 tick=1ms, caller promises
 * true forward inter-observation gaps <2^31 ticks. Observed delta >=2^31 rejects
 * before mutation. Equal observations are valid; unseen whole wraps undetectable.
 * Poll rejects invalid args/time before transitions, then expires age >=20 before
 * event acceptance. Age is only stored below20 or set to20 on timeout, so no
 * cumulative overflow. Advancing observations and service scheduling are required
 * for eventual timeout. Three ADVANCE polls do ACQUIRE/CONVERT/RESULT, at most one
 * phase each; WAIT immediately returns PENDING. report.phase names the serviced
 * or failed phase; state.phase is the next phase. Only READY sets samplePresent.
 * READY, backend error and timeout all synchronously release the fake operation.
 * committed/hasSample survive admission rejects, pending, failures and cancel.
 * Terminal polls reject BAD_STATE and preserve report; new start is allowed.
 *
 * adc_cancel is synchronous pure-host cleanup: active=false, candidate=0,
 * phase=TERMINAL and status=CANCELLED on return. No event or external pointer can
 * still own this fake operation. It is not asynchronous acceptance, a physical
 * ADC abort, remote-effect undo, generation protection or hardware recovery.
 * Cancel requires active state; idle/terminal cancel rejects BAD_STATE.
 */

/**
 * @brief Validate the conditional fixed-clock plan; preserve output on failure.
 * @param[in] request Real finite request.
 * @param[out] plan Disjoint writable result.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_plan(const AdcRequest *request, AdcPlan *plan);

/**
 * @brief Quantize original floor bins with inclusive top-end saturation.
 * @param[in] request Real request; only bits/reference/input are used.
 * @param[out] code Disjoint writable code, unchanged on failure.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_quantize(const AdcRequest *request, uint16_t *code);

/**
 * @brief Reconstruct a validated code as exact lower-edge or endpoint fraction.
 * @param[in] request Real request; bits/reference define the code domain.
 * @param[in] code Code strictly below 2^bits.
 * @param[in] endpoint False uses 2^bits; true uses 2^bits-1 denominator.
 * @param[out] value Disjoint writable fraction, unchanged on failure.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_reconstruct(const AdcRequest *request, uint32_t code, bool endpoint, AdcRational *value);

/**
 * @brief Initialize genuinely fresh storage without reading prior fields.
 * @param[out] state Real writable fresh object; no old operation may be live.
 * @return ADC_OK or ADC_INVALID_ARGUMENT.
 */
AdcStatus adc_init(AdcState *state);

/**
 * @brief Copy a valid request; busy has precedence over request/time inspection.
 * @param[in,out] state Initialized object; committed sample is preserved.
 * @param[in] request Disjoint request; no pointer is retained after return.
 * @param[in] now Start tick, any uint32_t; starts a new observation domain.
 * @return ADC_PENDING, ADC_BUSY, ADC_INVALID_ARGUMENT or ADC_BAD_STATE.
 */
AdcStatus adc_start(AdcState *state, const AdcRequest *request, uint32_t now);

/**
 * @brief Perform at most one fake phase, checking deadline before supplied event.
 * @param[in,out] state Initialized active object.
 * @param[in] now Next checked observation.
 * @param[in] event WAIT, ADVANCE or FAIL; invalid events preserve all fields.
 * @param[out] report Disjoint result; only READY indicates a fresh sample.
 * @return PENDING/READY/BACKEND_ERROR/TIMEOUT or preserving rejection status.
 */
AdcStatus adc_poll(AdcState *state, uint32_t now, AdcEvent event, AdcReport *report);

/**
 * @brief Synchronously cancel this pure-host active operation and release it.
 * @param[in,out] state Initialized active object; committed value survives.
 * @param[out] report Disjoint result; samplePresent is false.
 * @return ADC_CANCELLED or preserving INVALID_ARGUMENT/BAD_STATE rejection.
 */
AdcStatus adc_cancel(AdcState *state, AdcReport *report);

#endif
```

</details>

</div>
<div class="content-section" id="recovery-practice" role="region" aria-labelledby="recovery-practice-title">

## 十个独立回忆题：说明原因和下一步 {#recovery-practice-title}


<p>先遮住答案，在纸上解释条件、状态和下一步；每题都自足，不依赖当前活动。答案只在本页折叠展示，不保存作答。</p><div class="controls"></div><section class="exercise" id="recovery-question-1"><h3>01 · 失回包后的递增</h3><p class="question-stem">独占fakeCounter初值0。INCREMENT已处理COMMIT_LOST_REPLY，随后取消和匹配清理均完成。安全策略的最终counter、reason和start次数是什么？独立盲重放一次又会如何？</p><details class="exercise-answer" id="recovery-answer-1"><summary>展开完整解析</summary><p>COMMIT_LOST_REPLY先产生效果，所以counter=1；没有新结果，uncertain=true，清理后reason=UNSAFE_EFFECT，只有1次start。另一个独立盲重放再加1得2。cleanup只释放本地请求，不能撤销效果。下一步查是否有真正去重/确认契约，不能凭超时重放。</p></details></section>
<section class="exercise" id="recovery-question-2"><h3>02 · 取消是否等于释放</h3><p class="question-stem">READ在0启动，20检测尝试超时，21取消请求被接受。此时cleanup/resource应为何值？能否立刻在同一对象start下一次？22匹配清理完成后，最早何时再start？</p><details class="exercise-answer" id="recovery-answer-2"><summary>展开完整解析</summary><p>21为REQUESTED/OWNED，request与token仍活着，不能复用；22确认后为CONFIRMED/RELEASED并进入RETRY_WAIT。等待从22起算5ms，最早27。一次清理poll不能同时start，下一步看动作账本与匹配token。</p></details></section>
<section class="exercise" id="recovery-question-3"><h3>03 · 20ms与迟到READY</h3><p class="question-stem">READ在0被接纳并另一次service启动。now20带匹配READY，20也是真实前向合法观察。此次可接受新结果吗？动作数、phase和原始cause是什么？</p><details class="exercise-answer" id="recovery-answer-3"><summary>展开完整解析</summary><p>attemptAge=20，等号过期；先于后端poll，所以backendActions=0，输入未消费，无新结果，phase=CANCEL_DUE，cause=ATTEMPT_TIMEOUT。原结果对象保持。下一次服务才请求取消；下一步先核时间，再看回包。</p></details></section>
<section class="exercise" id="recovery-question-4"><h3>04 · 总期限压过取消和等待</h3><p class="question-stem">两个独立READ均start0/timeout20。A在90才发取消，100带清理完成。B在80发取消、95已匹配清理、99服务一次、100到达5ms重试边界。分别是什么终态与所有权？</p><details class="exercise-answer" id="recovery-answer-4"><summary>展开完整解析</summary><p>A的totalAge100先于cancelAge10，未清理，QUARANTINED/TOTAL_TIMEOUT并保留UNCONFIRMED所有权；100的清理不消费。B的95−80=15未过取消期，已RELEASED；100总期限先于wait5，所以FAILED/TOTAL_TIMEOUT且干净，不重试。下一步确认两个fixture的清理事实不能相互借用。</p></details></section>
<section class="exercise" id="recovery-question-5"><h3>05 · 三次尝试不是三次重试</h3><p class="question-stem">READ按0start、20timeout、21cancel、22cleanup、27start、47timeout、48cancel、49cleanup、54start、74timeout、75cancel、76cleanup服务。请列所有start及76的reason；77再服务会启动第四次吗？</p><details class="exercise-answer" id="recovery-answer-5"><summary>展开完整解析</summary><p>start只有0、27、54，共3次（初次也计入），76匹配清理后ATTEMPTS_EXHAUSTED、resource=RELEASED。77为0动作，终态年龄仍76。firstFailure仍attempt1@20，lastFailure为attempt3@74。下一步核issuedAttempts，不把“最多3次尝试”译成初次加3次。</p></details></section>
<section class="exercise" id="recovery-question-6"><h3>06 · 等待4ms还是5ms</h3><p class="question-stem">同一READ的cleanup在服务观察22确认，26与27分别service，total均未到期、token可用、attempt=1且cause可重放。两次最多发几个start？等待能从cancel21起算吗？</p><details class="exercise-answer" id="recovery-answer-6"><summary>展开完整解析</summary><p>26−22=4，0动作；27−22=5，允许1次start并令attempt2。不能从21算，因为取消接受还没释放。资格还要求安全cause、已清理、attempt<3和total<100。下一步逐项查资格，不只做时间减法。</p></details></section>
<section class="exercise" id="recovery-question-7"><h3>07 · 旧token与有限耗尽</h3><p class="question-stem">token1清理22、token2启动27，28给READY(token1)。会写新输出或释放token2吗？另一个fresh域从MAX−1开始，两次失败清理后还有第三个token吗？checked reset能恢复它吗？</p><details class="exercise-answer" id="recovery-answer-7"><summary>展开完整解析</summary><p>28消耗1个poll action并报告STALE，不提交、不释放，当前token2保持。fresh MAX−1域依次发MAX−1、MAX后耗尽，第二次清理后TOKEN_EXHAUSTED、attempt2，不发0。reset不回拨token历史，之后submit仍拒绝。下一步查旧事件是否还能返回，不能盲换域。</p></details></section>
<section class="exercise" id="recovery-question-8"><h3>08 · 隔离不等于恢复</h3><p class="question-stem">FAKE start0/timeout20/cancel21，41时给匹配CLEANUP_DONE。为什么隔离而不是重试？42再给清理会调用backend吗？初始化新结构体可否擦掉原任务？</p><details class="exercise-answer" id="recovery-answer-8"><summary>展开完整解析</summary><p>41取消年龄达到20，期限先于输入；QUARANTINED/CANCEL_TIMEOUT，request仍owned。42和以后0自动动作，submit/reset均LOCKED，status仍可用。fresh init有无旧活操作/事件的新域前提，不授权覆盖live quarantine。下一步需要另立外部清理协议，本批没有。</p></details></section>
<section class="exercise" id="recovery-question-9"><h3>09 · 真实status的公平性证据</h3><p class="question-stem">period=100ms，host ADC还PENDING。scheduler用4次实际uart_receive喂A5 01 02 03，然后一次terminal turn。哪些对象证明新命令？period会变吗？job状态由谁产生？这能证明wire响应时间吗？</p><details class="exercise-answer" id="recovery-answer-9"><summary>展开完整解析</summary><p>真实uart_poll最多排4字节，XOR=01⊕02=03，commandPresent才证明新GET_STATUS；command复制period100且不改它。应用另一次recovery_status复制post-service job，responsePresent授权应用响应对象，manager最多1 port action。隔离后同样能查询。没有wire发送或调度WCET证据，不能推出真实延迟/无丢字节。下一步分别查看uart/job reportValid与计数。</p></details></section>
<section class="exercise" id="recovery-question-10"><h3>10 · 原始cause与最终policy</h3><p class="question-stem">actual ADC已提交2048。下一job的adc_poll在ACQUIRE返回ADC_BACKEND_ERROR，producer已inactive；随后取消接受与cancel-poll事实确认。应保留什么failure与输出？该cancel-poll算几次port/ADC调用？</p><details class="exercise-answer" id="recovery-answer-10"><summary>展开完整解析</summary><p>first/last cause为ADC_BACKEND，adcStatus=ADC_BACKEND_ERROR，adcPhase=ACQUIRE，记录失败那次token/attempt/年龄；最终可能进入retry wait，但不覆盖起因。历史manager/producer sample2048保留，fresh=false时不能当新采样。取消poll报告已保存localReleased事实，1 port action、0 ADC生命周期调用，不能非法cancel inactive producer。下一步核本地释放与wrapper所有权是两件事。</p></details></section>
<p class="small">隔天改一个条件再回忆：把cleanup22改为23时，最早重试如何变？先推因果再看表。若某一步仍不清楚，可向agent问“为什么取消接受不释放wrapper所有权？”或给出自己的tick/token/phase，请一起核对。</p>
</div>
<div class="content-section" id="recovery-sources" role="region" aria-labelledby="recovery-sources-title">

## 一手资料、版本与未验证边界 {#recovery-sources-title}


<ol class="source-list"><li><a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Src/stm32f4xx_hal_adc.c">ST HAL ADC，固定commit b6f0ed…</a>：研究者实际阅读HAL_ADC_PollForConversion与HAL_ADC_Stop；前者依赖HAL_GetTick，HAL_MAX_DELAY跳过期限，判定为elapsed&gt;Timeout并二次查flag。此处≥20是原创策略，非该HAL函数的替身；Stop还涉及injected转换，不能当私有regular-only恢复。</li><li><a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Src/stm32f4xx_hal_uart.c">同固定版本HAL UART</a>：实际有限阅读Receive、wait helper、IRQ错误分支和HAL_UART_AbortReceive_IT；特定接收abort的完成是callback，函数return不是完成。某些内部ORE路径被调用层flatten，故分类与原始detail应分开。不能推广到所有模式/版本；本例没有callback。</li><li><a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Src/stm32f4xx_hal_i2c.c">同固定版本HAL I2C</a>：研究者实际读wait/address helper、IsDeviceReady与DMAAbort。特定HAL_ERROR可由AF或timeout引起，需error bits；Trials是readiness probe的局部界限，非任意应用命令重放许可。READY handle不证明物理线路已恢复。</li><li><a href="https://www.st.com/resource/en/datasheet/dm00037051.pdf">DS8626 Rev12，March2026</a>与<a href="https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf">历史RM0090 Rev5，September2013</a>：13所选F407VG/LQFP100、假设wired VDDA=VREF+=3.3V、84MHz PCLK2÷4=21MHz的来源条件。当前DS有限文字已读；历史ADC页图由研究者看过，当前RM未获取、当前表格像素未核验，不是最新寄存器配置审计。</li><li><a href="https://www.st.com/resource/en/application_note/cd00211314-how-to-get-the-best-adc-accuracy-in-stm32-microcontrollers-stmicroelectronics.pdf">AN2834 Rev10，October2024</a>：有限error/settling文字阅读；末转移文字、图与数值冲突保留；典型4pF不是保证上限、源阻抗公式几何未目视。13的floor bins与本章固定2048是原创host算术，不是硬件精度证据。</li></ol><p>以上是研究者限定原文阅读的转述，不声称本章作者重新看过所有PDF像素或整本文档。历史RM、current DS/AN的text-only范围、最新RM/ADC silicon errata/板级参考/真实abort/采样/WCET仍有缺口；不重复下载装饰来源。I2C的ARLO、busy与物理bus-clear需实际ownership、其他controller排除、线状态、电源/复位权限及板级条件；本章不提供STOP/九脉冲/上电重置步骤。3/20/5/100/20、token域、quarantine与fake replay表全为原创教学政策。</p>
</div>
<div class="next-links"><a href="../learn/adc-sampling.html">上一章13：ADC输入条件</a><a href="../learn/driver-recovery-reference.html">本章可打印速查</a><a href="../learn/uart-framing.html">复习11：原始status帧</a><a href="../learn/interrupt-shared-data.html">下一单元15：异常、NVIC与共享数据</a></div>