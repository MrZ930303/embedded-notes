# 嵌入式技术笔记

使用 VitePress 1.6.4 稳定版构建的中文技术笔记站。依赖版本由 package-lock.json 锁定，适合部署到 GitHub Pages。

当前内容：九篇技术交互笔记（MCU 堆栈、Beads、Plane、Matt Pocock Skills、MCU 晶振与主频、Cortex-M CPU 核心寄存器、HardFault 栈回溯分析、EasyLogger、MCU OTA），另有学习地图与三路资料对照、GPIO、C 基础、构建与启动九章及各自速查，共十九份学习中心资料，以及一条 MCU 内存学习路线。首页按五个正式主题帮助你找到笔记，进入笔记后直接操作模型、阅读图解并展开完整正文。FreeRTOS 独立分类仍为规划中。

## 本地预览（Windows / macOS / Linux）

先安装官方 Node.js 24 LTS（https://nodejs.org/），建议使用 VS Code 编辑 Markdown。

1. 下载或克隆本仓库，在文件夹内打开终端。
2. 首次运行或依赖变更后，执行：

```powershell
npm ci
```

3. 启动开发预览：

```powershell
npm run docs:dev
```

打开终端显示的本地地址，默认子路径为 /embedded-notes/。按 Ctrl+C 停止。若 Windows PowerShell 提示无法加载 npm.ps1，可改用 npm.cmd ci / npm.cmd run docs:dev，或在命令提示符中执行；无需放宽系统执行策略。

4. 发布前运行检查：

```powershell
npm run check
```

5. 预览最终构建：

```powershell
npm run docs:preview
```

预览地址通常为 http://127.0.0.1:4173/embedded-notes/。不要双击构建后的 HTML 文件代替服务器预览。

## 主机 C 基础实验

网站的 npm run check 保持为可移植的 JavaScript、构建与链接门禁。另用已有 C11 编译器执行：

```powershell
npm run test:c-foundations -- --compiler cc
```

该脚本依次检查 bits.c、objects.c、fifo.c 的严格 C11、NDEBUG 测试运行与独立模块编译。它通过已有 mcu-build 的 validate → dry-run → build 路由；可用 --router 指定 build_router.py、--python 指定已有 Python，也支持 CC、MCU_BUILD_ROUTER、PYTHON 环境变量。缺少工具会明确失败，不自行安装。运行证据保存在本地 .scratch/c-foundations/code-evidence/result.json，含编译器身份、源/产物哈希、返回码和日志，不随公开阅读页发布。主机通过不代表目标固件、RTOS 或硬件验证。

## 构建与启动 C 实验

使用已有 GCC 兼容 C11 编译器及对应 GNU nm/objdump 直接运行可选门禁，不改变网站的可移植 npm 检查：

```powershell
node scripts/test-build-startup-c.mjs --compiler cc --router /path/to/build_router.py --python python
```

用 `--arm-compiler /path/to/arm-none-eabi-gcc` 启用已安装工具链的人工 ARM 产物与栈对象检查；宿主 `--nm` / `--objdump` 和 ARM `--arm-nm` / `--arm-readelf` / `--arm-objcopy` / `--arm-objdump` 可显式指定，默认从对应编译器推导同目录工具。也支持 CC、MCU_BUILD_ROUTER、PYTHON、ARM_CC。每次编译、预处理、汇编、链接与探针编译均经 mcu-build validate → dry-run → build。两类真实链接失败保留非零原始状态，绝不执行失败目的地。缺工具明确失败或记为未请求的可选范围，不自动安装。

证据保存到本地 `.scratch/build-startup/integration/c-evidence/run-*`，含源、工具、profile、返回状态、新鲜产物哈希和原始日志；可用 `--output` 指定其他工作区内私有目录。普通/NDEBUG/独立模块、描述符改动后的生成身份、阶段产物、人工 ARM ELF/bin/map 与编译器 `.su` 各自记录。ARM 产物不可启动且从未执行，栈报告是所选编译器/参数的逐函数结果，均不证明目标启动、全程序最坏栈、硬件或发布。06—09 范围见 curriculum/stage02-evidence.md。

## 新增笔记

1. 把 templates/note.md 复制到对应分类，例如 docs/c-memory/pointers.md。
2. 填写标题、description、适用范围、正文和参考链接。
3. 在分类 index.md 增加文章链接；在 docs/.vitepress/config.mts 的 sidebar 中增加导航。
4. 内容正式发布后，再更新首页 docs/.vitepress/theme/HomePage.vue 的数量和状态。
5. 运行 npm run check，然后在浏览器检查文章、搜索、移动端布局与交互。
6. 审阅改动后提交并推送；main 分支的推送会触发自动发布。

重要：docs/public/demos/ 下的二十八份 HTML 是主阅读体验的完整源码。scripts/interactive-note.mjs 注册源码和主路径；VitePress 的 transformHtml 构建钩子原样输出到 c-memory/heap-stack.html、tools/、mcu/ 与 debug/easylogger.html 等主阅读路径，开发服务提供相同 HTML。demos/ 路径保留兼容访问。docs/c-memory/heap-stack.md、docs/tools/、docs/mcu/、docs/learn/ 与 docs/debug/easylogger.md 只提供全文搜索输入，不作为公开文档式阅读页。修改正文、代码或限定条件后必须同步 HTML 与搜索输入；新增搜索标题还需为 HTML 中对应章节添加相同 id。构建测试会核对搜索结果锚点。

文章内链接到另一篇文章时，使用相对 Markdown 路径，如 ./heap-stack.md。主题组件中的站内链接使用 VitePress 的 withBase()。主交互笔记使用 data-no-router 和主题路由守卫进行浏览器原生导航，搜索及后退/前进也不会恢复成文档版。交互页中的搜索入口返回知识库并打开本地搜索。

本地搜索使用 VitePress 内置 MiniSearch，并用 Intl.Segmenter 做中文分词；构建时生成索引，不需要外部搜索账户。

## GitHub Pages 首次部署

1. 将源文件放入自己的 GitHub 仓库，默认分支为 main。
2. 在 Settings → Pages → Build and deployment 中，将 Source 设为 GitHub Actions。
3. 在 Actions 查看 Build and deploy notes；可用 Run workflow 手动启动。
4. 等待 build、deploy 两个任务都成功。网站地址以 Pages 和部署记录实际返回的地址为准。

工作流会先运行模型测试、公开信息扫描、构建及站内链接检查。拉取请求只构建检查，不发布。main 分支推送和手动运行会部署，发布依赖仓库 Pages 配置及权限。

### 修改仓库名、域名或基础路径

默认 base 为 /embedded-notes/。项目站通常是 /仓库名/，用户名主页和自定义域名通常是 /。

可在仓库 Settings → Secrets and variables → Actions → Variables 中设置 SITE_BASE，例如 /new-notes/ 或 /。本地用同名环境变量覆盖：

Windows PowerShell：

```powershell
$env:SITE_BASE="/"
npm run check
npm run docs:preview
Remove-Item Env:SITE_BASE
```

macOS / Linux：

```sh
SITE_BASE=/ npm run check
SITE_BASE=/ npm run docs:preview
```

不设置变量时，使用配置中的默认值。更改发布路径后重新构建并检查首页、文章、搜索和实验入口。

## 文件结构

- docs/index.md：首页入口
- docs/.vitepress/config.mts：导航、搜索、部署路径
- docs/.vitepress/theme/：首页组件与主题样式
- docs/c-memory/：分类索引，以及交互笔记的全文搜索输入
- docs/tools/：Beads、Plane、Matt Pocock Skills 分类与全文搜索输入
- docs/learn/：学习地图、GPIO、C 基础与构建启动九章、打印速查的分类与全文搜索输入
- docs/guide/：学习路线
- docs/mcu/：时钟、寄存器、HardFault 与 OTA 文章的分类和全文搜索输入
- docs/debug/：调试与实战分类、EasyLogger 全文搜索输入
- docs/freertos/：规划中分类
- docs/public/demos/：二十八份完整 HTML 阅读页源码，样式、模型与正文完整内嵌；demos/ 保留兼容访问
- docs/public/examples/：按键、三个 C 基础实验及构建启动四章的可下载 C11 源码、生成器、人工链接布局与复现说明
- scripts/test-c-foundations-c.mjs：独立主机 C 门禁，使用已有 mcu-build custom profile 路由
- scripts/test-build-startup-c.mjs：构建启动四章的可选统一 C/产物证据门禁，编译、链接和二进制转换均经同一路由
- scripts/interactive-note.mjs：主阅读 URL 的开发/生产 HTML 输出适配
- docs/.vitepress/theme/interactive-routing.mjs：点击、搜索与历史导航保护
- templates/note.md：新笔记模板，不会被发布
- scripts/：模型、源文件和构建检查
- .github/workflows/deploy.yml：自动构建与发布

## 公开内容与安全

GitHub 公开仓库与 Pages 网站任何人都能访问。上传前确认代码、日志、截图、路径和元数据适合公开，不包含私人聊天链接、个人联系方式、密钥或公司内部资料。自动扫描只提供基础提示，不能代替人工审阅。网站没有表单、账户或第三方统计脚本；主题偏好由 VitePress 在本地浏览器保存。

Beads、Plane 与 Skills 交互均为本地教学模拟，不调用 CLI、不连接真实账户、不运行技能，也不会创建或同步真实任务；数据仅保存在当前页面内存中。工具笔记注明资料核查日期，具体行为、版本与许可请再以官方资料及安装版本为准。

MCU 晶振与主频笔记以 STM32F407、3.3 V / Scale 1 为限定条件，按当前官方资料校验 PLL、总线及 Flash 的名义数值。交互不配置硬件，不验证起振、锁相时间、精度、温漂或 USB 电气合规；其他系列不可直接套用。

教学模型和示例代码不代表真实设备测量值。移植到工程前，应检查芯片内核、编译器、链接布局、RTOS 端口与版本；不要覆盖正在使用的栈。

EasyLogger 笔记的过滤、RTT、ISR 优先级和 UART 带宽均为页面内教学模拟。简短片段不构成完整板级工程；研究参考实现的主机 ASan/UBSan 烟测不覆盖页面新片段，也不代表 Keil、AC5/AC6、真实 FreeRTOS 并发或目标硬件验证。接入前固定官方源码版本并保留许可证。

MCU OTA 笔记比较六类典型更新路径。双槽不等于可回滚，外部暂存不等于保留旧版，双 Bank 不等于 A/B；单槽必须保留独立救援入口。容量计算和失败模拟只说明架构条件，不执行设备操作，也不代表硬件断电测试。

学习中心现有八阶段地图（含三路资料范围对照）、01—09 九章与各自速查，和九篇专题笔记合计二十八份完整阅读页，仍为五个正式主题。03—05 的主机 C 与 JavaScript 检查分开；单上下文 FIFO 不可共享给任务、ISR 或 DMA。03—05 已有基线78723d5与CI/Pages39058801087及父任务线上核验，06—09 构建与启动为本地候选。下一阶段 10—14 待建设，定时器在 10；32 单元与八阶段的完整状态见 curriculum/coverage.md。本地检查、审查、发布和硬件分别记录，不推定整个阶段或课程完成。按键电路与抖动时间轴是人工教学模型，5 ms 不是通用参数，也没有经过硬件验证。站点不保存个人作答或学习记录。

## 依赖与维护

- 只固定使用稳定版 VitePress 1.6.4，未采用 next / alpha。
- npm ci 按锁文件重现安装。升级依赖时单独审阅，重新运行全部检查。
- 部署权限仅授予 GitHub Actions 的临时令牌，无需在仓库内保存个人访问令牌。
- 公共参考优先使用 Arm、Keil、FreeRTOS 等官方来源。

### 已知开发工具链风险

截至 2026-10-13，全量 npm audit 对锁定的 VitePress 1.6.4 → Vite 5.4.21 / esbuild 0.21.5 依赖链报告 3 个受影响包（1 高、2 中）。npm audit --omit=dev 的结果为 0，但这不代表开发工具链没有风险。本站仅部署构建后的静态文件，不在 GitHub Pages 上运行开发服务器。

开发和预览脚本已固定绑定 127.0.0.1，并关闭跨域读取。不要增加 --host 0.0.0.0、开放端口或把开发服务器暴露到局域网/公网；关闭预览后再访问不可信网页，且不要把密钥、私人文件放入工程。此配置缩小暴露面，不等于修复底层漏洞。

主要公告：

- [GHSA-fx2h-pf6j-xcff](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff)：Windows 路径形式可绕过开发服务器文件拒绝规则；公告列出的条件包括网络暴露、允许目录中存在敏感文件以及相应 Windows / NTFS 特性。
- [GHSA-4w7w-66w2-5vf9](https://github.com/vitejs/vite/security/advisories/GHSA-4w7w-66w2-5vf9)：可预测路径下的敏感 .map 文件存在读取风险，涉及对网络开放的开发服务。
- [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3)：Windows 上 launch-editor 的 UNC 路径处理可能泄露 NTLMv2 哈希。若 NTLM 未禁用、相关编辑器中间件正在运行且访问了恶意网页，即使服务只绑定 127.0.0.1，恶意网页仍可能发起请求触发该问题；回环绑定或关闭跨域读取不能被视为修复。结束本地编辑后，立即在运行终端按 Ctrl+C 关闭开发服务器；不要让它在浏览其他网站时继续运行。
- [GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99)：esbuild 自带开发服务器的跨域读取风险；本站构建流程不使用它作为网站服务器。

等待兼容的稳定版升级；不使用 npm audit fix --force 盲目跨大版本替换。升级后重新运行构建、搜索、导航和交互测试。

## 授权状态

本仓库暂未选择开源许可证。公开可访问不等于已授予开源授权；转载和使用请遵循作者后续声明及各引用资料本身的条款。第三方依赖保留各自许可证。
