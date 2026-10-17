单元05 · 可打印速查

# 四字节FIFO：接口与轨迹 {#bounded-fifo-reference}

先检查所有权和前提，再看下标；只有OK才消费新输出。

**head读 · tail写 · count数**

单线程、单执行上下文、不可重入。

## 先核对接口条件 {#fifo-ref-contract-title}

本章速查只用于容量4的内部字节值队列：C11、CHAR_BIT=8和uint8_t，值0..255；head下一读、tail下一写、count占用。真实存活可写Fifo先reset再push/pop；同一个对象只由单线程、单执行上下文使用，不可重入。不安全用于任务/ISR/DMA或并发SPSC；volatile不补同步、排序或原子性。无分配、无阻塞、无等待或重试。硬件未验证。

## 状态与不变量 {#fifo-ref-state-title}

head/tail各0..3，count为0..4；先检查范围，再检查tail==(head+count)%4。count=0为空，count=4为满；两者head都可等于tail。物理槽0..3不等于逻辑顺序：从head数count个字节，回绕继续。未占用槽保留的旧值是陈旧字节，不得当新数据读。

例：slots=[85,102,51,68]，head=tail=2，count=4。逻辑队列51,68,85,102；下一pop取51；现在满，下一push必须拒绝。

## C接口与拒绝保持 {#fifo-ref-api-title}

公开C接口与五种状态

 | 接口/状态 | 条件与可见结果

 | fifo_reset(Fifo *queue) | 非空真实可写对象→OK；写入确定空起点，不读取旧值

 | fifo_push(Fifo *queue,uint8_t value) | 先验证元数据；未满→复制值、前进tail、count+1，返回OK

 | fifo_pop(Fifo *queue,uint8_t *output) | 先拒绝空参数，再验证元数据；非空→复制最旧值、前进head、count-1

 | FIFO_FULL / FIFO_EMPTY | 容量满/无有效值；保持所有队列字段，pop不改output

 | FIFO_INVALID_ARGUMENT | queue为空，或pop output为空；不访问队列

 | FIFO_BAD_STATE | 真实已初始化对象的元数据范围/关系失配；不读槽、不修改状态或output

成功push复制值到slots[tail]，tail=(tail+1)%4且count+1；成功pop复制slots[head]到output，head=(head+1)%4且count-1。这些是一整个概念操作，依赖单执行上下文；不承诺CPU原子性。FULL、EMPTY及参数/状态拒绝保持所有槽和元数据；失败pop保持output，只有OK才消费新输出。

pop的output必须是真实存活可写、属于调用者且与整个队列对象不重叠的uint8_t字节；不能指向内部slot。空queue或空pop output在访问前返回INVALID_ARGUMENT。BAD_STATE只检查真实全字段已初始化对象的元数据范围和关系；不检测任意地址、悬空对象、通用别名或自洽的外部篡改。不要用任意未初始化对象测试push/pop。

reset对NULL返回INVALID_ARGUMENT；对真实可写对象写入零槽、head=tail=count=0，不读旧payload或元数据，可初始化真实未赋值对象，也可恢复已初始化坏元数据；旧队列被丢弃，不能在其他上下文同时访问。

## 最小手工核对 {#fifo-ref-replay-title}

空起点，输出初值165；每个成功操作仍单独检查状态

 | 阶段 | head/tail/count | 逻辑顺序

 | reset | 0/0/0 | 空

 | push17,34,51,68 | 0/0/4 | 17,34,51,68

 | push85→FULL | 0/0/4 | 保持

 | pop17,34 | 2/0/2 | 51,68

 | push85,102 | 2/2/4 | 51,68,85,102

 | pop51,68,85,102 | 2/2/0 | 空

 | 再pop→EMPTY | 2/2/0 | 输出仍102

值复制夹具：source=17，reset后push成功，再source=99；向独立output pop成功仍得17。C的uint8_t形参无法恢复转换前的256；需要拒绝宽整数时先验域再转换。页面输入0..255整数，256、小数、空或负值先拒绝，保持上次有效状态。

## 复用与实际检查 {#fifo-ref-c-check-title}

<a href="../examples/bounded-fifo/fifo.c" download>完整fifo.c</a> · <a href="../examples/bounded-fifo/README.txt" download>复现说明</a>。定义FIFO_TEST才带main；不定义时编译模块。严格参数：-std=c11 -Wall -Wextra -Werror -pedantic；测试分别加-DFIFO_TEST、-DFIFO_TEST -DNDEBUG；模块加-c。主机可用cc，Windows用已有编译器及.exe调用。

本次已安装GCC13.1.0经mcu-build自定义profile validate→dry-run→build：正常/NDEBUG测试和模块编译退出0，两个测试运行退出0。完整源码与下载字节一致，见章节。测试不依赖assert；14行字面期望、0/255、null、真实已初始化坏元数据、reset、命名字段与槽快照、输出哨兵、复制所有权，以及20000步线性列表预期均通过。输出为PASS FIFO: literal replay, boundaries, null, initialized corruption, snapshots, copy, 20000 steps。它与浏览器模型分别验证，均不证明硬件或并发。

## 折叠回忆与迁移 {#fifo-ref-recall-title}

先口述：head=tail=1、count=0、output=255时pop怎样？改count=4又怎样？

count=0返回EMPTY，output仍255且所有状态不变；255不是新数据。count=4为满，pop成功取head位置并把head前进到2、count变3；但还需元数据一致、真实初始化和独立有效output等前提。不要只用下标相等判断空。

隔一天把回放换成0、255、7、9，写下完整顺序与拒绝原因，再核对。没有保存答案或掌握记录。若卡住，向助手指出“逻辑顺序”“陈旧值”“有效对象”或“并发前提”的具体问题。

## 版本与来源 {#fifo-ref-sources-title}

技术资料核对日期2026-10-17。图、回放、解释和练习是原创教学材料，不复制私有或付费课程。来源支撑下述语言条件；队列策略和固定答案仍由本章合同、独立测试和审阅负责。

- [WG14 N1570，Committee Draft，2011-04-12](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)：实际阅读§6.2.4（对象生命周期、不确定初值），§6.3.1.1/6.3.1.3（整数提升及无符号转换），§6.5.6（同数组与端点），§6.7.3（限定符及实现定义volatile访问），§7.19（size_t），§7.20.1.1（可选的精确宽度整数）。它是公开委员会草案，不冒充购买的最终ISO标准。**首选阅读任务：**先读§6.2.4第1—2、6段，解释为何“非空地址”不足以替代live object前提，再对照本章output合同。
- [GCC13.1手册§6.46：When is a Volatile Object Accessed?](https://gcc.gnu.org/onlinedocs/gcc-13.1.0/gcc/Volatiles.html)：完整页面已读，说明实现的volatile访问语义，以及它不替非volatile内存提供排序屏障。只支撑GCC版本限定的访问条件，不作为ISR/DMA安全或FIFO原子性的证明。
- [Matt Pocock teach](https://github.com/mattpocock/skills/blob/main/skills/productivity/teach/SKILL.md?plain=1)：知识先行、短成果、预测反馈、回忆与迁移的教学组织方法；不提供C技术正确性证明。

## 返回章节与课程范围 {#fifo-ref-next-title}

上一章是C对象与边界；下一章06构建与身份已可作为本地候选阅读，07—09继续复位、预算与时钟。后续10—14待建设，单元10才是定时器；本地内容不代表远端发布或硬件验证。

[完整章节与十题](../learn/bounded-fifo.html)[C对象与边界](../learn/c-objects-bounds.html)[下一章：构建与身份](../learn/build-link-identity.html)[构建与身份速查](../learn/build-link-identity-reference.html)[阶段地图](../learn/engineering-map.html#stage-01)
