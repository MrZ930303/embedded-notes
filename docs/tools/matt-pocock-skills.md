---
title: Matt Pocock Skills：可检查的 AI 编程流程
description: 按任务交互选择 Matt Pocock Skills，理解澄清、规格、拆票、TDD、审查、C/STM32 适配与授权边界。固定源码快照核验。
---

<!-- 全文搜索输入；公开阅读页输出完整交互 HTML。 -->

# Matt Pocock Skills：把 AI 编程变成可检查的工程流程 {#matt-pocock-skills}

从问清需求到测试与审查，按任务选一张工作卡，而不是一键放权。

## 版本卡 {#skills-version}

- 官方项目：mattpocock/skills，项目名 Skills For Real Engineers
- 核验日期：2026-10-14
- 本文固定源码：49dd158d1076134a641b33efb035946536778336（提交于 2026-10-09 10:56:49 UTC）
- 此快照 package.json 标注 1.3.1；提交快照与已安装插件版本不是同一件事
- 许可证：MIT，Copyright (c) 2026 Matt Pocock
- 本站为独立中文学习笔记，与作者不存在官方隶属关系

来源：[固定源码](https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336)、[版本文件](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/package.json)、[MIT 许可证](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/LICENSE)、[作者文档](https://www.aihero.dev/skills)。

## 交互练习：从当前卡点选一张工作卡 {#skills-lab}

先选你遇到的任务，再逐步查看入口技能、所需上下文、输出证据和动作边界。路线来自本文固定版本，串口示例与模拟权限是本站教学设计。实际项目不必机械走完全部技能。

选择器提供九种入口：不知道从哪里开始、需求还模糊、需要形成规格、需要跨会话拆任务、已有任务要实现、遇到难复现错误、要检查变更、想改善架构，以及会话结束后的复盘。每条路线显示本步骤的输入、输出和可能发生的操作。

可切换任务落点为本地 Markdown 或已配置的远端跟踪器；这只影响规格和票据步骤的模拟写入边界。可勾选“练习中已确认”本地文件写入、运行程序与检查、Git commit 或远端写入，观察下一步是否仍有缺口。这些勾选不构成真实授权，也不保存到任何账户。读仓库的前提也是你有权访问该仓库。

“下一步预演”只切换页面内的讲解；“上一步”可回看；“重置练习”恢复默认入口和全部未确认状态。按钮支持触摸、Tab 与 Enter/空格。全部数据只在页面内存中，刷新即重置。不执行命令、不安装技能、不提交代码、不连接 GitHub、GitLab、Beads 或 Plane，也不访问硬件。

关闭 JavaScript 后，下面的完整正文仍可阅读；浏览器内建的展开项仍可操作。打印按钮会临时展开全文，打印结束后恢复原来的折叠状态。

## 01 · 先弄懂四个角色 {#skills-roles}

Matt Pocock Skills 是作者公开维护的一组 AI Agent 工作方法，强调小、可组合、可按项目修改。它覆盖需求澄清、规格、拆票、实现、调试和审查。它不是一个新的基础模型，也不是给固件项目增加了编译器。

- Agent：阅读上下文、作判断并调用工具的执行者。
- Skill：按需加载的任务说明包。核心是 SKILL.md，内含名称、描述和操作指导；还可附参考文件、脚本和模板。
- 工具：真正执行动作的能力，例如读文件、运行测试、调用 GitHub CLI。写着“执行测试”的 skill，不会凭空提供测试环境。
- AGENTS.md / CLAUDE.md：项目级常驻约定和导航；本项目的 setup 会在其中记录技能配置的入口。Skill 用于特定任务流程，两者需要协调。

理解成“程序员 + 工作卡 + 工具箱 + 项目约定”会更直观。Skill 会影响行为，但不是强制执行器或安全隔离机制。

来源：[Agent Skills 官方格式](https://agentskills.io/home)、[项目 README](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/README.md)、[setup 源码](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/setup-matt-pocock-skills/SKILL.md)。角色类比为本站解释。

## 02 · 从症状选择技能 {#skills-catalog}

### 不知道从哪里开始：ask-matt {#skill-ask-matt}

它是技能路线的导航器。先说清当前卡点，再让它推荐入口。它不是远程联系 Matt 本人，也不会让所有流程自动跑一遍。

### 想法还模糊：grill-me / grill-with-docs {#skill-grill}

grill-me 聚焦对话中的方案追问；grill-with-docs 还会调用 domain-modeling，在仓库里逐步形成术语表 GLOSSARY.md 和必要的架构决策记录 ADR。后者有文件写入，不是纯聊天。

### 已谈清楚，要形成规格：to-spec {#skill-to-spec}

综合当前对话和代码理解，确认测试边界后生成规格，并发布到已配置的任务跟踪器。它不负责重新做一次完整需求访谈。未确认需求时先回到澄清阶段。

### 工作超过一个会话：to-tickets {#skill-to-tickets}

把规格或计划切成可独立验证的纵向小任务，同时声明哪些任务会阻塞它。先审阅拆分，再创建本地票据文件或真实平台的 issue。广泛机械重构可能需要“扩展→分批迁移→收缩”，不应硬切成无法单独通过验证的小块。

### 已有明确任务：implement + tdd {#skill-implement-tdd}

implement 负责按规格或票据实施，在事先约定的测试边界调用 tdd，最后做 code-review，并将工作提交到当前分支。它有实际代码修改和 Git commit，使用前要确认分支与授权范围。

tdd 的重点是公开接口上的可观察行为：先看到一个真实失败，再写刚够通过的实现，每轮只走一个纵向切片。期望值应来自独立规格或已知例子，不能照抄实现的算法计算一遍来“证明正确”。

### 难复现的错误：diagnosing-bugs {#skill-diagnosing-bugs}

先构造能够识别这个具体故障的反馈回路，再缩小复现、提出可证伪假设、做针对性观测、修复并回归。没有可靠复现条件时，应说明缺口并索取环境或脱敏证据。它可能运行程序、加入临时探针、改代码和清理临时文件。

### 要检查变更：code-review {#skill-code-review}

从明确的 Git 比较基准出发，分开审查两条轴：Standards 检查项目规范，Spec 检查需求是否实现。缺少规格就报告缺少规格，不能伪造“需求通过”。该技能的目标是报告发现，不能把审查报告当成已经修复或已经发布。

### 代码架构越来越难理解：improve-codebase-architecture {#skill-architecture}

先找模块边界和可测试性上的阻力，生成候选方案的 HTML 报告，再由你选择要深入讨论的方案。它不是自动全仓重构按钮：初始报告写临时目录，后续讨论可能更新术语表和 ADR。

### 一轮结束后：retro {#skill-retro}

回看本次工程会话，提出改善 Agent 工作环境的建议，例如更好找资料的入口、自动检查或编码标准。机械错误应优先让确定性检查捕获，不能只靠再加一句提示词。

对应源码链接：
- [ask-matt](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/ask-matt/SKILL.md)
- [grill-with-docs](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/grill-with-docs/SKILL.md)
- [domain-modeling](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/domain-modeling/SKILL.md)
- [to-spec](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/to-spec/SKILL.md)
- [to-tickets](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/to-tickets/SKILL.md)
- [implement](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/implement/SKILL.md)
- [tdd](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/tdd/SKILL.md)
- [diagnosing-bugs](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/diagnosing-bugs/SKILL.md)
- [code-review](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/code-review/SKILL.md)
- [improve-codebase-architecture](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/improve-codebase-architecture/SKILL.md)
- [retro](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/retro/SKILL.md)

## 03 · 一个最小工作流 {#skills-minimal-workflow}

以“给串口接收模块增加超时恢复”为学习示例：

1. 澄清：什么叫超时？帧边界如何识别？部分帧是丢弃还是保留？什么场景必须恢复？用 grill-with-docs 讨论，并统一“帧”“空闲”“恢复”的含义。
2. 定规格：记录输入、状态迁移、失败行为和不做的事。确认要在哪个公开接口上判断正确性，再用 to-spec 固化。
3. 分任务：先让一个完整可验证路径跑通。若跨多个会话，用 to-tickets 表达真实依赖，避免仅拆成“先全写驱动、再全写测试”。
4. 小步实现：在选定接口上，一次建立一个会失败的测试，再写最小实现。运行项目真实编译和检查命令。
5. 双轴审查：一边核对项目规范，一边核对规格；保留执行过的测试证据和未覆盖项。
6. 复盘：把重复错误转为适合项目的自动检查或明确约定。

这是一条学习路径，不要求小改动必须经过所有步骤。技能选择器只帮助理解路线，不会运行工具。来源：[官方路线说明](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/ask-matt/SKILL.md)。串口案例为本站改编示例。

## 交付链：把讨论变成可验证的结果 {#skills-delivery-chain}

一条可靠的交付链是：澄清问题 → 人确认取舍 → 明确范围与不做的事 → 拆成可验证的纵向切片 → 实现与保留证据 → 对照规格和规范审查。技能是每一段的工作卡，最终决策与授权仍属于人。以下是本站归纳的工程方法，不是额外安装的技能。

### 先确认问题，再固定范围 {#skills-confirm-scope}

澄清不只是多问几个问题，还要把未决点列出来：谁使用、在哪些输入和异常下工作、哪些约束不能打破、什么证据能判定完成。涉及产品取舍、对外承诺或硬件风险时，先让人明确选择。把目标、验收条件与 non-goals 放在同一份规格中，避免把“以后可以做”误写成这次必须交付。

### Spec 与 ADR 分别回答什么 {#skills-spec-adr}

Spec 说明这次要交付什么行为、约束与验收证据；ADR 记录为什么在当时的约束下选择这个方案、比较过哪些替代方案、接受哪些代价。ADR 不能替代可测试的规格，Spec 也不应该抹掉重要决策的理由。GLOSSARY.md 用于统一词义，避免同一个词在代码、讨论与测试里指向不同概念。

### 纵向切片与完成证据 {#skills-slices-evidence}

切片要穿过一条真实可观察路径，例如“接收半帧后超时，状态恢复并能继续解析下一帧”，而不是把全部接口、全部实现、全部测试分成互相等待的三大块。每片都带上输入、预期结果和验证办法。审查时区分“已经运行并通过”“只检查过代码”“尚未验证”，不能把 Agent 的完成陈述替代测试记录。

发生在测试循环之外的重构，也需要清晰范围、审查与重新验证。这个快照的 tdd 实现循环是 red → green；重构放在审查阶段处理。不能看到审查报告，就假定修复、提交或发布都已完成。

## 04 · 用到 C / STM32，要补齐哪些上下文？ {#skills-embedded-context}

这些工程方法可以迁移，但仓库并不提供 STM32 器件知识或硬件安全保证。官方 tdd 示例使用 TypeScript；不能把其中的测试命令和 Web 假设直接当成固件方案。

建议在自己的工程上下文中补齐：
- 器件完整型号、板卡修订、参考手册和勘误版本、工具链与 HAL/LL/RTOS 版本
- 编译命令、链接脚本、Flash/RAM 预算、警告策略，以及实际可运行的测试命令
- 中断与线程边界、缓冲区所有权、DMA/缓存一致性要求、实时性与看门狗约束
- 哪些行为能在主机端测试，哪些必须在目标板或硬件在环环境验证
- 哪些步骤允许 Agent 做，哪些要人确认，例如烧录、擦除、改 option bytes、控制真实电机或执行器

示例测试边界：主机端通过 packet_parser_feed() 输入半帧、错误长度、连续帧，检查公开返回结果。它可以验证解析逻辑，但不能证明真实串口时序、中断竞争、DMA 行为或功耗合格。硬件验证必须另列证据，不得把“编译通过”写成“上板通过”。

以上为本站嵌入式适配建议，并非 Matt Pocock 仓库的 STM32 官方教程。来源：[官方测试示例](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/tdd/tests.md)。

## 05 · 安装示例，只展示，不执行 {#skills-installation}

先打开官方源码，阅读要使用的 SKILL.md、引用文件和脚本，再选择安装方式。同一个 Agent 尽量只选插件或可编辑副本之一，避免重复技能。

可编辑文件方式（官方 README 提供，省略 -a 时交互选择 Agent）：

```sh
npx skills@latest add mattpocock/skills
```

Claude Code 插件方式：

```sh
claude plugin install mattpocock-skills@claude-plugins-official
```

Codex 插件方式：

```sh
codex plugin marketplace add mattpocock/skills
codex plugin add mattpocock-skills@mattpocock
```

这些命令是安装操作，不是只读预览，也不是版本锁定命令。npx 会获取并运行安装器，@latest 和插件更新都可能引入新内容。本文只记录固定快照里的官方命令；使用前请确认当前客户端版本支持该语法。

安装后，官方建议每个仓库先调用 /setup-matt-pocock-skills，配置任务跟踪器、标签和文档布局。它会修改 AGENTS.md 或 CLAUDE.md 以及 docs/agents/ 下的配置；配置真实平台且启用 triage 时，还可能创建缺失标签。GitHub 路线需要 gh，GitLab 路线需要 glab，并具备相应权限；也可以使用本地 Markdown 跟踪。

仅学习时，可以先阅读文档或使用本站模拟器。安装不等于授权它提交代码、发 issue、修改远端设置或接触硬件。

来源：[固定版安装说明](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/README.md)、[setup 的具体修改范围](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/setup-matt-pocock-skills/SKILL.md)。

## 06 · 权限边界与更新检查 {#skills-boundaries}

不是每个 skill 都是只读：
- 对话/建议为主：grill-me、ask-matt、retro
- 读取仓库并报告：code-review；必要时还读取远端规格
- 写文档或配置：grill-with-docs、domain-modeling、setup
- 写本地任务或远端 issue：to-spec、to-tickets、triage
- 改代码、运行检查，甚至提交 Git：implement、tdd、diagnosing-bugs
- 先写临时报告，后续可能写项目文档：improve-codebase-architecture

这是行为导览，不是沙箱权限表。最终能力取决于宿主工具、账户和批准范围；文件里出现一句指令并不自动赋予权限。

每次引入或更新前：核对官方 owner/repo → 固定并记录版本/commit → 看 diff 和引用脚本 → 检查联网、凭据读取、删除、发布与提交动作 → 在独立分支或试验仓库验证 → 再纳入自己的工程。

不要把 token、密码或私有设备标识粘贴到公开笔记、issue、截图和日志里。调试证据先脱敏。若复制或再分发原始技能内容，应按 MIT 条款保留版权和许可声明；MIT 不承诺适用性或安全保证。

版本提醒：这个快照使用 GLOSSARY.md / GLOSSARY-MAP.md。旧教程中的 CONTEXT.md 命名已变更。tdd 的实际 SKILL.md 将实现循环写为 red→green，并把重构放到审查阶段；README 的概述仍有 red-green-refactor 表述。具体执行细节以你固定版本的技能文件为准，不把新旧版本揉成一套流程。

来源：[CHANGELOG](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/CHANGELOG.md)、[tdd](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/tdd/SKILL.md)、[诊断中的脱敏要求](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/diagnosing-bugs/SKILL.md)、[维护范围](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/SCOPE.md)。不要把 misc/ 中已冻结、不维护的历史技能当作当前推荐清单。
