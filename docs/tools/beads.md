---
title: Beads：任务依赖与就绪队列
description: 交互式理解 Beads 的依赖图、ready 就绪队列、任务认领、CLI 工作流与 Dolt 持久化和同步边界。
---

<!-- 全文搜索输入；公开阅读页输出完整交互 HTML。 -->

# Beads：任务依赖与就绪队列 {#beads-title}

Beads 把 AI 编程中的任务、依赖和完成记录留在可查询的系统里。本文以虚构解析器项目解释工作图，不连接真实仓库，不调用 bd。

## 依赖图：下一步能做什么 {#dependency-lab}

本地教学实验：A 明确协议；B 实现解析器依赖 A；C 边界测试依赖 B；D 使用说明依赖 A；E 验收交付依赖 C 和 D。选择节点、领取、完成，观察 ready 队列变化。模型只包含 open → in_progress → closed 和 blocks，所有数据仅在页面内存中，重置或刷新恢复初始状态。

## Beads 是什么：给任务一个持久的上下文 {#beads-mental-model}

这里的 Beads 指 Steve Yegge 发起的开源任务跟踪工具，命令行入口是 `bd`。原官方仓库 `steveyegge/beads` 已跳转到 `gastownhall/beads`。它面向需要跨会话继续工作的 AI 编程 agent，也可以由人直接使用。

聊天记录告诉你讨论过什么，任务记录告诉你还有什么要做。一个可交接的任务至少应该写明目标、范围、验收条件、阻塞依赖和完成证据。Beads 保存并查询这些信息；它本身不会替你决定产品取舍，也不会证明代码正确。

**拆成能验收的一步**

「优化固件」过大；「补齐解析器超长帧测试」更容易判断是否完成。

**表达真正的先后约束**

如果 B 在 A 完成前无法开始，就记录 B 依赖 A。相关任务不一定互相阻塞。

**交接留下证据**

保存做了什么、验证了什么、还剩什么。短而完整，比复制整段聊天更有用。

## 依赖方向与 ready：别把箭头读反 {#beads-dependency-direction}

`bd dep add B A` 的含义是「B 依赖 A」。A 是 blocker，B 是被阻塞的任务。为了更容易读懂，也可以用 `bd dep add B --blocked-by A`。本文图里的箭头从 A 指向 B，表达前置工作的完成会解锁后续工作。

```sh
# 把两个示例 ID 替换为真实 ID
bd dep add bd-example-tests --blocked-by bd-example-parser
bd ready --json
bd show bd-example-tests
```

实验里的 ready = 状态为 open，且所有 blocks 前置任务都已 closed。in_progress 表示已有人开始做，不再列入可领取队列。已 closed 的任务也不应重复领取。

真实 Beads 的 ready 还受配置和过滤规则影响。v1.3.1 发布说明包含自定义 active-category 状态；不能把本页的三态规则当作全部版本的完整实现。层级父子关系用于分解工作，相关关系用于关联线索，也不要全部当作 blocks。

依赖图必须避免自依赖与有向环：如果 A 等 B、B 又等 A，就没有可启动的一步。优先级再高也不能消除这个逻辑矛盾。v1.3 还增加了针对祖先/后代阻塞关系的死锁保护；请按具体版本验证层级限制。

## 最小 CLI 工作流：记录、认领、验证、关闭 {#beads-cli-workflow}

先从官方安装文档选择与你系统匹配的发布包，再核对本机版本。不要直接执行来源不明的安装脚本。本节示例按 v1.3.1 官方命令源码核对，不代表本站安装或连接了 Beads。初始化会创建或更新任务数据，也可能涉及 agent 指导或集成文件；先确认目标目录，再审阅初始化产生的变化。

```sh
bd version
bd init --help
# 阅读帮助，确认存储与运行模式后，在目标仓库初始化
bd init

# create 的输出会给出实际 ID
bd create "实现协议解析器" -t task -p 1
bd create "补齐解析器边界测试" -t task -p 1

# 用上一步输出的 ID 替换占位符
bd dep add bd-example-tests --blocked-by bd-example-parser
bd ready --json
bd show bd-example-parser
bd update bd-example-parser --claim

# 在工程中实现并运行适用测试，再记录验收结果
bd close bd-example-parser --reason "实现完成，边界用例已通过"
bd ready --json
```

`--claim` 将负责人设置为当前 actor，并将任务置为 in_progress；在支持该语义的版本中，认领对当前访问的数据库或服务是原子的，不应直接夺走其他人的有效认领；两个尚未同步的离线副本仍可能分别认领。领取不等于获得代码仓库或运行环境的权限。

`bd close ID --reason "…"` 是明确的关闭与原因记录。普通 epic 在子任务完成后仍需显式关闭；父任务不应被想当然地自动验收。关闭任务前，确认阻塞、子项和验收条件都已处理；不要用强制选项掩盖未完成工作。

命令示例没有替你运行测试，也没有自动保存代码提交。创建任务时补充具体说明与验收条件；任务状态和 Git 提交应彼此能追溯，但不是同一个系统。

## Dolt、同步和备份：不要沿用旧教程的假设 {#beads-storage-sync}

当前官方资料以 Dolt 作为持久化基础。嵌入式单写者、独立服务器并发写者、代理式连接等拓扑适用条件不同。v1.3 发布说明和部分架构文档对默认模式的表述存在差异，因此本文不指定统一默认值；以实际 `bd version`、`bd init --help` 和对应 release notes 为准。

- **嵌入式：**数据库由本地进程直接访问，注意单写者和锁的边界。

- **服务器式：**通过数据库服务协调并发；需要关注服务生命周期、连接和访问配置。

- **代理式：**客户端通过代理访问后端，不能把本地客户端状态当作服务端数据库状态。

`.beads/issues.jsonl` 可用于导出或交换任务，但不是当前主数据库，也不是完整备份。只提交这个文件不等于已保护所有任务、历史和数据库元数据。

代码的 `git push` 与 Dolt 数据库的 push/pull 是不同链路。任务是否同步，取决于选用的存储模式、远端和团队流程。散列 ID 可降低 ID 碰撞，不能保证内容合并零冲突。`bd backup` 是数据库备份入口；远程共享服务器的备份应由服务端管理员按部署方式负责。真正需要验证的是能否恢复，而不只是有没有导出文件。

采用前先在非关键仓库演练：创建任务 → 建依赖 → 关闭任务 → 备份 → 在隔离环境恢复。升级时阅读迁移说明，保留可验证的备份，不对正在使用的数据库盲目套用旧版迁移命令。

## 与 Plane 怎样分工，哪些事情不能代替 {#beads-plane-boundaries}

Beads 贴近代码执行中的任务图与 agent 交接；[Plane](../tools/plane.html) 则更适合团队共享项目、工作项、周期与模块视图。可以把 Beads 理解为细粒度执行记录，把 Plane 用作团队讨论进度的共同界面，但分工应由实际团队决定。

先确定哪边是状态来源、什么内容需要同步、由谁更新、完成证据放在哪里。本站没有提供 Beads 与 Plane 的集成、自动同步或账号连接。把一个任务复制到两边并不会自动建立一致性。

- 不要在任务描述中放密钥、令牌、私人会话或不适合共享的日志。

- AI agent 读到任务描述，不等于得到执行危险命令、外发数据或发布的授权。

- ready 说明依赖允许开始，不能保证需求正确、环境就绪或执行安全。

- 任务 close 说明记录已关闭；代码评审、CI、设备验证和交付仍需各自的证据。

## 版本、许可与官方资料 {#beads-sources}

核查日期：2026-10-14。本文以官方仓库、v1.3.1 发布记录与对应 CLI 源码交叉核对。仓库迁移、命令、默认模式与行为会变化，动手前再核对安装版本。Beads 项目采用 MIT 许可；转载其代码仍应保留要求的版权与许可声明。本文为独立教学说明，未暗示官方背书。

- [Beads 官方仓库](https://github.com/gastownhall/beads)项目定位、当前入口和文档。

- [v1.3.1 发布说明](https://github.com/gastownhall/beads/releases/tag/v1.3.1)版本行为、存储拓扑、自定义状态变更。

- [依赖命令源码](https://github.com/gastownhall/beads/blob/v1.3.1/cmd/bd/dep.go)dep add 参数顺序与 blocked-by。

- [认领命令源码](https://github.com/gastownhall/beads/blob/v1.3.1/cmd/bd/update.go)update --claim 的并发认领语义。

- [关闭命令源码](https://github.com/gastownhall/beads/blob/v1.3.1/cmd/bd/close.go)close 与 --reason 参数。

- [创建任务命令源码](https://github.com/gastownhall/beads/blob/v1.3.1/cmd/bd/create.go)：create 的 task 类型与优先级参数。

- [Dolt 架构与备份](https://github.com/gastownhall/beads/blob/v1.3.1/docs/architecture/dolt.md)：存储拓扑、导出与恢复边界。

- [MIT 许可证](https://github.com/gastownhall/beads/blob/main/LICENSE)以官方仓库保留的完整许可文本为准。

