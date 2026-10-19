---
title: 吞吐、抖动与过载
description: 单位、burst、service jitter、同epoch序号与真实有界组合
---

# 吞吐、抖动与过载<span>先把单位和时刻分开，再解释为什么会丢</span> {#tp-title}

<header class="topbar"><div class="wrap topbar-inner"><a class="brand" href="../"><span class="brandmark">E</span>嵌入式技术笔记</a><nav aria-label="全站导航"><a href="../learn/">返回分类</a><a href="./throughput-overload.html#tp-capacity">交互实验</a><a href="./throughput-overload.html">完整笔记</a><a href="../learn/engineering-map.html">32单元地图</a><a href="./throughput-overload-reference.html">本章速查</a><a href="../?search=1">搜索笔记</a></nav></div></header><main class="wrap" id="main"><div class="hero"><div><p class="tag">第17单元 · 同一个可升级采集终端</p><p class="hero-intro">中断及时、DMA 交出完整块，并不表示下游消化得完。这一章把 source、准入、排队、服务、线路发完逐层记账，再用真实原生组合验证有界交接。</p><p>先修：<a href="timer-pwm.html">10 定时与回绕</a>、<a href="uart-framing.html">11 字节成帧</a>、<a href="adc-sampling.html">13 ADC</a>、<a href="dma-ownership.html">16 DMA 所有权</a>。建议路线：位与字节 → A/B/C手算 → 两条时间轴 → 序号 → native组合 → 独立回忆。</p></div><aside class="hero-card"><strong>一次能说明什么？</strong><p>位与字节手算、有限队列守恒、同epoch序号和真实有界组合。source/model/native/browser与hardware证据分别记录。</p><p><a href="throughput-overload-reference.html">打开可打印速查</a></p><p>无JavaScript仍有完整解释、图、字面表、答案和源码。活动只在本页内存中运行，不保存答案。</p></aside></div><nav class="section-nav" aria-label="本章目录"><a href="#tp-capacity">单位与线速</a><a href="#tp-queue">burst与过载</a><a href="#tp-time">两条时间轴</a><a href="#tp-sequence">序号窗口</a><a href="#tp-native">真实组合</a><a href="#tp-practice">十题回忆</a><a href="#tp-source">完整源码</a></nav><div class="notes-toolbar"><button class="btn" id="expand-notes" type="button">展开全部说明</button><button class="btn" id="collapse-notes" type="button">收起全部说明</button><button class="btn" id="print-all" type="button">打印全文</button><button class="btn" id="print-questions" type="button">只打十道题干</button></div><noscript><p class="callout">JavaScript已关闭：活动按钮不可推进；请按逐行表手算、展开原生答案、下载源码。正文与打印内容完整。</p></noscript><section class="content-section" id="tp-capacity">

## 01 · 同一条链，先分清阶段和单位 {#tp-capacity-title}

<p>每个数字先回答三个问题：在哪一层、用什么单位、哪个时间窗口。source capacity 是具名硬件条件下的理论容量；offered 包含本层拒绝的新项；admitted 才是进入本队列的项。service opportunity 是“有数据时可做多少”的预算；departed 是实际完成移除的项。空队列的一次机会不会存成下一次的信用。</p><p>例如一个16-bit sample字段只有2B，但还需 source sequence、source timestamp 和 framing。把 sample payload 的2000B/s直接同字符容量比较，会漏掉本例另9000B/s。RX命令每轮可处理4byte，也不是TX采样线每毫秒可发4sample。</p><figure id="tp-pipeline"><div class="flow-scroll" tabindex="0" role="region" aria-label="原创图1：计量阶段与单位，宽图可横向滚动"><svg viewBox="0 0 920 240" role="img" aria-labelledby="tp-pipeline-title"><title id="tp-pipeline-title">原创图1：计量阶段与单位</title>
<rect class="box" x="15" y="38" width="185" height="112" rx="8"/><text x="30" y="70">实际 source event</text><text x="30" y="101">sample / source time</text><text x="30" y="132">先编号，再准入</text>
<path class="arrow" d="M200 94H250m-12-8 12 8-12 8"/><text x="210" y="28">offer</text>
<rect class="box" x="250" y="38" width="185" height="112" rx="8"/><text x="265" y="70">cap4 SAMPLE 队列</text><text x="265" y="101">admitted / dropped</text><text x="265" y="132">service → departed</text>
<path class="arrow" d="M435 94H485m-12-8 12 8-12 8"/>
<rect class="box" x="485" y="38" width="185" height="112" rx="8"/><text x="500" y="70">虚构计账 record</text><text x="500" y="101">2+2+4+3 = 11 B</text><text x="500" y="132">并非 native sizeof</text>
<path class="arrow" d="M670 94H720m-12-8 12 8-12 8"/>
<rect class="box" x="720" y="38" width="185" height="112" rx="8"/><text x="735" y="70">8N1 字符线</text><text x="735" y="101">11×10 = 110 bits</text><text x="735" y="132">wire completion</text>
<text x="20" y="195">转换完成 ≠ DMA块完成 ≠ 应用departure ≠ 线路发完；每个速率先写阶段、单位、窗口。</text></svg></div><figcaption>箭头是本课原创计量关系；最后两框仅作条件算术，没有实现新采样协议。DMA 不会减少每字符的 start/stop bit-times。</figcaption></figure>


### 115200 8N1：从 bit-time 开始手算 {#tp-wire}

<p>在请求115200baud、8data/no parity/1stop、连续字符且无额外gap的条件下，一个字符占1start+8data+1stop=10bit-times。因此115200/10=11520 encoded B/s，字符时间10/115200=3125/36≈86.805556µs。这个条件计数来自<a href="https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf">历史 RM0090 Rev5 September2013 §30.3 pp948–951、§30.3.4 p959</a>；其他格式需重算。</p><p>原创虚构计账记录：2B sample+2B source sequence+4B source timestamp+3B framing=11 encoded bytes=110 line bits。无escaping/padding/ACK/retry；它没有规定布局、端序、校验算法，也不是单元11 parser接受的新命令或生产采样协议。1000条/s需要11000B/s、110000bit/s，利用率275/288≈95.486111%；其中8B payload为8000B/s，sample字段仅2000B/s。</p><p>每条串行化110/115200=34375/36≈954.861111µs；连续上限11520/11≈1047.272727条/s。1100条/s要12100B/s，超过名义字符容量。若实际编码还含转向、间隙或重传，必须追加，不能沿用这份余量。</p>

### D365、合批与ADC条件 {#tp-divider}

<p>沿此前PCLK=42MHz、OVER8=0、D365：nominal baud=42000000/365≈115068.493150；相对请求误差−25/219%≈−0.114155%。11B时间20075/21≈955.952381µs。这是名义时钟与除数的量化算术，排除了晶振、线缆和服务影响，不能当接收容差、实测吞吐或最坏余量。</p><p>合批 R(N)=H+N×S 只有在实际编码确实把H收一次时才减少每样本开销；每样本time/sequence不能悄悄省略。等一批填满会增加等待，且改变burst与所有权。DMA本身不改变每字符10bit-times。</p><p>单元13的12bit、sample15cycles、ADCCLK21MHz给(15+12)/21MHz=9/7µs，只是条件转换时间。trigger、settling、DR服务、DMA完成、owner交接、应用完成与wire completion仍不同；不能推出整机可可靠采777.8kHz。</p><div class="lab" id="cap-activity">

### 预测活动1：完整record是否越过名义线速 {#tp-cap-activity-title}

<p>先手算rate×11B×10bit，再选择；计算条件固定，不构造新协议。</p><form id="cap-form"><div class="fields"><label class="field">记录数/秒（整数0..2000）<input id="cap-rate" inputmode="numeric" value="1000"></label><label class="field">预测结果<select id="cap-prediction"><option value="">先选预测</option><option value="OVER">超过名义线速</option><option value="WITHIN">未超名义线速</option></select></label></div><div class="controls"><button class="btn primary" id="cap-apply" type="submit" disabled>应用一次</button><button class="btn" id="cap-reset" type="button">重置本活动</button></div></form><p class="pending" id="cap-pending">种子尚未应用；先预测。</p><div class="applied-result" id="cap-result" hidden><p id="cap-last"></p><p id="cap-state">种子rate1000。</p></div><p class="feedback" id="cap-feedback" role="status" aria-live="polite"></p><pre class="activity-log" id="cap-log" tabindex="0" aria-label="预测活动1：完整record是否越过名义线速有限记录"></pre></div></section><section class="content-section" id="tp-queue">

## 02 · burst、服务空窗与有限buffer {#tp-queue-title}

<p>以下是原创单上下文离散模型：初始空、FIFO、容量固定4个<strong>SAMPLE RECORDS</strong>、先arrival后service、满时drop-new。每个sample一次原子准入，不含隐藏in-service slot；不能把旧Fifo的4个uint8_t字节槽改叫4sample。任何事件顺序、整块准入、drop-old或暂停源的变化，都需要另算。</p><p>令上步结束q、本步offer数a和service预算s，均有界非负：drop=max(0,q+a−4)，pre=min(4,q+a)，depart=min(s,pre)，q′=pre−depart。例q3+a4先形成未截断峰值7：仅新4可入，5/6/7被丢，然后服务旧1，留下2/3/4。先服务再到达会给另一答案。</p><figure id="tp-peak"><div class="flow-scroll" tabindex="0" role="region" aria-label="原创图3：A的到达瞬间决定峰值，宽图可横向滚动"><svg viewBox="0 0 920 240" role="img" aria-labelledby="tp-peak-title"><title id="tp-peak-title">原创图3：A的到达瞬间决定峰值</title>
<text x="25" y="32">tick0：arrival-first</text><text x="470" y="32">tick1：到达前 backlog=3</text>
<rect class="box" x="30" y="55" width="280" height="60"/><text x="50" y="92">0 | 1 | 2 | 3（4个sample）</text>
<path class="arrow" d="M310 85H400m-12-8 12 8-12 8"/><text x="320" y="135">service 0</text>
<rect class="box" x="470" y="55" width="285" height="60"/><text x="490" y="92">1 | 2 | 3 | 4（容量4）</text>
<text x="775" y="80">5、6、7</text><text x="775" y="111">drop-new</text>
<text x="30" y="178">tick0结束 [1,2,3]</text><text x="470" y="178">随后 service 1 → [2,3,4]</text>
<text x="25" y="222">同一trace在第二次准入的未截断峰值=3+4=7；容量6仍丢1，容量7才够这一给定trace。</text></svg></div><figcaption>终点平均 offer=service opportunity=1/tick，仍丢3。空闲的后来机会不能回到已经发生的准入瞬间。</figcaption></figure>

### 字面trace A：每行是tick结束 {#tp-trace-a}

<div class="table-wrap" tabindex="0" role="region" aria-label="A tick表，可横向滚动"><table><thead><tr><th>A tick</th><th>offered</th><th>service</th><th>departed</th><th>dropped</th><th>end queue</th></tr></thead><tbody><tr><td>0</td><td>0,1,2,3</td><td>1</td><td>0</td><td>none</td><td>1,2,3</td></tr><tr><td>1</td><td>4,5,6,7</td><td>1</td><td>1</td><td>5,6,7</td><td>2,3,4</td></tr><tr><td>2</td><td>none</td><td>1</td><td>2</td><td>none</td><td>3,4</td></tr><tr><td>3</td><td>none</td><td>1</td><td>3</td><td>none</td><td>4</td></tr><tr><td>4</td><td>none</td><td>1</td><td>4</td><td>none</td><td>empty</td></tr><tr><td>5</td><td>none</td><td>1</td><td>none</td><td>none</td><td>empty</td></tr><tr><td>6</td><td>none</td><td>1</td><td>none</td><td>none</td><td>empty</td></tr><tr><td>7</td><td>none</td><td>1</td><td>none</td><td>none</td><td>empty</td></tr></tbody></table></div><p>A共8tick：offered8/admitted5/departed5/drop3/queued0，offer与service机会平均都为1/tick。同一有限trace容量7可免丢，6还丢1；关键是arrival前积压3再到4的峰值7，不能只看tick末q或平均。</p>

### 字面trace B：每行是tick结束 {#tp-trace-b}

<div class="table-wrap" tabindex="0" role="region" aria-label="B tick表，可横向滚动"><table><thead><tr><th>B tick</th><th>offered</th><th>service</th><th>departed</th><th>dropped</th><th>end queue</th></tr></thead><tbody><tr><td>0</td><td>0,1</td><td>1</td><td>0</td><td>none</td><td>1</td></tr><tr><td>1</td><td>2,3</td><td>1</td><td>1</td><td>none</td><td>2,3</td></tr><tr><td>2</td><td>4,5</td><td>1</td><td>2</td><td>none</td><td>3,4,5</td></tr><tr><td>3</td><td>6,7</td><td>1</td><td>3</td><td>7</td><td>4,5,6</td></tr><tr><td>4</td><td>8,9</td><td>1</td><td>4</td><td>9</td><td>5,6,8</td></tr><tr><td>5</td><td>10,11</td><td>1</td><td>5</td><td>11</td><td>6,8,10</td></tr><tr><td>6</td><td>none</td><td>1</td><td>6</td><td>none</td><td>8,10</td></tr><tr><td>7</td><td>none</td><td>1</td><td>8</td><td>none</td><td>10</td></tr><tr><td>8</td><td>none</td><td>1</td><td>10</td><td>none</td><td>empty</td></tr></tbody></table></div><p>B是六个active tick加三个drain tick，随后TERMINAL：offered12/admitted9/departed9/drop3/queued0。丢掉的11是尾部，之后没有更大序号来暴露它；可靠终点/总offer数或独立统计才可发现。有限排空不使无限offer2/service1稳定。</p>

### 字面trace C：每行是tick结束 {#tp-trace-c}

<div class="table-wrap" tabindex="0" role="region" aria-label="C tick表，可横向滚动"><table><thead><tr><th>C tick</th><th>offered</th><th>service</th><th>departed</th><th>dropped</th><th>end queue</th></tr></thead><tbody><tr><td>0</td><td>0</td><td>0</td><td>none</td><td>none</td><td>0</td></tr><tr><td>1</td><td>1</td><td>0</td><td>none</td><td>none</td><td>0,1</td></tr><tr><td>2</td><td>2</td><td>0</td><td>none</td><td>none</td><td>0,1,2</td></tr><tr><td>3</td><td>3</td><td>0</td><td>none</td><td>none</td><td>0,1,2,3</td></tr><tr><td>4</td><td>4</td><td>0</td><td>none</td><td>4</td><td>0,1,2,3</td></tr><tr><td>5</td><td>5</td><td>4</td><td>0,1,2,3</td><td>5</td><td>empty</td></tr><tr><td>6</td><td>6</td><td>4</td><td>6</td><td>none</td><td>empty</td></tr><tr><td>7</td><td>7</td><td>0</td><td>none</td><td>none</td><td>7</td></tr></tbody></table></div><p>C总service机会8，结束offered8/admitted6/departed5/drop2/queued1。tick5是先丢5、再服务0..3；不能把后来的空余机会搬回tick4/5。queued7既未depart也未drop，终点不自动flush。A/B/C末端再step只保留terminal快照，不加offer/service/counter/history；reset是另一个明确丢弃本队列并回种子的动作，不得重置16 lease或allocator。</p>

### 守恒怎样证明有限缓冲救不了持续差额 {#tp-overload}

<p>未饱和时本层有offered+initialQueued=departed+dropped+queued。若无限source每tick给2、服务最多1，未截断积压至少每tick增1。固定queued≤K，长期差额无界便只能丢弃或改变输入、服务、语义；再大的有限K只延后首次溢出。不要通过无限catch-up或偷偷补数据改变题目。</p><p>要提出无损的条件结论，需已知最大burst、最大服务空窗、初始backlog、反应延迟和已在途work。若延迟L内最多B项、另有I项在途且不重复计算，阈值处至少留B+I空槽才可能够；平均rate无法替代burst上界。真实CTS下一帧前检查，失效时当前帧仍完成；RTS是自身receiver/RDR准备状态，并非本软件queue count的自动流控（历史RM §30.3.14 pp983–984）。暂停采样还会改变时间网格，本例没有实现自动backpressure。</p><div class="lab" id="replay-activity">

### 预测活动2：逐步回放A/B/C {#tp-replay-activity-title}

<p>先预测下一步丢几个sample。切换trace是待应用输入；第一次应用新trace从空队列tick0开始，旧结果保留其标签。A/C8步、B9步后结束，不自动排空C。</p><form id="replay-form"><div class="fields"><label class="field">有限trace<select id="replay-trace"><option value="A">A 同均值burst</option><option value="B">B 持续过载后有限drain</option><option value="C">C 服务空窗</option></select></label><label class="field">预测结果<select id="replay-prediction"><option value="">先选预测</option><option value="2">本步丢2</option><option value="0">本步丢0</option><option value="3">本步丢3</option><option value="1">本步丢1</option><option value="4">本步丢4</option></select></label></div><div class="controls"><button class="btn primary" id="replay-apply" type="submit" disabled>应用一次</button><button class="btn" id="replay-reset" type="button">重置本活动</button></div></form><p class="pending" id="replay-pending">种子尚未应用；先预测。</p><div class="applied-result" id="replay-result" hidden><p id="replay-last"></p><p id="replay-state">种子A/empty/tick0。</p></div><p class="feedback" id="replay-feedback" role="status" aria-live="polite"></p><pre class="activity-log" id="replay-log" tabindex="0" aria-label="预测活动2：逐步回放A/B/C有限记录"></pre></div><div class="lab" id="custom-activity">

### 改值活动3：先4/0，再1/4 {#tp-custom-activity-title}

<p>每次最多4个完整sample。source ID从0递增，在准入前分配，drop也推进；仅8个accepted steps。可以改成service-first的手算作比较，但本活动政策固定。</p><form id="custom-form"><div class="fields"><label class="field">本步arrival数（0..4）<input id="custom-arrivals" value="4" inputmode="numeric"></label><label class="field">本步service预算（0..4）<input id="custom-service" value="1" inputmode="numeric"></label><label class="field">预测结果<select id="custom-prediction"><option value="">先选预测</option><option value="1">本步丢1</option><option value="3">本步丢3</option><option value="0">本步丢0</option><option value="4">本步丢4</option><option value="2">本步丢2</option></select></label></div><div class="controls"><button class="btn primary" id="custom-apply" type="submit" disabled>应用一次</button><button class="btn" id="custom-reset" type="button">重置本活动</button></div></form><p class="pending" id="custom-pending">种子尚未应用；先预测。</p><div class="applied-result" id="custom-result" hidden><p id="custom-last"></p><p id="custom-state">empty/next ID0。</p></div><p class="feedback" id="custom-feedback" role="status" aria-live="polite"></p><pre class="activity-log" id="custom-log" tabindex="0" aria-label="改值活动3：先4/0，再1/4有限记录"></pre></div></section><section class="content-section" id="tp-time">

## 03 · service抖动不等于sample jitter {#tp-time-title}

<p>假设同一明确的毫秒时钟域、足够分辨率并已关联同一sample，提供source/sample labels[0,10,20,30]与service labels[1,11,38,38]。source intervals=10/10/10，service intervals=10/27/0；逐项service−source得latency1/1/18/8ms。平均、最大、峰峰和RMS是不同统计，必须先定义事件和单位。</p><figure id="tp-axes"><div class="flow-scroll" tabindex="0" role="region" aria-label="原创图2：source 与 service 两条独立时间轴，宽图可横向滚动"><svg viewBox="0 0 920 240" role="img" aria-labelledby="tp-axes-title"><title id="tp-axes-title">原创图2：source 与 service 两条独立时间轴</title>
<text x="15" y="35">source/sample labels（ms）</text><path class="arrow" d="M270 45H900"/>
<text x="15" y="142">service labels（ms）</text><path class="arrow" d="M270 150H900"/>
<circle cx="290" cy="45" r="6"/><circle cx="440" cy="45" r="6"/><circle cx="590" cy="45" r="6"/><circle cx="740" cy="45" r="6"/>
<text x="282" y="76">0</text><text x="426" y="76">10</text><text x="576" y="76">20</text><text x="726" y="76">30</text>
<circle cx="305" cy="150" r="6"/><circle cx="455" cy="150" r="6"/><circle cx="860" cy="150" r="6"/>
<text x="297" y="181">1</text><text x="442" y="181">11</text><text x="825" y="181">38 / 38</text>
<path class="arrow" d="M290 82L305 130M440 82L455 130M590 82L850 130M740 82L870 130"/>
<text x="25" y="222">间隔：source 10/10/10；service 10/27/0；延迟：1/1/18/8 ms。全部为提供的 fake labels。</text></svg></div><figcaption>两次 service 同为 38ms 不意味着两个 sample 同时发生。仅有 service 时间不能还原 20/30ms；图没有测量 ADC aperture jitter。</figcaption></figure><p>time模块初始化100/P10，110服务后，145才再服务：跨120/130/140三条release，返回releases3/work1/missed2/remainder5。最多执行一个实际work；它不会创造120/130已采到的历史sample。硬件trigger+DMA可让采样与CPU晚处理分离，仍需真实对应观测。</p><p><a href="https://www.analog.com/media/en/training-seminars/tutorials/MT-007.pdf">ADI MT-007 Rev.A10/08 pp1–3</a>用aperture jitter指实际采样开关时刻变化；这里仅采用术语边界，不借其公式估F407电气值。研究者只读官方web文本，未取得origin PDF bytes/像素；本作者未重新读PDF。全部图中时间是fake labels。</p></section><section class="content-section" id="tp-sequence">

## 04 · 序号只能在有限窗口内判断 {#tp-sequence-title}

<p>在本课模型里，真正发生的source event先分配uint16 modulo65536序号，再决定能否入队；drop也推进编号。DMA block ID、source ID与source epoch是不同域。数学trace ID从0起且0合法，native小例选ID1..8只是局部约定。没有成功发生的push，不得先叫sample再偷偷编号。</p><p>比较需要同一显式epoch，真实向前/窗口跨度严格小于32768。d=(received−last) modulo65536：d0为duplicate-of-last候选；1..32767为forward、当前跨过d−1个位置；32768半周歧义；32769..65535为older/late候选。只有forward更新last，初次观察只seed、不虚构先前丢失。C使用显式unsigned转换，先检查宽值，再收窄，不用越界signed cast作排序保证。</p><div class="table-wrap" tabindex="0" role="region" aria-label="last65534 后 received表，可横向滚动"><table><thead><tr><th>last65534 后 received</th><th>d</th><th>判断</th><th>更新last</th></tr></thead><tbody><tr><td>65535</td><td>1</td><td>forward</td><td>65535</td></tr><tr><td>0</td><td>1</td><td>forward-wrap</td><td>0</td></tr><tr><td>0</td><td>0</td><td>duplicate-of-last</td><td>0</td></tr><tr><td>3</td><td>3</td><td>forward/current-gap2</td><td>3</td></tr><tr><td>2</td><td>65535</td><td>older</td><td>3</td></tr><tr><td>32771</td><td>32768</td><td>ambiguous</td><td>3</td></tr><tr><td>4</td><td>1</td><td>forward</td><td>4</td></tr></tbody></table></div><p>收到2较晚，说明先前gap2并非永久丢2的结算。last-only不能认全历史duplicate，也不能看出尾丢、整圈未见回绕或未声明restart。不同epoch拒绝比较；新epoch需另一个没有旧事件的fresh域。gap、queue drop、硬件flag、parser reject与parser continuity-loss事件均不可合成同一精确loss率。</p><p><a href="https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf">WG14 N1570公开委员会草案2011-04-12 §6.2.5p9、§6.3.1.1/.3、§7.20.1.1</a>支持unsigned模运算与有条件的exact-width类型。它不是最终ISO标准。<a href="https://www.rfc-editor.org/rfc/rfc1982">RFC1982 August1996 §§2–5</a>是DNS有限序号算术范例，半周限制可供参考；本课epoch/window政策是原创，不是ST采集协议规定。RFC origin字节/hash未取得。</p><div class="lab" id="seq-activity">

### 预测活动4：半周与epoch {#tp-seq-activity-title}

<p>seed已观察epoch1/last65534。每次提供一个sequence，最多8次accepted观察；不同epoch或非法数值保持。完整reset才回到该seed，不当作DMA reset。</p><form id="seq-form"><div class="fields"><label class="field">source epoch（1..4294967295）<input id="seq-epoch" value="1" inputmode="numeric"></label><label class="field">received（0..65535）<input id="seq-received" value="65535" inputmode="numeric"></label><label class="field">预测结果<select id="seq-prediction"><option value="">先选预测</option><option value="OLDER">older/late候选</option><option value="AMBIGUOUS">半周ambiguous</option><option value="FORWARD">forward</option><option value="DUPLICATE">duplicate-of-last</option></select></label></div><div class="controls"><button class="btn primary" id="seq-apply" type="submit" disabled>应用一次</button><button class="btn" id="seq-reset" type="button">重置本活动</button></div></form><p class="pending" id="seq-pending">种子尚未应用；先预测。</p><div class="applied-result" id="seq-result" hidden><p id="seq-last"></p><p id="seq-state">epoch1/last65534。</p></div><p class="feedback" id="seq-feedback" role="status" aria-live="polite"></p><pre class="activity-log" id="seq-log" tabindex="0" aria-label="预测活动4：半周与epoch有限记录"></pre></div></section><section class="content-section" id="tp-uart-loss">

## 05 · byte连续性事件和sample drop不同 {#tp-uart-loss-title}

<p>旧FIFO是4BYTE，FULL push先保持底层字段；UART上层明确清空queued4、清partial continuity，并丢失败第5byte。初始period100、旧command={SET_PERIOD,555}；receive A5 01 02 03均OK，尚未poll便没有新command。第5个A5返回UART_LOSS/FIFO_FULL/queuedBeforeLoss4/fullPreservedBeforeDiscard=true；losses1，period仍100。</p><p>poll1消耗0/events0/commandPresent=false，外部555保持。再给fresh A5 01 02 03，poll2消耗4/events4，才产生GET_STATUS/current100。这个已知例有5个入口byte不能进入后续解析，losses却只加一个<strong>事件</strong>；一般还可能有partial失效，不能推广成精确丢byte/packet数，也不承诺任意噪声最终重同步。</p><p>真实uart_poll仍先检查时间/20ms service-observed partial timeout，再最多drain4byte、5event、1command；每byte共享本轮now，无法还原wire interbyte time。MAX−1再加1到MAX且saturated=false；下一次尝试加才MAX/true。共享sticky标志不指出哪个counter截断，饱和诊断只能说明有限计数，不可算精确loss率。</p></section><section class="content-section" id="tp-native">

## 06 · 真实native组合与资源合同 {#tp-native-title}

<p>浏览器活动是JS有限回放；下面的C组合证据来自独立caller分别链接真实dma、throughput、fifo、uart、time对象。四次成功push后仍为WRITER/valid4/NDTR0，complete(token)才READY、切CT/reload NDTR4；begin_next另占一个phase，分配下一块或LATE。不能把第四次safe push写成硬件raw的自动切换。</p><p>adapter仅有2个metadata bank×4entry，以实际(run,block,slot,index)为键。start/begin成功才reserve；成功push才提交一次source ID/seq/time/epoch，失败不推进。正常claim最旧READY，以四次真实dma_read值和matching label构成copied record，然后matching release，再一次offer。queue只留复制值，不留producer指针或lease；claim/service时刻从不改叫source time。</p><div class="table-wrap" tabindex="0" role="region" aria-label="每turn资源表，可横向滚动"><table><thead><tr><th>每turn资源</th><th>上限/提交点</th></tr></thead><tbody><tr><td>producer</td><td>1个显式phase（含失败）；push至多1样本；complete/begin独立</td></tr><tr><td>consumer</td><td>1次claim、4次实际read、1次matching release</td></tr><tr><td>metadata/status</td><td>2×4 entries；observe≤1；dma_status≤2</td></tr><tr><td>queue/sequence</td><td>1 step≤4offer+4service；≤4 departure observations</td></tr><tr><td>UART/time</td><td>≤5 actual receive；1 poll≤4byte/5event/1command；1 time_service/work≤1</td></tr><tr><td>可选history</td><td>每个模型32copied rows；row33只丢诊断行，执行继续</td></tr></tbody></table></div><p>N1的真实A读得10/11/12/13，service1后queue11/12/13。B填20..23期间service0，complete/copy后只准入20，丢21/22/23，服务旧11，queue12/13/20；再三个service1离开12、13、20。合计2blocks、8copied samples、16B sample payload，queue offered8/admitted5/drop3/departed5/q0。source IDs6/7/8被丢，已在push时推进至8。实际GET_STATUS在B运行、BOUNDARY且drop3、stop-requested和stop-confirmed时均可解析period100。</p><p>N2单独刻意held-A：A CONSUMER/B READY时begin_next报LATE_REUSE并请求停止，接着push30为NOT_RUNNING、不写30也不编号。未确认recover BUSY；确认后仍held则BUSY。matching read index1得11，release后才能recover run2，丢弃未消费B的READY计数1、NDTR4、长度0、清flags；start另一步分配block3。旧A read/release、旧B complete均STALE且保持。正常策略可在任一valid phase claim READY，N3专门证明stopped READY可复制，不能把N2的刻意持有误写成producer能力限制。</p><p>每个module只保证自身被拒调用保持；之前成功push/标签提交/release/queue step/UART ingress不会因后来的time拒绝而回滚。一turn不原子。N4验证真实FULL/timeout/time与这种部分提交；N5独立验证所有A/B/C字面行、sequence65534、history33与饱和。C严格normal/NDEBUG、重复include、每模块分编译再link；README内完整caller原文抽取复跑，非复制DMA实现、改内部READY、文本include .c或预先接受的假command。</p><p>fresh initializer不读旧storage，前提是没有live owner、旧lease/事件；它无法检测并抹掉违反此前提的域。每个fresh fixture使用独立storage，后续只用checked queue reset或真实producer recover。可检查null/enum/domain/metadata，不声称能检查悬空/伪造指针、假extent或aliasing。所有objects/output要求真实、足够大、不重叠、单上下文独占、不可重入。</p><p>固定work、host .su与官方栈扫描只给宿主逻辑/逐函数证据，不能证明目标ABI、整条调用栈、ISR WCET、实际采样、线延迟、并发或无损。真实DBM不会等软件owner，SAFE_STOP_ON_REUSE只是事件边界原创政策，TC ISR是否及时止写仍未验证。</p></section><div class="content-section" id="tp-practice">

## 十题独立回忆 {#tp-practice-title}

<p class="practice-intro">先收起答案，写出原因再展开。题目不依赖活动当前状态；只打题干可打印这十题。没有分数或个人学习记录。</p><p class="practice-intro">改值任务：把A的容量按手算改为6/7，解释相同平均下为何分别丢1/0；把C的service次序改动并重新列出守恒。不要用这个静态比较擅改固定cap4 C合同。</p><div class="exercise" id="tp-question-01">

### 17-01 · 基础 {#tp-question-01-title}

<p class="question-stem">请求115200 8N1、连续字符无gap；虚构记录含2sample+2seq+4time+3framing字节。求字符容量、每记录时间及1000条/s占用。</p><details class="exercise-answer" id="tp-answer-01"><summary>展开完整推理</summary><p>10bit-times/字符给11520 encoded B/s；11B=110bits，时间954.861111…µs。1000条/s耗11000B/s、275/288≈95.486111%。只算sample的2000B/s漏掉元数据与封装。它是条件算术，不是实测或单元11命令；下一步核真实编码/gap。</p></details></div><div class="exercise" id="tp-question-02">

### 17-02 · 迁移 {#tp-question-02-title}

<p class="question-stem">PCLK42MHz、OVER8=0、D365。求名义baud，并解释−0.114155…%的含义和边界。</p><details class="exercise-answer" id="tp-answer-02"><summary>展开完整推理</summary><p>42000000/365≈115068.493150baud，相对请求误差−25/219%。这是名义时钟下除数的量化误差，不含振荡器、wire和服务。不能由此保证接收容差或最坏余量；下一步核具名时钟/接收器条件。</p></details></div><div class="exercise" id="tp-question-03">

### 17-03 · 故障 {#tp-question-03-title}

<p class="question-stem">cap4samples、arrival-first/drop-new、初始空：tick0 offer0..3/service1；tick1 offer4..7/service1。给tick1丢弃与queue；八tick共8offer/8service机会说明什么？</p><details class="exercise-answer" id="tp-answer-03"><summary>展开完整推理</summary><p>tick0后queue1,2,3。tick1只准入4，丢5,6,7，再服务1，queue2,3,4。平均均为1/tick仍丢3；后来的空机会不能回到准入瞬间。下一步检查未截断峰值和最大服务空窗。</p></details></div><div class="exercise" id="tp-question-04">

### 17-04 · 故障 {#tp-question-04-title}

<p class="question-stem">cap4/drop-new的B在tick0..5每步offer2/service1，tick6..8只drain1。已知丢7,9,11，求总数并解释尾丢11。</p><details class="exercise-answer" id="tp-answer-04"><summary>展开完整推理</summary><p>offered12、admitted9、departed9、drop3、queued0。没有随后更大received seq，单看gap发现不了尾11。需可靠预期终点或独立source总数；有限drain结束不能证明无限2/1稳定。</p></details></div><div class="exercise" id="tp-question-05">

### 17-05 · 故障 {#tp-question-05-title}

<p class="question-stem">cap4、arrival-first/drop-new，tick0..7各offer1，service[0,0,0,0,0,4,4,0]。给最终depart/drop/queue，并解释tick5为何救不了5。</p><details class="exercise-answer" id="tp-answer-05"><summary>展开完整推理</summary><p>tick4丢4；tick5到达5时仍满，先丢5再服务0..3；tick6服务6，tick7留7。最终depart5/drop2/queued1，守恒8。service不是倒流credit；queued7不能在terminal偷偷flush。下一步核事件先后。</p></details></div><div class="exercise" id="tp-question-06">

### 17-06 · 迁移 {#tp-question-06-title}

<p class="question-stem">不改变语义、不压缩、不暂停，source无限每tick给2samples、service至多1，buffer容量有限K。加大K能保证不丢吗？</p><details class="exercise-answer" id="tp-answer-06"><summary>展开完整推理</summary><p>未截断积压至少每tick加1，任何固定K终会满。由守恒，之后需丢弃或改变输入/服务/语义。更大buffer仅延迟首次溢出；下一步找持续瓶颈和可证明的burst/gap边界。</p></details></div><div class="exercise" id="tp-question-07">

### 17-07 · 基础 {#tp-question-07-title}

<p class="question-stem">提供fake sample labels[0,10,20,30]ms、service labels[1,11,38,38]ms。求两种间隔与延迟，并说明测量边界。</p><details class="exercise-answer" id="tp-answer-07"><summary>展开完整推理</summary><p>sample间隔10/10/10，service间隔10/27/0，逐项延迟1/1/18/8ms。uniform提供的sample网格可与service变化共存；这没有测physical aperture。只有service时间还原不出sample时刻；下一步核事件关联和clock domain。</p></details></div><div class="exercise" id="tp-question-08">

### 17-08 · 故障 {#tp-question-08-title}

<p class="question-stem">同epoch/真实跨度&lt;32768，last65534，依次收到65535,0,0,3,2,32771,4。分类并更新last。</p><details class="exercise-answer" id="tp-answer-08"><summary>展开完整推理</summary><p>依次forward、forward-wrap、duplicate-of-last、forward/current-gap2、older、半周ambiguous、forward，last最终4。older/ambiguous不更新；后到2让早先gap不能结算为永久丢失。整圈未见回绕、restart和尾丢越出last-only证据，下一步核epoch/window。</p></details></div><div class="exercise" id="tp-question-09">

### 17-09 · 故障 {#tp-question-09-title}

<p class="question-stem">真实UART初始period100/FIFO4bytes，receive A5 01 02 03后尚未poll，第5个A5到达。loss后还剩什么，fresh status bytes能做什么？</p><details class="exercise-answer" id="tp-answer-09"><summary>展开完整推理</summary><p>FULL先保持底层FIFO，再由UART主动flush4和partial continuity，丢失败A5，losses1/period100。空poll无新command、旧输出保持；fresh完整状态帧可在有界poll后得GET_STATUS100。1loss事件非普遍精确byte/packet数，亦非sample drop-new；下一步看commandPresent。</p></details></div><div class="exercise" id="tp-question-10">

### 17-10 · 迁移 {#tp-question-10-title}

<p class="question-stem">16的一个block已完成，17要消费且真实UART状态命令仍需工作。什么证据才证明native组合，又不能证明什么？</p><details class="exercise-answer" id="tp-answer-10"><summary>展开完整推理</summary><p>独立caller需分别link实际producer/queue/UART/time，通过真实claim/read获得匹配值、copy后release，同时actual receive/poll解析状态且遵守work上限。JS回放或假READY不足。有限native work不证明物理sample time、wire latency、WCET、无损或目标硬件；下一步分别检查资源/target证据。</p></details></div></div><section class="content-section" id="tp-sources">

## 07 · 来源、尚未验证的边界 {#tp-sources-title}

<p>一手依据按版本/条款使用：历史RM0090 DocID018909 Rev5 September2013的ADC §13.5/13.8 pp395/398–399、UART §30.3/30.3.4/30.3.14；C模算术用N1570公开草案；RFC1982是可选DNS范例，ADI MT-007仅供aperture术语。原始研究者读历史RM相关完整文本，目视395/398/950/955/984；DMA研究目视60/73/305/310/319/321/329。本作者读了这些研究dossiers与清单，未把研究者PDF/像素读数冒称自己的新测量。</p><p>当前官方RM仍未读；当前DS/PM/AN多数像素、所选硅片revision/current errata、目标电气、buffer placement/backend stop/concurrency/cache/WCET、真实sampling/wire/overrun、OS实体纸张均未验证。web-only origin文件缺bytes/SHA时保持缺口，文本快照hash不冒充origin PDF hash。F407的Flash I/D-Code加速不是M7 SRAM L1 D-cache；迁移F7/H7需另核reachability、attributes、cache state、line/shared邻接、方向，未交付维护指令。</p><p>本章原创的是队列政策、图、fake时间标签和有限回放。12–14已审源码已进入main dafffcc4b3426aae93f7562ff27a815dfcabe79b；其新CI/Pages/线上验收另验，本章17仍是本地候选。完整课程仍有32单元/8阶段；18–32尚待交付。本单元、源代码与native/browser验证不等于阶段完成、正式发布、硬件通过或个人掌握。可以向Agent追问：“若arrival先于service而最大空窗是5tick，我应怎样改守恒和容量前提？”</p></section>

<section class="content-section" id="tp-source">

## 完整原生源码与复现 {#tp-c-title}

<p>下载所有C/H与README，按README相对目录保存。生产模块没有main；完整独立caller在README标记内，可原文抽取。源码展示逐字节对应下载，不需要隐藏文件。</p><div class="source-downloads"><a href="../examples/throughput-overload/throughput.c" download>throughput.c（throughput-overload）</a><a href="../examples/throughput-overload/throughput.h" download>throughput.h（throughput-overload）</a><a href="../examples/dma-ownership/dma.c" download>dma.c（dma-ownership）</a><a href="../examples/dma-ownership/dma.h" download>dma.h（dma-ownership）</a><a href="../examples/bounded-fifo/fifo.c" download>fifo.c（bounded-fifo）</a><a href="../examples/bounded-fifo/fifo.h" download>fifo.h（bounded-fifo）</a><a href="../examples/uart-framing/uart.c" download>uart.c（uart-framing）</a><a href="../examples/uart-framing/uart.h" download>uart.h（uart-framing）</a><a href="../examples/timer-pwm/time.c" download>time.c（timer-pwm）</a><a href="../examples/timer-pwm/time.h" download>time.h（timer-pwm）</a><a href="../examples/throughput-overload/README.txt" download>README.txt（throughput-overload）</a></div></section>



### throughput-overload/throughput.c 完整源码 {#tp-source-throughput-overload-throughput-c}



```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file throughput.c
 * @author embedded-notes contributors
 * @brief Arrival-first/drop-new sample records with finite copied reports.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#include "throughput.h"
#include <string.h>

/** @brief Increment one diagnostic without wrap.
 * @param[in,out] counter Initialized counter.
 * @param[in,out] saturated Sticky shared indication.
 * @return None. */
static void throughput_increment(uint32_t *counter, bool *saturated)
{
    /**
    * Reaching MAX is exact; only an attempted increment beyond it truncates.
    **/
    if (*counter == UINT32_MAX) {
        *saturated = true;
    } else {
        *counter += 1U;
    }
}

/** @brief Check initialized queue metadata in fixed work.
 * @param[in] state Real live initialized object.
 * @return Whether checkable fields are in their declared domain. */
static bool throughput_valid(const ThroughputState *state)
{
    size_t index;
    /**
    * Only occupied records need a live positive source epoch.
    **/
    if (state->head >= TP_CAPACITY || state->count > TP_CAPACITY || state->limit == 0U ||
        state->tick > state->limit || state->historyCount > TP_HISTORY_ROWS) {
        return false;
    }
    for (index = 0U; index < state->count; index++) {
        if (state->slots[(state->head + index) % TP_CAPACITY].epoch == 0U) {
            return false;
        }
    }
    return true;
}

/** @brief Check one complete acquisition input before narrowing.
 * @param[in] input Real live wide input.
 * @return Whether all named input domains hold. */
static bool throughput_input_valid(const ThroughputInput *input)
{
    /**
    * Source ID zero is legitimate and is unrelated to positive DMA identities.
    **/
    return input->value <= UINT16_MAX && input->sourceId <= UINT32_MAX &&
        input->sequence <= UINT16_MAX && input->sourceTime <= UINT32_MAX &&
        input->epoch > 0U && input->epoch <= UINT32_MAX;
}

/** @brief Copy already validated input into independently owned record storage.
 * @param[in] input Checked wide record.
 * @return Complete copied record. */
static ThroughputRecord throughput_record(const ThroughputInput *input)
{
    /**
    * The fictional eleven-byte wire example is not this C object's layout.
    **/
    return (ThroughputRecord){(uint16_t)input->value, (uint32_t)input->sourceId,
        (uint16_t)input->sequence, (uint32_t)input->sourceTime, (uint32_t)input->epoch};
}

/** @brief Append one diagnostic row without controlling execution progress.
 * @param[in,out] state Initialized accepted state.
 * @param[in] report Current accepted copied records.
 * @return None. */
static void throughput_history(ThroughputState *state, const ThroughputReport *report)
{
    size_t index;
    /**
    * A full history loses only the new row; existing rows remain intact.
    **/
    if (state->historyEnabled) {
        if (state->historyCount < TP_HISTORY_ROWS) {
            ThroughputHistoryRow *row = &state->history[state->historyCount];
            *row = (ThroughputHistoryRow){0};
            row->tick = report->tick;
            row->offered = report->offeredCount;
            row->dropped = report->droppedCount;
            row->departed = report->departedCount;
            row->queuedCount = report->queuedCount;
            for (index = 0U; index < report->queuedCount; index++) {
                row->queuedIds[index] = report->queued[index].sourceId;
            }
            state->historyCount += 1U;
        } else {
            throughput_increment(&state->diagnostics.historyDropped, &state->diagnostics.saturated);
        }
    }
}

/** @brief Establish a fresh empty bounded queue with fully initialized storage.
 * @param[out] state Genuinely fresh object.
 * @param[in] limit Wide finite number of accepted steps.
 * @param[in] fixture Public normal/counter seed.
 * @param[in] historyEnabled Enable copied rows.
 * @return TP_OK or preserving argument error. */
ThroughputStatus throughput_init(ThroughputState *state, uint64_t limit,
    ThroughputFixture fixture, bool historyEnabled)
{
    /**
    * Validation precedes writing and never inspects old storage.
    **/
    if (state == NULL || limit == 0U || limit > UINT32_MAX ||
        fixture < TP_FIXTURE_NORMAL || fixture > TP_FIXTURE_COUNTER_EDGE) {
        return TP_INVALID_ARGUMENT;
    }
    memset(state, 0, sizeof(*state));
    state->limit = (uint32_t)limit;
    state->historyEnabled = historyEnabled;
    if (fixture == TP_FIXTURE_COUNTER_EDGE) {
        state->diagnostics = (ThroughputDiagnostics){UINT32_MAX - 1U, UINT32_MAX - 1U,
            UINT32_MAX - 1U, UINT32_MAX - 1U, UINT32_MAX - 1U, false};
    }
    return TP_OK;
}

/** @brief Initialize a fresh last-only observer without inspecting prior storage.
 * @param[out] state Fresh object.
 * @param[in] epoch Wide positive source identity.
 * @param[in] fixture Normal/counter edge seed.
 * @return TP_OK or preserving invalid argument. */
ThroughputStatus throughput_sequence_init(ThroughputSequence *state, uint64_t epoch,
    ThroughputFixture fixture)
{
    /**
    * Source epochs and DMA run identities are independent domains.
    **/
    if (state == NULL || epoch == 0U || epoch > UINT32_MAX ||
        fixture < TP_FIXTURE_NORMAL || fixture > TP_FIXTURE_COUNTER_EDGE) {
        return TP_INVALID_ARGUMENT;
    }
    *state = (ThroughputSequence){0};
    state->epoch = (uint32_t)epoch;
    if (fixture == TP_FIXTURE_COUNTER_EDGE) {
        state->diagnostics = (ThroughputSequenceDiagnostics){UINT32_MAX - 1U, UINT32_MAX - 1U,
            UINT32_MAX - 1U, UINT32_MAX - 1U, UINT32_MAX - 1U, UINT32_MAX - 1U, false};
    }
    return TP_OK;
}

/** @brief Classify a single same-epoch observation with unsigned modulo arithmetic.
 * @param[in,out] state Initialized exclusively owned observer.
 * @param[in] epoch Checked source epoch.
 * @param[in] sequence Wide sequence checked before narrowing.
 * @param[out] report Fully initialized output only on TP_OK.
 * @return TP_OK or preserving argument/state/epoch rejection. */
ThroughputStatus throughput_sequence_observe(ThroughputSequence *state, uint64_t epoch,
    uint64_t sequence, ThroughputSequenceReport *report)
{
    uint16_t received;
    uint16_t delta;
    uint32_t gap;
    /**
    * Checks cannot detect an unseen full wrap or a violated true-window promise.
    **/
    if (state == NULL || report == NULL || epoch == 0U || epoch > UINT32_MAX || sequence > UINT16_MAX) {
        return TP_INVALID_ARGUMENT;
    }
    if (state->epoch == 0U) {
        return TP_BAD_STATE;
    }
    if (epoch != state->epoch) {
        return TP_EPOCH_REJECTED;
    }
    received = (uint16_t)sequence;
    delta = (uint16_t)((uint32_t)received + UINT32_C(65536) - (uint32_t)state->last);
    *report = (ThroughputSequenceReport){0};
    throughput_increment(&state->diagnostics.observations, &state->diagnostics.saturated);
    if (!state->seeded) {
        state->seeded = true;
        state->last = received;
        report->order = TP_SEEDED;
    } else if (delta == 0U) {
        report->order = TP_DUPLICATE;
        throughput_increment(&state->diagnostics.duplicates, &state->diagnostics.saturated);
    } else if (delta < UINT16_C(32768)) {
        report->order = TP_FORWARD;
        report->delta = delta;
        report->gap = (uint16_t)(delta - 1U);
        state->last = received;
        throughput_increment(&state->diagnostics.forward, &state->diagnostics.saturated);
        gap = report->gap;
        /**
        * Add the bounded skipped-position count without a loop over the gap.
        **/
        if (gap > UINT32_MAX - state->diagnostics.gaps) {
            state->diagnostics.gaps = UINT32_MAX;
            state->diagnostics.saturated = true;
        } else {
            state->diagnostics.gaps += gap;
        }
    } else if (delta == UINT16_C(32768)) {
        report->order = TP_AMBIGUOUS;
        report->delta = delta;
        throughput_increment(&state->diagnostics.ambiguous, &state->diagnostics.saturated);
    } else {
        report->order = TP_OLDER;
        report->delta = delta;
        throughput_increment(&state->diagnostics.older, &state->diagnostics.saturated);
    }
    report->last = state->last;
    report->diagnostics = state->diagnostics;
    return TP_OK;
}

/** @brief Perform a checked queue-only reset rather than a fresh lifetime reset.
 * @param[in,out] state Initialized valid queue.
 * @return TP_OK or preserving rejection. */
ThroughputStatus throughput_reset(ThroughputState *state)
{
    uint32_t limit;
    bool historyEnabled;
    /**
    * This explicit action discards queued copies, not any producer ownership.
    **/
    if (state == NULL) {
        return TP_INVALID_ARGUMENT;
    }
    if (!throughput_valid(state)) {
        return TP_BAD_STATE;
    }
    limit = state->limit;
    historyEnabled = state->historyEnabled;
    memset(state, 0, sizeof(*state));
    state->limit = limit;
    state->historyEnabled = historyEnabled;
    return TP_OK;
}

/** @brief Apply at most four ordered arrivals then at most four departures.
 * @param[in,out] state Valid exclusive queue.
 * @param[in] offered Real disjoint array with checked count.
 * @param[in] count Wide number of supplied complete records.
 * @param[in] service Wide current service budget, without credit.
 * @param[out] report Completely initialized copied report only on success.
 * @return TP_OK/TERMINAL or preserving rejection. */
ThroughputStatus throughput_step(ThroughputState *state, const ThroughputInput *offered,
    uint64_t count, uint64_t service, ThroughputReport *report)
{
    size_t index;
    /**
    * Check all inputs before any accepted queue, diagnostic or output mutation.
    **/
    if (state == NULL || report == NULL || count > TP_CAPACITY || service > TP_CAPACITY ||
        (count != 0U && offered == NULL)) {
        return TP_INVALID_ARGUMENT;
    }
    if (!throughput_valid(state)) {
        return TP_BAD_STATE;
    }
    for (index = 0U; index < count; index++) {
        if (!throughput_input_valid(&offered[index])) {
            return TP_INVALID_ARGUMENT;
        }
    }
    if (state->tick == state->limit) {
        return TP_TERMINAL;
    }
    /**
    * Zero fixed scalar/enum/bool fields directly, avoiding a report-sized stack temporary.
    **/
    memset(report, 0, sizeof(*report));
    report->tick = state->tick;
    report->offeredCount = (uint32_t)count;
    for (index = 0U; index < count; index++) {
        ThroughputRecord record = throughput_record(&offered[index]);
        report->offered[index] = record;
        throughput_increment(&state->diagnostics.offered, &state->diagnostics.saturated);
        if (state->count < TP_CAPACITY) {
            state->slots[(state->head + state->count) % TP_CAPACITY] = record;
            state->count += 1U;
            report->admitted[report->admittedCount] = record;
            report->admittedCount += 1U;
            throughput_increment(&state->diagnostics.admitted, &state->diagnostics.saturated);
        } else {
            report->dropped[report->droppedCount] = record;
            report->droppedCount += 1U;
            throughput_increment(&state->diagnostics.dropped, &state->diagnostics.saturated);
        }
    }
    for (index = 0U; index < service && state->count != 0U; index++) {
        report->departed[report->departedCount] = state->slots[state->head];
        report->departedCount += 1U;
        state->head = (state->head + 1U) % TP_CAPACITY;
        state->count -= 1U;
        throughput_increment(&state->diagnostics.departed, &state->diagnostics.saturated);
    }
    report->queuedCount = state->count;
    for (index = 0U; index < state->count; index++) {
        report->queued[index] = state->slots[(state->head + index) % TP_CAPACITY];
    }
    state->tick += 1U;
    report->terminal = state->tick == state->limit;
    throughput_history(state, report);
    report->diagnostics = state->diagnostics;
    return TP_OK;
}
```



### throughput-overload/throughput.h 完整源码 {#tp-source-throughput-overload-throughput-h}



```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file throughput.h
 * @author embedded-notes contributors
 * @brief Four sample records, finite work and bounded sequence observations.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#ifndef EMBEDDED_NOTES_THROUGHPUT_H
#define EMBEDDED_NOTES_THROUGHPUT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#if !defined(UINT16_MAX) || !defined(UINT32_MAX) || !defined(UINT64_MAX)
#error Exact-width uint16_t, uint32_t and uint64_t are required.
#endif

#define TP_CAPACITY 4U
#define TP_HISTORY_ROWS 32U

typedef enum {
    TP_OK = 0,
    TP_TERMINAL,
    TP_INVALID_ARGUMENT,
    TP_BAD_STATE,
    TP_EPOCH_REJECTED
} ThroughputStatus;
typedef enum {
    TP_FIXTURE_NORMAL = 0,
    TP_FIXTURE_COUNTER_EDGE
} ThroughputFixture;
typedef struct {
    uint64_t value;
    uint64_t sourceId;
    uint64_t sequence;
    uint64_t sourceTime;
    uint64_t epoch;
} ThroughputInput;
typedef struct {
    uint16_t value;
    uint32_t sourceId;
    uint16_t sequence;
    uint32_t sourceTime;
    uint32_t epoch;
} ThroughputRecord;
typedef struct {
    uint32_t offered;
    uint32_t admitted;
    uint32_t dropped;
    uint32_t departed;
    uint32_t historyDropped;
    bool saturated;
} ThroughputDiagnostics;
typedef struct {
    uint32_t tick;
    uint32_t offered;
    uint32_t dropped;
    uint32_t departed;
    uint32_t queuedCount;
    uint32_t queuedIds[TP_CAPACITY];
} ThroughputHistoryRow;
typedef struct {
    ThroughputRecord slots[TP_CAPACITY];
    uint32_t head;
    uint32_t count;
    uint32_t tick;
    uint32_t limit;
    bool historyEnabled;
    ThroughputDiagnostics diagnostics;
    size_t historyCount;
    ThroughputHistoryRow history[TP_HISTORY_ROWS];
} ThroughputState;
typedef struct {
    uint32_t tick;
    bool terminal;
    uint32_t offeredCount;
    uint32_t admittedCount;
    uint32_t droppedCount;
    uint32_t departedCount;
    uint32_t queuedCount;
    ThroughputRecord offered[TP_CAPACITY];
    ThroughputRecord admitted[TP_CAPACITY];
    ThroughputRecord dropped[TP_CAPACITY];
    ThroughputRecord departed[TP_CAPACITY];
    ThroughputRecord queued[TP_CAPACITY];
    ThroughputDiagnostics diagnostics;
} ThroughputReport;

/*
 * Original single-context, exclusive, non-reentrant host model; no MMIO, heap,
 * callbacks, recursion, sleeps, blocking I/O, concurrent queue or physical time.
 * Every nonnull argument names a real live typed sufficiently sized object.
 * All outputs, state and input arrays are disjoint; no pointer is retained.
 * Callers may inspect fields but must never edit accepted state metadata.
 * Null/domain checks do not validate forged/dangling pointers, aliasing or false
 * extents. Later operations require successful initialization, not arbitrary bytes.
 * Fresh init reads no old storage; it requires no old live owner/events. It must
 * not erase a DMA lifetime/lease/allocator. Checked reset discards ONLY this queue
 * and its diagnostics/history, preserving the declared limit/history setting.
 *
 * Capacity is exactly four SAMPLE RECORDS, independent of the old four-BYTE FIFO.
 * A step first admits 0..4 ordered records (drop-new), then serves up to 0..4
 * oldest records. No hidden in-service slot, carried credit or terminal flush.
 * Inputs are checked in uint64_t before narrowing: value/sequence <=65535;
 * sourceId/sourceTime <=UINT32_MAX (ID zero is valid); epoch 1..UINT32_MAX.
 * limit is 1..UINT32_MAX accepted steps; tick never wraps. On the last TP_OK,
 * report.terminal is true. A later TP_TERMINAL preserves state/output; retain the
 * last committed terminal snapshot, with no fresh report or history action.
 *
 * TP_OK alone refreshes the complete report. Argument/state/epoch rejections
 * preserve ALL named state, counters/history and outputs. Queue drop is accepted
 * progress. Earlier successful calls in another module are never rolled back.
 * Every report list has four initialized slots; unused slots are all zero.
 * Each step offers <=4, departs <=4, copies <=4 current queued records and appends
 * <=1 optional copied row. State owns four records and 32 fixed history rows,
 * even when recording is off. Row33 drops only the diagnostic row; queue work
 * still advances. Counters reach MAX with saturated=false; the next attempted
 * increment at MAX sets sticky saturated=true. Saturated totals are not rates.
 * COUNTER_EDGE is a fresh public fixture seeding each total MAX-1, not permission
 * to edit initialized metadata. Every loop has the fixed 4 or 32 storage bound.
 */

/** @brief Initialize genuinely fresh queue storage after validating wide limit.
 * @param[out] state Fresh disjoint writable object.
 * @param[in] limit Accepted steps 1..UINT32_MAX.
 * @param[in] fixture NORMAL or COUNTER_EDGE.
 * @param[in] historyEnabled Enable optional copied history.
 * @return TP_OK or preserving TP_INVALID_ARGUMENT. */
ThroughputStatus throughput_init(ThroughputState *state, uint64_t limit,
    ThroughputFixture fixture, bool historyEnabled);
/** @brief Explicitly discard/reseed only the initialized queue domain.
 * @param[in,out] state Valid initialized queue; no DMA resource is referenced.
 * @return TP_OK or preserving argument/state rejection. */
ThroughputStatus throughput_reset(ThroughputState *state);
/** @brief Admit first, then remove oldest records under fixed work limits.
 * @param[in,out] state Valid initialized queue.
 * @param[in] offered Real ordered array of count inputs; NULL allowed only at zero.
 * @param[in] count Wide cardinality 0..4.
 * @param[in] service Wide current service opportunity 0..4.
 * @param[out] report Fresh complete copied result only on TP_OK.
 * @return TP_OK/TERMINAL or preserving argument/state rejection. */
ThroughputStatus throughput_step(ThroughputState *state, const ThroughputInput *offered,
    uint64_t count, uint64_t service, ThroughputReport *report);

typedef enum {
    TP_SEEDED = 0,
    TP_FORWARD,
    TP_DUPLICATE,
    TP_OLDER,
    TP_AMBIGUOUS
} ThroughputOrder;
typedef struct {
    uint32_t observations;
    uint32_t forward;
    uint32_t gaps;
    uint32_t duplicates;
    uint32_t older;
    uint32_t ambiguous;
    bool saturated;
} ThroughputSequenceDiagnostics;
typedef struct {
    uint32_t epoch;
    uint16_t last;
    bool seeded;
    ThroughputSequenceDiagnostics diagnostics;
} ThroughputSequence;
typedef struct {
    ThroughputOrder order;
    uint16_t delta;
    uint16_t gap;
    uint16_t last;
    ThroughputSequenceDiagnostics diagnostics;
} ThroughputSequenceReport;

/* Sequence observations share the object/non-overlap/fresh-output contract above.
 * Caller promises same explicit epoch and true forward/window span <32768.
 * A different positive epoch returns preserving TP_EPOCH_REJECTED; a new epoch
 * needs a distinct fresh domain (no old events), not silent comparison/reset.
 * First observation seeds last without earlier loss. Only FORWARD advances last.
 * d0 duplicate-of-last candidate; d1..32767 forward/gap=d-1; d32768 ambiguous;
 * d32769..65535 older/late candidate. No signed conversion or hidden history.
 * Gaps count currently skipped positions, not settled permanent loss. Last-only
 * state cannot detect all past duplicates, tail loss, unseen wraps or restart.
 * Each call has constant work and no history; all diagnostics saturate as above.
 */
/** @brief Initialize one fresh explicit source-epoch observer.
 * @param[out] state Genuinely fresh disjoint object.
 * @param[in] epoch Wide positive uint32 domain.
 * @param[in] fixture Public normal/counter seed.
 * @return TP_OK or preserving TP_INVALID_ARGUMENT. */
ThroughputStatus throughput_sequence_init(ThroughputSequence *state, uint64_t epoch,
    ThroughputFixture fixture);
/** @brief Observe one checked source sequence under the true-span promise.
 * @param[in,out] state Initialized observer, never caller-edited.
 * @param[in] epoch Same positive epoch in wide input.
 * @param[in] sequence Wide value 0..65535.
 * @param[out] report Complete fresh result only on TP_OK.
 * @return TP_OK or preserving argument/state/epoch rejection. */
ThroughputStatus throughput_sequence_observe(ThroughputSequence *state, uint64_t epoch,
    uint64_t sequence, ThroughputSequenceReport *report);

#endif
```



### dma-ownership/dma.c 完整源码 {#tp-source-dma-ownership-dma-c}



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



### dma-ownership/dma.h 完整源码 {#tp-source-dma-ownership-dma-h}



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



### bounded-fifo/fifo.c 完整源码 {#tp-source-bounded-fifo-fifo-c}



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



### bounded-fifo/fifo.h 完整源码 {#tp-source-bounded-fifo-fifo-h}



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



### uart-framing/uart.c 完整源码 {#tp-source-uart-framing-uart-c}



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



### uart-framing/uart.h 完整源码 {#tp-source-uart-framing-uart-h}



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



### timer-pwm/time.c 完整源码 {#tp-source-timer-pwm-time-c}



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



### timer-pwm/time.h 完整源码 {#tp-source-timer-pwm-time-h}



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

## README.txt 完整说明与独立caller {#tp-source-readme}

```text
Unit17 original host teaching module and complete independent native caller

Scope: single-context exclusive non-reentrant host C11, not MMIO/ISR/DMA/UART hardware.
All objects and outputs are real live sufficiently sized and disjoint. Never edit module metadata.
Fresh initialization requires no old owner, lease or events; do not reinitialize a live lifetime domain.
Every fixture below owns separate storage. Queue reset discards copied queue state only.
Normal copying is available in any valid producer phase, including stopped READY.
The held-A fixture deliberately withholds this normal consumer policy; it is diagnostic.
Fake source labels commit only after successful dma_push, keyed by actual run/block/slot/index.
Actual dma_read values populate copied records; release precedes queue offer; no lease/pointer is retained.
Each component commits independently: later rejecting UART/time does not rewind successful producer/ingress.
No wire sampling protocol is added. The 11B/110bit record is accounting only, not sizeof or parser grammar.

Layout to preserve (every C/H is downloadable beside the chapter):
examples/
  throughput-overload/throughput.c throughput.h README.txt
  dma-ownership/dma.c dma.h
  bounded-fifo/fifo.c fifo.h
  uart-framing/uart.c uart.h
  timer-pwm/time.c time.h

The complete caller starts at BEGIN_CONSUMER_C and ends before END_CONSUMER_C below.
Save that exact text as consumer.c next to examples/. No omitted helper or terminal module is required.
For a generic local reproduction, use an existing C11 compiler; do not install tools for this example.
Compile each of throughput.c, dma.c, fifo.c, uart.c, time.c and consumer.c separately with:
  gcc -std=c11 -Wall -Wextra -Werror -pedantic -fstack-usage -I examples -c <source> -o <unique-object>
Link those six objects, then execute the resulting host program. Repeat every compile with -DNDEBUG.
All acceptance checks use ordinary nonzero failure propagation; no assert depends on debug mode.
This project routes every compiler/link/run command through its existing mcu-build custom profiles:
  python <mcu-build>/scripts/build_router.py validate --config <profile.toml>
  python <mcu-build>/scripts/build_router.py build --config <profile.toml> --profile <name> --dry-run
  python <mcu-build>/scripts/build_router.py build --config <profile.toml> --profile <name>
Profile command is a structured argv array; artifacts are workspace-relative paths. Keep raw returns/logs,
input/profile/tool hashes, before/after and fresh artifact size/SHA. Use a process-local compiler PATH only.
The repository runner supports --native with --gcc --python --router --out (existing tools only).
It extracts this exact complete caller and separately builds actual production modules in normal/NDEBUG.

Expected finite evidence: N1 2 blocks/8 copied samples/16B sample payload; queue8/5/3/5/q0.
N2 late/no30write, unconfirmed BUSY, confirmed-held BUSY, matching release/recoverrun2, stale old tokens.
N3 stopped READY copying and actual status; N4 FULL4+failed5th/timeout5events/time110/145/non-atomic commits.
N5 all A8/B9/C8 literal rows (IDs start0), terminal/reset, wide rejection, sequence65534/epoch/half,
counter saturation MAX-1 -> MAX/false -> next attempt MAX/true and history row33 drop/progress.
Per turn <=1 producer phase, <=1 claim, <=4 actual reads, <=1 release, <=1 observe, <=2 status,
<=1 queue step/4 offers/4 service, <=4 sequence observations, <=5 receive, <=1 poll/4byte/5event/1command,
<=1 time_service/work1. Setup and independent single-module capability fixtures are explicitly separate.
Host stack scan/.su and fixed loops do not prove target ABI, call-chain stack, WCET or hardware timing.
Original RM/current-source/errata/electrical/concurrency/physical-paper limitations remain in the chapter.

BEGIN_CONSUMER_C
/******************************************************************************
 * Original embedded-notes teaching caller, 2026; no third-party ownership claim.
 * @file consumer.c
 * @author embedded-notes contributors
 * @brief Independent finite composition, not a hardware terminal driver.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#include "throughput-overload/throughput.h"
#include "throughput-overload/throughput.h"
#include "dma-ownership/dma.h"
#include "dma-ownership/dma.h"
#include "uart-framing/uart.h"
#include "uart-framing/uart.h"
#include "bounded-fifo/fifo.h"
#include "bounded-fifo/fifo.h"
#include "timer-pwm/time.h"
#include "timer-pwm/time.h"
#include <stdio.h>
#include <string.h>

static unsigned int g_failures;

/** @brief Keep every acceptance check active with NDEBUG.
 * @param[in] condition Required observable behavior.
 * @param[in] line Caller's source line, for diagnosis.
 * @return None. */
static void check(bool condition, int line)
{
    /**
    * Output errors also make the executable fail.
    **/
    if (!condition) {
        g_failures += 1U;
        if (fprintf(stderr, "FAIL consumer line %d\n", line) < 0) {
            g_failures += 1U;
        }
    }
}
#define CHECK(condition) check((condition), __LINE__)

/** @brief Compare complete copied acquisition records, ignoring padding.
 * @param[in] a First initialized record.
 * @param[in] b Second initialized record.
 * @return Whether every named member agrees. */
static bool same_record(ThroughputRecord a, ThroughputRecord b)
{
    /**
    * Wire arithmetic is independent of native object padding.
    **/
    return a.value == b.value && a.sourceId == b.sourceId && a.sequence == b.sequence &&
        a.sourceTime == b.sourceTime && a.epoch == b.epoch;
}

/** @brief Compare queue diagnostics including the sticky boundary indicator.
 * @param[in] a First initialized diagnostics.
 * @param[in] b Second initialized diagnostics.
 * @return Named-member equality. */
static bool same_diagnostics(ThroughputDiagnostics a, ThroughputDiagnostics b)
{
    /**
    * Counters that have saturated cannot be used for exact rates.
    **/
    return a.offered == b.offered && a.admitted == b.admitted && a.dropped == b.dropped &&
        a.departed == b.departed && a.historyDropped == b.historyDropped && a.saturated == b.saturated;
}

/** @brief Compare every named initialized queue member, including unused rows.
 * @param[in] a Live snapshot.
 * @param[in] b Live snapshot.
 * @return Named-member equality without padding access. */
static bool same_queue(const ThroughputState *a, const ThroughputState *b)
{
    size_t index;
    size_t item;
    /**
    * Preservation includes initialized stale slots and unused history fields.
    **/
    if (a->head != b->head || a->count != b->count || a->tick != b->tick || a->limit != b->limit ||
        a->historyEnabled != b->historyEnabled || a->historyCount != b->historyCount ||
        !same_diagnostics(a->diagnostics, b->diagnostics)) {
        return false;
    }
    for (index = 0U; index < TP_CAPACITY; index++) {
        if (!same_record(a->slots[index], b->slots[index])) {
            return false;
        }
    }
    for (index = 0U; index < TP_HISTORY_ROWS; index++) {
        const ThroughputHistoryRow *x = &a->history[index];
        const ThroughputHistoryRow *y = &b->history[index];
        if (x->tick != y->tick || x->offered != y->offered || x->dropped != y->dropped ||
            x->departed != y->departed || x->queuedCount != y->queuedCount) {
            return false;
        }
        for (item = 0U; item < TP_CAPACITY; item++) {
            if (x->queuedIds[item] != y->queuedIds[item]) {
                return false;
            }
        }
    }
    return true;
}

/** @brief Compare all report fields and all five fixed record lists.
 * @param[in] a Initialized result.
 * @param[in] b Initialized result.
 * @return Named-member equality. */
static bool same_report(const ThroughputReport *a, const ThroughputReport *b)
{
    size_t index;
    /**
    * All unused slots are part of the deterministic report contract.
    **/
    if (a->tick != b->tick || a->terminal != b->terminal || a->offeredCount != b->offeredCount ||
        a->admittedCount != b->admittedCount || a->droppedCount != b->droppedCount ||
        a->departedCount != b->departedCount || a->queuedCount != b->queuedCount ||
        !same_diagnostics(a->diagnostics, b->diagnostics)) {
        return false;
    }
    for (index = 0U; index < TP_CAPACITY; index++) {
        if (!same_record(a->offered[index], b->offered[index]) ||
            !same_record(a->admitted[index], b->admitted[index]) ||
            !same_record(a->dropped[index], b->dropped[index]) ||
            !same_record(a->departed[index], b->departed[index]) ||
            !same_record(a->queued[index], b->queued[index])) {
            return false;
        }
    }
    return true;
}

/** @brief Compare sequence diagnostics without comparing structure padding.
 * @param[in] a Initialized diagnostics.
 * @param[in] b Initialized diagnostics.
 * @return Named-member equality. */
static bool same_sequence_diagnostics(ThroughputSequenceDiagnostics a, ThroughputSequenceDiagnostics b)
{
    /**
    * Observed gaps and permanent loss have different meanings.
    **/
    return a.observations == b.observations && a.forward == b.forward && a.gaps == b.gaps &&
        a.duplicates == b.duplicates && a.older == b.older && a.ambiguous == b.ambiguous &&
        a.saturated == b.saturated;
}

/** @brief Compare a complete last-only observer snapshot.
 * @param[in] a Initialized observer.
 * @param[in] b Initialized observer.
 * @return Named-member equality. */
static bool same_sequence(ThroughputSequence a, ThroughputSequence b)
{
    /**
    * Last and epoch remain unchanged on a rejected observation.
    **/
    return a.epoch == b.epoch && a.last == b.last && a.seeded == b.seeded &&
        same_sequence_diagnostics(a.diagnostics, b.diagnostics);
}

/** @brief Compare the complete sequence output sentinel.
 * @param[in] a Initialized report.
 * @param[in] b Initialized report.
 * @return Named-member equality. */
static bool same_sequence_report(ThroughputSequenceReport a, ThroughputSequenceReport b)
{
    /**
    * Output freshness follows TP_OK, never a retained classification.
    **/
    return a.order == b.order && a.delta == b.delta && a.gap == b.gap && a.last == b.last &&
        same_sequence_diagnostics(a.diagnostics, b.diagnostics);
}

/** @brief Compare producer identities as three named scalar fields.
 * @param[in] a Initialized token.
 * @param[in] b Initialized token.
 * @return Exact identity equality. */
static bool same_token(DmaToken a, DmaToken b)
{
    /**
    * A slot alone cannot identify an instance.
    **/
    return a.run == b.run && a.block == b.block && a.slot == b.slot;
}

/** @brief Compare complete producer diagnostic snapshots.
 * @param[in] a Initialized diagnostics.
 * @param[in] b Initialized diagnostics.
 * @return Named-member equality. */
static bool same_dma_diagnostics(DmaDiagnostics a, DmaDiagnostics b)
{
    /**
    * Observed latches, copied items and releases stay distinct.
    **/
    return a.completed == b.completed && a.observedTc == b.observedTc && a.copiedItems == b.copiedItems &&
        a.released == b.released && a.lateReuse == b.lateReuse && a.transferErrors == b.transferErrors &&
        a.discardedReady == b.discardedReady && a.historyDropped == b.historyDropped && a.saturated == b.saturated;
}

/** @brief Compare every named producer report member.
 * @param[in] a Initialized report.
 * @param[in] b Initialized report.
 * @return Named-member equality. */
static bool same_dma_report(const DmaReport *a, const DmaReport *b)
{
    size_t index;
    /**
    * Reports carry no payload pointers or sample arrays.
    **/
    if (a->phase != b->phase || a->cause != b->cause || a->run != b->run || a->current != b->current ||
        a->ndtr != b->ndtr || a->stopValid != b->stopValid || a->stopConfirmed != b->stopConfirmed ||
        a->ht != b->ht || a->tc != b->tc || a->leasePresent != b->leasePresent ||
        !same_token(a->lease, b->lease) || !same_dma_diagnostics(a->diagnostics, b->diagnostics)) {
        return false;
    }
    for (index = 0U; index < DMA_BLOCKS; index++) {
        if (a->descriptors[index].owner != b->descriptors[index].owner ||
            a->descriptors[index].valid != b->descriptors[index].valid ||
            !same_token(a->descriptors[index].token, b->descriptors[index].token)) {
            return false;
        }
    }
    return true;
}

/** @brief Compare all initialized producer state members after rejection.
 * @param[in] a Initialized state.
 * @param[in] b Saved state.
 * @return Named-member equality, no padding comparison. */
static bool same_dma(const DmaState *a, const DmaState *b)
{
    size_t index;
    size_t item;
    /**
    * State copies are diagnostic snapshots; they are never reinitialized or run.
    **/
    if (a->phase != b->phase || a->cause != b->cause || a->run != b->run || a->nextRun != b->nextRun ||
        a->nextBlock != b->nextBlock || a->current != b->current || a->ndtr != b->ndtr ||
        a->stopValid != b->stopValid || a->runExhausted != b->runExhausted ||
        a->blockExhausted != b->blockExhausted || a->ht != b->ht || a->tc != b->tc ||
        a->leasePresent != b->leasePresent || a->historyEnabled != b->historyEnabled ||
        !same_token(a->lease, b->lease) || !same_dma_diagnostics(a->diagnostics, b->diagnostics) ||
        a->historyCount != b->historyCount) {
        return false;
    }
    for (index = 0U; index < DMA_BLOCKS; index++) {
        const DmaDescriptor *x = &a->blocks[index].descriptor;
        const DmaDescriptor *y = &b->blocks[index].descriptor;
        if (x->owner != y->owner || x->valid != y->valid || !same_token(x->token, y->token)) {
            return false;
        }
        for (item = 0U; item < DMA_ITEMS; item++) {
            if (a->blocks[index].items[item] != b->blocks[index].items[item]) {
                return false;
            }
        }
    }
    for (index = 0U; index < DMA_HISTORY_ROWS; index++) {
        const DmaHistoryRow *x = &a->history[index];
        const DmaHistoryRow *y = &b->history[index];
        if (x->status != y->status || x->phase != y->phase || x->run != y->run ||
            x->slot != y->slot || x->valid != y->valid) {
            return false;
        }
    }
    return true;
}

typedef struct {
    bool reserved;
    DmaToken token;
    bool present[DMA_ITEMS];
    ThroughputInput labels[DMA_ITEMS];
} LabelBank;
typedef struct {
    DmaState dma;
    ThroughputState queue;
    ThroughputSequence sequence;
    UartState uart;
    TimeState time;
    LabelBank banks[DMA_BLOCKS];
    DmaReport snapshot;
    ThroughputReport queueReport;
    DmaToken held;
    bool hasHeld;
    uint64_t nextSource;
    uint32_t acquired;
    uint32_t copied;
    uint32_t releases;
} Application;
typedef enum {
    PH_NONE = 0, PH_START, PH_PUSH, PH_COMPLETE, PH_BEGIN, PH_STOP, PH_CONFIRM, PH_RECOVER
} ProducerPhase;
typedef enum {
    COPY_NORMAL = 0, COPY_DEFER, COPY_HOLD, COPY_INSPECT_RELEASE
} CopyPolicy;
typedef struct {
    ProducerPhase phase;
    uint32_t sample;
    uint32_t sourceTime;
    uint32_t now;
    uint32_t service;
    CopyPolicy copy;
    DmaStatus expected;
    bool statusCommand;
    bool observe;
} Turn;
typedef struct {
    uint32_t producer;
    uint32_t claim;
    uint32_t reads;
    uint32_t release;
    uint32_t observe;
    uint32_t snapshots;
    uint32_t offers;
    uint32_t departed;
    uint32_t sequence;
    uint32_t receives;
    uint32_t polls;
    uint32_t timeCalls;
} Work;

/** @brief Initialize one fresh separate application lifetime domain exactly once.
 * @param[out] app Fresh static object, not an old fixture reused as reset.
 * @return Whether every real module accepted initialization. */
static bool app_init(Application *app)
{
    /**
    * Banks contain only copied fake acquisition labels, never producer storage.
    **/
    memset(app, 0, sizeof(*app));
    app->nextSource = 1U;
    return dma_init(&app->dma, DMA_FIXTURE_NORMAL, true) == DMA_OK &&
        throughput_init(&app->queue, 128U, TP_FIXTURE_NORMAL, true) == TP_OK &&
        throughput_sequence_init(&app->sequence, 1U, TP_FIXTURE_NORMAL) == TP_OK &&
        uart_init(&app->uart, 100U, 0U) == UART_OK && time_init(&app->time, 10U, 0U) == TIME_OK &&
        dma_status(&app->dma, &app->snapshot) == DMA_OK;
}

/** @brief Reserve a physical bank only after successful start/begin allocation.
 * @param[in,out] app Initialized application.
 * @return Whether the returned actual writer token can own its empty bank. */
static bool reserve_bank(Application *app)
{
    uint32_t slot = app->snapshot.current;
    LabelBank *bank = &app->banks[slot];
    const DmaDescriptor *descriptor = &app->snapshot.descriptors[slot];
    /**
    * A live READY/CONSUMER bank can never be replaced to hide a mismatch.
    **/
    if (bank->reserved || descriptor->owner != DMA_WRITER || descriptor->valid != 0U) {
        return false;
    }
    *bank = (LabelBank){0};
    bank->reserved = true;
    bank->token = descriptor->token;
    return true;
}

/** @brief Supply at most one explicit actual producer phase this turn.
 * @param[in,out] app Initialized application and previous real snapshot.
 * @param[in] turn One fixed scripted event.
 * @param[in,out] work Per-turn logical-call accounting.
 * @return Whether actual status, metadata capture and allocation match the script. */
static bool producer_phase(Application *app, const Turn *turn, Work *work)
{
    DmaStatus status = DMA_OK;
    DmaReport report = app->snapshot;
    DmaToken token = app->snapshot.descriptors[app->snapshot.current].token;
    uint32_t slot = app->snapshot.current;
    uint32_t index = app->snapshot.descriptors[slot].valid;
    ThroughputInput staged = {turn->sample, app->nextSource,
        (app->nextSource - 1U) % UINT64_C(65536), turn->sourceTime, 1U};
    bool stagePresent = false;
    /**
    * Labels are staged before push; only OK commits exactly one acquisition.
    **/
    if (turn->phase == PH_NONE) {
        return true;
    }
    work->producer += 1U;
    if (turn->phase == PH_PUSH && turn->sample <= UINT16_MAX &&
        app->snapshot.phase == DMA_RUNNING && index < DMA_ITEMS) {
        LabelBank *bank = &app->banks[slot];
        if (!bank->reserved || !same_token(bank->token, token) || bank->present[index] ||
            app->nextSource > UINT32_MAX) {
            return false;
        }
        stagePresent = true;
    }
    switch (turn->phase) {
        case PH_START:
            status = dma_start(&app->dma, &report);
            break;
        case PH_PUSH:
            status = dma_push(&app->dma, turn->sample, &report);
            break;
        case PH_COMPLETE:
            status = dma_complete(&app->dma, &token, &report);
            break;
        case PH_BEGIN:
            status = dma_begin_next(&app->dma, &report);
            break;
        case PH_STOP:
            status = dma_request_stop(&app->dma, DMA_CAUSE_USER, &report);
            break;
        case PH_CONFIRM:
            status = dma_confirm_stop(&app->dma, &report);
            break;
        case PH_RECOVER:
            status = dma_recover(&app->dma, &report);
            break;
        default:
            return false;
    }
    if (status != turn->expected) {
        return false;
    }
    if (status == DMA_OK || status == DMA_LATE_REUSE || status == DMA_TRANSFER_ERROR) {
        app->snapshot = report;
    }
    if (turn->phase == PH_PUSH && status == DMA_OK) {
        if (!stagePresent) {
            return false;
        }
        app->banks[slot].labels[index] = staged;
        app->banks[slot].present[index] = true;
        app->nextSource += 1U;
        app->acquired += 1U;
    }
    if ((turn->phase == PH_START || turn->phase == PH_BEGIN) && status == DMA_OK) {
        return reserve_bank(app);
    }
    if (turn->phase == PH_RECOVER && status == DMA_OK) {
        memset(app->banks, 0, sizeof(app->banks));
    }
    return true;
}

/** @brief Copy actual read values with matching acquisition-event labels.
 * @param[in,out] app Initialized application.
 * @param[in] token Matching newly claimed full block.
 * @param[out] offered Four disjoint staged records owned by this turn.
 * @param[in,out] work Current turn budgets.
 * @return Whether all actual reads and the matching release succeeded. */
static bool copy_block(Application *app, const DmaToken *token, ThroughputInput offered[TP_CAPACITY], Work *work)
{
    size_t index;
    LabelBank *bank = &app->banks[token->slot];
    /**
    * No sample comes from state.items or a canned block; release follows four reads.
    **/
    if (!bank->reserved || !same_token(bank->token, *token)) {
        return false;
    }
    for (index = 0U; index < DMA_ITEMS; index++) {
        uint16_t value = 0U;
        if (!bank->present[index]) {
            return false;
        }
        work->reads += 1U;
        if (dma_read(&app->dma, token, (uint32_t)index, &value) != DMA_OK) {
            return false;
        }
        offered[index] = bank->labels[index];
        offered[index].value = value;
        app->copied += 1U;
    }
    work->release += 1U;
    if (dma_release(&app->dma, token) != DMA_OK) {
        return false;
    }
    app->releases += 1U;
    *bank = (LabelBank){0};
    work->offers = DMA_ITEMS;
    return true;
}

/** @brief Apply normal READY copying or the explicitly named held-A diagnostic.
 * @param[in,out] app Initialized application.
 * @param[in] policy Fixed normal/defer/hold/inspect choice.
 * @param[out] offered Turn-owned copied list.
 * @param[in,out] work Current turn budgets.
 * @return Whether every attempted actual consumer operation succeeded. */
static bool consume(Application *app, CopyPolicy policy, ThroughputInput offered[TP_CAPACITY], Work *work)
{
    DmaToken token = {0};
    bool ready = false;
    size_t slot;
    /**
    * Ordinary READY eligibility does not depend on RUNNING versus stopped phase.
    **/
    if (policy == COPY_INSPECT_RELEASE) {
        uint16_t value = 0U;
        work->reads += 1U;
        if (!app->hasHeld || dma_read(&app->dma, &app->held, 1U, &value) != DMA_OK || value != 11U) {
            return false;
        }
        work->release += 1U;
        if (dma_release(&app->dma, &app->held) != DMA_OK) {
            return false;
        }
        app->banks[app->held.slot] = (LabelBank){0};
        app->hasHeld = false;
        app->releases += 1U;
        return true;
    }
    if (policy == COPY_DEFER || app->hasHeld) {
        return true;
    }
    for (slot = 0U; slot < DMA_BLOCKS; slot++) {
        ready = ready || app->snapshot.descriptors[slot].owner == DMA_READY;
    }
    if (!ready || app->snapshot.leasePresent) {
        return true;
    }
    work->claim += 1U;
    if (dma_claim(&app->dma, &token) != DMA_OK) {
        return false;
    }
    if (policy == COPY_HOLD) {
        app->held = token;
        app->hasHeld = true;
        return true;
    }
    return copy_block(app, &token, offered, work);
}

/** @brief Parse a real bounded status command and service real periodic time.
 * @param[in,out] app Initialized modules.
 * @param[in] turn Current monotonic service label and optional status bytes.
 * @param[in,out] work Current turn budgets.
 * @return Whether actual parsed command/work limits match expectations. */
static bool service_terminal(Application *app, const Turn *turn, Work *work)
{
    static const uint16_t bytes[4] = {0xA5U, 1U, 2U, 3U};
    UartReport report;
    UartCommand command = {UART_SET_PERIOD, 555U};
    TimeReport timeReport;
    size_t index;
    /**
    * The existing parser accepts these bytes; no command is preaccepted by the caller.
    **/
    if (turn->statusCommand) {
        for (index = 0U; index < 4U; index++) {
            UartIngress ingress;
            work->receives += 1U;
            if (uart_receive(&app->uart, bytes[index], &ingress) != UART_OK) {
                return false;
            }
        }
    }
    work->polls += 1U;
    if (uart_poll(&app->uart, turn->now, &report, &command) != UART_OK ||
        report.consumed > 4U || report.eventCount > 5U || report.commandPresent != turn->statusCommand) {
        return false;
    }
    if (report.commandPresent && (command.kind != UART_GET_STATUS || command.periodMs != 100U)) {
        return false;
    }
    work->timeCalls += 1U;
    if (time_service(&app->time, turn->now, &timeReport) != TIME_OK ||
        (timeReport.work && timeReport.releases == 0U)) {
        return false;
    }
    return true;
}

/** @brief Execute one bounded non-atomic caller turn using real module calls.
 * @param[in,out] app Initialized exclusive application.
 * @param[in] turn Fixed scripted event/service choice.
 * @return Whether all module outcomes and budgets hold. */
static bool app_turn(Application *app, Turn turn)
{
    Work work = {0};
    ThroughputInput offered[TP_CAPACITY] = {{0}};
    size_t index;
    /**
    * Each component commits independently; failure here never invents rollback.
    **/
    if (!producer_phase(app, &turn, &work)) {
        return false;
    }
    if (turn.observe) {
        work.observe += 1U;
        if (dma_observe(&app->dma, true, &app->snapshot) != DMA_OK) {
            return false;
        }
    }
    work.snapshots += 1U;
    if (dma_status(&app->dma, &app->snapshot) != DMA_OK || !consume(app, turn.copy, offered, &work)) {
        return false;
    }
    if (throughput_step(&app->queue, offered, work.offers, turn.service, &app->queueReport) != TP_OK) {
        return false;
    }
    work.departed = app->queueReport.departedCount;
    for (index = 0U; index < work.departed; index++) {
        ThroughputSequenceReport observed;
        const ThroughputRecord *record = &app->queueReport.departed[index];
        work.sequence += 1U;
        if (throughput_sequence_observe(&app->sequence, record->epoch, record->sequence, &observed) != TP_OK) {
            return false;
        }
    }
    if (!service_terminal(app, &turn, &work)) {
        return false;
    }
    work.snapshots += 1U;
    if (dma_status(&app->dma, &app->snapshot) != DMA_OK) {
        return false;
    }
    return work.producer <= 1U && work.observe <= 1U && work.snapshots <= 2U && work.claim <= 1U &&
        work.reads <= 4U && work.release <= 1U && work.offers <= 4U && turn.service <= 4U &&
        work.departed <= 4U && work.sequence <= 4U && work.receives <= 5U &&
        work.polls <= 1U && work.timeCalls <= 1U;
}

/** @brief Run actual two-block handoff, queue backlog/drop and status while active/stopped.
 * @return None. */
static void normal_composition(void)
{
    static Application app;
    static const Turn turns[] = {
        {PH_START,0U,0U,0U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_PUSH,10U,0U,0U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_PUSH,11U,10U,10U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_PUSH,12U,20U,20U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_PUSH,13U,30U,30U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_COMPLETE,0U,0U,31U,1U,COPY_NORMAL,DMA_OK,false,true},
        {PH_BEGIN,0U,0U,32U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_PUSH,20U,40U,40U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_PUSH,21U,50U,50U,0U,COPY_NORMAL,DMA_OK,true,false},
        {PH_PUSH,22U,60U,60U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_PUSH,23U,70U,70U,0U,COPY_NORMAL,DMA_OK,false,false},
        {PH_COMPLETE,0U,0U,71U,1U,COPY_NORMAL,DMA_OK,true,false},
        {PH_STOP,0U,0U,72U,1U,COPY_NORMAL,DMA_OK,true,false},
        {PH_CONFIRM,0U,0U,73U,1U,COPY_NORMAL,DMA_OK,true,false},
        {PH_NONE,0U,0U,74U,1U,COPY_NORMAL,DMA_OK,true,false}
    };
    size_t index;
    /**
    * Every source time is supplied at push, independent of later claim/service.
    **/
    CHECK(app_init(&app));
    for (index = 0U; index < sizeof turns / sizeof turns[0]; index++) {
        CHECK(app_turn(&app, turns[index]));
        if (index == 4U) {
            CHECK(app.snapshot.ndtr == 0U && app.snapshot.descriptors[0].owner == DMA_WRITER &&
                app.snapshot.descriptors[0].valid == 4U && !app.snapshot.tc);
        }
        if (index == 5U) {
            CHECK(app.queueReport.departed[0].value == 10U && app.queueReport.queuedCount == 3U &&
                app.queueReport.queued[0].value == 11U && app.queueReport.queued[2].value == 13U &&
                app.snapshot.phase == DMA_BOUNDARY && app.snapshot.ndtr == 4U);
        }
        if (index == 8U) {
            CHECK(app.snapshot.phase == DMA_RUNNING && app.queueReport.queuedCount == 3U &&
                app.queueReport.queued[0].sourceTime == 10U);
        }
        if (index == 11U) {
            CHECK(app.snapshot.phase == DMA_BOUNDARY && app.queueReport.droppedCount == 3U &&
                app.queueReport.dropped[0].sourceId == 6U && app.queueReport.dropped[2].sourceId == 8U &&
                app.queueReport.dropped[0].value == 21U && app.queueReport.dropped[2].sourceTime == 70U &&
                app.queueReport.departed[0].value == 11U && app.queueReport.queued[2].value == 20U);
        }
    }
    CHECK(app.acquired == 8U && app.nextSource == 9U && app.copied == 8U && app.releases == 2U &&
        app.snapshot.diagnostics.completed == 2U && app.snapshot.diagnostics.copiedItems == 8U &&
        app.queueReport.diagnostics.offered == 8U && app.queueReport.diagnostics.admitted == 5U &&
        app.queueReport.diagnostics.dropped == 3U && app.queueReport.diagnostics.departed == 5U &&
        app.queueReport.queuedCount == 0U && app.snapshot.phase == DMA_STOP_CONFIRMED);
}

/** @brief Hold A deliberately, reject unsafe recovery, then release/recover/start.
 * @return None. */
static void late_composition(void)
{
    static Application app;
    static const Turn setup[] = {
        {PH_START,0U,0U,0U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,10U,0U,1U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,11U,10U,2U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,12U,20U,3U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,13U,30U,4U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_COMPLETE,0U,0U,5U,0U,COPY_HOLD,DMA_OK,true,false},
        {PH_BEGIN,0U,0U,6U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,20U,40U,7U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,21U,50U,8U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,22U,60U,9U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_PUSH,23U,70U,10U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_COMPLETE,0U,0U,11U,0U,COPY_DEFER,DMA_OK,false,false},
        {PH_BEGIN,0U,0U,12U,0U,COPY_DEFER,DMA_LATE_REUSE,true,false}
    };
    DmaState before;
    DmaReport output;
    DmaReport saved;
    DmaToken oldA;
    DmaToken oldB;
    uint16_t sample = 555U;
    size_t index;
    /**
    * This diagnostic deliberately disables ordinary consumption for named turns.
    **/
    CHECK(app_init(&app));
    for (index = 0U; index < sizeof setup / sizeof setup[0]; index++) {
        CHECK(app_turn(&app, setup[index]));
    }
    oldA = app.held;
    oldB = app.snapshot.descriptors[1].token;
    CHECK(app.snapshot.phase == DMA_STOP_REQUESTED && app.snapshot.cause == DMA_CAUSE_LATE &&
        app.snapshot.stopValid == 0U && app.snapshot.diagnostics.lateReuse == 1U &&
        app.snapshot.diagnostics.transferErrors == 0U && app.snapshot.diagnostics.completed == 2U &&
        app.snapshot.descriptors[0].owner == DMA_CONSUMER && app.snapshot.descriptors[1].owner == DMA_READY &&
        app.snapshot.diagnostics.copiedItems == 0U && app.snapshot.diagnostics.released == 0U);
    before = app.dma;
    CHECK(app_turn(&app, (Turn){PH_PUSH,30U,80U,13U,0U,COPY_DEFER,DMA_NOT_RUNNING,true,false}));
    CHECK(same_dma(&app.dma, &before) && app.acquired == 8U && app.nextSource == 9U &&
        app.banks[0].labels[0].value == 10U && app.dma.blocks[0].items[0] == 10U);
    CHECK(app_turn(&app, (Turn){PH_RECOVER,0U,0U,14U,0U,COPY_DEFER,DMA_BUSY,true,false}));
    CHECK(same_dma(&app.dma, &before));
    CHECK(app_turn(&app, (Turn){PH_CONFIRM,0U,0U,15U,0U,COPY_DEFER,DMA_OK,true,false}));
    before = app.dma;
    CHECK(app_turn(&app, (Turn){PH_RECOVER,0U,0U,16U,0U,COPY_DEFER,DMA_BUSY,true,false}));
    CHECK(same_dma(&app.dma, &before));
    CHECK(app_turn(&app, (Turn){PH_NONE,0U,0U,17U,0U,COPY_INSPECT_RELEASE,DMA_OK,true,false}));
    CHECK(app.snapshot.phase == DMA_STOP_CONFIRMED && app.snapshot.descriptors[0].owner == DMA_FREE &&
        app.snapshot.descriptors[1].owner == DMA_READY && app.queueReport.diagnostics.offered == 0U);
    CHECK(app_turn(&app, (Turn){PH_RECOVER,0U,0U,18U,0U,COPY_DEFER,DMA_OK,true,false}));
    CHECK(app.snapshot.run == 2U && app.snapshot.phase == DMA_IDLE && app.snapshot.current == 0U &&
        app.snapshot.ndtr == 4U && !app.snapshot.ht && !app.snapshot.tc && app.snapshot.stopValid == 0U &&
        app.snapshot.diagnostics.discardedReady == 1U && app.dma.nextBlock == 3U &&
        !app.banks[0].reserved && !app.banks[1].reserved && app.acquired == 8U);
    before = app.dma;
    output = app.snapshot;
    saved = output;
    CHECK(dma_complete(&app.dma, &oldB, &output) == DMA_STALE_TOKEN &&
        same_dma(&app.dma, &before) && same_dma_report(&output, &saved));
    CHECK(dma_read(&app.dma, &oldA, 0U, &sample) == DMA_STALE_TOKEN && sample == 555U &&
        dma_release(&app.dma, &oldA) == DMA_STALE_TOKEN && same_dma(&app.dma, &before));
    CHECK(app_turn(&app, (Turn){PH_START,0U,0U,19U,0U,COPY_NORMAL,DMA_OK,true,false}));
    CHECK(app.snapshot.descriptors[0].token.run == 2U && app.snapshot.descriptors[0].token.block == 3U &&
        app.snapshot.descriptors[0].valid == 0U && app.acquired == 8U);
    CHECK(app_turn(&app, (Turn){PH_STOP,0U,0U,20U,0U,COPY_NORMAL,DMA_OK,false,false}));
    CHECK(app_turn(&app, (Turn){PH_CONFIRM,0U,0U,21U,0U,COPY_NORMAL,DMA_OK,false,false}));
}

/** @brief Demonstrate ordinary copying from READY in either stopped phase.
 * @param[in,out] app Distinct fresh fixture domain.
 * @param[in] confirmed Whether setup includes independent stop confirmation.
 * @return None. */
static void stopped_ready(Application *app, bool confirmed)
{
    uint32_t index;
    /**
    * Only these explicitly listed setup turns defer ordinary READY consumption.
    **/
    CHECK(app_init(app));
    CHECK(app_turn(app, (Turn){PH_START,0U,0U,0U,0U,COPY_DEFER,DMA_OK,false,false}));
    for (index = 0U; index < 4U; index++) {
        CHECK(app_turn(app, (Turn){PH_PUSH,10U + index,index * 10U,index + 1U,0U,
            COPY_DEFER,DMA_OK,false,false}));
    }
    CHECK(app_turn(app, (Turn){PH_COMPLETE,0U,0U,5U,0U,COPY_DEFER,DMA_OK,false,false}));
    CHECK(app_turn(app, (Turn){PH_STOP,0U,0U,6U,0U,COPY_DEFER,DMA_OK,true,false}));
    if (confirmed) {
        CHECK(app_turn(app, (Turn){PH_CONFIRM,0U,0U,7U,0U,COPY_DEFER,DMA_OK,true,false}));
    }
    CHECK(app_turn(app, (Turn){PH_NONE,0U,0U,8U,4U,COPY_NORMAL,DMA_OK,true,false}));
    CHECK(app->copied == 4U && app->releases == 1U && app->queueReport.departedCount == 4U &&
        app->queueReport.departed[0].value == 10U && app->queueReport.departed[3].value == 13U &&
        app->snapshot.phase == (confirmed ? DMA_STOP_CONFIRMED : DMA_STOP_REQUESTED));
    if (!confirmed) {
        CHECK(app_turn(app, (Turn){PH_CONFIRM,0U,0U,9U,0U,COPY_NORMAL,DMA_OK,false,false}));
    }
}

typedef struct {
    uint32_t count;
    uint32_t arrivals[4];
    uint32_t service;
    uint32_t departures;
    uint32_t departed[4];
    uint32_t drops;
    uint32_t dropped[4];
    uint32_t queued;
    uint32_t queue[4];
} LiteralRow;
static const LiteralRow g_a[8] = {
    {4,{0,1,2,3},1,1,{0},0,{0},3,{1,2,3}},
    {4,{4,5,6,7},1,1,{1},3,{5,6,7},3,{2,3,4}},
    {0,{0},1,1,{2},0,{0},2,{3,4}},
    {0,{0},1,1,{3},0,{0},1,{4}},
    {0,{0},1,1,{4},0,{0},0,{0}},
    {0,{0},1,0,{0},0,{0},0,{0}},
    {0,{0},1,0,{0},0,{0},0,{0}},
    {0,{0},1,0,{0},0,{0},0,{0}}
};
static const LiteralRow g_b[9] = {
    {2,{0,1},1,1,{0},0,{0},1,{1}},
    {2,{2,3},1,1,{1},0,{0},2,{2,3}},
    {2,{4,5},1,1,{2},0,{0},3,{3,4,5}},
    {2,{6,7},1,1,{3},1,{7},3,{4,5,6}},
    {2,{8,9},1,1,{4},1,{9},3,{5,6,8}},
    {2,{10,11},1,1,{5},1,{11},3,{6,8,10}},
    {0,{0},1,1,{6},0,{0},2,{8,10}},
    {0,{0},1,1,{8},0,{0},1,{10}},
    {0,{0},1,1,{10},0,{0},0,{0}}
};
static const LiteralRow g_c[8] = {
    {1,{0},0,0,{0},0,{0},1,{0}},
    {1,{1},0,0,{0},0,{0},2,{0,1}},
    {1,{2},0,0,{0},0,{0},3,{0,1,2}},
    {1,{3},0,0,{0},0,{0},4,{0,1,2,3}},
    {1,{4},0,0,{0},1,{4},4,{0,1,2,3}},
    {1,{5},4,4,{0,1,2,3},1,{5},0,{0}},
    {1,{6},4,1,{6},0,{0},0,{0}},
    {1,{7},0,0,{0},0,{0},1,{7}}
};

/** @brief Verify every mathematical literal row through the actual public queue.
 * @param[in] rows Independent frozen handwritten row list.
 * @param[in] count Exact finite trace endpoint.
 * @param[in] offered Literal total.
 * @param[in] admitted Literal total.
 * @param[in] departed Literal total.
 * @param[in] dropped Literal total.
 * @return None. */
static void literal_trace(const LiteralRow *rows, size_t count, uint32_t offered,
    uint32_t admitted, uint32_t departed, uint32_t dropped)
{
    ThroughputState state;
    ThroughputState before;
    ThroughputReport report;
    ThroughputReport saved;
    size_t index;
    size_t item;
    const ThroughputRecord zero = {0};
    /**
    * A/B/C are independent mathematical schedules, not the one-item DMA schedule.
    **/
    CHECK(throughput_init(&state, count, TP_FIXTURE_NORMAL, true) == TP_OK);
    for (index = 0U; index < count; index++) {
        const LiteralRow *row = &rows[index];
        ThroughputInput input[4] = {{0}};
        for (item = 0U; item < row->count; item++) {
            uint32_t id = row->arrivals[item];
            input[item] = (ThroughputInput){100U + id,id,id,id * 10U,1U};
        }
        CHECK(throughput_step(&state, input, row->count, row->service, &report) == TP_OK);
        CHECK(report.tick == index && report.offeredCount == row->count && report.droppedCount == row->drops &&
            report.departedCount == row->departures && report.queuedCount == row->queued);
        for (item = 0U; item < TP_CAPACITY; item++) {
            CHECK(item < row->departures ? report.departed[item].sourceId == row->departed[item] :
                same_record(report.departed[item], zero));
            CHECK(item < row->drops ? report.dropped[item].sourceId == row->dropped[item] :
                same_record(report.dropped[item], zero));
            CHECK(item < row->queued ? report.queued[item].sourceId == row->queue[item] :
                same_record(report.queued[item], zero));
            if (item >= report.offeredCount) {
                CHECK(same_record(report.offered[item], zero));
            }
            if (item >= report.admittedCount) {
                CHECK(same_record(report.admitted[item], zero));
            }
        }
    }
    CHECK(report.terminal && report.diagnostics.offered == offered && report.diagnostics.admitted == admitted &&
        report.diagnostics.departed == departed && report.diagnostics.dropped == dropped &&
        offered == departed + dropped + report.queuedCount);
    before = state;
    saved = report;
    CHECK(throughput_step(&state, NULL, 0U, 4U, &report) == TP_TERMINAL &&
        same_queue(&state, &before) && same_report(&report, &saved));
    CHECK(throughput_reset(&state) == TP_OK && state.count == 0U && state.tick == 0U &&
        state.diagnostics.offered == 0U && state.historyCount == 0U);
}

/** @brief Verify all checked wide inputs preserve queue and output snapshots.
 * @return None. */
static void queue_rejections(void)
{
    ThroughputState state;
    ThroughputState before;
    ThroughputReport report = {.tick=777U,.terminal=true};
    ThroughputReport saved = report;
    ThroughputInput input = {65535U,0U,65535U,UINT32_MAX,1U};
    ThroughputInput invalid[5] = {
        {65536U,0U,0U,0U,1U}, {1U,UINT64_C(4294967296),0U,0U,1U},
        {1U,0U,65536U,0U,1U}, {1U,0U,0U,UINT64_C(4294967296),1U}, {1U,0U,0U,0U,0U}
    };
    size_t index;
    /**
    * No invalid input is narrowed into an accidentally accepted value.
    **/
    CHECK(throughput_init(&state, 8U, TP_FIXTURE_NORMAL, true) == TP_OK);
    before = state;
    CHECK(throughput_init(&state, 0U, TP_FIXTURE_NORMAL, true) == TP_INVALID_ARGUMENT &&
        throughput_init(&state, UINT64_C(4294967296), TP_FIXTURE_NORMAL, true) == TP_INVALID_ARGUMENT &&
        throughput_init(&state, 8U, (ThroughputFixture)99, true) == TP_INVALID_ARGUMENT);
    for (index = 0U; index < 5U; index++) {
        CHECK(throughput_step(&state, &invalid[index], 1U, 1U, &report) == TP_INVALID_ARGUMENT &&
            same_queue(&state, &before) && same_report(&report, &saved));
    }
    CHECK(throughput_step(&state, &input, 5U, 0U, &report) == TP_INVALID_ARGUMENT &&
        throughput_step(&state, &input, 1U, 5U, &report) == TP_INVALID_ARGUMENT &&
        throughput_step(&state, NULL, 1U, 0U, &report) == TP_INVALID_ARGUMENT &&
        throughput_step(&state, &input, 1U, 0U, NULL) == TP_INVALID_ARGUMENT &&
        throughput_step(NULL, &input, 1U, 0U, &report) == TP_INVALID_ARGUMENT &&
        same_queue(&state, &before) && same_report(&report, &saved));
    CHECK(throughput_step(&state, &input, 1U, 1U, &report) == TP_OK &&
        report.departed[0].value == 65535U && report.departed[0].sourceId == 0U &&
        report.departed[0].sourceTime == UINT32_MAX);
}

/** @brief Verify finite history and exact counter saturation through fresh fixtures.
 * @return None. */
static void queue_limits(void)
{
    static ThroughputState counter;
    static ThroughputState history;
    ThroughputReport report;
    ThroughputInput input = {1U,0U,0U,0U,1U};
    ThroughputHistoryRow first;
    size_t index;
    /**
    * Counter and history are separate fresh lifetime domains, never reinitialized.
    **/
    CHECK(throughput_init(&counter, 4U, TP_FIXTURE_COUNTER_EDGE, false) == TP_OK &&
        throughput_step(&counter, &input, 1U, 1U, &report) == TP_OK &&
        report.diagnostics.offered == UINT32_MAX && report.diagnostics.admitted == UINT32_MAX &&
        report.diagnostics.departed == UINT32_MAX && !report.diagnostics.saturated);
    CHECK(throughput_step(&counter, &input, 1U, 1U, &report) == TP_OK && report.diagnostics.saturated &&
        report.diagnostics.offered == UINT32_MAX);
    CHECK(throughput_init(&history, 40U, TP_FIXTURE_NORMAL, true) == TP_OK);
    for (index = 0U; index < 32U; index++) {
        CHECK(throughput_step(&history, NULL, 0U, 0U, &report) == TP_OK);
    }
    first = history.history[0];
    CHECK(throughput_step(&history, &input, 1U, 1U, &report) == TP_OK && history.historyCount == 32U &&
        report.departedCount == 1U && history.tick == 33U && history.diagnostics.historyDropped == 1U &&
        history.history[0].tick == first.tick && history.history[0].queuedIds[0] == first.queuedIds[0]);
}

/** @brief Verify fixed sequence classifications, epoch rejection and edge deltas.
 * @return None. */
static void sequence_cases(void)
{
    static ThroughputSequence state;
    static ThroughputSequence edge;
    static ThroughputSequence saturation;
    ThroughputSequence before;
    ThroughputSequenceReport report;
    ThroughputSequenceReport saved;
    static const uint32_t input[7] = {65535U,0U,0U,3U,2U,32771U,4U};
    static const ThroughputOrder order[7] = {TP_FORWARD,TP_FORWARD,TP_DUPLICATE,TP_FORWARD,
        TP_OLDER,TP_AMBIGUOUS,TP_FORWARD};
    static const uint32_t last[7] = {65535U,0U,0U,3U,3U,3U,4U};
    size_t index;
    /**
    * The literal last65534 table is independent of the comparison implementation.
    **/
    CHECK(throughput_sequence_init(&state, 1U, TP_FIXTURE_NORMAL) == TP_OK &&
        throughput_sequence_observe(&state, 1U, 65534U, &report) == TP_OK && report.order == TP_SEEDED);
    for (index = 0U; index < 7U; index++) {
        CHECK(throughput_sequence_observe(&state, 1U, input[index], &report) == TP_OK &&
            report.order == order[index] && report.last == last[index]);
        if (index == 3U) {
            CHECK(report.gap == 2U && report.delta == 3U);
        }
    }
    before = state;
    saved = report;
    CHECK(throughput_sequence_observe(&state, 2U, 5U, &report) == TP_EPOCH_REJECTED &&
        throughput_sequence_observe(&state, 0U, 5U, &report) == TP_INVALID_ARGUMENT &&
        throughput_sequence_observe(&state, 1U, 65536U, &report) == TP_INVALID_ARGUMENT &&
        same_sequence(state, before) && same_sequence_report(report, saved));
    CHECK(throughput_sequence_init(&edge, 1U, TP_FIXTURE_NORMAL) == TP_OK &&
        throughput_sequence_observe(&edge, 1U, 0U, &report) == TP_OK && report.order == TP_SEEDED &&
        throughput_sequence_observe(&edge, 1U, 32768U, &report) == TP_OK && report.order == TP_AMBIGUOUS &&
        throughput_sequence_observe(&edge, 1U, 32769U, &report) == TP_OK && report.order == TP_OLDER &&
        throughput_sequence_observe(&edge, 1U, 32767U, &report) == TP_OK &&
        report.order == TP_FORWARD && report.gap == 32766U);
    CHECK(throughput_sequence_init(&saturation, 1U, TP_FIXTURE_COUNTER_EDGE) == TP_OK &&
        throughput_sequence_observe(&saturation, 1U, 0U, &report) == TP_OK &&
        report.diagnostics.observations == UINT32_MAX && !report.diagnostics.saturated &&
        throughput_sequence_observe(&saturation, 1U, 0U, &report) == TP_OK &&
        report.diagnostics.observations == UINT32_MAX && report.diagnostics.saturated &&
        report.diagnostics.duplicates == UINT32_MAX);
}

/** @brief Verify original UART FULL/flush, command freshness, timeout and time policy.
 * @return None. */
static void uart_time_cases(void)
{
    UartState uart;
    UartState timeout;
    UartIngress ingress;
    UartReport report;
    UartCommand command = {UART_SET_PERIOD,555U};
    TimeState time;
    TimeState wrap;
    TimeReport timeReport;
    uint32_t elapsed = 777U;
    static const uint16_t bytes[4] = {0xA5U,1U,2U,3U};
    size_t index;
    /**
    * Four queued status bytes were never accepted before the fifth caused loss.
    **/
    CHECK(uart_init(&uart, 100U, 0U) == UART_OK);
    for (index = 0U; index < 4U; index++) {
        CHECK(uart_receive(&uart, bytes[index], &ingress) == UART_OK);
    }
    CHECK(uart_receive(&uart, 0xA5U, &ingress) == UART_LOSS && ingress.fifoStatus == FIFO_FULL &&
        ingress.queuedBeforeLoss == 4U && ingress.fullPreservedBeforeDiscard &&
        uart.queue.count == 0U && uart.phase == UART_SEEK && uart.diagnostics.losses == 1U &&
        uart.applicationPeriod == 100U && command.periodMs == 555U);
    CHECK(uart_poll(&uart, 1U, &report, &command) == UART_OK && report.consumed == 0U &&
        report.eventCount == 0U && !report.commandPresent && command.kind == UART_SET_PERIOD &&
        command.periodMs == 555U);
    for (index = 0U; index < 4U; index++) {
        CHECK(uart_receive(&uart, bytes[index], &ingress) == UART_OK);
    }
    CHECK(uart_poll(&uart, 2U, &report, &command) == UART_OK && report.consumed == 4U &&
        report.eventCount == 4U && report.commandPresent && command.kind == UART_GET_STATUS &&
        command.periodMs == 100U);
    CHECK(uart_receive(&uart, 256U, &ingress) == UART_INVALID_ARGUMENT);
    CHECK(uart_init(&timeout, 100U, 0U) == UART_OK && uart_receive(&timeout, 0xA5U, &ingress) == UART_OK &&
        uart_poll(&timeout, 0U, &report, &command) == UART_OK);
    for (index = 0U; index < 4U; index++) {
        CHECK(uart_receive(&timeout, bytes[index], &ingress) == UART_OK);
    }
    CHECK(uart_poll(&timeout, 20U, &report, &command) == UART_OK && report.eventCount == 5U &&
        report.events[0] == UART_TIMEOUT && report.commandPresent && report.consumed == 4U);
    CHECK(time_init(&time, 10U, 100U) == TIME_OK && time_service(&time, 110U, &timeReport) == TIME_OK &&
        timeReport.releases == 1U && timeReport.work && timeReport.missed == 0U && timeReport.remainder == 0U);
    CHECK(time_service(&time, 145U, &timeReport) == TIME_OK && timeReport.releases == 3U &&
        timeReport.work && timeReport.missed == 2U && timeReport.remainder == 5U);
    CHECK(time_service(&time, 145U, &timeReport) == TIME_OK && !timeReport.work && timeReport.releases == 0U);
    CHECK(time_init(&wrap, 10U, UINT32_C(4294967290)) == TIME_OK &&
        time_service(&wrap, 4U, &timeReport) == TIME_OK && timeReport.elapsed == 10U && timeReport.work);
    CHECK(time_elapsed(0U, TIME_HALF_RANGE, &elapsed) == TIME_GAP_REJECTED && elapsed == 777U);
}

/** @brief Demonstrate per-component preserving failure without whole-turn rollback.
 * @return None. */
static void component_failures(void)
{
    static Application app;
    UartIngress ingress;
    UartReport report = {0};
    UartCommand command = {UART_SET_PERIOD,555U};
    DmaState before;
    DmaReport output;
    DmaReport saved;
    DmaToken zero = {0};
    uint16_t sample = 777U;
    /**
    * A successful real producer phase remains committed after a rejected poll.
    **/
    CHECK(app_init(&app));
    CHECK(app_turn(&app, (Turn){PH_START,0U,0U,0U,0U,COPY_NORMAL,DMA_OK,false,false}));
    CHECK(app_turn(&app, (Turn){PH_PUSH,10U,0U,1U,0U,COPY_NORMAL,DMA_OK,false,false}));
    before = app.dma;
    CHECK(uart_receive(&app.uart, 0xA5U, &ingress) == UART_OK);
    CHECK(uart_poll(&app.uart, UINT32_C(2147483649), &report, &command) == UART_TIME_REJECTED &&
        app.uart.queue.count == 1U && same_dma(&app.dma, &before) && app.acquired == 1U &&
        app.banks[0].present[0] && app.banks[0].labels[0].sourceTime == 0U);
    output = app.snapshot;
    saved = output;
    CHECK(dma_push(&app.dma, 65536U, &output) == DMA_INVALID_ARGUMENT &&
        same_dma(&app.dma, &before) && same_dma_report(&output, &saved));
    CHECK(dma_read(&app.dma, &zero, 0U, &sample) == DMA_INVALID_TOKEN && sample == 777U &&
        same_dma(&app.dma, &before));
    CHECK(app_turn(&app, (Turn){PH_STOP,0U,0U,2U,0U,COPY_NORMAL,DMA_OK,false,false}));
    CHECK(app_turn(&app, (Turn){PH_CONFIRM,0U,0U,3U,0U,COPY_NORMAL,DMA_OK,false,false}));
}

/** @brief Exercise real producer exhaustion and matching read/index/BUSY behavior.
 * @return None. */
static void producer_limits(void)
{
    static DmaState lastBlock;
    static DmaState lastRun;
    static DmaState counter;
    DmaReport report;
    DmaReport saved;
    DmaState before;
    DmaToken token = {99U,99U,1U};
    DmaToken sentinel;
    uint16_t sample = 777U;
    uint32_t index;
    /**
    * One fresh LAST_BLOCK domain reaches MAX without editing producer fields.
    **/
    CHECK(dma_init(&lastBlock, DMA_FIXTURE_LAST_BLOCK, true) == DMA_OK &&
        dma_claim(&lastBlock, &token) == DMA_EMPTY && token.run == 99U &&
        dma_start(&lastBlock, &report) == DMA_OK && report.descriptors[0].token.block == UINT32_MAX);
    token = report.descriptors[0].token;
    for (index = 0U; index < 4U; index++) {
        CHECK(dma_push(&lastBlock, 10U + index, &report) == DMA_OK);
    }
    CHECK(dma_complete(&lastBlock, &token, &report) == DMA_OK && dma_claim(&lastBlock, &token) == DMA_OK);
    before = lastBlock;
    sentinel = (DmaToken){99U,99U,1U};
    CHECK(dma_claim(&lastBlock, &sentinel) == DMA_BUSY && sentinel.run == 99U &&
        dma_read(&lastBlock, &token, 4U, &sample) == DMA_INVALID_ARGUMENT && sample == 777U &&
        same_dma(&lastBlock, &before));
    CHECK(dma_read(&lastBlock, &token, 0U, &sample) == DMA_OK && sample == 10U &&
        dma_release(&lastBlock, &token) == DMA_OK);
    before = lastBlock;
    saved = report;
    CHECK(dma_begin_next(&lastBlock, &report) == DMA_EXHAUSTED && same_dma(&lastBlock, &before) &&
        same_dma_report(&report, &saved));
    CHECK(dma_request_stop(&lastBlock, DMA_CAUSE_USER, &report) == DMA_OK &&
        dma_confirm_stop(&lastBlock, &report) == DMA_OK && dma_recover(&lastBlock, &report) == DMA_OK);
    before = lastBlock;
    saved = report;
    CHECK(dma_start(&lastBlock, &report) == DMA_EXHAUSTED && same_dma(&lastBlock, &before) &&
        same_dma_report(&report, &saved));
    /**
    * Independent domains preserve allocator/lease history for every fresh fixture.
    **/
    CHECK(dma_init(&lastRun, DMA_FIXTURE_LAST_RUN, true) == DMA_OK &&
        dma_start(&lastRun, &report) == DMA_OK &&
        dma_request_stop(&lastRun, DMA_CAUSE_USER, &report) == DMA_OK &&
        dma_confirm_stop(&lastRun, &report) == DMA_OK && dma_recover(&lastRun, &report) == DMA_OK &&
        report.run == UINT32_MAX && dma_start(&lastRun, &report) == DMA_OK &&
        dma_request_stop(&lastRun, DMA_CAUSE_USER, &report) == DMA_OK &&
        dma_confirm_stop(&lastRun, &report) == DMA_OK);
    before = lastRun;
    saved = report;
    CHECK(dma_recover(&lastRun, &report) == DMA_EXHAUSTED && same_dma(&lastRun, &before) &&
        same_dma_report(&report, &saved));
    CHECK(dma_init(&counter, DMA_FIXTURE_COUNTER_EDGE, false) == DMA_OK &&
        dma_start(&counter, &report) == DMA_OK);
    token = report.descriptors[0].token;
    for (index = 0U; index < 4U; index++) {
        CHECK(dma_push(&counter, index, &report) == DMA_OK);
    }
    CHECK(dma_complete(&counter, &token, &report) == DMA_OK &&
        report.diagnostics.completed == UINT32_MAX && !report.diagnostics.saturated &&
        dma_claim(&counter, &token) == DMA_OK && dma_read(&counter, &token, 0U, &sample) == DMA_OK &&
        counter.diagnostics.copiedItems == UINT32_MAX && !counter.diagnostics.saturated &&
        dma_read(&counter, &token, 1U, &sample) == DMA_OK && counter.diagnostics.saturated &&
        dma_release(&counter, &token) == DMA_OK &&
        dma_request_stop(&counter, DMA_CAUSE_USER, &report) == DMA_OK &&
        dma_confirm_stop(&counter, &report) == DMA_OK);
}

/** @brief Run the complete finite independent consumer with meaningful exit status.
 * @return Zero only when every active check and output operation succeeds. */
int main(void)
{
    static Application stoppedRequested;
    static Application stoppedConfirmed;
    /**
    * Separate static lifetime domains prevent fresh initializers wiping old leases.
    **/
    normal_composition();
    late_composition();
    stopped_ready(&stoppedRequested, false);
    stopped_ready(&stoppedConfirmed, true);
    literal_trace(g_a, 8U, 8U, 5U, 5U, 3U);
    literal_trace(g_b, 9U, 12U, 9U, 9U, 3U);
    literal_trace(g_c, 8U, 8U, 6U, 5U, 2U);
    queue_rejections();
    queue_limits();
    sequence_cases();
    uart_time_cases();
    component_failures();
    producer_limits();
    if (g_failures != 0U) {
        return 1;
    }
    if (puts("PASS N1 actual read/copy/release: 2 blocks / 8 samples / 16 payload bytes; queue 8/5/3/5/0") < 0 ||
        puts("PASS N2 held-A late/no30write/unconfirmed BUSY/confirmed-held BUSY/release/recover run2/stale/start")
            < 0 ||
        puts("PASS N3 READY copy while stop-requested and stop-confirmed; actual bounded UART status usable") < 0 ||
        puts("PASS N4 real UART FULL4+failed5th/timeout5events/time110,145/equal,wrap/non-atomic commits") < 0 ||
        puts("PASS N5 A8/B9/C8 rows/terminal/reset/wide rejection/sequence65534/epoch/half/saturation/history33") < 0 ||
        printf("Host sizeof only: queue=%zu report=%zu sequence=%zu app=%zu label-bank=%zu\n",
            sizeof(ThroughputState), sizeof(ThroughputReport), sizeof(ThroughputSequence),
            sizeof(Application), sizeof(LabelBank)) < 0 || fflush(stdout) != 0) {
        return 1;
    }
    return 0;
}
END_CONSUMER_C
```
<nav class="next-links" aria-label="前后单元"><a href="dma-ownership.html">← 16 DMA缓冲所有权</a><a href="throughput-overload-reference.html">本章速查 →</a><a href="../learn/engineering-map.html#stage-05">18 RTOS：尚待交付 →</a></nav></main><footer class="wrap">原创教学模型 · 无硬件/实体纸张验证 · 不存个人成绩、答案或掌握状态。</footer>