# 阶段01本地证据：GPIO、C 与有界状态

记录日期：2026-10-17。此汇总只描述实际执行范围，阶段01仍未宣称整体完成。课程覆盖不等于个人学习、保持或掌握。

公开基线 `0772b06f6b3ca1700ae5159b58f839326d02424b` 包含已发布01—02；02 的 CI / Pages run39052396416 和线上章节、速查、导航、搜索、路径、预算已有发布检查确认。03—05 后续已由公开基线 `78723d525775feb83b91071b3f634a9c65863a1a`、CI/Pages run39058801087及父任务线上六阅读页/六源码说明下载字节、导航、搜索和核心交互证据确认发布；根任务复核发布树与先前审查版本一致。硬件与实体纸张仍未验证。

| 单元 | 已有实际证据 | 限制 |
| --- | --- | --- |
| 01 可靠按键输入 | 本批重跑原严格 C11、NDEBUG、模块编译与变异敏感性；原版通过，延迟接受变异按预期失败；模型回归通过 | 既有源未改，人工波形；无硬件 |
| 02 GPIO 输出与 LED | 13组 JavaScript 模型/控制器回归继续通过；已发布基线和线上检查 | 无新增 C、RTOS 或硬件 |
| 03 位与寄存器 | 真实页面模型/控制器；掩码固定值、宽度/字段/移位拒绝、RW/RO/W1C、两类顺序 RMW 反例；严格/NDEBUG/模块 C 检查 | 虚构1..8位假寄存器；RM0008仅历史读例；无硬件或并发 |
| 04 对象与边界 | 七类格子分类、真实预测控制；read_le16 五个成功、九个拒绝、哨兵保持、定义良好的无符号转换；严格/NDEBUG/模块 C 检查 | 真实存储、长度、生命周期和独立输出由调用者保证；不执行非法指针或 UB |
| 05 单上下文 FIFO | 14行固定重放、空满/回绕、0/255、NULL、真实已初始化坏元数据、复制所有权、20000步独立列表预期；严格/NDEBUG/模块 C 检查 | 单线程、单执行上下文、不可重入；不保证任务/ISR/DMA/SPSC安全 |

三个新实验统一经 `scripts/test-c-foundations-c.mjs` 的 mcu-build custom profile validate → dry-run → build 执行；实际编译器为已有 GCC13.1.0。参数为 `-std=c11 -Wall -Wextra -Werror -pedantic`；测试 main 宏分别为 BITS_TEST / OBJECTS_TEST / FIFO_TEST。九次编译、六次运行退出0；普通和 NDEBUG 输出一致，检查不依赖 assert。npm test 单独覆盖 JavaScript 与源扫描，不要求安装这套本地主机工具。

下表保留03—05先前发布批次的被测身份；10—11批次的FIFO公共头提取与新身份另记于后，不抹掉旧记录。

| 先前实际被测源 | SHA-256 |
| --- | --- |
| docs/public/examples/c-bits-registers/bits.c | 8964ef336bd48bdb5ae0bc520be6433412dc473f5bd2a675be32be3f01167f2b |
| docs/public/examples/c-objects-bounds/objects.c | 212ec7f8ed74a6495f85da70c563a37376a6678c0bd5f6bd729e7abab5eea957 |
| docs/public/examples/bounded-fifo/fifo.c | ce2d5c1e20aa95788e7217779ee69e96de0336b88cbaa8928c7296d450af287a |

维护者的本地证据：`.scratch/gpio-textbook/code-evidence/result.json` 为01本批回归；`.scratch/c-foundations/code-evidence/result.json` 为三个新实验的编译器身份、profile/命令、返回码、日志、源与九个产物哈希。私有二进制与机器路径不随公开阅读页发布；阶段证据不能替代实际版本记录。

技术来源只覆盖实际已读条款：N1570公开草案、GCC13.1 volatile 与 RM0008 Rev9历史寄存器例；具体范围见相应章节来源表。本文不声称硬件、目标 ABI、真实 RTOS、真实并发或全课程完成。06—09已有发布证据，见[阶段02证据](stage02-evidence.md)；10—11为本地候选，12—32待建设，见[阶段03本地证据](stage03-evidence.md)。先前06—09批次中，01与03—05既有源码通过原mcu-build封装重跑：03—05九构建/六运行/34命令；01严格/NDEBUG/模块和独立副本事件变异拒绝后原版绿色。该批原始回归文件由根任务保留。

## 10—11批次：只为真实复用提取FIFO公共头

为让UART独立链接原FIFO，05仅把原容量、类型、前提和声明提取到fifo.h；原枚举值、布局、四值容量、值复制、空满拒绝、失败保持与单上下文语义不变。旧读本、速查及镜像显示完整C/H并提供原生下载，README说明分别编译，不包含.c实现文本。

本批原作者通过已有GCC13.1.0和mcu-build validate→dry-run→build，实际重跑03—05严格/NDEBUG/模块及真实独立重复头调用者：13次路由构建、8次执行、48条命令，均符合预期；同一runner的默认输出和调用者指定私有输出均留有独立结果。01另有4次路由构建、4次执行、17条命令，原版通过、事件变异按预期退出1。根任务保留原始冻结记录，本共享集成不重复这些旧C。新10—11组合runner对实际借入FIFO模块的单独编译和链接另属集成证据。

| 提取后当前文件 | SHA-256 |
| --- | --- |
| docs/public/examples/bounded-fifo/fifo.c | edc3760763a7c163c1941b2515bb5092b1f9da0d358a733471ac14c8fdb0d340 |
| docs/public/examples/bounded-fifo/fifo.h | 6aa7acda719de132fb3bbbca5cdb9d8257cbeeaf5fb9aab0d5a1cb9bc0edda4a |

真实FIFO操作和所有14行轨迹、0/255、已初始化坏元数据、输出保持、复制所有权与20000步独立列表检查保留。启发式栈检查与主机执行不增加任务/ISR/DMA/SPSC或硬件保证；改动05的源码身份也不意味本批已正式发布。
