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

| 实际被测源 | SHA-256 |
| --- | --- |
| docs/public/examples/c-bits-registers/bits.c | 8964ef336bd48bdb5ae0bc520be6433412dc473f5bd2a675be32be3f01167f2b |
| docs/public/examples/c-objects-bounds/objects.c | 212ec7f8ed74a6495f85da70c563a37376a6678c0bd5f6bd729e7abab5eea957 |
| docs/public/examples/bounded-fifo/fifo.c | ce2d5c1e20aa95788e7217779ee69e96de0336b88cbaa8928c7296d450af287a |

维护者的本地证据：`.scratch/gpio-textbook/code-evidence/result.json` 为01本批回归；`.scratch/c-foundations/code-evidence/result.json` 为三个新实验的编译器身份、profile/命令、返回码、日志、源与九个产物哈希。私有二进制与机器路径不随公开阅读页发布；阶段证据不能替代实际版本记录。

技术来源只覆盖实际已读条款：N1570公开草案、GCC13.1 volatile 与 RM0008 Rev9历史寄存器例；具体范围见相应章节来源表。未来 ABI / 构建启动等资料仍待核对。本文不声称硬件、目标 ABI、真实 RTOS、真实并发、全课程完成或远端发布通过。06—09现为本地候选，见[阶段02本地证据](stage02-evidence.md)；10—32保持待建设，下一阶段10—14，定时器10。01与03—05既有源码在本批通过原mcu-build封装重跑：03—05九构建/六运行/34命令；01严格/NDEBUG/模块和独立副本事件变异拒绝后原版绿色。原始42份回归文件由根任务保存，本集成不重复运行旧C。
