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
      { text: '学习中心', link: '/learn/' },
      { text: '交互笔记', items: [
        { text: 'MCU 工程学习地图', link: '/learn/engineering-map.html' },
        { text: '按下按钮，为什么读到 0？', link: '/learn/gpio-button.html' },
        { text: 'GPIO 按键：可打印速查', link: '/learn/gpio-button-reference.html' },
        { text: 'GPIO 输出与 LED 驱动', link: '/learn/gpio-led.html' },
        { text: 'GPIO 输出与 LED 驱动：可打印速查', link: '/learn/gpio-led-reference.html' },
        { text: '位运算与寄存器读写', link: '/learn/c-bits-registers.html' },
        { text: '位运算与寄存器读写：可打印速查', link: '/learn/c-bits-registers-reference.html' },
        { text: 'C 对象、指针与边界', link: '/learn/c-objects-bounds.html' },
        { text: 'C 对象、指针与边界：可打印速查', link: '/learn/c-objects-bounds-reference.html' },
        { text: '单执行上下文的有界 FIFO', link: '/learn/bounded-fifo.html' },
        { text: '有界 FIFO：可打印速查', link: '/learn/bounded-fifo-reference.html' },
        { text: '预处理、编译、链接与构建身份', link: '/learn/build-link-identity.html' },
        { text: '预处理、编译、链接与构建身份：可打印速查', link: '/learn/build-link-identity-reference.html' },
        { text: '从复位向量到 C 运行环境', link: '/learn/reset-runtime.html' },
        { text: '从复位向量到 C 运行环境：可打印速查', link: '/learn/reset-runtime-reference.html' },
        { text: '静态内存、堆与调用栈预算', link: '/learn/memory-budget.html' },
        { text: '静态内存、堆与调用栈预算：可打印速查', link: '/learn/memory-budget-reference.html' },
        { text: '时钟树、切换与时间基准', link: '/learn/clock-timebase.html' },
        { text: '时钟树、切换与时间基准：可打印速查', link: '/learn/clock-timebase-reference.html' },
        { text: '定时器、PWM 与非阻塞期限', link: '/learn/timer-pwm.html' },
        { text: '定时器、PWM 与非阻塞期限：可打印速查', link: '/learn/timer-pwm-reference.html' },
        { text: 'UART 字节到有界命令', link: '/learn/uart-framing.html' },
        { text: 'UART 字节到有界命令：可打印速查', link: '/learn/uart-framing-reference.html' },
        { text: 'I2C / SPI 事务与失败', link: '/learn/bus-transactions.html' },
        { text: 'I2C / SPI 事务与失败：可打印速查', link: '/learn/bus-transactions-reference.html' },
        { text: 'ADC参考、采样与输入条件', link: '/learn/adc-sampling.html' },
        { text: 'ADC参考、采样与输入条件：可打印速查', link: '/learn/adc-sampling-reference.html' },
        { text: '驱动错误、超时与恢复', link: '/learn/driver-recovery.html' },
        { text: '驱动错误、超时与恢复：可打印速查', link: '/learn/driver-recovery-reference.html' },
        { text: 'MCU 堆栈原理与监测', link: '/c-memory/heap-stack.html' },
        { text: 'MCU 晶振与主频：从 8 MHz 到 168 MHz', link: '/mcu/crystal-pll-clock.html' },
        { text: 'Cortex-M CPU 核心寄存器', link: '/mcu/cortex-m-cpu-registers.html' },
        { text: 'HardFault 栈回溯分析', link: '/mcu/hardfault-stack-trace.html' },
        { text: 'MCU OTA：从分区到回滚', link: '/mcu/mcu-ota.html' },
        { text: 'EasyLogger：从第一行日志到可维护的固件诊断', link: '/debug/easylogger.html' },
        { text: 'Beads：任务依赖与就绪队列', link: '/tools/beads.html' },
        { text: 'Plane：项目协作与工作流', link: '/tools/plane.html' },
        { text: 'Matt Pocock Skills：AI 编程工作流', link: '/tools/matt-pocock-skills.html' }
      ] },
      { text: '学习路线', link: '/guide/memory-roadmap.html' },
      { text: '笔记分类', items: [
        { text: '学习中心', link: '/learn/' },
        { text: 'C 语言与内存', link: '/c-memory/' },
        { text: '工程工具与协作', link: '/tools/' },
        { text: 'MCU 基础与外设', link: '/mcu/' },
        { text: 'FreeRTOS · 规划中', link: '/freertos/' },
        { text: '调试与实战', link: '/debug/' }
      ]}
    ],
    sidebar: [
      { text: '学习中心', items: [
        { text: '分类概览', link: '/learn/' },
        { text: 'MCU 工程学习地图', link: '/learn/engineering-map.html' },
        { text: '按下按钮，为什么读到 0？', link: '/learn/gpio-button.html' },
        { text: 'GPIO 按键：可打印速查', link: '/learn/gpio-button-reference.html' },
        { text: 'GPIO 输出与 LED 驱动', link: '/learn/gpio-led.html' },
        { text: 'GPIO 输出与 LED 驱动：可打印速查', link: '/learn/gpio-led-reference.html' },
        { text: '位运算与寄存器读写', link: '/learn/c-bits-registers.html' },
        { text: '位运算与寄存器读写：可打印速查', link: '/learn/c-bits-registers-reference.html' },
        { text: 'C 对象、指针与边界', link: '/learn/c-objects-bounds.html' },
        { text: 'C 对象、指针与边界：可打印速查', link: '/learn/c-objects-bounds-reference.html' },
        { text: '单执行上下文的有界 FIFO', link: '/learn/bounded-fifo.html' },
        { text: '有界 FIFO：可打印速查', link: '/learn/bounded-fifo-reference.html' },
        { text: '预处理、编译、链接与构建身份', link: '/learn/build-link-identity.html' },
        { text: '预处理、编译、链接与构建身份：可打印速查', link: '/learn/build-link-identity-reference.html' },
        { text: '从复位向量到 C 运行环境', link: '/learn/reset-runtime.html' },
        { text: '从复位向量到 C 运行环境：可打印速查', link: '/learn/reset-runtime-reference.html' },
        { text: '静态内存、堆与调用栈预算', link: '/learn/memory-budget.html' },
        { text: '静态内存、堆与调用栈预算：可打印速查', link: '/learn/memory-budget-reference.html' },
        { text: '时钟树、切换与时间基准', link: '/learn/clock-timebase.html' },
        { text: '时钟树、切换与时间基准：可打印速查', link: '/learn/clock-timebase-reference.html' },
        { text: '定时器、PWM 与非阻塞期限', link: '/learn/timer-pwm.html' },
        { text: '定时器、PWM 与非阻塞期限：可打印速查', link: '/learn/timer-pwm-reference.html' },
        { text: 'UART 字节到有界命令', link: '/learn/uart-framing.html' },
        { text: 'UART 字节到有界命令：可打印速查', link: '/learn/uart-framing-reference.html' },
        { text: 'I2C / SPI 事务与失败', link: '/learn/bus-transactions.html' },
        { text: 'I2C / SPI 事务与失败：可打印速查', link: '/learn/bus-transactions-reference.html' },
        { text: 'ADC参考、采样与输入条件', link: '/learn/adc-sampling.html' },
        { text: 'ADC参考、采样与输入条件：可打印速查', link: '/learn/adc-sampling-reference.html' },
        { text: '驱动错误、超时与恢复', link: '/learn/driver-recovery.html' },
        { text: '驱动错误、超时与恢复：可打印速查', link: '/learn/driver-recovery-reference.html' },
      ]},
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
        { text: 'MCU OTA：从分区到回滚', link: '/mcu/mcu-ota.html' },
      ]},
      { text: '调试与实战', items: [
        { text: '分类总览', link: '/debug/' },
        { text: 'EasyLogger 固件日志', link: '/debug/easylogger.html' }
      ]},
      { text: '后续专题', collapsed: true, items: [
        { text: 'FreeRTOS · 规划中', link: '/freertos/' },
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
