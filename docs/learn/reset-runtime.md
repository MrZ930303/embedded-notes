# 从复位向量到C运行环境 {#reset-runtime}

阶段02 · 单元07 · 原创64字节模型 · 无硬件操作 · 本地候选

先解释谁准备初始上下文，再证明每个RAM字节的来处。放置、初始化和执行有各自责任。

## 起点、短路径与一份能解释的RAM图像 {#runtime-overview-title}

采集终端的FIFO已经有了对象和边界，但程序刚复位时，谁给全局变量放入初值？谁先准备函数调用要用的栈？本章把“镜像放在哪里”和“运行前做了什么”连起来。前置是能读数组下标、长度与返回状态；需要时先读[第四章：C对象与边界](../learn/c-objects-bounds.html)和[第五章：有界FIFO](../learn/bounded-fifo.html)。第六章构建、链接与身份说明文件怎样形成镜像；本章的独立虚构夹具不依赖某块板或其链接地址。

本章成果是一张64字节RAM变化图、一份带拒绝理由的初始化轨迹，以及你实际运行后保留的C11检查输出。**短路径**分四段：① 解码两个向量字并写出责任人；② 手算四字节复制和四字节零填充；③ 预测一次成功及一次重叠拒绝；④ 看接口并独立答题。每段先取得一张小纸条上的可核对结果，不需要一次记住所有符号。完整深读保留来源条件、CPU寄存器桥梁和失败规则。

这是阶段02单元07的原创教材候选。地址0x1000、0x2000均为虚构标签，浏览器与C程序只操作真实宿主数组。main-ready是模型完成状态；没有MCU复位、寄存器写入、跳转、库初始化实机验证，也没有物理纸张验证。不保存个人作答、进度或掌握记录。

## 先分清核心、芯片映射、链接器与运行库 {#runtime-actors-title}

**复位向量**是复位入口的初始上下文数据，不是“先调用main”的同义词。以[ST PM0214 Rev10，2020年3月，§2.1.3 p19、§2.3.4 p40](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)描述的Cortex-M4为例，复位时从核心可见0x00000000取得MSP初值，从0x00000004取得入口；入口bit0用于Thumb状态，必须为1。最前面的SP字本身不是处理函数指针。这个核心规则并不说明哪一块物理存储器出现在零地址。

芯片负责复位可见的启动映射。历史[RM0090 Rev5，2013年9月，§2.4 pp69–70](https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf)对其STM32F4范围说明BOOT选择的Flash、系统存储器、SRAM启动空间，以及F405/407的物理重映射。这里仅把它作为版本明确的映射例子；不是当前所有STM32的引脚或启动配置指南，更不把本章0x1000当成STM32真实Flash基址。核心取向量的角色与芯片映射到什么字节，是两个证据问题。

**链接器**决定符号、段和地址关系，不在芯片复位时主动执行复制。**启动代码**是入口以后实际运行的指令；**C运行环境**指普通C代码依赖的存储初始化及所选运行库约定。它们可能分散在启动文件、编译器运行库和链接脚本中。托管操作系统的装载器还有自己的装载合同，不能拿主机可执行程序的启动方式替代Flash固件。

小产物：用四行写出“核心取上下文→芯片映射提供字节→入口执行启动代码→所选运行时建立C前提”。其中映射是取字节条件，不是核心之后顺序执行的另一个软件函数。

## CPU寄存器桥梁：MSP边界与PC控制流 {#runtime-registers-title}

先回看[CPU核心寄存器的SP、LR、PC段](../mcu/cortex-m-cpu-registers.html#stack-link-pc-title)。R13/SP有MSP与PSP的架构角色，R15/PC参与取指和控制流。C变量`uint32_t spLabel`则是普通对象，保存一个数；改变这个对象不会改变处理器的MSP。C指针也有对象、类型和有效期前提，不能因画了0x2000就获得访问该地址的权限。

为什么SP要先有值？函数调用可能需要保存返回现场和局部临时存储；在这些操作发生前，活动栈必须有可靠的边界。为什么入口有状态位？入口数值同时携带控制流目标和Thumb状态信息，不能把奇数入口字直接解释为普通字节下标。本模型把0x1011清除bit0得到0x1010，再要求完整的最小2字节单元；这只验证有限入口范围，不分析其指令、后续分支或栈深度。[PM0214 Rev10 §2.1.3 pp19、23](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)给出该核心的Thumb状态条件；本模型的完整两字节检查和8字节SP对齐是额外教学政策。

声明向下增长的虚构栈时，0x2040可作为64字节RAM的顶端边界，虽然它是一过末端、不是可读取的RAM字节。模型也允许底端0x2000作为边界；这不保证有空间容纳一次调用。模型对齐8字节不能推广成“每条指令都由ABI要求8字节对齐”。通过入口检查更不能推出真实板上向量位置、所有异常向量、权限、栈容量或运行库都正确。

**复位与bootloader受控转交**有不同前提。普通分支或函数调用不会自动重演复位的寄存器、时钟、外设、中断或存储状态变化。转交的两端必须明确谁准备活动栈、向量、执行状态与运行库，如何处理仍活跃的中断、外设和DMA，以及哪些状态由目标保留。此处是对责任的推导，不是可直接复制的跳转流程；本章不提供MSP赋值、伪造函数指针或MMIO代码。

## Flash初值、LMA/VMA、data、BSS与保留区 {#runtime-storage-title}

**Flash**在这里存放镜像字节；**RAM**在这里是可写运行存储。初始化的静态对象如`uint8_t samples[4]={17,34,51,68}`需要这些初值在运行前到达可写目标。**LMA（装载地址）**描述初值在装载镜像中的位置，**VMA（运行地址）**描述运行时的地址；在ROM到RAM的安排中二者不同。依据是[GNU ld2.36 §3.1、§3.6.8.2](https://www.sourceware.org/binutils/docs-2.36/ld.html#Output-Section-LMA)的定义和启动复制示例。

本章data初值的LMA标签是0x1020，即Flash偏移32；运行目标VMA标签为0x2008，即RAM偏移8。每复制一个字节，源偏移和目标偏移都前进1，四字节对应关系为32→8、33→9、34→10、35→11。不是把“地址数0x1020”存入RAM，也不是把整个Flash搬进RAM。

**BSS**通常为需要零初始化的静态存储保留RAM空间，其零值可由运行时写入，不必在Flash为每个零都存一份同尺寸的有效载荷。本例只声明RAM偏移16..19清零。**noinit/保留区**依工程链接与运行时合同选择不初始化；不是ISO C给任意未初始化读取的通行证。这里未被data/BSS拥有的字节保留0xA5，用来证明模型没有擅自清空全部RAM，也不把这个图案当成真实硬件复位值。

小产物：写两列“Flash负载字节”和“RAM运行保留”，data在两列各有四字节，BSS只有四字节RAM目标和零填充责任。map能说明本次链接的布局；仍需实际启动代码履行复制/清零合同。

## 读一个固定CMSIS例子，明确_start的责任 {#runtime-cmsis-title}

选定Arm **CMSIS5.9.0**，发布标签2022-05-02，对应commit `2b7495b8535bdcb306dac29b9ded4cfb679d7e5c`。其[ARMCM4启动例子V2.0.3，2020-03-31](https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/Device/ARM/ARMCM4/Source/startup_ARMCM4.c)的`Reset_Handler`先`SystemInit()`再`__PROGRAM_START()`。这是所选设备/工具链例子的顺序；不是所有C程序或所有厂商启动文件的通用顺序。尤其不能因此假定SystemInit调用时所有普通全局初值已经可用。

同一commit的[cmsis_gcc.h启动段](https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/CMSIS/Core/Include/cmsis_gcc.h#L117)在未覆盖宏时将`__PROGRAM_START`映射到`__cmsis_start`：遍历copy-table，遍历zero-table，然后调用`_start()`。这些表依实际链接脚本才有内容，长度为word而不是本模型的byte。

必须同时看[gcc_arm.ld V2.1.0，2020-08-04](https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/Device/ARM/ARMCM4/Source/GCC/gcc_arm.ld)：`.data : AT(__etext)`放在RAM，copy-table给出Flash源与RAM目标；模板zero-table只留了额外BSS条目的可选示例，普通`.bss`不必出现在该表中。因此**不能声称__cmsis_start的zero-table循环单独清除了每个普通.bss**；必须继续核对实际选择的`_start`和C运行库合同。本章未执行该目标运行库，不补写一个“必然调用main”的虚假目标轨迹。

本章模型有自己的明确合同：全部校验→私有data复制→私有BSS清零→提交main-ready。它用这个顺序解释存储责任；它没有声称复刻上述CMSIS例子的全部库步骤、构造器、设备设置或真实复位路径。

## 独立手算：两个向量字与每一个改变的字节 {#runtime-fixture-title}

固定前提：Flash和RAM各为真实64字节对象，标签分别从0x1000和0x2000开始；标签宽32位，向量采用小端字节序。RAM种子全部为0xA5=165。向量位于Flash偏移0..3与4..7；可执行范围为**[0x1010,0x1012)**，方括号含起点、圆括号不含末端。Flash其余字节可有0xA5，但不分析其是否可执行。

| Flash偏移 / 十六进制字节 | 小端解码 | 解释 |
| --- | --- | --- |
| 0..3：40 20 00 00（十进制64,32,0,0） | 0x00002040=8256 | 0x40+0x20×256；是栈顶边界值 |
| 4..7：11 10 00 00（十进制17,16,0,0） | 0x00001011=4113 | 0x11+0x10×256；bit0=1，目标0x1010 |
| 32..35：11 22 33 44（十进制17,34,51,68） | 四个独立字节 | 源0x1020..0x1023，复制到0x2008..0x200B |

SP0x2040位于[0x2000,0x2040]边界区间且8256除8余0。入口清状态位后为4112，末端4114减4112=2，所以完整最小单元恰好容纳。若末端改为4113只剩1字节；若入口字为4115，目标4114正好等于末端；两者都拒绝。

<figure class="runtime-diagram" aria-labelledby="runtime-diagram-title"><div class="diagram-grid"><div><strong>① 虚构Flash · 64字节</strong><p>标签0x1000..0x103F<br>0..7：SP与入口<br>32..35：17,34,51,68</p></div><div><strong>② 校验 → 私有准备</strong><p>先查完整请求<br>32..35 → 8..11<br>16..19 → 写零<br>失败：不提交</p></div><div><strong>③ 虚构RAM · 64字节</strong><p>标签0x2000..0x203F<br>8..11：17,34,51,68<br>16..19：0,0,0,0<br>其余：165</p></div></div><figcaption id="runtime-diagram-title">原创事务图。箭头表示有限字节复制或处理顺序，不表示总线访问、寄存器赋值或CPU跳转。所有偏移单位为byte；0x前缀为十六进制标签。虚线概念由“失败：不提交”文字表达，无色彩依赖。</figcaption></figure>

图的文字等价：先验证上下文和两个不相交目标，后在私有副本里从Flash32..35复制四字节到RAM8..11，再把RAM16..19写零；直到所有准备结束才公开RAM与报告。源Flash不改变，目标外没有字节被授权写入。

| RAM偏移 / 标签 | 种子 | 成功后的完整区间结果 |
| --- | --- | --- |
| 0..7 / 0x2000..0x2007 | 全165 | 全165 |
| 8..11 / 0x2008..0x200B | 全165 | 17,34,51,68 |
| 12..15 / 0x200C..0x200F | 全165 | 全165 |
| 16..19 / 0x2010..0x2013 | 全165 | 0,0,0,0 |
| 20..63 / 0x2014..0x203F | 全165 | 全165 |

共64字节：4个data、4个BSS、56个保持165；报告initialSp=8256、entryWord=4113、entryTarget=4112、copied=4、zeroed=4、mainReady=true。可先盖住表最后一列自己填完，之后再进入控制器。这个静态例子在无JavaScript时也完整可读。

## 拒绝规则、真实对象与事务提交 {#runtime-contract-title}

`runtime_image_initialize`只在整个请求有效后改变输出。它先检查四个空参数，再检查容量、向量长度、32位标签端点、SP和入口，然后检查每个区间和目标交集；最后形成私有64字节暂存并提交。报告mainReady在失败时也保持原值，所以旧true不等于这次请求成功。调用者必须先看返回状态，再把报告与其已接受输入配对。

| 条件 | 本模型的明确处理 |
| --- | --- |
| Flash少于8字节；或大于64；RAM不在1..64 | BAD_VECTOR或BAD_LENGTH；不读不存在的向量字 |
| base+length不能表示为uint32_t排他端点 | ADDRESS_OVERFLOW；先比较UINT32_MAX-base再相加 |
| SP超出含顶端边界区间、或不按8对齐 | BAD_SP；对齐为教学政策，不承诺栈需求充足 |
| 缺Thumb位、目标不在执行范围、仅剩1字节、目标在末端 | BAD_ENTRY；最小2字节检查不证明指令正确 |
| offset+length将溢出size_t；或完整区间越界 | ADDRESS_OVERFLOW或BAD_RANGE；不能先加再看包回的小数 |
| data与BSS非空目标相交 | OVERLAP；即使复制阶段看似正确，也不能先写后拒绝 |
| data/BSS长度0 | 仍要求offset≤对应对象长度；exact endpoint64可用，65不可用；不形成该空区间的指针 |

独立故障例：保持向量有效，把BSS起点从16改为10、长度仍4，则data[8,12)与BSS[10,14)交于10..11。不能让后来的零填充悄悄破坏51、68；应在任何RAM/报告写入前拒绝。端点相接如data[8,12)、BSS[12,16)则不重叠。若data与BSS都为空、起点都64，其他上下文有效，允许main-ready但copied=zeroed=0。

**非空指针不足以证明安全。**Flash、request、RAM与report必须是四个存活、完整初始化、互不重叠的真实对象；实际数组必须覆盖声明的flashLength/ramLength，调用期间不得并发修改。函数可以检查NULL和整数范围，不能通用识别伪造/悬空指针、谎报长度或别名。不要把地址标签强转指针来“测试错误”，也不要让report位于RAM里。失败夹具只改变真实已初始化对象中的元数据。C使用size_t上限，JS使用Number.MAX_SAFE_INTEGER上限，数值表示不同；两者在本章0..64的有限合法域与32位标签合同一致。

这里的事务性依赖单执行上下文和非重叠所有权；不是线程同步、断电原子性或真实启动回滚承诺。最多复制64个旧RAM字节，最多复制64个data字节，最多清零64个字节，再最多提交64字节；所有循环都有已验证上界，没有探测内存或等待硬件。

## 预测后应用：成功或整笔拒绝 {#runtime-lab-title}

先用上面的手算例预测状态和RAM[8]，再应用；一次选择不会保存分数。所有数值输入使用十进制非负整数，界面上限4294967295；不接收空值、小数、负数、Infinity或0x前缀。偏移和长度仍受真实64字节窗口约束。草稿编辑会清空旧预测；已接受图像若保留，旁边始终标注它自己的已接受输入。

试一次BSS目标10的重叠拒绝，再试BSS目标12的相接成功。每次处理都从上次已接受RAM准备副本，所以不再归本次目标拥有的旧字节也会保持；若要重做全165种子，使用重置。拒绝不能改变已接受RAM或报告。按钮只增强练习，无脚本可依静态表和十题完成相同推导。

<div class="lab"><form id="runtime-form" novalidate><div class="fields"><label class="field" for="runtime-sp">SP标签（十进制，0..4294967295）<input id="runtime-sp" inputmode="numeric" value="8256" type="text"></label><label class="field" for="runtime-entry">入口字（十进制，含Thumb位）<input id="runtime-entry" inputmode="numeric" value="4113" type="text"></label><label class="field" for="runtime-execEnd">执行范围排他末端（起点固定4112）<input id="runtime-execEnd" inputmode="numeric" value="4114" type="text"></label><label class="field" for="runtime-dataSource">data源偏移（byte）<input id="runtime-dataSource" inputmode="numeric" value="32" type="text"></label><label class="field" for="runtime-dataDestination">data目标偏移（byte）<input id="runtime-dataDestination" inputmode="numeric" value="8" type="text"></label><label class="field" for="runtime-dataLength">data长度（byte）<input id="runtime-dataLength" inputmode="numeric" value="4" type="text"></label><label class="field" for="runtime-bssDestination">BSS目标偏移（byte）<input id="runtime-bssDestination" inputmode="numeric" value="16" type="text"></label><label class="field" for="runtime-bssLength">BSS长度（byte）<input id="runtime-bssLength" inputmode="numeric" value="4" type="text"></label><label class="field" for="runtime-fault">独立故障条件<select id="runtime-fault"><option value="none">保持64字节真实范围</option><option value="short-vector">声明Flash有效范围为7字节</option><option value="short-source">声明Flash有效范围为35字节</option><option value="address-overflow">Flash标签端点超出32位</option></select></label><label class="field" for="runtime-prediction">预测返回状态<select id="runtime-prediction"><option value="">先选择预测</option><option value="BAD_ENTRY">BAD_ENTRY</option><option value="OK">OK</option><option value="BAD_RANGE">BAD_RANGE</option><option value="BAD_SP">BAD_SP</option><option value="OVERLAP">OVERLAP</option><option value="BAD_VECTOR">BAD_VECTOR</option><option value="ADDRESS_OVERFLOW">ADDRESS_OVERFLOW</option><option value="BAD_LENGTH">BAD_LENGTH</option><option value="INVALID_ARGUMENT">INVALID_ARGUMENT</option></select></label><label class="field" for="runtime-byte">预测操作后已接受RAM[8]（十进制0..255）<input id="runtime-byte" type="text" inputmode="numeric" value=""></label></div><div class="controls"><button class="btn primary" id="runtime-apply" type="submit" disabled>应用整笔请求</button><button class="btn" id="runtime-reset" type="button">恢复确定种子</button></div></form><p id="runtime-pending">种子RAM全为165，报告mainReady=false；先预测。</p><div id="runtime-result" class="applied-result" hidden><p id="runtime-accepted"></p><p id="runtime-state"></p></div><p class="feedback" role="status" aria-live="polite" id="runtime-feedback">尚未应用请求；动态结果未揭示。</p></div>

## 四步回放：准备结果还不等于已提交 {#runtime-trace-title}

本回放是独立固定种子，不受上一个表单草稿影响：64字节对象、SP0x2040、入口0x1011、data32→8长4、BSS16长4。四个有意义的阶段各需要一次新预测；没有自动跑完或无限追加。第一步只验证，第二步复制到私有副本，第三步清零私有BSS，第四步提交。私有RAM[8]依次应为165、17、17、17；前面三步的公开已接受RAM仍全165，最后一步才有main-ready。

如果另一个请求在完整校验时发现坏BSS，就根本不进入这里的复制阶段。这解释了为什么真实实现先验证全部请求，而不是复制一部分后再检查后半段。阶段名称只是安全模型的可解释轨迹，浏览器没有运行C编译器，也没有写真实核心上下文。

<div class="lab"><p id="trace-next">下一步1/4：预测即将发生的阶段，以及该步后的私有RAM[8]。</p><form id="trace-form" novalidate><div class="fields"><label class="field" for="trace-prediction">预测下一阶段<select id="trace-prediction"><option value="">先选择预测</option><option value="zero">私有副本清零BSS</option><option value="validate">完整请求检查上下文</option><option value="commit">提交RAM以及报告</option><option value="copy">私有副本复制data</option></select></label><label class="field" for="trace-byte">预测本步后的私有RAM[8]（0..255）<input id="trace-byte" type="text" inputmode="numeric" value=""></label></div><div class="controls"><button class="btn primary" id="trace-apply" type="submit" disabled>揭示下一步</button><button class="btn" id="trace-reset" type="button">重置四步轨迹</button></div></form><div id="trace-result" class="applied-result" hidden><p id="trace-state"></p><p id="trace-log" class="trace-readout"></p></div><p id="trace-feedback" class="feedback" role="status" aria-live="polite">尚未揭示步骤；独立种子RAM全165。</p></div>

## 完整C11接口、实现与复现实验 {#runtime-c-lab-title}

下载与正文代码为同一份原创建模源。`RuntimeRequest`用整数标签和size_t偏移描述对象；`RuntimeReport`只有命名值，不依靠填充字节；唯一公共操作`runtime_image_initialize`返回显式`RuntimeStatus`。可在不定义RUNTIME_IMAGE_TEST时单独编译为模块，再由调用者包含头文件并立即检查返回值。测试main只在宏打开时进入；所有运行时检查在NDEBUG下继续执行。

本地已通过既有GCC13.1.0的严格C11、-Wall -Wextra -Werror -Wconversion -Wshadow -pedantic正常/NDEBUG可执行检查，以及独立模块编译；每次实际编译均经已有mcu-build自定义profile的validate→dry-run→build。正常及NDEBUG的实际输出为：`PASS runtime: fixed64-byte image, transactional boundaries and live checks`。下列通用命令不要求读者拥有作者机器路径；若工程要求统一构建入口，把同一argv放入其允许的profile，不能绕过。

每次编译失败就停止，不运行旧文件。每次运行立即看退出状态；测试期望或puts/fprintf/fflush失败均退出非零。NULL测试在读取前受保护；故障参数使用真实已初始化对象，未执行伪造地址、越界指针或未初始化读取。源代码中的每次拒绝都对64个RAM字节和全部报告命名字段作前后比较，不memcmp结构体填充。

<a href="../examples/reset-runtime/runtime_image.h" download>下载runtime_image.h</a> · <a href="../examples/reset-runtime/runtime_image.c" download>下载runtime_image.c</a> · <a href="../examples/reset-runtime/README.txt" download>下载复现说明README.txt</a>

### runtime_image.h：完整接口 {#runtime-source-header}

```c
/******************************************************************************
 * @file runtime_image.h
 * @brief Original embedded-notes fictional image transaction interface.
 * @author embedded-notes project contributors
 * @version V1.0 2026-10-17
 * Original project teaching code; no third-party authorship or license implied.
 *****************************************************************************/
#ifndef RUNTIME_IMAGE_H
#define RUNTIME_IMAGE_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#define RUNTIME_CAPACITY 64U
typedef enum {
    RUNTIME_OK,
    RUNTIME_INVALID_ARGUMENT,
    RUNTIME_BAD_LENGTH,
    RUNTIME_ADDRESS_OVERFLOW,
    RUNTIME_BAD_VECTOR,
    RUNTIME_BAD_SP,
    RUNTIME_BAD_ENTRY,
    RUNTIME_BAD_RANGE,
    RUNTIME_OVERLAP
} RuntimeStatus;
typedef struct {
    uint32_t flashBase;
    uint32_t ramBase;
    size_t flashLength;
    size_t ramLength;
    uint32_t execStart;
    uint32_t execEnd;
    size_t dataSource;
    size_t dataDestination;
    size_t dataLength;
    size_t bssDestination;
    size_t bssLength;
} RuntimeRequest;
typedef struct {
    uint32_t initialSp;
    uint32_t entryWord;
    uint32_t entryTarget;
    size_t copied;
    size_t zeroed;
    bool mainReady;
} RuntimeReport;
/**
 * @brief Validate a complete request, prepare private RAM, then commit on OK.
 * @param[in] flash Live readable initialized byte object, truthful flashLength.
 * @param[in] request Live fully initialized request. Lengths are at most64.
 * @param[in,out] ram Live writable initialized object, truthful ramLength.
 * @param[in,out] report Live writable initialized report; unchanged on rejection.
 * @return Explicit status; OK means fictional main-ready, never a branch.
 * All four objects must be distinct, nonoverlapping and live throughout the call.
 * One execution context, no concurrent mutation. NULL is checked. Forged/dangling
 * pointers, dishonest spans and caller alias violations are not detected.
 * Labels are32-bit integers, not pointers. Eight-byte SP alignment and an
 * inclusive RAM boundary interval are model policies. Endpoints must be
 * representable as uint32_t; empty regions still need in-object endpoints.
 */
RuntimeStatus runtime_image_initialize(const uint8_t *flash, const RuntimeRequest *request,
                                       uint8_t *ram, RuntimeReport *report);
#endif
```

### runtime_image.c：完整模块与可选测试main {#runtime-source-implementation}

```c
/******************************************************************************
 * @file runtime_image.c
 * @brief Original embedded-notes bounded fictional reset/runtime transaction.
 * @author embedded-notes project contributors
 * @version V1.0 2026-10-17
 * No MCU-address dereference, real reset, register write or function-pointer call.
 * Define RUNTIME_IMAGE_TEST for live runtime checks; omit it for module use.
 * Original project teaching code; no third-party authorship or license implied.
 *****************************************************************************/
#include "runtime_image.h"
#include <limits.h>
#if CHAR_BIT != 8 || !defined(UINT8_MAX) || !defined(UINT32_MAX)
#error "This model requires eight-bit bytes, uint8_t and uint32_t."
#endif
#ifdef RUNTIME_IMAGE_TEST
#include <stdio.h>
#include <string.h>
#endif
/**
 * @brief Decode one little-endian vector word from an already checked span.
 * @param[in] bytes Four live initialized bytes.
 * @return Decoded32-bit value; no alignment-dependent typed dereference.
 */
static uint32_t read_le32(const uint8_t *bytes)
{
    /**
     * Promote before shifting so narrow integer promotions cannot overflow.
     **/
    return (uint32_t)bytes[0] | ((uint32_t)bytes[1] << 8U) |
           ((uint32_t)bytes[2] << 16U) | ((uint32_t)bytes[3] << 24U);
}
/**
 * @brief Validate region metadata before any offset addition or byte access.
 * @param[in] request Live initialized request with bounded object lengths.
 * @return Range, arithmetic or overlap status.
 */
static RuntimeStatus validate_regions(const RuntimeRequest *request)
{
    size_t dataEnd;
    size_t bssEnd;
    /**
     * Empty spans still require offset <= object length; no pointer is formed.
     **/
    if (request->dataLength > SIZE_MAX - request->dataSource ||
        request->dataLength > SIZE_MAX - request->dataDestination ||
        request->bssLength > SIZE_MAX - request->bssDestination) {
        return RUNTIME_ADDRESS_OVERFLOW;
    }
    if (request->dataSource > request->flashLength ||
        request->dataLength > request->flashLength - request->dataSource ||
        request->dataDestination > request->ramLength ||
        request->dataLength > request->ramLength - request->dataDestination ||
        request->bssDestination > request->ramLength ||
        request->bssLength > request->ramLength - request->bssDestination) {
        return RUNTIME_BAD_RANGE;
    }
    dataEnd = request->dataDestination + request->dataLength;
    bssEnd = request->bssDestination + request->bssLength;
    if (request->dataLength != 0U && request->bssLength != 0U &&
        request->dataDestination < bssEnd && request->bssDestination < dataEnd) {
        return RUNTIME_OVERLAP;
    }
    return RUNTIME_OK;
}
/**
 * @brief Check declared32-bit labels and decode a complete initial context.
 * @param[in] flash Checked live readable object of at least eight bytes.
 * @param[in] request Bounded real-object metadata.
 * @param[out] candidate Private report, never caller output.
 * @return Validation status, without changing caller RAM/report.
 */
static RuntimeStatus validate_context(const uint8_t *flash, const RuntimeRequest *request,
                                      RuntimeReport *candidate)
{
    uint32_t flashEnd;
    uint32_t ramEnd;
    /**
     * Exclusive integer endpoints must fit; this is a model address policy.
     **/
    if (request->flashLength > UINT32_MAX - request->flashBase ||
        request->ramLength > UINT32_MAX - request->ramBase) {
        return RUNTIME_ADDRESS_OVERFLOW;
    }
    flashEnd = request->flashBase + (uint32_t)request->flashLength;
    ramEnd = request->ramBase + (uint32_t)request->ramLength;
    candidate->initialSp = read_le32(flash);
    candidate->entryWord = read_le32(flash + 4U);
    candidate->entryTarget = candidate->entryWord & ~UINT32_C(1);
    if (candidate->initialSp < request->ramBase || candidate->initialSp > ramEnd ||
        candidate->initialSp % 8U != 0U) {
        return RUNTIME_BAD_SP;
    }
    if ((candidate->entryWord & 1U) == 0U || request->execStart < request->flashBase ||
        request->execEnd > flashEnd || request->execStart > request->execEnd ||
        candidate->entryTarget < request->execStart || candidate->entryTarget > request->execEnd ||
        request->execEnd - candidate->entryTarget < 2U) {
        return RUNTIME_BAD_ENTRY;
    }
    return RUNTIME_OK;
}
/**
 * @brief Validate the whole request, prepare bounded scratch RAM and commit.
 * @param[in] flash Real initialized byte object under the header preconditions.
 * @param[in] request Real initialized metadata, distinct from other objects.
 * @param[in,out] ram Initialized accepted output; unchanged on failure.
 * @param[in,out] report Initialized accepted report; unchanged on failure.
 * @return Explicit status, independent of assertions and NDEBUG.
 */
RuntimeStatus runtime_image_initialize(const uint8_t *flash, const RuntimeRequest *request,
                                       uint8_t *ram, RuntimeReport *report)
{
    uint8_t scratch[RUNTIME_CAPACITY];
    RuntimeReport candidate = {0U, 0U, 0U, 0U, 0U, false};
    RuntimeStatus status;
    size_t index;
    /**
     * NULL checks precede every caller access. Non-NULL is not a validity proof.
     **/
    if (flash == NULL || request == NULL || ram == NULL || report == NULL) {
        return RUNTIME_INVALID_ARGUMENT;
    }
    if (request->flashLength > RUNTIME_CAPACITY || request->ramLength == 0U ||
        request->ramLength > RUNTIME_CAPACITY) {
        return RUNTIME_BAD_LENGTH;
    }
    if (request->flashLength < 8U) {
        return RUNTIME_BAD_VECTOR;
    }
    status = validate_context(flash, request, &candidate);
    if (status != RUNTIME_OK) {
        return status;
    }
    status = validate_regions(request);
    if (status != RUNTIME_OK) {
        return status;
    }
    for (index = 0U; index < request->ramLength; ++index) {
        scratch[index] = ram[index];
    }
    for (index = 0U; index < request->dataLength; ++index) {
        scratch[request->dataDestination + index] = flash[request->dataSource + index];
    }
    for (index = 0U; index < request->bssLength; ++index) {
        scratch[request->bssDestination + index] = 0U;
    }
    candidate.copied = request->dataLength;
    candidate.zeroed = request->bssLength;
    candidate.mainReady = true;
    /**
     * No fallible operation remains. Commit only under single-context ownership.
     **/
    for (index = 0U; index < request->ramLength; ++index) {
        ram[index] = scratch[index];
    }
    *report = candidate;
    return RUNTIME_OK;
}
#ifdef RUNTIME_IMAGE_TEST
/**
 * @brief Report a failed expectation with checked I/O.
 * @param[in] condition Behavioral result.
 * @param[in] name Diagnostic literal.
 * @return Whether the expectation passed.
 */
static bool expect_true(bool condition, const char *name)
{
    /**
     * Returning false remains effective with NDEBUG.
     **/
    if (!condition) {
        if (fprintf(stderr, "FAIL runtime: %s\n", name) < 0) {
            return false;
        }
        if (fflush(stderr) != 0) {
            return false;
        }
    }
    return condition;
}
/**
 * @brief Compare named report fields, never indeterminate structure padding.
 * @param[in] left First live initialized report.
 * @param[in] right Second live initialized report.
 * @return Whether every meaningful field agrees.
 */
static bool same_report(const RuntimeReport *left, const RuntimeReport *right)
{
    /**
     * A structure assignment preserves values without defining padding bytes.
     **/
    return left->initialSp == right->initialSp && left->entryWord == right->entryWord &&
           left->entryTarget == right->entryTarget && left->copied == right->copied &&
           left->zeroed == right->zeroed && left->mainReady == right->mainReady;
}
/**
 * @brief Check failure status and all actual output bytes/meaningful fields.
 * @param[in] flash Real initialized input, or NULL for the explicit NULL case.
 * @param[in] request Real initialized metadata, or NULL.
 * @param[in,out] ram Real64-byte accepted output, never NULL here.
 * @param[in,out] report Real initialized accepted report.
 * @param[in] expected Independently specified status.
 * @param[in] nullOutput Zero normally, one for RAM NULL, two for report NULL.
 * @return Whether rejection and complete preservation hold.
 */
static bool expect_rejected(const uint8_t *flash, const RuntimeRequest *request, uint8_t *ram,
                            RuntimeReport *report, RuntimeStatus expected, unsigned int nullOutput)
{
    uint8_t before[RUNTIME_CAPACITY];
    RuntimeReport prior = *report;
    RuntimeStatus status;
    /**
     * Snapshot only real initialized storage, even when a call argument is NULL.
     **/
    memcpy(before, ram, sizeof before);
    status = runtime_image_initialize(flash, request, nullOutput == 1U ? NULL : ram,
                                      nullOutput == 2U ? NULL : report);
    if (!expect_true(status == expected, "rejection status")) {
        return false;
    }
    return expect_true(memcmp(before, ram, sizeof before) == 0 && same_report(&prior, report),
                       "rejection preserves every output byte and report field");
}
/**
 * @brief Exercise real initialized metadata faults and exact endpoints.
 * @param[in,out] flash Real64-byte fixture input.
 * @param[in,out] ram Real64-byte accepted image.
 * @param[in,out] report Real accepted report.
 * @return Whether all independently specified cases pass.
 */
static bool check_boundaries(uint8_t *flash, uint8_t *ram, RuntimeReport *report)
{
    const RuntimeRequest seed = {4096U, 8192U, 64U, 64U, 4112U, 4114U, 32U, 8U, 4U, 16U, 4U};
    RuntimeRequest request;
    RuntimeStatus status;
    size_t index;
    const uint8_t badSp[4][4] = {{255U, 31U, 0U, 0U}, {65U, 32U, 0U, 0U},
                                {60U, 32U, 0U, 0U}, {255U, 255U, 255U, 255U}};
    /**
     * All four NULL positions are guarded before any pointee access.
     **/
    if (!expect_rejected(NULL, &seed, ram, report, RUNTIME_INVALID_ARGUMENT, 0U) ||
        !expect_rejected(flash, NULL, ram, report, RUNTIME_INVALID_ARGUMENT, 0U) ||
        !expect_rejected(flash, &seed, ram, report, RUNTIME_INVALID_ARGUMENT, 1U) ||
        !expect_rejected(flash, &seed, ram, report, RUNTIME_INVALID_ARGUMENT, 2U)) {
        return false;
    }
    for (index = 0U; index < 4U; ++index) {
        memcpy(flash, badSp[index], 4U);
        if (!expect_rejected(flash, &seed, ram, report, RUNTIME_BAD_SP, 0U)) {
            return false;
        }
    }
    flash[0] = 64U;
    flash[1] = 32U;
    flash[2] = 0U;
    flash[3] = 0U;
    flash[4] = 16U;
    if (!expect_rejected(flash, &seed, ram, report, RUNTIME_BAD_ENTRY, 0U)) {
        return false;
    }
    flash[4] = 19U;
    if (!expect_rejected(flash, &seed, ram, report, RUNTIME_BAD_ENTRY, 0U)) {
        return false;
    }
    flash[4] = 15U;
    if (!expect_rejected(flash, &seed, ram, report, RUNTIME_BAD_ENTRY, 0U)) {
        return false;
    }
    flash[4] = 17U;
    for (index = 0U; index < 21U; ++index) {
        RuntimeStatus expected = RUNTIME_BAD_RANGE;
        request = seed;
        switch (index) {
            case 0U:
                request.execEnd = 4113U;
                expected = RUNTIME_BAD_ENTRY;
                break;
            case 1U:
                request.execEnd = 4161U;
                expected = RUNTIME_BAD_ENTRY;
                break;
            case 2U:
                request.flashLength = 7U;
                expected = RUNTIME_BAD_VECTOR;
                break;
            case 3U:
                request.ramLength = 0U;
                expected = RUNTIME_BAD_LENGTH;
                break;
            case 4U:
                request.flashBase = UINT32_MAX - 63U;
                expected = RUNTIME_ADDRESS_OVERFLOW;
                break;
            case 5U:
                request.ramBase = UINT32_MAX - 63U;
                expected = RUNTIME_ADDRESS_OVERFLOW;
                break;
            case 6U:
                request.dataSource = 61U;
                break;
            case 7U:
                request.dataDestination = 61U;
                break;
            case 8U:
                request.bssDestination = 61U;
                break;
            case 9U:
                request.bssDestination = 10U;
                expected = RUNTIME_OVERLAP;
                break;
            case 10U:
                request.dataSource = SIZE_MAX;
                expected = RUNTIME_ADDRESS_OVERFLOW;
                break;
            case 11U:
                request.dataDestination = SIZE_MAX;
                expected = RUNTIME_ADDRESS_OVERFLOW;
                break;
            case 12U:
                request.bssDestination = SIZE_MAX;
                expected = RUNTIME_ADDRESS_OVERFLOW;
                break;
            case 13U:
                request.dataSource = 65U;
                request.dataLength = 0U;
                break;
            case 14U:
                request.dataDestination = 65U;
                request.dataLength = 0U;
                break;
            case 15U:
                request.bssDestination = 65U;
                request.bssLength = 0U;
                break;
            case 16U:
                request.dataLength = SIZE_MAX;
                expected = RUNTIME_ADDRESS_OVERFLOW;
                break;
            case 17U:
                request.bssLength = SIZE_MAX;
                expected = RUNTIME_ADDRESS_OVERFLOW;
                break;
            case 18U:
                request.flashLength = 0U;
                expected = RUNTIME_BAD_VECTOR;
                break;
            case 19U:
                request.flashLength = 35U;
                break;
            default:
                request.execStart = 4113U;
                expected = RUNTIME_BAD_ENTRY;
                break;
        }
        if (!expect_rejected(flash, &request, ram, report, expected, 0U)) {
            return false;
        }
    }
    request = seed;
    request.dataSource = 64U;
    request.dataDestination = 64U;
    request.dataLength = 0U;
    request.bssDestination = 64U;
    request.bssLength = 0U;
    status = runtime_image_initialize(flash, &request, ram, report);
    if (!expect_true(status == RUNTIME_OK && report->copied == 0U && report->zeroed == 0U &&
                     report->mainReady, "all-empty regions with exact endpoints")) {
        return false;
    }
    request = seed;
    request.bssDestination = 64U;
    request.bssLength = 0U;
    status = runtime_image_initialize(flash, &request, ram, report);
    if (!expect_true(status == RUNTIME_OK && report->copied == 4U && report->zeroed == 0U,
                     "empty BSS exact endpoint")) {
        return false;
    }
    request = seed;
    request.dataSource = 64U;
    request.dataDestination = 64U;
    request.dataLength = 0U;
    status = runtime_image_initialize(flash, &request, ram, report);
    if (!expect_true(status == RUNTIME_OK && report->copied == 0U && report->zeroed == 4U,
                     "empty data exact endpoints")) {
        return false;
    }
    request = seed;
    request.dataSource = 60U;
    request.dataDestination = 60U;
    request.bssDestination = 56U;
    status = runtime_image_initialize(flash, &request, ram, report);
    if (!expect_true(status == RUNTIME_OK && ram[56] == 0U && ram[59] == 0U && ram[63] == 165U,
                     "nonempty exact endpoints and adjacent regions")) {
        return false;
    }
    flash[0] = 0U;
    status = runtime_image_initialize(flash, &seed, ram, report);
    if (!expect_true(status == RUNTIME_OK && report->initialSp == 8192U,
                     "inclusive bottom stack boundary under model policy")) {
        return false;
    }
    flash[0] = 64U;
    return true;
}
/**
 * @brief Reject over-capacity metadata using truthful actual65-byte objects.
 * @return Whether both capacity rejections preserve all real output storage.
 */
static bool check_capacity(void)
{
    uint8_t flash[65];
    uint8_t ram[65];
    uint8_t before[65];
    RuntimeRequest request = {4096U, 8192U, 65U, 65U, 4112U, 4114U, 32U, 8U, 4U, 16U, 4U};
    RuntimeReport report = {8256U, 4113U, 4112U, 4U, 4U, true};
    RuntimeReport prior = report;
    RuntimeStatus status;
    /**
     * The larger real objects make capacity rejection a defined experiment.
     **/
    memset(flash, 165, sizeof flash);
    memset(ram, 165, sizeof ram);
    memcpy(before, ram, sizeof before);
    status = runtime_image_initialize(flash, &request, ram, &report);
    if (!expect_true(status == RUNTIME_BAD_LENGTH, "real65-byte Flash capacity rejection")) {
        return false;
    }
    if (!expect_true(memcmp(before, ram, sizeof before) == 0 && same_report(&prior, &report),
                     "all65 actual bytes preserved")) {
        return false;
    }
    request.flashLength = 64U;
    status = runtime_image_initialize(flash, &request, ram, &report);
    if (!expect_true(status == RUNTIME_BAD_LENGTH, "real65-byte RAM capacity rejection")) {
        return false;
    }
    return expect_true(memcmp(before, ram, sizeof before) == 0 && same_report(&prior, &report),
                       "RAM capacity rejection preserves bytes and report");
}
/**
 * @brief Execute the independently specified64-byte fixture.
 * @return Zero only when every check and final output succeeds.
 */
int main(void)
{
    uint8_t flash[RUNTIME_CAPACITY];
    uint8_t ram[RUNTIME_CAPACITY];
    RuntimeRequest request = {4096U, 8192U, 64U, 64U, 4112U, 4114U, 32U, 8U, 4U, 16U, 4U};
    RuntimeReport report = {0U, 0U, 0U, 0U, 0U, false};
    RuntimeStatus status;
    size_t index;
    const uint8_t vector[8] = {64U, 32U, 0U, 0U, 17U, 16U, 0U, 0U};
    const uint8_t data[4] = {17U, 34U, 51U, 68U};
    /**
     * Every object is real and initialized before a rejection fixture can run.
     **/
    memset(flash, 165, sizeof flash);
    memset(ram, 165, sizeof ram);
    memcpy(flash, vector, sizeof vector);
    memcpy(flash + 32U, data, sizeof data);
    status = runtime_image_initialize(flash, &request, ram, &report);
    if (!expect_true(status == RUNTIME_OK, "baseline status")) {
        return 1;
    }
    for (index = 0U; index < RUNTIME_CAPACITY; ++index) {
        uint8_t expected = 165U;
        if (index >= 8U && index <= 11U) {
            expected = data[index - 8U];
        } else if (index >= 16U && index <= 19U) {
            expected = 0U;
        }
        if (!expect_true(ram[index] == expected, "literal RAM bytes")) {
            return 1;
        }
    }
    if (!expect_true(report.initialSp == 8256U && report.entryWord == 4113U &&
                     report.entryTarget == 4112U && report.copied == 4U && report.zeroed == 4U &&
                     report.mainReady, "meaningful report fields")) {
        return 1;
    }
    if (!check_boundaries(flash, ram, &report)) {
        return 1;
    }
    if (!check_capacity()) {
        return 1;
    }
    if (puts("PASS runtime: fixed64-byte image, transactional boundaries and live checks") == EOF) {
        return 1;
    }
    if (fflush(stdout) != 0) {
        return 1;
    }
    return 0;
}
#endif
```

### README.txt：完整复现与调用条件 {#runtime-source-instructions}

```text
reset-runtime: original embedded-notes fictional image initializer (C11)

Files: runtime_image.h, runtime_image.c, README.txt. Keep the header beside C.
No device, target startup, function-pointer jump, MMIO or hardware is exercised.
Original project teaching code; no third-party authorship or license is implied.

Prerequisite: an already installed host C11 compiler with eight-bit bytes,
uint8_t, uint32_t and size_t. No installation or board is needed by this lab.
From this directory, using your compiler driver in place of cc:

cc --version
cc -std=c11 -Wall -Wextra -Werror -Wconversion -Wshadow -pedantic -DRUNTIME_IMAGE_TEST runtime_image.c -o runtime-test
./runtime-test
cc -std=c11 -Wall -Wextra -Werror -Wconversion -Wshadow -pedantic -DRUNTIME_IMAGE_TEST -DNDEBUG runtime_image.c -o runtime-ndebug
./runtime-ndebug
cc -std=c11 -Wall -Wextra -Werror -Wconversion -Wshadow -pedantic -c runtime_image.c -o runtime_image.o

Windows: use the installed driver's name, add .exe to executable output names,
and run .\runtime-test.exe / .\runtime-ndebug.exe in PowerShell. Stop immediately
if a compilation or execution fails; do not run an older executable. In a
managed project requiring a build router, put these identical compiler argv
into its existing custom profile and run validate, dry-run, then build for EACH
actual compile/link. Never use a helper to bypass the project build route.

Expected normal and NDEBUG execution: exit0 and
PASS runtime: fixed64-byte image, transactional boundaries and live checks
An expectation or I/O failure exits nonzero. Runtime checks do not use assert.
Local author validation used existing host GCC13.1.0 via mcu-build custom
validate -> dry-run -> build, including normal/NDEBUG runs and module compile.
This is host evidence, not a target reset or physical startup validation.

Independent fixed fixture: actual64-byte Flash and RAM arrays. Labels0x1000
and0x2000 are integers only. Fill RAM with0xA5; little-endian Flash0..7 bytes
are [64,32,0,0,17,16,0,0], decoding SP0x2040 and entry0x1011 -> target0x1010.
Executable extent [0x1010,0x1012) contains one complete minimum2-byte unit;
no instruction decoding/execution is claimed. Flash32..35=[17,34,51,68].
dataSource32, dataDestination8, dataLength4; bssDestination16,bssLength4.
Success: RAM8..11=[17,34,51,68],16..19=[0,0,0,0], all other bytes0xA5.
Report: initialSp8256,entryWord4113,entryTarget4112,copied4,zeroed4,mainReadytrue.

Use independently of tests: include runtime_image.h in a caller, compile
runtime_image.c without RUNTIME_IMAGE_TEST, and link runtime_image.o. Create
four distinct live, initialized, nonoverlapping objects: readable Flash bytes,
RuntimeRequest, writable RAM bytes and writable RuntimeReport. Supply truthful
actual spans. The call reads/writes only request.flashLength/ramLength bytes;
the caller must ensure the underlying storage really covers them. NULL is
rejected, but an arbitrary non-NULL/dangling/forged pointer or a dishonest span
cannot be validated by this function. Never test those by executing invalid C.
Single execution context, no concurrent access or mutation through aliases.

runtime_image_initialize(flash,&request,ram,&report) validates the WHOLE request
before preparing a private64-byte scratch array. It copies data, zeros BSS,
then commits RAM and named report fields only on RUNTIME_OK. On every rejected
call, all actual accepted RAM bytes and all report fields remain unchanged.
Check status immediately; an unchanged old mainReadytrue is an OLD accepted
report after failure, not evidence that the rejected request succeeded.

Lengths: Flash8..64, RAM1..64. Labels and exclusive endpoints fit uint32_t;
offsets/lengths fit size_t. SP interval includes both RAM boundary endpoints
and requires8-byte alignment, both explicit teaching policies. Empty stack
space at the bottom endpoint is not proof of a usable real call stack.
Entry bit0 must be1; cleared target must have two complete bytes inside the
declared executable interval, itself inside Flash. Entry at end is rejected.
Data source/destination and BSS destination must fit, with no nonempty target
overlap. Check offset+length overflow before arithmetic. Empty data/BSS still
require offset<=object length; an exact endpoint is legal only for zero bytes.
Loops do no pointer formation for those empty regions. Both-empty is allowed.

Statuses: RUNTIME_INVALID_ARGUMENT(NULL), RUNTIME_BAD_LENGTH(capacity policy),
RUNTIME_ADDRESS_OVERFLOW(endpoint or size addition), RUNTIME_BAD_VECTOR(<8),
RUNTIME_BAD_SP(range/alignment), RUNTIME_BAD_ENTRY(Thumb/extent),
RUNTIME_BAD_RANGE(region), RUNTIME_OVERLAP(destinations), RUNTIME_OK(commit).
Fault precedence follows the source, not a promise to list every defect.

Tests use initialized real storage for NULL positions, missing Thumb, entry
before/at end/incomplete extent, SP outside/misaligned, short vector/regions,
label and SIZE_MAX arithmetic, overlap, empty endpoints and nonempty exact ends.
They compare bytes and meaningful report fields, never structure padding.
Main-ready is only this model's completed transaction. Linker placement, actual
core reset, chosen startup/runtime/library contract, boot remapping and a
bootloader's controlled transfer require separate target-specific evidence.
```

小产物：保留编译器身份、命令和三种检查的实际结果；用自己的话说明一笔OVERLAP为什么不能损坏旧mainReady=true报告。宿主验证是已执行的有限证据，不能代替目标启动、硬件或断电验证。

## 十题：基础、故障与受控转交 {#runtime-practice-title}

<p class="practice-intro">每题包含独立前提；先写结论与原因，再展开原生答案。普通打印展开后恢复原折叠；题目专用打印保留所有数字和条件，隐藏答案与其他已解结果。打印分发失败也恢复原折叠和临时模式。</p><div class="notes-toolbar"><button id="expand-notes" class="btn" type="button">展开全部答案</button><button id="collapse-notes" class="btn" type="button">折叠全部答案</button><button id="print-questions" class="btn primary" type="button">只打印题目</button></div><div id="recall-questions"><article class="exercise" id="runtime-exercise-01"><h3 id="runtime-question-01">01 · 基础：解码前两字</h3><p>虚构64字节Flash标签0x1000，小端偏移0..7为[64,32,0,0,17,16,0,0]。RAM标签0x2000、长64。解码SP和入口字，清除入口状态位后目标是多少？向量槽地址是不是SP值？</p><details class="exercise-answer" id="runtime-answer-01"><summary>展开本题原因</summary><p>SP=0x2040=8256；入口字0x1011=4113；目标0x1010=4112。槽在Flash偏移0，里面存的边界值指向另一空间；不能把槽位置与所存数值混为一谈。下一步才检查范围和Thumb。</p></details></article><article class="exercise" id="runtime-exercise-02"><h3 id="runtime-question-02">02 · 基础：逐字节复制</h3><p>真实64字节Flash/RAM，RAM全165。Flash32..35为17,34,51,68，data源32、目标8、长4，BSS目标16、长4；其他上下文有效且执行范围[0x1010,0x1012)。成功后RAM8..11、16..19及其余56字节是什么？</p><details class="exercise-answer" id="runtime-answer-02"><summary>展开本题原因</summary><p>8..11为17,34,51,68；16..19为0；其余56字节保持165。data复制初值，BSS由零填充取得初值，二者责任不同。main-ready只表示这笔有限事务完成。</p></details></article><article class="exercise" id="runtime-exercise-03"><h3 id="runtime-question-03">03 · 基础：装载与运行地址</h3><p>虚构Flash从0x1000开始，四个data初值位于偏移32；RAM从0x2000开始，目标偏移8。给出LMA和VMA标签；BSS偏移16长4是否必需在Flash有四个零负载字节？</p><details class="exercise-answer" id="runtime-answer-03"><summary>展开本题原因</summary><p>LMA0x1020，VMA0x2008。BSS需四个RAM字节和实际零初始化责任，不能由RAM大小推得同量Flash零负载。链接器安排地址，启动/运行时或装载器合同负责执行初始化。</p></details></article><article class="exercise" id="runtime-exercise-04"><h3 id="runtime-question-04">04 · 故障：Thumb与完整入口</h3><p>执行范围[0x1010,0x1012)，最低完整单元2字节，其他条件有效。入口字依次为0x1010、0x1013；另一次入口0x1011但范围改为[0x1010,0x1011)。三次是否接受？</p><details class="exercise-answer" id="runtime-answer-04"><summary>展开本题原因</summary><p>三次均BAD_ENTRY。第一缺bit0=1；第二清位后0x1012已在排他末端；第三只剩1字节。不能只比较目标小于Flash总末端，必须检查声明可执行范围和完整单元。</p></details></article><article class="exercise" id="runtime-exercise-05"><h3 id="runtime-question-05">05 · 故障：SP边界与对齐</h3><p>RAM边界区间[0x2000,0x2040]，模型要求8字节对齐、允许顶端；向量其他条件有效。SP=0x2040、0x203C、0x2048各怎样？接受是否证明一次函数调用也安全？</p><details class="exercise-answer" id="runtime-answer-05"><summary>展开本题原因</summary><p>0x2040接受；0x203C虽在范围内但不按8对齐，BAD_SP；0x2048超顶端，BAD_SP。接受不证明实际栈需求、真实RAM或ABI全部条件；8对齐为本模型政策。</p></details></article><article class="exercise" id="runtime-exercise-06"><h3 id="runtime-question-06">06 · 故障：先复制再发现重叠</h3><p>64字节RAM原有一份已接受结果，报告copied4、zeroed4、mainReady=true。新请求data目标8长4、BSS目标10长4，其他条件有效。应该返回什么？旧RAM和全部报告字段怎样？</p><details class="exercise-answer" id="runtime-answer-06"><summary>展开本题原因</summary><p>OVERLAP，[8,12)与[10,14)相交。整笔在写入前拒绝，旧64字节和全部命名报告字段保持；旧true仍只说明旧请求成功。先复制再查BSS会破坏事务合同。</p></details></article><article class="exercise" id="runtime-exercise-07"><h3 id="runtime-question-07">07 · 边界：空段也有端点</h3><p>Flash和RAM各64字节，上下文有效。A：data源64目标64长0，BSS目标64长0。B：仅把A的data源改65。C：data源60目标60长4，BSS目标56长4。分别怎样，是否允许形成不存在的指针？</p><details class="exercise-answer" id="runtime-answer-07"><summary>展开本题原因</summary><p>A可OK，copied=zeroed=0且不操作空段指针；B为BAD_RANGE，空段也要求端点≤64；C可OK，完整末端相等且目标相接不相交。合法空段不是任意地址运算的授权。</p></details></article><article class="exercise" id="runtime-exercise-08"><h3 id="runtime-question-08">08 · 故障：溢出发生在检查前</h3><p>32位标签FlashBase=4294967232，flashLength64；另一请求在真实对象中令dataSource=SIZE_MAX、dataLength4。为什么不能先计算两者的和再检查？输出怎样？</p><details class="exercise-answer" id="runtime-answer-08"><summary>展开本题原因</summary><p>两者分别超出uint32_t排他端点或size_t偏移加法，ADDRESS_OVERFLOW。先用length>MAX-base/offset检查，避免包回后看似很小。两笔都保持原RAM和报告；不需要访问该无效区域来验证拒绝。</p></details></article><article class="exercise" id="runtime-exercise-09"><h3 id="runtime-question-09">09 · 迁移：NULL与谎报span</h3><p>有真实初始化Flash[64]、RAM[64]、RuntimeRequest和RuntimeReport。A把flash实参设NULL；B把某个非NULL整数强转指针；C谎报RAM具有128字节。函数能对哪些情况作安全保证？应怎样构造错误测试？</p><details class="exercise-answer" id="runtime-answer-09"><summary>展开本题原因</summary><p>A安全返回INVALID_ARGUMENT且保持输出。B和C违反真实对象/span前提，不能执行后声称函数通用检测。需要测试超过容量65时应提供真实65字节存储；区域元数据越界则使用真实对象并只改变整数。保持对象非别名且存活。</p></details></article><article class="exercise" id="runtime-exercise-10"><h3 id="runtime-question-10">10 · 迁移：一次分支与运行库责任</h3><p>选定CMSIS5.9.0 ARMCM4例子：Reset_Handler先SystemInit再__PROGRAM_START，默认GCC入口copy-table→zero-table→_start，模板zero-table可不列普通.bss。bootloader只普通分支到目标时，能声称完整硬件复位且普通.bss已被该zero-table清零吗？</p><details class="exercise-answer" id="runtime-answer-10"><summary>展开本题原因</summary><p>两项都不能。普通分支不重演核心/芯片复位副作用，转交必须建立并声明自己的上下文。普通.bss若不在zero-table中，该循环便没有清它；应核对选定_start/运行库和链接合同。本章模型main-ready也不证明真实启动。</p></details></article></div><p class="practice-intro">隔一天把data值换成0,255,7,9，目标改为24长4、BSS改32长4，先手算再执行。分别解释“入口完整单元”“LMA/VMA”“旧mainReady报告”“真实span”里最卡住的一处，可继续向助手追问；章节覆盖与一次选对不能证明长期掌握。</p>

## 核对资料、读到哪里与证据边界 {#runtime-sources-title}

资料核对2026-10-17；固定夹具、图、代码和问题为本项目原创。只在实际读到的条款范围引用，不把下载成功等同于硬件验证。

- [PM0214 Rev10，2020年3月](https://www.st.com/resource/en/programming_manual/pm0214-stm32-cortexm4-mcus-and-mpus-programming-manual-stmicroelectronics.pdf)：已读§2.1.3 pp19、23与§2.3.4 p40，限所述Cortex-M4核心的初始MSP/PC、向量和Thumb语义。**首选阅读任务：**先看p19的Stack pointer/Program counter，分别圈出“取值槽位”和“被装入的值”，再对照本章虚构标签。
- [CMSIS5.9.0固定commit的startup_ARMCM4.c](https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/Device/ARM/ARMCM4/Source/startup_ARMCM4.c)、[cmsis_gcc.h](https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/CMSIS/Core/Include/cmsis_gcc.h#L117)、[gcc_arm.ld](https://github.com/ARM-software/CMSIS_5/blob/2b7495b8535bdcb306dac29b9ded4cfb679d7e5c/Device/ARM/ARMCM4/Source/GCC/gcc_arm.ld)：已读Reset_Handler、__cmsis_start及copy/zero/data/BSS段；默认宏可被覆盖，普通BSS责任继续依赖所选_start/运行库。不是通用启动顺序承诺。
- [GNU ld2.36 §3.1、§3.6.8.2](https://www.sourceware.org/binutils/docs-2.36/ld.html#Output-Section-LMA)：已读VMA/LMA定义和ROM→RAM/data、BSS示例；支撑布局和初始化责任的区别，不证明本模型具有目标固件格式。
- [ST RM0090历史Rev5，2013年9月，§2.4 pp69–70](https://www.keil.com/dd/docs/datashts/st/stm32f4xx/dm00031020.pdf)：有界文本已读，仅用于明确芯片启动alias/remap与核心角色不同；历史版本不是最新手册。未在真实芯片核实BOOT、电源或重映射。

本地C检查和JS模型/控制器检查分开记录。目标启动、硬件、物理纸张以及本批发布仍是独立证据状态；主机输出不能把它们推进为通过。无账号、浏览器存储或外部执行服务。

## 把初始上下文接到内存预算 {#runtime-next-title}

现在能说明镜像字节怎样变成有限RAM状态；下一章单元08继续检查静态区域、堆预留、同时活跃的调用帧与中断需求能否放进同一个RAM信封，再由单元09连接时钟树与时间基准。可直接进入内存预算章节，或回到阶段02地图核对完整顺序。下一阶段10–14仍待建设，定时器从10开始；完整终点仍是32单元、八阶段和可复现的终端证据，不以本章候选冒充整门课程完成。

<div class="next-links"><a href="../learn/build-link-identity.html">上一章：构建、链接与身份</a><a href="../learn/reset-runtime-reference.html">本章打印速查</a><a href="../learn/memory-budget.html">下一章：静态内存、堆与调用栈预算</a><a href="../learn/engineering-map.html#stage-02">阶段02地图</a><a href="../mcu/cortex-m-cpu-registers.html#stack-link-pc-title">CPU寄存器桥梁</a></div>
