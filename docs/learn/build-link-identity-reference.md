# 构建阶段与身份 · 打印速查 {#build-link-identity-reference}

先分清哪个阶段，才能解释哪个文件代表哪次构建。

阶段02 · 单元06 · 构建与启动；本地候选；硬件未验证。

## 速查合同：先问阶段，再问身份 {#build-ref-contract-title}

<p>前置：先完成本章四字节跨文件实验；本页用于压缩回忆，不替代完整因果解释。采集终端的一个运行记录至少关联源清单、工具/选项、生成源和最终产物。首要成果是一张“输入→阶段→产物→局限”卡片。主机执行、浏览器模型、人工ARM链接、目标启动彼此独立。</p><p>声明让当前翻译单元检查名字/类型；定义提供实际函数体。每个.c在展开其头文件后分别编译，头文件声明不是另一个自动链接的实现。main.o引用measurement_sum；measurement.o提供本例唯一外部强定义。缺少它在链接失败；两个独立目标均提供它会重复强定义失败。static/weak/common规则不能拿来替换本例。</p><div class="table-wrap" role="region" tabindex="0" aria-label="阶段、证据与不能推出的结论"><table><caption>阶段、证据与不能推出的结论</caption><thead><tr><th scope="col">阶段</th><th scope="col">证据</th><th scope="col">界限</th></tr></thead><tbody><tr><td>预处理-E</td><td>main.i展开文本</td><td>不证明完整定义已链接</td></tr><tr><td>编译-S</td><td>measurement.s汇编文本</td><td>还没有最终地址归属</td></tr><tr><td>编译/汇编-c</td><td>三个可重定位.o</td><td>仍允许未解析外部引用</td></tr><tr><td>链接</td><td>宿主PE/COFF、map、nm</td><td>不证明ARM或硬件启动</td></tr></tbody></table></div><p>运行条件：对象先编译成功，链接必须本次成功且目的地新鲜；失败样本从未运行。每个实际编译/链接沿既有custom profile validate→dry-run→build，保留raw返回与错误，不把预期链接失败改写成成功构建。完整操作与文件在下方下载。</p>

## 固定例子：170、4080与拒绝保持 {#build-ref-worked-title}

<p>uint8_t真实数组[17,34,51,68]，独立uint32_t输出999；17+34+51+68=170。16个255总和4080，是本模块有界最大值；count=0可配NULL输入并输出0且不做指针运算。输入为NULL且count>0、输出NULL、count>16返回INVALID_ARGUMENT，拒绝不改输出。容量外测试使用真实17字节已初始化对象，不伪造地址或虚假跨度。</p><p>measurement_sum是可独立复用的C11模块；所有非空对象须真实存活、容量真实、输出与输入字节对象不重叠且单执行上下文。NULL检查不能证明这些调用者前提。正常/NDEBUG检查均在普通分支，立即检查所有可能失败的I/O及最终flush；不能只看到PASS字样而忽略退出码。</p><p>两个失败构建先有有效组件：missing链接省measurement.o；duplicate另编一个measurement-second.o再把两份强函数体一起链接。分别保留undefined reference / multiple definition与measurement_sum的真实原始诊断；新失败目的地无旧可执行件，绝不运行。</p>

## 八成员清单与三份不同摘要 {#build-ref-identity-title}

<p>描述符准确四字段schema/product/version/sourceManifest；schema1，product acquisition-terminal，三段版本每段规范十进制0..9999。固定八成员顺序：build.json、build_identity.h、entry.c、generate_identity.mjs、lesson.ld、main.c、measurement.c、measurement.h。逐文件SHA256后按“name 空格 lowercase digest LF”组成UTF-8文本，再SHA256。生成build_identity.c不纳入清单，避免循环；README/页面另入完整交付清单。</p><p>有限顺序：固定输入 → 校验并生成身份.c → 编译生成源与其他源 → 链接 → 分别记录生成源/最终文件SHA256。--check用当前输入比较保存生成源，失配非零STALE_IDENTITY；它不证明旧exe已经重建。1.0.0旧exe配期望1.0.1会非零IDENTITY_MISMATCH；私有副本改descriptor为1.0.1后必须生成并重建，输出才变1.0.1。仅版本相等还需核对清单与artifact摘要。</p><p>version是标签，manifest只含列明源，generated-source hash标识生成字节，artifact SHA256标识最终字节。GNU ld2.36 build-ID不是完整文件校验，可在后处理修改后保留。哈希依赖可信预期，CRC不是认证；签名需要可信钥匙，版本授权与防回滚属于后续25—28。两次干净构建实际比字节才可称那两次相同；相同指令本身不证明，时间戳/路径/选项/工具版本仍有影响。</p>

## 人工ARM：可检查的ELF，不是可启动固件 {#build-ref-arm-title}

<p>已安装ARM GCC10.3.1与GNU ld2.36.1工具实验使用-mcpu=cortex-m4 -mthumb -ffreestanding，-nostdlib与lesson.ld。FLASH标签0x08000000/16KiB，RAM0x20000000/4KiB；.data为RAM VMA、FLASH LMA，.bss为NOLOAD预留。链接器排位置不自动复制或清零。缺少向量表/复位startup/C运行环境，明确NOT BOOTABLE，从未执行/烧录；芯片物理容量、重启和硬件均未验证。</p><p>readelf -h/-S/-l/-s/-n分别看ELF头/节/段/符号/notes，nm看符号，objdump -h比VMA/LMA，objcopy -O binary导出选中装载内容并丢符号/重定位。ELF/bin/map不同文件，不能互换摘要或假定bin自带装载地址。map/nm地址仅在匹配本次产物身份时有意义；旧map不能定位新程序。</p>

## 折叠回忆：带着条件说原因 {#build-ref-recall-title}

<p>合上速查先写结论，再展开解释。普通打印展开后恢复原折叠；本参考不再设置另一份模拟器。</p><details id="build-ref-answer-one"><summary>旧1.0.0程序，描述符已改1.0.1；--check与旧程序参数1.0.1分别会怎样？</summary><p>--check非零STALE_IDENTITY，旧程序非零IDENTITY_MISMATCH；前者比生成源，后者比链接标签。必须生成、编译、链接、运行并核对清单与artifact摘要，两个检查对象不同。</p></details><details id="build-ref-answer-two"><summary>人工ARM有ELF/bin/map与ENTRY，但无向量表/startup，.data的VMA在RAM。能否说main已就绪？</summary><p>不能。链接只排位置；没有复位上下文及数据复制/BSS清零运行时条件。NOT BOOTABLE、从未执行/烧录。下一步读07的职责分工，不能把产物检查替代硬件证据。</p></details><p>隔一天换一个错误对象组合，再不看表解释失败边界。若仍混淆“可重定位目标”或“清单自引用”，带着具体输入向助手追问；本页不保存个人作答或掌握记录。</p>

## 源码、操作、来源与下一步 {#build-ref-downloads-title}

<div class="next-links"><a href="../examples/build-link-identity/measurement.h" download>下载measurement.h</a><a href="../examples/build-link-identity/measurement.c" download>下载measurement.c</a><a href="../examples/build-link-identity/build_identity.h" download>下载build_identity.h</a><a href="../examples/build-link-identity/build_identity.c" download>下载build_identity.c</a><a href="../examples/build-link-identity/build.json" download>下载build.json</a><a href="../examples/build-link-identity/generate_identity.mjs" download>下载generate_identity.mjs</a><a href="../examples/build-link-identity/main.c" download>下载main.c</a><a href="../examples/build-link-identity/entry.c" download>下载entry.c</a><a href="../examples/build-link-identity/lesson.ld" download>下载lesson.ld</a><a href="../examples/build-link-identity/README.txt" download>下载README.txt</a></div><p>所有文件完整显示于<a href="../learn/build-link-identity.html#build-c-lab-title">本章源码与复做说明</a>；measurement.h/c可独立复用，main是宿主验证入口，entry/lesson.ld仅人工产物检查。先生成build_identity.c再编译。原始来源/条件详见<a href="../learn/build-link-identity.html#build-sources-title">本章来源</a>：GCC13.1与已安装10.3系§3.2；GNU ld/binutils2.36的Map、强定义、build-ID、nm/readelf/objcopy及LMA条款。首选对照GCC三个停止选项，然后亲自解释缺少定义为何到链接才失败。</p><p>本地内容/模型/宿主/人工目标证据分别记录，全站浏览器、独立评审、发布另验；硬件与实体纸张未验证。本参考保留每条使用前提，不把压缩表格当作安全认证或启动保证。</p><div class="next-links"><a href="../learn/build-link-identity.html">回到完整章节</a><a href="../learn/bounded-fifo.html">上一章：有界FIFO</a><a href="../learn/reset-runtime.html">下一章：复位与C运行环境</a></div><a href="../learn/engineering-map.html#stage-02">阶段02地图</a>
