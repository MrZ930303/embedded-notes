# 嵌入式技术笔记

使用 VitePress 1.6.4 稳定版构建的中文技术笔记站。依赖版本由 package-lock.json 锁定，适合部署到 GitHub Pages。

当前内容：一篇完整的 MCU 堆栈原理与监测笔记、一条 MCU 内存学习路线，以及自包含的堆栈交互实验。其他分类明确标为规划中。

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

## 新增笔记

1. 把 templates/note.md 复制到对应分类，例如 docs/c-memory/pointers.md。
2. 填写标题、description、适用范围、正文和参考链接。
3. 在分类 index.md 增加文章链接；在 docs/.vitepress/config.mts 的 sidebar 中增加导航。
4. 内容正式发布后，再更新首页 docs/.vitepress/theme/HomePage.vue 的数量和状态。
5. 运行 npm run check，然后在浏览器检查文章、搜索、移动端布局与交互。
6. 审阅改动后提交并推送；main 分支的推送会触发自动发布。

重要：docs/c-memory/heap-stack.md 与 docs/public/demos/stack-heap.html 中的完整笔记是同一内容的两份呈现。修改概念、代码或限定条件后，必须同步更新两处，并分别预览；不能只改文章而让实验里的正文过时。

文章内链接到另一篇文章时，使用相对 Markdown 路径，如 ./heap-stack.md。主题组件中的站内链接使用 VitePress 的 withBase()。指向独立 HTML 实验时，加 data-no-router，让浏览器正常打开实验。

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
- docs/c-memory/：C 语言与内存笔记
- docs/guide/：学习路线
- docs/mcu/、docs/freertos/、docs/debug/：后续分类
- docs/public/demos/stack-heap.html：独立交互实验，正文完整内嵌
- templates/note.md：新笔记模板，不会被发布
- scripts/：模型、源文件和构建检查
- .github/workflows/deploy.yml：自动构建与发布

## 公开内容与安全

GitHub 公开仓库与 Pages 网站任何人都能访问。上传前确认代码、日志、截图、路径和元数据适合公开，不包含私人聊天链接、个人联系方式、密钥或公司内部资料。自动扫描只提供基础提示，不能代替人工审阅。网站没有表单、账户或第三方统计脚本；主题偏好由 VitePress 在本地浏览器保存。

教学模型和示例代码不代表真实设备测量值。移植到工程前，应检查芯片内核、编译器、链接布局、RTOS 端口与版本；不要覆盖正在使用的栈。

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

