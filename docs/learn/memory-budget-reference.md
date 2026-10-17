# 内存预算速查 {#memory-budget-reference}

预留只算一次，峰值按生命期，栈按最大可达路径。

## 先读条件，再用公式 {#memory-ref-contract-title}

<span id="memory-ref-contract"></span>

<p>本页压缩单元08的完整推导。任务是采集终端的RAM预算；单上下文、有限声明工作负载、真实且不重叠的C对象。布局与生命周期条件不能从公式中删去。text/rodata常驻Flash；data可同时有Flash初值LMA及RAM运行VMA；BSS占RAM零填充。map只证明选定链接的放置，不证明动态峰值、DMA可达或最坏调用路径。</p><p>包络=data+BSS+heap预留+stack预留+guard；各区不重叠，对齐/填充另有归属。另比heap live peak≤heap reservation、stack bounded demand≤stack reservation，不能重复加live，也不能自动跨arena借空闲。</p><p>FITS包括等于；EXCEEDS表示新数字超容量。INVALID/OVERFLOW/UNKNOWN保持旧数值报告。heap只有FITS提交state+report，其EXCEEDS也保持旧值。NULL检查不能验证伪造/悬空指针、虚假跨度或别名；heap仅允许init/step建立有效表示。</p>

## 可独立复算的固定夹具 {#memory-ref-fixtures-title}

<span id="memory-ref-fixtures"></span>

<div class="table-wrap" role="region" tabindex="0" aria-label="数字均为教学声明，非真实地址/硬件帧"><table><caption>数字均为教学声明，非真实地址/硬件帧</caption><thead><tr><th scope="col">夹具</th><th scope="col">独立结论</th></tr></thead><tbody><tr><td>1024容量=128data+256BSS+256heap+256stack+128guard</td><td>FITS，unreserved0；guard129→1025、EXCEEDS1</td></tr><tr><td>heap128、overhead0、alignment1，A/B/C/D各32；释放A/C</td><td>live64、free64、largest32、peak128；连续E48拒绝</td></tr><tr><td>再释放B，再分配E48</td><td>largest96后成功；live80/free48/largest48/peak128</td></tr><tr><td>payload5、overhead4、alignment8</td><td>每块span16；两块32</td></tr><tr><td>互斥路径80+64+32与80+48，aggregate IRQ64</td><td>max176+64=240；stack256余16</td></tr><tr><td>路径176，IRQ每层64，2层</td><td>304，超256共48；未知嵌套→UNKNOWN</td></tr></tbody></table></div><p>finite trace：A32→B32→C32→D32→releaseA→releaseC→E48拒绝→releaseB→E48成功→releaseD。生命周期峰值是同时live的最大128，不是成功申请过的累计176。first-fit需连续洞，相邻洞合并、非相邻不合并，不移动活对象；释放终止引用有效期，泄漏与悬空风险仍由调用者避免。</p>

## 路径边界与实际证据 {#memory-ref-stack-title}

<span id="memory-ref-stack"></span>

<p>max-of-paths先找同时活跃帧；siblings互斥则不相加。声明repetitions乘整路径，IRQ每层完整成本×最大嵌套；都先检查乘法和加法。未给递归次数、未知目标、缺少IRQ边界→UNKNOWN，绝不是安全0。C最多8路径，每路径16帧；无自动调用图分析。</p><p>AAPCS32 2025Q1 §6.2.1.1/.2：SP始终4字节对齐，public interface8字节。PM0214 Rev10 §2.3.7 pp.42–44：基本8-word硬件异常帧32字节，padding/FP扩展依配置与状态，handler软件帧及嵌套另算；图12浮点保存扩展18字=72。PSP被打断保存与Handler MSP成本要分别记账。64只是本章aggregate IRQ假定。</p><p>GCC13.1.0/x86_64，O0/no-inline/no-tail-call/fstack-usage真实host报告leaf48、middle96、root112，均static，不能替代toy80/64/32。GCC10.3/13.1：static固定帧；dynamic,bounded含动态调整上界；dynamic未bounded只给有界部分。逐函数报告缺完整调用/库/IRQ覆盖，水位只说明已执行条件，map只说明放置。可选ARM交叉对象使用GCC10.3.1/Cortex-M4/Thumb/soft-float及相同O0/no-inline/no-tail-call/fstack-usage，报告leaf40/middle64/root80 static；未链接、未执行。默认沙箱先拒绝启动，限定批准执行上下文后经同一router成功；不是工具损坏诊断。本章没有目标运行、水位、硬件或物理打印证明。</p>

## 受检运算与复用 {#memory-ref-api-title}

<span id="memory-ref-api"></span>

<p><a href="../examples/memory-budget/memory_budget.h" download>下载 memory_budget.h</a> · <a href="../examples/memory-budget/memory_budget.c" download>下载 memory_budget.c</a> · <a href="../examples/memory-budget/stack_probe.c" download>下载 stack_probe.c</a> · <a href="../examples/memory-budget/README.txt" download>下载 README.txt</a></p><p>头文件、实现、probe与说明均为本项目原创，无虚构第三方版权/许可。size_t非负；addition先right≤SIZE_MAX−left，multiplication先value≤SIZE_MAX/numerator。memory_scale_ceil检查分母非零及选定中间乘积，再商+非零余数；可约分比值也可能因中间乘积返回OVERFLOW。</p><p>memory_envelope；memory_scale_ceil；memory_stack；memory_heap_init；memory_heap_step完整合同见主章。heap最多8槽、payload>0、alignment非零2的幂；span=round_up(payload+overhead,alignment)，元数据在fictional arena外。模块独立编译不定义MEMORY_BUDGET_TEST，测试定义该宏；probe运行只定义STACK_PROBE_TEST。严格C11、NDEBUG运行检查、I/O失败非零；完整复现参数在README.txt。</p><p>首选读<a href="https://github.com/ARM-software/abi-aa/blob/c51addc3dc03e73a016a1e4edf25440bcac76431/aapcs32/aapcs32.rst#L1053">AAPCS32 2025Q1 §6.2.1.1/.2</a>区分4/8条件，再核对<a href="https://gcc.gnu.org/onlinedocs/gcc-13.1.0/gcc/Developer-Options.html#index-fstack-usage">GCC13.1 §3.19</a>三种qualifier。原章列出已读ST PM0214、GNU ld2.36与Arm AN316 V1.3的版本、范围和证据局限。</p>

## 遮住答案，保留所有前提 {#memory-ref-recall-title}

<span id="memory-ref-recall"></span>

<p>RAM1024含data128/BSS256/heap256/stack256/guard128；heap128 arena中A/B/C/D各32，释放A/C；两条互斥路径80+64+32与80+48，aggregate IRQ64，stack256。分别给出包络、连续48分配和栈结论。</p><details id="memory-ref-answer"><summary>展开独立核对</summary><p>包络1024，FITS/余0；64free但largest32，48拒绝；max176+64=240，余16。若路径未知则UNKNOWN，不用240继续宣称安全。</p></details><p>隔天更改生命线和路径再算。一次看懂不等于长期掌握；把不清楚的“分账/碎片/UNKNOWN”交给助手追问。</p><div class="next-links"><a href="../learn/memory-budget.html">返回完整章节</a><a href="../c-memory/heap-stack.html">专题桥接：堆与栈</a><a href="../learn/clock-timebase.html">下一章：时钟树、切换与时基</a><a href="../learn/engineering-map.html#stage-02">阶段02地图</a></div>
