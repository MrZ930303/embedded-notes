# 预处理、编译、链接与构建身份 {#build-link-identity}

先让四个字节跨文件得到170，再解释你运行的是哪一次构建。

阶段02 · 单元06 · 构建与启动；本地候选；硬件未验证。

## 把四个采样字节交给一个有身份的程序 {#build-overview-title}

<p>上一章的有界 FIFO 解决“哪些采样值还在队里”；本章解决“现在运行的到底是哪一次构建”。采集终端以后可以升级，现场错误日志若只写“版本1”，很难判断它来自哪份源文件、哪组编译选项和哪一个可执行文件。先把这些关系做成可核对的证据，再谈升级安全。</p><p>前置：能读 C 函数声明、数组、返回状态和上一章的对象边界；不需要开发板或链接脚本经验。本章只用17、34、51、68四个真实字节，跨文件求和170并报告生成的版本。浏览器练习是原创建模，浏览器没有调用编译器；宿主 C 执行、ARM 交叉链接、硬件启动是不同证据。</p><p><strong>短路线：</strong>先用一段写出“声明为何不等于定义”，再画出四个阶段；下一段保留一次成功宿主输出和两条真实链接错误；最后生成一张身份清单。每段交一个小成果，深读源码与十题可以另分两次完成。完整解释都保留在本页，无脚本也可阅读、下载与展开原生答案。</p><p>本章交付物是一份能重做的多文件实验、一张输入到产物的关系图和一份证据记录。它不保存你的答案、分数或推断掌握情况；本课程仍是32单元、八阶段，06—09属于阶段02，10—14才是下一阶段。</p>

## 先把声明、定义和翻译单元分开 {#build-vocabulary-title}

<p><strong>声明（declaration）</strong>让当前编译器知道名字、类型与调用形式。measurement.h 中的 measurement_sum 声明让 main.c 检查参数和返回类型。<strong>定义（definition）</strong>提供实际函数体；本例只有 measurement.c 定义 measurement_sum。把头文件包含两次并不会因此产生两个函数体；反过来，仅把声明放进头文件也不会给链接器创造缺少的函数体。</p><p><strong>翻译单元（translation unit）</strong>在本例中是一个 .c 经预处理后得到的编译输入，其中已经展开它包含的头文件和宏。main.c、measurement.c、生成的 build_identity.c 分别形成三个翻译单元。头文件不是“等待自动合并的第四份实现”；编译命令必须选中需要的定义。</p><p>main.c 的调用经过类型检查仍留下对 measurement_sum 的外部引用。measurement.o 里提供该强函数定义，链接器才有目标可解析。这里“强定义”指本实验普通外部函数定义，与 static 本地名字、弱符号、common符号另有规则；不能把所有同名声明概括成重复定义错误。</p><p><strong>目标文件（relocatable object）</strong>保存机器码、数据和供后续处理的符号/重定位信息。它可以同时含自己定义的名字和尚未解决的引用。链接成功需要本次输入足够，不是某个 .o 文件单独存在就能运行。编译器驱动 gcc 可以一次调多个工具，也可以用选项停在中间。</p><p>小成果：在 main.c 旁写“使用声明并产生引用”，在 measurement.c 旁写“提供定义”。把省略 measurement.o 的后果留到链接阶段，而不是说头文件失效。</p>

## 四步分别得到什么，怎样实际停下来 {#build-stages-title}

<figure id="build-stage-diagram"><figcaption><strong>原创阶段与依赖图：</strong>箭头表示本工具链的一次变换，卡片内先写输入，再写输出；扩展名不是运行许可。</figcaption><div class="stage-flow" role="img" aria-label="每个.c与其头文件经预处理成.i，编译成.s，汇编成.o，三个.o与库经链接成宿主PE可执行文件及map"><div><b>1 预处理 →</b><span>.c + 包含的.h</span><span>-E → .i</span></div><div><b>2 编译 →</b><span>预处理后输入</span><span>-S → .s</span></div><div><b>3 汇编 →</b><span>汇编输入</span><span>-c → .o</span></div><div><b>4 链接</b><span>多个.o + 所需库</span><span>解析引用 / 布局 / 输出</span></div></div><p>图例：→表示依赖与阶段顺序；.i是预处理文本，.s是汇编文本，.o是可重定位目标。三个翻译单元各走自己的前三步，再汇合到一次链接。宿主链接另有所需的运行库；人工 ARM 实验选择 -nostdlib 并不自动获得这些运行时服务。图不按文件大小绘制，没有“速度”或“已运行”的含义。</p></figure><p>预处理展开包含和宏，让声明实际出现在当前输入；编译把语言表达转成选定目标的汇编层表示；汇编产生带符号与重定位的目标文件；链接根据本次目标文件及库解析引用并放置输出段。本例显式保存中间文件以便检查，工具链并不需要在每次普通构建时把全部中间文本永久写盘。</p><p>GCC13.1手册§3.2和已安装 ARM GCC10.3系列随附同名章节支持下列停止点：-E停止在预处理后；-S停止在编译后、不汇编；-c编译/汇编到目标而不链接；-o命名主要输出。-c处理.c时可以隐含前两步，所以不能把“-c”读成“只做汇编”。<a href="#build-source-gcc">版本与原始来源</a>在末节。</p><div class="table-wrap" role="region" tabindex="0" aria-label="真实实验的阶段输入与输出"><table><caption>真实实验的阶段输入与输出</caption><thead><tr><th scope="col">选中命令的主要参数</th><th scope="col">输入</th><th scope="col">保存的输出</th><th scope="col">这一步还不能证明</th></tr></thead><tbody><tr><td>-E main.c -o main.i</td><td>main.c、头文件</td><td>预处理文本main.i</td><td>measurement定义到达链接器</td></tr><tr><td>-S measurement.c -o measurement.s</td><td>measurement.c、头文件</td><td>汇编文本measurement.s</td><td>最终符号已解析</td></tr><tr><td>-c main.c / measurement.c / build_identity.c</td><td>各自的翻译单元</td><td>三个.o</td><td>三个.o已共同链接</td></tr><tr><td>main.o measurement.o build_identity.o -Map</td><td>目标文件、所需运行库</td><td>terminal.exe与terminal.map</td><td>开发板能够复位启动</td></tr></tbody></table></div><p>手算本例的数据关系：17+34=51，51+51=102，102+68=170。这里独立期望是170；测试没有再调用 measurement_sum 来计算“正确答案”。最大接受16个255得到4080，小于uint32_t可表示上界。空输入count=0得到0；边界与拒绝在源码合同中完整说明。</p><p>小成果：保留main.i，找到measurement_sum声明；在measurement.s里找到函数；再用nm观察main.o的U和measurement.o的T。它们分别是引用与定义，不是“错误标记”和“测试通过”。</p>

## 成功输出之后，做两次真实链接失败 {#build-real-experiment-title}

<pre role="region" tabindex="0" aria-label="多文件宿主实验，命令经项目构建入口执行"><code>node generate_identity.mjs .
node generate_identity.mjs . --check
# 下列每个编译/链接argv先放入既有custom profile，validate → dry-run → build
gcc -std=c11 -Wall -Wextra -Werror -pedantic -c main.c -o OUT/main.o
gcc -std=c11 -Wall -Wextra -Werror -pedantic -c measurement.c -o OUT/measurement.o
gcc -std=c11 -Wall -Wextra -Werror -pedantic -c build_identity.c -o OUT/build_identity.o
gcc OUT/main.o OUT/measurement.o OUT/build_identity.o -Wl,-Map=OUT/terminal.map -o OUT/terminal.exe
# 仅在本次链接成功且产物新鲜时，运行宿主文件
OUT/terminal.exe 1.0.0
sum=170
version=1.0.0
product=acquisition-terminal
source_manifest_sha256=&lt;本次八成员清单的64个十六进制字符的摘要&gt;
PASS measurement: literal170, max4080, empty0, null, capacity, preservation; NDEBUG-live
</code></pre><p>OUT必须是本次新目录；上面摘要占位符应由生成器的实际结果填入，它不是一个可复制的伪造摘要。下载的README给出每步停止点、自定义profile模板、工具前提和原始故障操作。实际验证宿主GCC13.1.0正常与NDEBUG运行均退出0；本机宿主格式由objdump识别为pei-x86-64，即PE/COFF，不能标为ARM ELF。</p><p><strong>缺少定义：</strong>三个原始源文件先各自编译成功。下一次新链接故意只提供main.o和build_identity.o，省略measurement.o。main.o需要measurement_sum而没有本次输入可提供它，因此真实链接返回非零，原始诊断包含undefined reference与measurement_sum。修复位置是链接输入/构建依赖，不是给main.c再抄一份函数声明。</p><p><strong>重复强定义：</strong>另外把measurement.c编译为第二个独立measurement-second.o，确认对象生成成功；再把它和原来的三个.o一起链接到另一个新目录。两份普通外部函数体都定义measurement_sum，真实链接返回非零并报告multiple definition。不要用两个重复声明来替代这个实验，也不要用允许多重定义的选项掩盖原因。</p><p>失败样本从未执行；新失败目的地没有可选旧可执行文件。即使某工具保留了部分文件，也必须按非零状态拒绝运行。不要写“编译失败后继续运行terminal.exe”；那可能启动上一次的成功产物，输出虽看起来正确，却回答了另一次构建的问题。</p><p>小成果：为每个样本记下“对象是否全编译成功、哪次链接非零、涉及哪个符号、该目录是否有可运行产物”。原始诊断措辞随工具版本变化，阶段和符号原因才是判定依据。</p>

## 一个地址必须和它的产物一起使用 {#build-artifacts-title}

<p><strong>ELF</strong>是结构化对象格式，可有文件头、节、装载段、符号和调试信息。具体包含哪些内容取决于选项；并非所有ELF都是可启动固件。<strong>raw binary</strong>是选中节的装载内容字节，失去等价的自描述地址、符号和调试记录。<strong>map</strong>是链接器的文本布局报告，不是可执行文件，也不是独立来源认证。</p><p>GNU binutils2.36的objcopy说明：-O binary从最低被复制节的装载地址开始输出内容，丢弃符号与重定位信息。由此可推得：同一ELF与bin大小、摘要通常不同，bin自己的起始字节不告诉你该放在哪里。readelf的-h/-S/-l/-s/-n分别观察ELF头、节、段、符号与notes；nm列符号，U表示未定义，T表示text中的名字；具体字母解释仍随格式和工具条件区分。</p><p><strong>VMA（运行地址）</strong>是运行时该段应在的位置；<strong>LMA（装载地址）</strong>是初始内容存放位置。本章人工lesson.ld让.data的运行地址在RAM、初始内容在FLASH；.bss为RAM NOLOAD预留。链接脚本分配这些位置，并没有在运行时自动替处理器复制.data或清零.bss。初始化责任将在<a href="../learn/reset-runtime.html">单元07</a>继续；静态预留与动态峰值将在<a href="../learn/memory-budget.html">单元08</a>继续。</p><p>map能把measurement_sum归到某个输入对象及地址，却只对应这次链接。拿旧map解释新ELF中的地址可能定位到别的函数。保存编译器/链接器版本、选项、原始源和生成源摘要、最终ELF摘要，再附map/nm记录，才有可核对的关系；地址本身不是版本身份。</p><div class="table-wrap" role="region" tabindex="0" aria-label="人工ARM产物与宿主结果分开"><table><caption>人工ARM产物与宿主结果分开</caption><thead><tr><th scope="col">产物/证据</th><th scope="col">本章实际用途</th><th scope="col">明确不成立的推论</th></tr></thead><tbody><tr><td>宿主terminal.exe，PE/COFF</td><td>主机执行sum170与身份输出</td><td>不是ARM ELF或目标运行</td></tr><tr><td>人工lesson.elf / lesson.bin / lesson.map</td><td>已安装Cortex-M4工具的交叉链接与结构检查</td><td>不含复位向量、startup；NOT BOOTABLE</td></tr><tr><td>ARM .data / .bss位置</td><td>解释VMA/LMA/NOLOAD</td><td>不是实际RAM已初始化</td></tr><tr><td>readelf notes中的build-ID</td><td>链接器标识原始链接输出</td><td>不是完整文件SHA256或签名</td></tr></tbody></table></div><p>ARM实验使用-mcpu=cortex-m4 -mthumb -ffreestanding，链接选择-nostdlib和人工16KiB FLASH/4KiB RAM窗口；这些窗口是布局输入，不证明某块芯片有这些可用区域。lesson_entry只提供真实符号引用，缺少向量表、复位入口协议和C运行环境。<strong>明确标记NOT BOOTABLE；从未执行、烧录或连接硬件。</strong>交叉链接成功只证明工具产物关系；若工具不可用应保留失败并标记此范围待补。</p>

## 实际符号、布局和字节关系 {#build-observed-title}

<p>下面是本章实际工具观测的整理，不是浏览器计算。宿主GCC13.1.0；ARM GCC10.3.1 20210824；ARM ld2.36.1.20210621。每个编译/链接都经既有路由逐次validate、dry-run、build。正常/NDEBUG宿主均退出0，missing/duplicate组件编译退出0而真实链接各非零，失败目的地无可执行文件。</p><div class="table-wrap" role="region" tabindex="0" aria-label="实际构建观测，限定为本次源和工具"><table><caption>实际构建观测，限定为本次源和工具</caption><thead><tr><th scope="col">产物/记录</th><th scope="col">字节数</th><th scope="col">实际SHA256</th></tr></thead><tbody><tr><td>宿主PE/COFF terminal.exe</td><td>79521</td><td>1cfe86ec14d7aaa98bf96ba3bb44007e1400908c3cc966b6efd85889b4504267</td></tr><tr><td>人工ARM lesson.elf</td><td>132172</td><td>e1532e96262a46f452efba8ea832072f4eb4d0d4a5f313be5fcea1aeb602bc01</td></tr><tr><td>人工ARM lesson.bin</td><td>304</td><td>14a590b63f7370afb9214d43981ec0a7b1b2d60d94d6205e5796725ea79b0c98</td></tr><tr><td>人工ARM lesson.map（原始本地报告）</td><td>4856</td><td>603c49b85287b370922fc37803aefaaf250ba30cfa59ecf94981121b1ed80102</td></tr></tbody></table></div><pre role="region" tabindex="0" aria-label="同一人工ELF的实际符号与段布局摘录"><code># 省略本地目录，保留真实符号名/地址；数值来自同一人工ARM ELF
08000000 T lesson_entry
08000038 T measurement_sum
080000a4 T build_version
080000c4 T build_source_manifest_sha256
20000000 D g_inspectionSeed
20000004 B g_inspectionSum
# objdump -h 的同一布局（Size / VMA / LMA）
.text               00000105  08000000  08000000
.note.gnu.build-id  00000024  08000108  08000108
.data               00000004  20000000  0800012c
.bss                00000004  20000004  08000130   ALLOC，无CONTENTS/LOAD
</code></pre><p>这次.text为0x105=261字节，补齐3字节后build-ID note为0x24=36字节，再放4字节.data装载内容：261+3+36+4=304字节bin。4字节.bss只预留RAM，不增加这些装载字节；ELF的132172字节还包括文件布局间隙与结构/符号等，不能拿文件总长当FLASH有效载荷。本脚本把.rodata并入.text，因此build_version也显示T；不能由T把常量误当可调用函数。map和nm都只解释这一个ELF，不能移用到另一个构建。</p><p class="manifest">本次source-manifest SHA256：647db67743de76a0a3fe9ddf5809d355109493dfd41ce9da13b0385008fd16ab；生成build_identity.c SHA256：0403e6db5170710fd638be49d9ce132bd5488a04b5a736dd050e894f4cb12c63；readelf实际build-ID：fc3822e55d1a18261706c3d8f18a818f481c50c3。</p><p>两个新宿主输出目录都显式使用--no-insert-timestamp，实际exe各79521字节且逐字节相同，SHA256同为上表宿主摘要；仅说明这两次相同输入/工具/选项的观测。改变描述符为1.0.1后，实际重建输出1.0.1、清单与exe摘要均改变。旧程序被要求1.0.1时非零报告IDENTITY_MISMATCH。人工ELF副本链接后只改OS/ABI字节，build-ID保留而SHA256改变，副本没有执行。</p><p>默认沙箱无法启动已安装的旧ARM工具，原始失败保留；同一只读/构建范围在一次受审执行权限下完成。没有安装或全局环境变更。该权限现象不是芯片或产物损坏证据。所有ARM文件仍明确NOT BOOTABLE、从未运行或烧录。</p>

## 从描述符到身份源码，保持有限顺序 {#build-identity-title}

<p><strong>版本version</strong>是人选的发布标签，本例1.0.0。<strong>源清单摘要source-manifest SHA256</strong>只标识明确列出的输入字节。<strong>生成源摘要</strong>标识生成的build_identity.c字节。<strong>最终产物SHA256</strong>在链接结束后计算，标识那个可执行文件的字节。它们的输入不同，不能互换。</p><p>本例build.json声明schema=1、product=acquisition-terminal、version=1.0.0和八个成员。生成器只接受准确字段集合、固定product、每段0..9999且无多余前导零的三段版本，以及固定顺序成员；校验完成才形成C字符串并写文件。输入不会成为任意C代码。生成器只用Node内建fs/path/url/crypto，不调用编译器、网络或外部依赖。</p><figure id="build-identity-diagram"><figcaption><strong>原创无循环身份图：</strong>实线“→”表示先后依赖；旁注摘要标识该箭头之前的哪份字节。</figcaption><div class="stage-flow"><div><b>描述符 + 八成员</b><span>逐文件SHA256</span><span>清单文本再SHA256 →</span></div><div><b>生成build_identity.c</b><span>内嵌version/product</span><span>内嵌清单摘要 →</span></div><div><b>实际编译/链接</b><span>生成源 + 其他源</span><span>链接产物 →</span></div><div><b>记录产物SHA256</b><span>单独保存生成源摘要</span><span>匹配对应map/nm</span></div></div><p>图例：清单只含build.json、build_identity.h、entry.c、generate_identity.mjs、lesson.ld、main.c、measurement.c、measurement.h，顺序固定。每成员先哈希原始字节，再按“文件名+一个空格+小写64字符摘要+LF”拼接UTF-8文本，对完整文本取SHA256。文件名、顺序和LF都是合同，不把不同排序的清单误当同一输入。</p></figure><p>生成文件build_identity.c本身不参加源清单摘要，所以不会要求“先知道自己含什么摘要才能计算自己摘要”。README和页面也不在这份有限清单内；交付整个包时仍要另外列文件摘要。固定成员里包含生成器和链接脚本，改变它们也会改变清单；但这不是完整工具链或系统环境的度量。</p><p>顺序必须是描述符/源字节固定 → 生成身份 → 编译生成源 → 链接 → 记录生成源与最终产物摘要。生成器--check只比较当前应生成内容与已保存源码，返回STALE_IDENTITY能发现遗漏生成；它不能替你证明旧可执行文件已经重建。</p>

### 独立故障推导：1.0.1的描述符配上1.0.0的程序 {#build-identity-worked}

<p>私有副本仅把build.json的version由1.0.0改成1.0.1。旧build_identity.c仍声称1.0.0，--check先非零；重新生成后，清单摘要与生成源字节改变。只有把新生成源重新编译并链接，宿主输出才变为version=1.0.1。实际旧1.0.0程序用参数1.0.1运行会返回非零IDENTITY_MISMATCH，expected=1.0.1、linked=1.0.0；新构建用1.0.1检查才通过。</p><p>这个参数比较只检查版本字符串。若两个不同源都叫1.0.1，单看它会误判；应将manifest与产物SHA256同可信交付记录核对。页面下一段把“生成是否重做”单独作为输入，方便预测这种遗漏，而不是假装浏览器真正重编译了文件。</p>

## 预测 → 应用 → 再检查下一步 {#build-lab-title}

<p>知识与独立样例在上面。这里是<strong>浏览器模型</strong>：只模拟三个源的阶段与标签，不执行命令。选择有效、缺少或重复measurement_sum强定义，再选择描述符补丁号和是否重新生成身份。补丁号为十进制规范整数0..9999；空值、小数、负数、非有限值、前导零和越界均拒绝。</p><p>种子是有效构建、补丁号0、重新生成；对应1.0.0。先预测链接结果与身份一致性，再应用。假设旧身份固定为1.0.0；补丁号1而不重新生成时，链接仍可通过，但与1.0.1描述符失配。缺少/重复样本虽有目标文件和内嵌标签候选，也没有可运行程序；“标签一致”不表示链接成功。</p><form class="lab" id="build-form"><div class="fields"><label class="field" for="build-scenario">本次链接输入<select id="build-scenario"><option value="valid">一个测量强定义</option><option value="missing">缺少测量强定义</option><option value="duplicate">重复测量强定义</option></select></label><label class="field" for="build-patch">描述符1.0.patch中的patch（0..9999）<input id="build-patch" inputmode="numeric" value="0" autocomplete="off"></label><label class="field" for="build-regenerate">身份源码处理<select id="build-regenerate"><option value="yes">按描述符重新生成</option><option value="no">沿用旧的身份源码</option></select></label><label class="field" for="build-prediction">预测本次链接<select id="build-prediction"><option value="">先选择一个预测</option><option value="MISSING">链接缺少强定义</option><option value="READY">链接通过可运行</option><option value="DUPLICATE">链接重复强定义</option></select></label><label class="field full" for="identity-prediction">预测候选身份与描述符<select id="identity-prediction"><option value="">先选择一个预测</option><option value="STALE">身份标签不一致</option><option value="MATCH">身份标签相一致</option></select></label></div><div class="controls"><button class="btn primary" id="build-apply" type="submit" disabled>应用本次预测</button><button class="btn" id="build-reset" type="button">恢复声明种子</button></div><p class="pending" id="build-pending">尚未应用；请先预测。</p><p class="applied-result" id="build-result" aria-live="polite" hidden></p><p class="feedback" id="build-feedback" aria-live="polite">尚未获得本次结果。</p></form>

### 同一已应用配置，逐步说出下一种产物 {#build-trace-title}

<p>每一步先预测再推进，最多四步：预处理、编译、汇编、链接。前三步保存的是本章主动要求的中间产物；最后只在有效输入下有新可执行文件。输入编辑后暂停轨迹，保留带配置标签的旧结果，重新应用才开启新轨迹。</p><form class="lab" id="trace-form"><p id="trace-position">等待已应用配置；尚无轨迹。</p><label for="trace-prediction">预测下一步保留的主要产物<select id="trace-prediction"><option value="">先选择一个预测</option><option value="object">生成目标文件</option><option value="preprocessed">生成展开文本</option><option value="executable">生成可执行件</option><option value="assembly">生成汇编文本</option><option value="failure">没有可执行件</option></select></label><div class="controls"><button class="btn primary" id="trace-step" type="submit" disabled>提交预测并走一步</button></div><ol class="trace-log" id="trace-log"></ol><p class="feedback" id="trace-feedback" aria-live="polite">尚未走步。</p></form><p>本段成果：说明“有.o但没有新可执行”为什么完全可能，并给身份失配写出下一项检查：先--check，再实际重建，再核对artifact SHA256。一次预测正确不是长期掌握证明。</p>

## 构建身份与认证之间还差哪些条件 {#build-trust-title}

<p>GNU ld2.36 §2.1允许--build-id选择生成方式或直接提供标识。它明确区分build-ID与完整文件校验：其他工具后续改变链接文件，原先build-ID位串仍可能保留。实际私有实验只改ELF副本的OS/ABI字节，readelf仍读到同一build-ID，而整文件SHA256改变。这个副本从未执行；该实验说明关系边界，不建议篡改发布产物。</p><p>一份SHA256相等，只能说明实际字节与某个预期摘要相等；预期摘要从何而来仍是信任问题。攻击者若能同时替换文件和网页上的摘要，就能给另一个文件重新算摘要。CRC适合在其假设下发现意外传输损坏；它也不是发布者身份凭证。数字签名验证还需要可信公钥，是否允许这个版本升级、是否允许回退仍属于授权和防回滚策略。后续25—28才处理这些实现，本章没有自制加密算法或安全更新承诺。</p><p><strong>可重做过程</strong>是读者能按指令产生有解释的结果；<strong>字节可复现</strong>还需要两次干净构建的产物实际逐字节相同。编译器版本、选项、时间戳、路径、调试记录和链接器行为都会影响后者。本次在相同宿主工具/源/选项及--no-insert-timestamp条件下比较两个新输出目录；记录实际比较结果，只把结论限定到这两次，不扩展成跨机器或任意选项的保证。</p><p>小成果：把version、source-manifest、generated-source、artifact SHA256和build-ID各写一行“它的输入是什么、不能证明什么”。当有人只给你一张map或一个版本字符串，就能指出还缺哪份关联记录。</p>

## 完整原始源码与复做说明 {#build-c-lab-title}

<p>以下是项目原创完整可复用源码、生成器和操作说明，均与原生下载相同。LiXin规范用于命名、显式边界、注释与返回检查；不伪造EternalChip版权或许可证。模块measurement_sum可独立编译，不依赖main或身份生成。所有C输入/输出为真实存活对象，total与输入字节对象不重叠；NULL检查无法识别任意悬空地址或不诚实长度。</p><p>正常与NDEBUG都实际运行普通条件检查；没有assert依赖。count为0允许NULL输入且不做指针运算；16个255为4080；容量外17使用真实17字节对象而在读取前拒绝；输出NULL、非零count配NULL也在访问前拒绝。拒绝保持999哨兵。没有伪造指针、重叠解引用、未初始化读取或故意崩溃的红测试。printf/puts/fprintf/fflush逐次检查，输出失败返回非零，消费方还必须检查进程退出码。</p><p>所有本次实际编译/链接均使用现有mcu-build custom profile的validate→dry-run→build，保存命令、原始返回、源摘要、产物SHA256和新鲜性。最初安全占位实现有空参数防护但不写总和；真实宿主构建成功后运行退出1，独立170预期变红；实现有界求和后转绿。无main模块编译对应measurement.o；原始宿主执行与目标产物检查分别记录。</p><div class="next-links"><a href="../examples/build-link-identity/measurement.h" download>下载measurement.h</a><a href="../examples/build-link-identity/measurement.c" download>下载measurement.c</a><a href="../examples/build-link-identity/build_identity.h" download>下载build_identity.h</a><a href="../examples/build-link-identity/build_identity.c" download>下载build_identity.c</a><a href="../examples/build-link-identity/build.json" download>下载build.json</a><a href="../examples/build-link-identity/generate_identity.mjs" download>下载generate_identity.mjs</a><a href="../examples/build-link-identity/main.c" download>下载main.c</a><a href="../examples/build-link-identity/entry.c" download>下载entry.c</a><a href="../examples/build-link-identity/lesson.ld" download>下载lesson.ld</a><a href="../examples/build-link-identity/README.txt" download>下载README.txt</a></div>

### 完整文件 measurement.h {#build-source-measurement-h}

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party license grant.
 * @file measurement.h
 * @brief Bounded acquisition-byte sum, independent of the host test entry.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef MEASUREMENT_H
#define MEASUREMENT_H

#include <stddef.h>
#include <stdint.h>

#define MEASUREMENT_CAPACITY 16U

typedef enum {
    MEASUREMENT_OK = 0,
    MEASUREMENT_INVALID_ARGUMENT
} MeasurementStatus;

/**
 * @brief Sum zero to sixteen acquisition bytes; preserve output on rejection.
 * @param[in] samples Live readable array of at least count bytes when count > 0.
 * @param[in] count In [0, MEASUREMENT_CAPACITY]; zero permits samples == NULL.
 * @param[out] total Live writable uint32_t, disjoint from the input byte object.
 * @return MEASUREMENT_OK, or MEASUREMENT_INVALID_ARGUMENT without output writes.
 * Caller guarantees truthful extents, lifetime, nonaliasing and single context.
 * A nonnull pointer alone cannot establish those caller preconditions.
 */
MeasurementStatus measurement_sum(const uint8_t *samples, size_t count, uint32_t *total);

#endif
```

### 完整文件 measurement.c {#build-source-measurement-c}

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party license grant.
 * @file measurement.c
 * @brief Bounded acquisition-byte sum.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "measurement.h"

/**
 * @brief Validate arguments before any access; commit only a complete sum.
 * @param[in] samples Caller-owned readable bytes (NULL only for count zero).
 * @param[in] count Number of bytes, at most sixteen.
 * @param[out] total Independent writable result, preserved on rejection.
 * @return Explicit status; see measurement.h for caller preconditions.
 */
MeasurementStatus measurement_sum(const uint8_t *samples, size_t count, uint32_t *total)
{
    uint32_t sum = 0U;
    size_t index;

    /**
    * Bounds cap the largest possible sum at 16 * 255 = 4080, below UINT32_MAX.
    **/
    if (total == NULL || count > MEASUREMENT_CAPACITY || (count > 0U && samples == NULL)) {
        return MEASUREMENT_INVALID_ARGUMENT;
    }
    for (index = 0U; index < count; ++index) {
        sum += samples[index];
    }
    *total = sum;
    return MEASUREMENT_OK;
}
```

### 完整文件 build_identity.h {#build-source-build_identity-h}

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party license grant.
 * @file build_identity.h
 * @brief Read-only, generated identifying information; no authentication claim.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#ifndef BUILD_IDENTITY_H
#define BUILD_IDENTITY_H

extern const char build_version[];
extern const char build_product[];
extern const char build_source_manifest_sha256[];

#endif
```

### 完整文件 build_identity.c {#build-source-build_identity-c}

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party license grant.
 * @file build_identity.c
 * @brief Deterministic generated identity. Regenerate; do not edit by hand.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "build_identity.h"

const char build_version[] = "1.0.0";
const char build_product[] = "acquisition-terminal";
const char build_source_manifest_sha256[] = "647db67743de76a0a3fe9ddf5809d355109493dfd41ce9da13b0385008fd16ab";
```

### 完整文件 build.json {#build-source-build-json}

```text
{
  "schema": 1,
  "product": "acquisition-terminal",
  "version": "1.0.0",
  "sourceManifest": [
    "build.json",
    "build_identity.h",
    "entry.c",
    "generate_identity.mjs",
    "lesson.ld",
    "main.c",
    "measurement.c",
    "measurement.h"
  ]
}
```

### 完整文件 generate_identity.mjs {#build-source-generate_identity-mjs}

```text
// Original embedded-notes teaching code, 2026. No third-party license grant.
// Node builtins only. Inputs are bytes; no timestamps, paths, generated self-hash.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const manifestMembers = Object.freeze([
  'build.json', 'build_identity.h', 'entry.c', 'generate_identity.mjs',
  'lesson.ld', 'main.c', 'measurement.c', 'measurement.h'
]);

/** Validate the complete descriptor before creating C tokens or writing output. */
export function generateIdentity(directory) {
  const descriptor = JSON.parse(readFileSync(join(directory, 'build.json'), 'utf8'));
  if (!descriptor || Object.keys(descriptor).sort().join(',') !== 'product,schema,sourceManifest,version' ||
      descriptor.schema !== 1 || descriptor.product !== 'acquisition-terminal' ||
      typeof descriptor.version !== 'string' || !/^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/.test(descriptor.version) ||
      !Array.isArray(descriptor.sourceManifest) ||
      descriptor.sourceManifest.length !== manifestMembers.length ||
      !manifestMembers.every((name, index) => descriptor.sourceManifest[index] === name)) {
    throw new Error('INVALID_DESCRIPTOR: schema1, fixed product, bounded numeric version and exact ordered members required');
  }
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
  const members = manifestMembers.map(name => ({ name, sha256: sha256(readFileSync(join(directory, name))) }));
  // SHA256(UTF8(name + space + lowercase member digest + LF), in declared order).
  const manifest = members.map(member => `${member.name} ${member.sha256}\n`).join('');
  const manifestSha256 = sha256(Buffer.from(manifest, 'utf8'));
  // All C literal values use validated safe ASCII alphabets; no unescaped input.
  const source = `/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party license grant.
 * @file build_identity.c
 * @brief Deterministic generated identity. Regenerate; do not edit by hand.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "build_identity.h"

const char build_version[] = "${descriptor.version}";
const char build_product[] = "${descriptor.product}";
const char build_source_manifest_sha256[] = "${manifestSha256}";
`;
  return { source, version: descriptor.version, manifestSha256, members };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length > 4 || (process.argv[3] && process.argv[3] !== '--check')) {
      throw new Error('Usage: node generate_identity.mjs [source-directory] [--check]');
    }
    const directory = resolve(process.argv[2] || dirname(fileURLToPath(import.meta.url)));
    const generated = generateIdentity(directory);
    const destination = join(directory, 'build_identity.c');
    if (process.argv[3] === '--check') {
      if (!readFileSync(destination).equals(Buffer.from(generated.source))) {
        throw new Error('STALE_IDENTITY: regenerate before compiling');
      }
    } else {
      writeFileSync(destination, generated.source, 'utf8');
    }
    console.log(JSON.stringify({ version: generated.version, sourceManifestSha256: generated.manifestSha256,
      generatedSha256: createHash('sha256').update(generated.source).digest('hex'), members: generated.members }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
```

### 完整文件 main.c {#build-source-main-c}

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party license grant.
 * @file main.c
 * @brief Hosted multi-file example and live checks, including under NDEBUG.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "measurement.h"
#include "build_identity.h"
#include <stdio.h>
#include <string.h>

/**
 * @brief Check literal fixtures using initialized, nonoverlapping real storage.
 * @param[in] None.
 * @param[out] None.
 * @return Zero on success, one on the first failed expectation.
 */
static int check_measurement(void)
{
    const uint8_t samples[4] = {17U, 34U, 51U, 68U};
    uint8_t maximum[MEASUREMENT_CAPACITY + 1U] = {0U};
    uint32_t total = 999U;
    size_t index;

    /**
    * All failure checks are ordinary control flow, never compiled-out assertions.
    **/
    if (measurement_sum(samples, 4U, &total) != MEASUREMENT_OK || total != 170U) {
        return 1;
    }
    for (index = 0U; index < MEASUREMENT_CAPACITY; ++index) {
        maximum[index] = 255U;
    }
    if (measurement_sum(maximum, MEASUREMENT_CAPACITY, &total) != MEASUREMENT_OK || total != 4080U) {
        return 1;
    }
    if (measurement_sum(NULL, 0U, &total) != MEASUREMENT_OK || total != 0U) {
        return 1;
    }
    total = 999U;
    if (measurement_sum(NULL, 1U, &total) != MEASUREMENT_INVALID_ARGUMENT || total != 999U) {
        return 1;
    }
    if (measurement_sum(samples, 4U, NULL) != MEASUREMENT_INVALID_ARGUMENT) {
        return 1;
    }
    if (measurement_sum(maximum, 17U, &total) != MEASUREMENT_INVALID_ARGUMENT || total != 999U) {
        return 1;
    }
    return 0;
}

/**
 * @brief Report the linked identity, optionally compare an expected version.
 * @param[in] argc Zero or one extra command-line argument is supported.
 * @param[in] argv Hosted C argument strings; optional expected build version.
 * @return Zero only after all checks and flushed output; nonzero on any failure.
 */
int main(int argc, char *argv[])
{
    const uint8_t samples[4] = {17U, 34U, 51U, 68U};
    uint32_t total = 0U;

    /**
    * Never announce success before checking both computation and output errors.
    **/
    if (argc > 2 || check_measurement() != 0) {
        return 1;
    }
    if (argc == 2 && strcmp(argv[1], build_version) != 0) {
        if (fprintf(stderr, "IDENTITY_MISMATCH expected=%s linked=%s\n", argv[1], build_version) < 0) {
            return 2;
        }
        if (fflush(stderr) != 0) {
            return 2;
        }
        return 1;
    }
    if (measurement_sum(samples, 4U, &total) != MEASUREMENT_OK) {
        return 1;
    }
    if (printf("sum=%lu\nversion=%s\nproduct=%s\nsource_manifest_sha256=%s\n",
               (unsigned long)total, build_version, build_product, build_source_manifest_sha256) < 0) {
        return 2;
    }
    if (puts("PASS measurement: literal170, max4080, empty0, null, capacity, preservation; NDEBUG-live") == EOF) {
        return 2;
    }
    if (fflush(stdout) != 0) {
        return 2;
    }
    return 0;
}
```

### 完整文件 entry.c {#build-source-entry-c}

```c
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party license grant.
 * @file entry.c
 * @brief Artificial ARM link inspection entry. NOT BOOTABLE; never execute/flash.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "measurement.h"
#include "build_identity.h"

volatile uint32_t g_inspectionSum;
uint32_t g_inspectionSeed = 17U;
const char * const g_inspectionVersion = build_version;
const char * const g_inspectionManifest = build_source_manifest_sha256;

/**
 * @brief Supply symbol references for linking only; no vector/runtime is supplied.
 * @param[in] None.
 * @param[out] None.
 * @return None; this artificial entry is never invoked.
 */
void lesson_entry(void)
{
    const uint8_t samples[4] = {17U, 34U, 51U, 68U};
    uint32_t total = 0U;

    /**
    * This body provides relocation evidence, not a reset/startup implementation.
    **/
    if (measurement_sum(samples, 4U, &total) != MEASUREMENT_OK) {
        return;
    }
    g_inspectionSum = total;
}
```

### 完整文件 lesson.ld {#build-source-lesson-ld}

```text
/* Original teaching layout. NOT BOOTABLE: no vector table, no runtime setup. */
ENTRY(lesson_entry)
MEMORY
{
    FLASH (rx) : ORIGIN = 0x08000000, LENGTH = 16K
    RAM (rw) : ORIGIN = 0x20000000, LENGTH = 4K
}
SECTIONS
{
    .text : { *(.text*) *(.rodata*) } > FLASH
    .note.gnu.build-id : { *(.note.gnu.build-id) } > FLASH
    .data : { *(.data*) } > RAM AT > FLASH
    .bss (NOLOAD) : { *(.bss*) *(COMMON) } > RAM
    /DISCARD/ : { *(.comment) *(.ARM.exidx*) *(.ARM.extab*) }
}
```

### 完整文件 README.txt {#build-source-README-txt}

```text
UNIT06 — Original multi-file acquisition-terminal experiment
Original embedded-notes teaching work, 2026. No third-party authorship or license
grant is implied. Host execution and artificial target inspection are separate.
The ARM output is NOT BOOTABLE: no vector table, reset handler or C runtime setup.
Never execute or flash that ELF/bin. No hardware operation is part of this lesson.

Prerequisites
  Existing Node.js (builtins only), an existing C11 GCC host compiler, and Python
  plus the existing mcu-build build_router.py when your project uses that gate.
  Optional: already installed arm-none-eabi GCC/binutils. Do not install tools to
  turn a missing optional artifact into a pass. Windows host output is PE/COFF,
  not ARM ELF; use the matching host nm/objdump. Commands use generic paths.

Files and interface
  measurement.h + measurement.c are reusable without main.c/build_identity.c.
  measurement_sum(samples,count,total): count 0..16; sum <= 4080; status OK or
  INVALID_ARGUMENT. A rejected request preserves *total. NULL output, count>16,
  or NULL input with nonzero count reject before any input read. For count zero,
  NULL input is allowed, no pointer arithmetic occurs, and result is zero.
  Nonnull inputs/outputs must designate live correctly sized objects; the output
  uint32_t must not overlap the input byte object. Truthful span, lifetime and
  single-context use are caller preconditions, not properties a null check proves.
  No dangling/forged pointers or overlapping object tests are executed.
  main.c runs live literal/boundary/rejection checks even with -DNDEBUG, then
  prints sum=170 and the linked identity. Its optional argv[1] is an expected
  version; mismatch reports IDENTITY_MISMATCH and exits 1. All output failures,
  including final flush failures, exit nonzero. Only consume output after exit 0.
  entry.c and lesson.ld exist solely for artificial ARM artifact inspection.

Finite generation order (always before actual compilation)
  node generate_identity.mjs .
  node generate_identity.mjs . --check
  The descriptor has exactly schema/product/version/sourceManifest. schema=1,
  product=acquisition-terminal, version has three decimal components 0..9999
  (no leading zero except zero), and the exact ordered members below. Values are
  validated before any C literal generation or output write; no eval/network.
  The eight source-manifest members are:
    build.json
    build_identity.h
    entry.c
    generate_identity.mjs
    lesson.ld
    main.c
    measurement.c
    measurement.h
  Each member hash is SHA256(exact file bytes). The aggregate is SHA256 of UTF-8
  lines "name lowercase-member-sha256\n" in that exact order, with one ASCII
  space and LF after each member. File names and order are part of the contract.
  build_identity.c is excluded to avoid circular self-reference; README and the
  readers are outside this explicitly limited manifest. Record their hashes
  separately when delivering a whole package. Hash the generated .c separately,
  compile it with the other .c files, then hash the final executable/ELF/bin.
  --check returns nonzero STALE_IDENTITY when saved generated bytes disagree.
  The generator exports generateIdentity(directory) and manifestMembers for
  inspection, but importing it does not write a file or invoke a compiler.

Use the project's build gate for EVERY actual compile/link
  The following are compiler argument examples, not a helper that bypasses a
  required gate. Put each exact argv array into a custom profile. Validate it,
  inspect dry-run, then build. Use a NEW output directory for each experiment;
  artifacts for expected link failures are [], and a nonzero raw build return is
  required evidence of that expected failure, never a successful program build.

  Minimal per-invocation TOML (replace paths, argv and artifact for the stage):
    version = 1
    default_profile = "unit06"
    [settings]
    workspace_root = "/path/to/workspace"
    log_dir = "evidence/unit06/logs"
    [environments.existing]
    kind = "custom"
    [profiles.unit06]
    environment = "existing"
    platform = "host-c11"
    command = ["gcc", "-std=c11", "-Wall", "-Wextra", "-Werror", "-pedantic", "-c", "measurement.c", "-o", "evidence/unit06/measurement.o"]
    artifacts = ["evidence/unit06/measurement.o"]
    artifact_policy = "all"

  python /path/to/build_router.py validate --config /path/to/profile.toml
  python /path/to/build_router.py build --config /path/to/profile.toml --dry-run
  python /path/to/build_router.py build --config /path/to/profile.toml
  Check EVERY return immediately. Stop before dependent work after unexpected
  failure. Ensure compiler support libraries are on the existing tool PATH.

Host stages (each line is its OWN routed command; OUT is a fresh directory)
  gcc -std=c11 -Wall -Wextra -Werror -pedantic -E main.c -o OUT/main.i
  gcc -std=c11 -Wall -Wextra -Werror -pedantic -S measurement.c -o OUT/measurement.s
  gcc -std=c11 -Wall -Wextra -Werror -pedantic -c main.c -o OUT/main.o
  gcc -std=c11 -Wall -Wextra -Werror -pedantic -c measurement.c -o OUT/measurement.o
  gcc -std=c11 -Wall -Wextra -Werror -pedantic -c build_identity.c -o OUT/build_identity.o
  gcc OUT/main.o OUT/measurement.o OUT/build_identity.o -Wl,-Map=OUT/terminal.map -o OUT/terminal.exe
  Run ONLY after successful fresh link: OUT/terminal.exe 1.0.0
  Expect sum=170, version=1.0.0, product=acquisition-terminal, current manifest
  digest and PASS measurement; exit0. Repeat compile/link in another clean output
  directory with -DNDEBUG at each compile, then run and compare meaningful output.
  Standalone -c measurement.c needs only measurement.h, no main or identity.
  nm -A OUT/main.o OUT/measurement.o OUT/build_identity.o
  objdump -f OUT/terminal.exe
  main.o has U measurement_sum, measurement.o has T measurement_sum. The host
  experiment observed pei-x86-64. Use your own actual tool output and versions.

Real expected-failure links (never execute either output)
  Missing: use the already compiled main.o and build_identity.o, omitting
  measurement.o. Route: gcc OUT/main.o OUT/build_identity.o -o NEW/missing.exe
  Expect nonzero linker return and undefined-reference diagnostic measurement_sum.
  Duplicate: separately route -c measurement.c -o NEW/measurement-second.o.
  Then link all three good objects plus that new object into NEW/duplicate.exe.
  Expect nonzero multiple-definition diagnostic measurement_sum. All component
  objects must compile first. Do not use two copies of a header declaration as
  this experiment. Local/weak/common symbols have separate rules; these are two
  external strong function definitions, with no allow-multiple-definition flag.
  Fresh failure destinations must not select old executables; confirm no output
  executable exists. Retain raw diagnostics and source/object hashes.

Changed descriptor and stale identity
  In a PRIVATE copy, change version to1.0.1. --check must fail before generation.
  Regenerate, compile all three host translation units, link a fresh executable,
  and run it with expected1.0.1. Its manifest/generated/artifact hashes change.
  Running the original1.0.0 executable with argument1.0.1 must return nonzero
  IDENTITY_MISMATCH. Argument matching checks only the claimed version string;
  pair the expected manifest and artifact hash with a trusted record as well.

Artificial ARM artifact, never run/flash
  Route separate compiles of entry.c, measurement.c and generated build_identity.c
  with: -std=c11 -Wall -Wextra -Werror -pedantic -O0 -mcpu=cortex-m4 -mthumb
        -ffreestanding -fno-builtin -c SOURCE -o OUT/SOURCE.o
  Route the cross-link:
    arm-none-eabi-gcc -mcpu=cortex-m4 -mthumb -nostdlib -T lesson.ld OUT/entry.o OUT/measurement.o OUT/build_identity.o -Wl,--build-id=sha1 -Wl,-Map=OUT/lesson.map -o OUT/lesson.elf
  Inspect with the installed matching tools:
    arm-none-eabi-readelf -h -S -l -s -n OUT/lesson.elf
    arm-none-eabi-nm -A -n OUT/lesson.elf
    arm-none-eabi-objdump -h OUT/lesson.elf
    arm-none-eabi-objcopy -O binary OUT/lesson.elf OUT/lesson.bin
  Record exit status, version, options, ELF/bin/map sizes and SHA256 separately.
  ELF contains structure/symbols; binary is selected load bytes, without equivalent
  addresses/debug/symbol metadata; map is a text placement report. In lesson.ld,
  .data runs in RAM but its initial bytes have a FLASH LMA; .bss is RAM NOLOAD.
  The script performs no runtime copying/zeroing. Even with an entry address,
  these files lack a reset vector and startup; they are explicitly NOT BOOTABLE.

Identity is evidence with limits
  A version is a selected label, manifest SHA256 names only listed input bytes,
  generated-source SHA256 names generated bytes, artifact SHA256 names final
  bytes, and linker build-ID identifies the linked output using that tool's rule.
  Build-ID is not a complete-file checksum and can survive later byte mutations.
  A hash proves equality only relative to an expected digest whose trust matters.
  CRC detects accidental corruption under its assumptions; neither CRC nor a
  public hash authenticates a publisher, authorizes an update or prevents rollback.
  Signature verification requires trusted keys; authorization/rollback policy and
  implementation are later course work. No cryptographic implementation is here.
  Reproducible commands alone do not prove byte-identical output. Compare two
  fresh builds with identical inputs/toolchain/options; record timestamps, paths,
  debug options and linker behavior. Windows GNU ld --no-insert-timestamp was
  used for the author's two-host-build comparison; do not assume all toolchains
  accept it or that this one comparison proves reproducibility everywhere.

Evidence limits
  The author used host GCC13.1.0 and ARM GCC10.3.1 20210824, GNU ld2.36.1.20210621,
  through custom-profile validate/dry-run/build. Only host output was executed.
  Static reading and JS models do not compile code in the browser. Target startup,
  physical hardware, actual resets, publication and physical paper are distinct
  validation states. Preserve failures; never run stale/failed artifacts.
```

## 十题：基础、故障与迁移 {#build-practice-title}

<p class="practice-intro">每题包含全部前提与数值，独立于模拟器状态。先写判断、因果与下一项检查，再展开原生解析。普通打印临时展开全文并恢复折叠；只打印题目隐藏答案、已解例子与模拟结果。取消或分发失败也恢复页面。无脚本仍有完整正文、题干和可展开原生答案。</p><div class="notes-toolbar"><button class="btn" id="expand-notes" type="button">展开全部答案</button><button class="btn" id="collapse-notes" type="button">折叠全部答案</button><button class="btn primary" id="print-questions" type="button">只打印题目</button></div><div id="recall-questions"><article class="exercise" id="build-exercise-01">

### 01 · 基础：声明到达哪里 {#build-question-01}

<p>main.c包含measurement.h，头文件只有measurement_sum声明；measurement.c提供唯一外部函数体。三个源原本是main.c、measurement.c、build_identity.c。若三个源各自-c成功，链接时只传main.o与build_identity.o，为什么仍失败？</p><details class="exercise-answer" id="build-answer-01"><summary>展开本题原因</summary><p>-c不链接；main.o保留measurement_sum引用，省略measurement.o使本次链接找不到定义。再写声明无助于提供函数体。下一步核对真实链接argv与对象路径。</p></details></article><article class="exercise" id="build-exercise-02">

### 02 · 基础：三个停止点 {#build-question-02}

<p>以本章GCC驱动处理main.c，分别使用-E、-S、-c，并分别-o main.i、main.s、main.o。每次停止在什么阶段，哪种输出已能独立证明完整程序可运行？</p><details class="exercise-answer" id="build-answer-02"><summary>展开本题原因</summary><p>-E后为展开文本，-S后为汇编文本，-c后为可重定位目标；三者都不能独立证明完整程序已链接。下一步必须给所需对象与库并检查新链接返回。</p></details></article><article class="exercise" id="build-exercise-03">

### 03 · 基础：数据与边界 {#build-question-03}

<p>真实uint8_t samples[4]={17,34,51,68}，独立uint32_t total=999；measurement_sum最大接受16字节。成功后total多少？另一个真实16字节全255数组结果多少？count=0且samples=NULL呢？</p><details class="exercise-answer" id="build-answer-03"><summary>展开本题原因</summary><p>依次170、4080、0。16×255被有界合同限制，不会在uint32_t溢出；count零不读输入，不做NULL指针运算。输出对象仍必须真实、存活、可写且不重叠。</p></details></article><article class="exercise" id="build-exercise-04">

### 04 · 故障：两份定义不是两份声明 {#build-question-04}

<p>measurement.c普通外部定义measurement_sum。分别-c为a.o与b.o均成功；将main.o、build_identity.o、a.o、b.o一起链接，无允许多重定义选项。失败在哪步，改为static同名函数是否还是本例？</p><details class="exercise-answer" id="build-answer-04"><summary>展开本题原因</summary><p>真实链接因重复强定义失败，组件编译成功不消除全局冲突。static本地符号与本例外部强定义规则不同，且main所需外部定义仍要存在；不能用它偷换实验。</p></details></article><article class="exercise" id="build-exercise-05">

### 05 · 故障：旧文件会说真话吗 {#build-question-05}

<p>目录OLD中terminal.exe曾成功，报告1.0.0；本次另一次链接缺少measurement.o并返回非零。脚本忽略返回后运行OLD/terminal.exe，仍输出sum170。它验证了哪一次？怎样防止误归属？</p><details class="exercise-answer" id="build-answer-05"><summary>展开本题原因</summary><p>验证的是OLD的旧成功程序；170不是本次失败构建的结果。每个实验用新目的地，立即检查返回和产物新鲜性，失败绝不执行；记录对象及最终文件摘要与命令。</p></details></article><article class="exercise" id="build-exercise-06">

### 06 · 故障：空参数与容量 {#build-question-06}

<p>真实17字节数组全初始化为0，独立total=999。分别调用measurement_sum(array,17,&total)、measurement_sum(NULL,1,&total)、measurement_sum(array,1,NULL)。最大容量16，拒绝合同保持输出。各状态和total是什么？</p><details class="exercise-answer" id="build-answer-06"><summary>展开本题原因</summary><p>三者均INVALID_ARGUMENT；前两者total仍999，第三者没有可写输出可提交。先检查参数再访问，17字节数组是真实对象；这不证明函数能识别任意伪造地址、生命周期错误或虚假长度。</p></details></article><article class="exercise" id="build-exercise-07">

### 07 · 迁移：改描述符但没生成 {#build-question-07}

<p>旧生成源和已链接宿主都标1.0.0。只在私有副本把build.json改为1.0.1，没有生成或重编译。--check应如何，旧程序用参数1.0.1运行如何，正确顺序是什么？</p><details class="exercise-answer" id="build-answer-07"><summary>展开本题原因</summary><p>--check非零STALE_IDENTITY；旧程序非零IDENTITY_MISMATCH expected1.0.1 linked1.0.0。先生成、编译生成源与其他源、链接、执行版本核对，再记录最终摘要；仅改标签不会改已链接字节。</p></details></article><article class="exercise" id="build-exercise-08">

### 08 · 迁移：清单会不会自指 {#build-question-08}

<p>清单按build.json、build_identity.h、entry.c、generate_identity.mjs、lesson.ld、main.c、measurement.c、measurement.h八成员顺序生成。build_identity.c内嵌清单摘要。是否再把生成文件加入同一摘要？如何记录它与最终exe？</p><details class="exercise-answer" id="build-answer-08"><summary>展开本题原因</summary><p>不能在当前合同下加入生成自引用，否则有限生成顺序被破坏。先对八成员原字节逐文件SHA256，再对指定name空格digest加LF文本哈希；生成源、最终exe各另算SHA256。README/页面也需在整包交付清单单列。</p></details></article><article class="exercise" id="build-exercise-09">

### 09 · 迁移：有ARM ELF就能启动吗 {#build-question-09}

<p>人工lesson.ld指定FLASH起始0x08000000/16KiB，RAM0x20000000/4KiB，ENTRY(lesson_entry)，.data有FLASH LMA与RAM VMA，.bss为NOLOAD；没有向量表、startup或运行时。交叉链接得到ELF、bin、map后，可证明哪些事？</p><details class="exercise-answer" id="build-answer-09"><summary>展开本题原因</summary><p>只能证明该工具/参数成功产生并可检查这些产物。ENTRY不建立复位向量、MSP、数据复制或BSS清零；窗口也不是硬件容量验证。明确NOT BOOTABLE，从未执行/烧录；启动责任留到07，动态峰值留到08。</p></details></article><article class="exercise" id="build-exercise-10">

### 10 · 迁移：同build-ID与同摘要 {#build-question-10}

<p>两个文件有相同版本1.0.0和相同链接build-ID，其中一个在链接后改了一个字节；实际整文件SHA256不同。另一人能同时替换文件与网页摘要。build-ID、哈希、签名和升级策略各能推出什么？</p><details class="exercise-answer" id="build-answer-10"><summary>展开本题原因</summary><p>同版本/同build-ID不能推出整文件相同；不同SHA256说明字节不同。哈希需可信预期才能核对，攻击者可重算摘要，不能由此认证发布者。签名还需可信钥匙；授权版本和防回滚是另行策略，不能被一个标签替代。</p></details></article></div><p class="practice-intro">隔一天换成0、255、7、9四个字节，重新解释跨文件引用；再交错判断“声明缺失/链接输入缺失/生成身份陈旧/旧map误配”四类故障。若卡住，可把“翻译单元”“强定义”“清单排除自引用”或“build-ID与信任”的具体一句交给助手追问。读完与一次答对不等于长期掌握。</p>

## 按版本核对工具行为与证据限度 {#build-sources-title}

<p>实际资料核对日期2026-10-17。阶段图、身份图、C、生成器、夹具和练习为项目原创；不复制私有或付费课程，不添加虚构许可证。技术事实与本章模型策略分开：四字节和八成员是本章合同，下面文档支撑所注明的工具行为。</p><ul class="source-list"><li id="build-source-gcc"><a href="https://gcc.gnu.org/onlinedocs/gcc-13.1.0/gcc/Overall-Options.html">S6：GNU GCC13.1.0手册§3.2 Overall Options</a>，实际阅读四阶段及-E/-S/-c/-o；另实际阅读已安装GNU Arm Embedded10.3-2021.10所附GCC同名章节，并参照<a href="https://gcc.gnu.org/onlinedocs/gcc-10.3.0/gcc.pdf">S7：GCC10.3.0手册§3.2，印刷页32—34</a>的阶段界限。首选阅读任务：先对照三个停止选项，再解释为什么-c成功不承诺链接成功。</li><li id="build-source-ld"><a href="https://sourceware.org/binutils/docs-2.36/ld/Options.html">S8：GNU ld2.36 §2.1 Options</a>：-M/-Map的布局报告、普通未解决引用和重复定义规则、--build-id及完整文件校验边界；实际阅读相关条款。默认与选项/格式有关，不能外推为所有链接情形。</li><li id="build-source-nm"><a href="https://sourceware.org/binutils/docs-2.36/binutils/nm.html">S9：GNU nm2.36</a>：符号值、U/T及本地/弱/common区别；<a href="https://sourceware.org/binutils/docs-2.36/binutils/readelf.html">S10：GNU readelf2.36</a>：-h/-S/-l/-s/-n观察对象；<a href="https://sourceware.org/binutils/docs-2.36/binutils/objcopy.html">S11：GNU objcopy2.36</a>：raw binary转换丢弃符号/重定位并从最低复制节LMA开始。相关段已实际阅读。</li><li id="build-source-lma"><a href="https://www.sourceware.org/binutils/docs-2.36/ld.html#Output-Section-LMA">S15：GNU ld2.36 §3.1及§3.6.8.2</a>：地址概念和初始化数据的LMA/VMA；用来解释脚本布局与运行时动作不同，不声称人工镜像可启动。</li><li><a href="https://github.com/mattpocock/skills/blob/main/skills/productivity/teach/SKILL.md?plain=1">Matt Pocock teach</a>：知识先行、短成果、预测反馈和间隔回忆的组织；不替代C或链接器技术证明。</li><li id="build-source-c"><a href="https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf">S26：WG14 N1570公开委员会草案，2011-04-12</a>：实际阅读§5.1.1.1（印刷页10）翻译单元，§6.7第5段（页108）声明/函数定义，§6.9第5段（页155）使用的外部链接名字与唯一外部定义条件。它是委员会草案，不冒充购买的最终ISO标准；本章链接错误的实际时机仍以所选GNU工具实验为证。</li></ul><p>本章本地候选：内容/控制器、宿主执行与人工ARM产物各自留证；全站构建、最终浏览器、独立评审和发布由集成阶段独立核对。硬件、物理复位、FLASH读取及实体纸张均未验证，不把“文件生成”写成“固件已运行”。</p>

## 下一段：复位并不会自动建立C环境 {#build-next-title}

<p>本章回答源文件如何成为某一份产物；下一章要问核心从哪两个向量字得到初始上下文，谁复制.data、谁清零.bss，再怎样到main-ready。仅有链接地址尚未执行任何初始化。后续单元08区分静态布局与活跃堆/栈峰值，09推导时钟与时间基准；定时器实践从10开始，整条32单元八阶段课程仍未结束。</p><div class="next-links"><a href="../learn/bounded-fifo.html">上一章：有界FIFO</a><a href="../learn/build-link-identity-reference.html">本章打印速查</a><a href="../learn/reset-runtime.html">下一章：复位与C运行环境</a><a href="../learn/engineering-map.html#stage-02">阶段02地图</a></div>
