import { defineConfig } from 'vitepress'
import { readInteractiveNote, interactiveNoteDevPlugin, interactiveNotes } from '../../scripts/interactive-note.mjs'

// GitHub 项目站默认 /embedded-notes/；个人主页或自定义域名可设为 /。
const requestedBase = process.env.SITE_BASE || '/embedded-notes/'
const base = '/' + requestedBase.split('/').filter(Boolean).join('/') + (requestedBase === '/' ? '' : '/')

export default defineConfig({
  lang: 'zh-CN',
  title: '嵌入式技术笔记',
  description: '从 C 语言与内存到 MCU、FreeRTOS 和工程调试。把原理学清楚，把证据留在工程里。',
  base,
  cleanUrls: false,
  transformHtml(html, _id, context) {
    const note = interactiveNotes.find(note => context.page === note.path.replace(/\.html$/, '.md'))
    return note ? readInteractiveNote(note.path) : html
  },
  vite: {
    plugins: [interactiveNoteDevPlugin(base)],
    server: { host: '127.0.0.1', cors: false, allowedHosts: ['localhost', '127.0.0.1'] },
    preview: { host: '127.0.0.1', cors: false, allowedHosts: ['localhost', '127.0.0.1'] }
  },
  lastUpdated: false,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: base + 'favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#f6f7f2' }]
  ],
  themeConfig: {
    logo: '/favicon.svg',
    siteTitle: '嵌入式技术笔记',
    nav: [
      { text: '首页', link: '/' },
      { text: '交互笔记', items: [
        { text: 'MCU 堆栈原理与监测', link: '/c-memory/heap-stack.html' },
        { text: 'MCU 晶振与主频：从 8 MHz 到 168 MHz', link: '/mcu/crystal-pll-clock.html' },
        { text: 'Cortex-M CPU 核心寄存器', link: '/mcu/cortex-m-cpu-registers.html' },
        { text: 'HardFault 栈回溯分析', link: '/mcu/hardfault-stack-trace.html' },
        { text: 'Beads：任务依赖与就绪队列', link: '/tools/beads.html' },
        { text: 'Plane：项目协作与工作流', link: '/tools/plane.html' },
        { text: 'Matt Pocock Skills：AI 编程工作流', link: '/tools/matt-pocock-skills.html' }
      ] },
      { text: '学习路线', link: '/guide/memory-roadmap.html' },
      { text: '笔记分类', items: [
        { text: 'C 语言与内存', link: '/c-memory/' },
        { text: '工程工具与协作', link: '/tools/' },
        { text: 'MCU 基础与外设', link: '/mcu/' },
        { text: 'FreeRTOS · 规划中', link: '/freertos/' },
        { text: '调试与实战 · 规划中', link: '/debug/' }
      ]}
    ],
    sidebar: [
      { text: '从这里开始', items: [
        { text: 'MCU 内存学习路线', link: '/guide/memory-roadmap.html' }
      ]},
      { text: 'C 语言与内存', items: [
        { text: '分类概览', link: '/c-memory/' },
        { text: 'MCU 堆栈原理与监测', link: '/c-memory/heap-stack.html' }
      ]},
      { text: '工程工具与协作', items: [
        { text: '分类概览', link: '/tools/' },
        { text: 'Beads：任务依赖与就绪队列', link: '/tools/beads.html' },
        { text: 'Plane：项目协作与工作流', link: '/tools/plane.html' },
        { text: 'Matt Pocock Skills：AI 编程工作流', link: '/tools/matt-pocock-skills.html' }
      ]},
      { text: 'MCU 基础与外设', items: [
        { text: '分类概览', link: '/mcu/' },
        { text: 'MCU 晶振与主频', link: '/mcu/crystal-pll-clock.html' },
        { text: 'Cortex-M CPU 核心寄存器', link: '/mcu/cortex-m-cpu-registers.html' },
        { text: 'HardFault 栈回溯分析', link: '/mcu/hardfault-stack-trace.html' },
      ]},
      { text: '后续专题', collapsed: true, items: [
        { text: 'FreeRTOS · 规划中', link: '/freertos/' },
        { text: '调试与实战 · 规划中', link: '/debug/' }
      ]}
    ],
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换为浅色模式',
    darkModeSwitchTitle: '切换为深色模式',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
    externalLinkIcon: true,
    notFound: {
      title: '这页笔记还不存在',
      quote: '回到首页，继续探索已经整理好的内容。',
      linkLabel: '返回首页',
      linkText: '返回首页'
    },
    search: {
      provider: 'local',
      options: {
        miniSearch: {
          options: {
            tokenize(text) {
              // 浏览器和构建时使用相同中文分词，不把整句中文当成一个词。
              return Array.from(new Intl.Segmenter('zh-CN', { granularity: 'word' }).segment(text))
                .filter(part => part.isWordLike)
                .map(part => part.segment)
            }
          }
        },
        locales: {
          root: {
            translations: {
              button: { buttonText: '搜索笔记', buttonAriaLabel: '搜索笔记' },
              modal: {
                displayDetails: '显示详细内容',
                resetButtonTitle: '清空搜索',
                backButtonTitle: '关闭搜索',
                noResultsText: '没有找到相关笔记',
                footer: {
                  selectText: '选择', selectKeyAriaLabel: '回车',
                  navigateText: '切换', navigateUpKeyAriaLabel: '上箭头',
                  navigateDownKeyAriaLabel: '下箭头',
                  closeText: '关闭', closeKeyAriaLabel: '退出'
                }
              }
            }
          }
        }
      }
    },
    footer: {
      message: '理解原理 · 动手验证 · 留下证据',
      copyright: '个人技术笔记 · 示例请结合具体芯片与工程验证'
    }
  }
})

