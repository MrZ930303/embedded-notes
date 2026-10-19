# I2C / SPI 事务速查 {#bus-transactions-reference}

<p>选定器件、整项操作、所有权和期限一起保留，简短才不会失去前提。</p>

<span id="bus-ref-scope"></span>

## 先核对选定对象与四层含义 {#bus-ref-scope-title}

<p>固定LIS3DH，假设CS高/SA0低用于I2C；未核验板接线。address7=18，写地址字节30，读地址字节31，寄存器SUB=0F，身份期望DATA=33。通用7位数值30合法，本夹具仅判目标不匹配；绝不自动unshift。所钉HAL三个函数另要求先左移，是API特定约定。</p><p>SPI采用4线、8位MSB-first，单读命令80|0F=8F。由传感器高空闲/下降发送/上升采样与历史MCU定义推导CPOL1/CPHA1=mode3，只限本例，不替代速率/CS/电气条件核验。</p><a href="bus-transactions.html#bus-address">回到完整地址推导</a>

<span id="bus-ref-wire"></span>

## 先画整项事务，再判断某一帧 {#bus-ref-wire-title}

<figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="ACK的接收者决定意义，可横向滚动"><svg viewBox="0 0 760 174" role="img" aria-labelledby="bus-ref-i2c-caption"><rect x="12" y="16" width="736" height="52" rx="7" fill="#eef2e9"/><text x="28" y="48">S 30 A(target) 0F A(target) Sr 31 A(target) 33 N(controller) P</text><rect x="12" y="82" width="736" height="52" rx="7" fill="#d5e7b3"/><text x="28" y="114">Sr保持busy；最后N正常结束；目标拒绝地址/SUB另报故障</text></svg></div><figcaption id="bus-ref-i2c-caption">ACK的接收者决定意义。原创逻辑图；采用Tables19/20一个8位SUB，正文两SUB矛盾未被消除。</figcaption></figure><figure><div class="diagram-scroll" role="region" tabindex="0" aria-label="同一个CS区间覆盖命令与数据，可横向滚动"><svg viewBox="0 0 760 174" role="img" aria-labelledby="bus-ref-spi-caption"><rect x="12" y="16" width="736" height="52" rx="7" fill="#eef2e9"/><text x="28" y="48">SELECT低 → TX8F/RX7E丢弃 → TX00(dummy)/RX33候选 → DESELECT高</text><rect x="12" y="82" width="736" height="52" rx="7" fill="#d5e7b3"/><text x="28" y="114">TXE仅缓冲移交；8位帧结束不等于完整寄存器事务完成</text></svg></div><figcaption id="bus-ref-spi-caption">同一个CS区间覆盖命令与数据。原创逻辑图；CS取消完成才提交候选，协议完成仍需另比较预期33。</figcaption></figure><a href="bus-transactions.html#bus-spi">回到命令、边沿与收尾解释</a>

<span id="bus-ref-failure"></span>

## 按phase、cause与所有权诊断 {#bus-ref-failure-title}

<p>目标地址/SUB NACK：仍OWNED→ERROR_STOP，下一poll有限逻辑STOP→FAILED/RELEASED，保留ADDRESS_NACK/DATA_NACK与原failurePhase。若先到20ms，policyCause=TIMEOUT，原cause/phase保留，UNKNOWN且无STOP。ARLO：FAILED/LOST，无STOP；新显式I2C请求仍先WAIT_FREE。ERROR/STUCK/timeout：UNKNOWN，拒绝新start，不可init/reset清掉未决资源。</p><p>busy可能正常占用/Sr/可选拉伸/卡线/本地状态，不足以授权九脉冲、reset或电源恢复。必须先查实际线状态、其他controller、所有权及板级权限。逻辑RELEASED不证明物理线路恢复；本接口无retry/cancel/physical recovery。</p><a href="bus-transactions.html#bus-ownership">回到所有权因果链与勘误适用条件</a>

<span id="bus-ref-time"></span>

## 20ms总期限与旧结果合同 {#bus-ref-time-title}

<p>start100→poll119可PENDING；poll120等号先超时，不接受同刻READY。每poll最多一阶段，WAIT/期限/终态零动作。时间依赖真实前进观察和调度，1tick=1ms，true gap&lt;2^31由调用者承诺；观测delta≥2^31拒绝且全状态/报告保持。跨零4294967290→4是10，等tick不增年龄，整圈漏观察不能检测。</p><p>I2C ticks0..8九阶段，tick6只有候选，tick8STOP才newResult；SPI ticks0..3四阶段，COMMAND丢7E，数据33到DESELECT才提交。PENDING、准入拒绝、无效时间和所有失败保留旧已提交值。resultPresent可能指旧结果，只有newResult授权消费本轮新值；返回非33可READY但identityMatches=false。</p><a href="bus-transactions.html#bus-bounded">回到固定逐阶段例子</a>

<span id="bus-ref-c"></span>

## 公共接口、常量资源与下载 {#bus-ref-c-title}

<p>bus_init(BusState*)只用于真正fresh storage；bus_start(state,request,now)复制protocol/address7/reg；bus_poll(state,now,event,report)一事件/一阶段，没有回调或忙等。BusCallStatus=OK/INVALID_ARGUMENT/BAD_STATE/BUS_BUSY/TIME_REJECTED，报告另有IDLE/PENDING/READY/FAILED，phase/nextPhase/cause/policyCause/failurePhase/resource。</p><p>存储恒定：一请求、一候选、一已提交字节；一输入事件/一输出报告，无队列/历史或会溢出的计数器，elapsed饱和20；UI固定路径≤9行。独占单上下文、不可重入，state与其他实参不重叠，真实存活类型/容量/生命周期由调用者保证。NULL检查不是指针有效性证明。UNKNOWN不可复用，LOST允许显式新请求但不证明物理free。</p><p>分别编译bus.c/time.c，独立调用者重复包含头，normal和NDEBUG检查都实际生效。AgentHub所有实际C操作使用mcu-build validate→dry-run→build，失败不跑旧产物；保留profile/tool/header/log/rawstatus/fresh artifact SHA。主机.su/栈启发式不等于目标最大栈。</p><p><a href="../examples/bus-transactions/bus.c" download>下载bus.c</a></p><p><a href="../examples/bus-transactions/bus.h" download>下载bus.h</a></p><p><a href="../examples/bus-transactions/README.txt" download>下载README.txt</a></p><p><a href="../examples/timer-pwm/time.c" download>下载time.c</a></p><p><a href="../examples/timer-pwm/time.h" download>下载time.h</a></p><a href="bus-transactions.html#bus-c">回到五份完整原始文本与复现说明</a>

<span id="bus-ref-sources"></span>

## 查原文时保留版本与空缺 {#bus-ref-sources-title}

<p>首选阅读[N]的START/ACK/地址与仲裁条款，再对照[L] Tables16/19/20和§8.5逐字节手推。下列版本与范围来自实际研究者有限阅读；本章作者进一步读了本地NXP与历史RM选页文字，不把研究者看过的像素声称自己全部复核。所有例子、图和有限软件策略均为本项目原创，没有复制收费课程。</p><ul><li>[N] <a href="https://www.nxp.com/docs/en/user-guide/UM10204.pdf">NXP UM10204 Rev7.0，2021-10-01</a>：§3.1.4–.6、.8–.10、.16，pp9–13/19；本地原文已提取，研究者实际看过pp9/11/19图。用来区分规范角色与bus-clear前提。</li><li>[L] <a href="https://www.st.com/resource/en/datasheet/lis3dh.pdf">ST LIS3DH DocID17530 Rev2，December2016</a>：§6 pp24–29、§8.5 p34及选定表文字。官方返回的该修订，不声称其后没有新版。单SUB表与两SUB句矛盾保留；时序/表像素未确认，不能输出板级速率验收。</li><li>[M] <a href="https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf">ST RM0090历史Rev5，September2013，Keil托管</a>：§27.3 pp827–829、§28.3 pp855–859/861/867的实际文本；研究者看过828/857/858图。不是最新RM，最新官方RM仍未读，不声称寄存器驱动已验证。</li><li>[H] <a href="https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/b6f0ed3829f3829eb358a2e7417d80bba1a42db7/Src/stm32f4xx_hal_i2c.c#L969">ST HAL I2C固定commit b6f0ed3829f3829eb358a2e7417d80bba1a42db7</a>：只用实际读过Master_Transmit/Master_Receive/Mem_Read参数说明，不推广其他API。状态返回与错误字段也不能混成物理总线恢复证据。</li><li>[E] <a href="https://www.st.com/resource/en/errata_sheet/es0182-stm32f405407xx-and-stm32f415417xx-device-errata-stmicroelectronics.pdf">ST ES0182 Rev19，July2026</a>：45页，Table3 pp2–4及§2.10/2.11.1/2.12文字，适用A与N按原表含义；表/电气像素未完成核验。slave BSY与USART IDLE的N不能误引。</li></ul><p>未验证：最新RM版本/全寄存器条款、传感器/errata部分表像素、实际芯片硅修订、引脚/供电/CS/SA0/上拉/电容与波形、硬件期限/吞吐、真实身份健康与物理打印纸张。已有有界下载失败已记录，不反复下载装饰来源，也不修改代理/TLS或安装工具来掩盖缺口。主机C/JavaScript、源码阅读、页面验证、发布、硬件与个人掌握是各自不同状态。</p><p>检索勘误先核device/revision/mode与Table3：A适用，N不适用；slave-only BSY不能当master规则，USART IDLE行全N不应说成当前适用缺陷。</p><div class="next-links"><a href="bus-transactions.html#bus-practice">回到十题独立回忆</a><a href="bus-transactions.html">返回完整读本</a><a href="adc-sampling.html">继续单元13</a></div>
