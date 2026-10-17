<script setup>
import { withBase } from 'vitepress'
const notes = [
  { n: '01', category: 'C 语言与内存', title: 'MCU 堆栈原理与监测', desc: '观察压栈时 SP 的变化，用分配与释放理解碎片、泄漏，再回到 Keil 与 FreeRTOS 工程中验证。', path: '/c-memory/heap-stack.html', detail: 'SP 实验 · 堆内存实验 · 工程检查清单' },
  { n: '02', category: 'MCU 基础与外设', title: 'MCU 晶振与主频：从 8 MHz 到 168 MHz', desc: '调整 PLL 与总线分频，追踪每一条时钟的来源，检查 Flash、USB 和外设的约束。', path: '/mcu/crystal-pll-clock.html', detail: 'STM32F407 · 可调时钟树 · 配置校验' },
  { n: '03', category: '工程工具与协作', title: 'Beads：任务依赖与就绪队列', desc: '沿着依赖图认领、完成前置工作，观察 ready 队列的变化，理解任务记录与同步的边界。', path: '/tools/beads.html', detail: '依赖图实验 · CLI 工作流 · Dolt' },
  { n: '04', category: '工程工具与协作', title: 'Plane：项目协作与工作流', desc: '移动工作项，用同一组样例区分状态、项目、周期与模块，建立一致的进度口径。', path: '/tools/plane.html', detail: '交互看板 · 周期与模块 · 部署与许可' },
  { n: '05', category: '工程工具与协作', title: 'Matt Pocock Skills：AI 编程工作流', desc: '按当前卡点选择技能，沿着需求、规格、实现和审查前进，分清指导、执行与授权。', path: '/tools/matt-pocock-skills.html', detail: '技能选择器 · 工作流图解 · 权限边界' },
  { n: '06', category: 'MCU 基础与外设', title: 'Cortex-M CPU 核心寄存器', desc: '点选 R0–PC、xPSR、屏蔽寄存器与 CONTROL，理解调用约定、异常和栈选择。', path: '/mcu/cortex-m-cpu-registers.html', detail: 'Armv7-M · Cortex-M3/M4 · 交互示意模型' },
  { n: '07', category: 'MCU 基础与外设', title: 'HardFault 栈回溯分析', desc: '从 EXC_RETURN 选择异常入口栈，核对硬件帧偏移、stacked PC 与实际固件证据。', path: '/mcu/hardfault-stack-trace.html', detail: 'Armv7-M · 基本帧与可选 M4F 扩展帧' },
  { n: '08', category: '调试与实战', title: 'EasyLogger：从第一行日志到可维护的固件诊断', desc: '分清格式化、日志策略与传输，动手比较过滤、RTT 缓冲、ISR 优先级和 UART 带宽。', path: '/debug/easylogger.html', detail: 'STM32 / GD32 Cortex-M · FreeRTOS · J-Link · 四个教学实验' },
  { n: '09', category: 'MCU 基础与外设', title: 'MCU OTA：从分区到回滚', desc: '逐步观察六类更新方案的分区与断电逻辑，区分安装恢复、试运行回滚和独立救援。', path: '/mcu/mcu-ota.html', detail: '六类架构 · 断电与失败模拟 · 容量估算' },
  { n: '10', category: '学习中心', title: 'MCU 工程学习地图', desc: '沿八阶段完善可升级的数据采集终端，按证据使用三路资料，找到现有笔记的学习位置。', path: '/learn/engineering-map.html', detail: '八阶段主线 · 三路资料对照 · 验收与建设状态' },
  { n: '11', category: '学习中心', title: '按下按钮，为什么读到 0？', desc: '先预测上拉与按键电路，再用人工时间轴理解抖动、稳定过滤与一次可靠按下。', path: '/learn/gpio-button.html', detail: '原创 GPIO 小课 · 先预测再解释 · 人工抖动示例' },
  { n: '12', category: '学习中心', title: 'GPIO 按键：可打印速查', desc: '回看电平、悬空和连续稳定过滤规则，用回忆与迁移题检验理解。', path: '/learn/gpio-button-reference.html', detail: '电路状态 · 11 ms 固定样例 · 上板验证清单' },
  { n: '13', category: '学习中心', title: 'GPIO 输出与 LED 驱动', desc: '先预测推挽与开漏的电流路径，再检查限流和同时电流预算，把一次按下映射为 LED 期望状态。', path: '/learn/gpio-led.html', detail: '16 组路径 · 条件预算 · 故障诊断与十题迁移' },
  { n: '14', category: '学习中心', title: 'GPIO 输出与 LED 驱动：可打印速查', desc: '压缩回看 LED 方向、输出模式、预算公式、特殊引脚脚注与外接驱动条件。', path: '/learn/gpio-led-reference.html', detail: '路径规则 · 最坏条件核算 · 原厂手册边界' },
  { n: '15', category: '学习中心', title: '位运算与寄存器读写', desc: '从位图和掩码预测 RW、RO、W1C 的写入结果，解释两条错误读改写时间线。', path: '/learn/c-bits-registers.html', detail: '整数提升 · 两类 RMW 失败 · 可复现 C11 实验' },
  { n: '16', category: '学习中心', title: '位运算与寄存器读写：可打印速查', desc: '回看宽度、移位、访问属性与拒绝合同，按历史手册条件核对寄存器案例。', path: '/learn/c-bits-registers-reference.html', detail: '掩码规则 · 写出数据与新状态 · 手册范围' },
  { n: '17', category: '学习中心', title: 'C 对象、指针与边界', desc: '在虚构内存格上核对对象、长度与生命周期，用检查后的字节拼接解码小端数值。', path: '/learn/c-objects-bounds.html', detail: 'one-past · read_le16 · 失败保留输出' },
  { n: '18', category: '学习中心', title: 'C 对象、指针与边界：可打印速查', desc: '用对象审计、字节序和整数类别检查表，保留真实存储与调用者前提。', path: '/learn/c-objects-bounds-reference.html', detail: '长度与生命周期 · 零长度 · 整数转换边界' },
  { n: '19', category: '学习中心', title: '单执行上下文的有界 FIFO', desc: '先预测四字节队列的状态和顺序，再重放装满、拒绝、回绕与排空。', path: '/learn/bounded-fifo.html', detail: '固定容量 · 值所有权 · 单上下文 C11 模块' },
  { n: '20', category: '学习中心', title: '有界 FIFO：可打印速查', desc: '压缩回看 head、tail、count、不变量和失败保持规则，明确并发使用限制。', path: '/learn/bounded-fifo-reference.html', detail: '14 步轨迹 · 空满边界 · 复现与条件' },
]
const categories = [
  { title: '学习中心', path: '/learn/', count: '11 篇' },
  { title: 'C 语言与内存', path: '/c-memory/', count: '1 篇' },
  { title: 'MCU 基础与外设', path: '/mcu/', count: '4 篇' },
  { title: '工程工具与协作', path: '/tools/', count: '3 篇' },
  { title: '调试与实战', path: '/debug/', count: '1 篇' }
]
</script>

<template>
  <div class="notebook-home">
    <section class="intro" aria-labelledby="notebook-title">
      <p class="eyebrow">个人技术笔记 / 交互学习</p>
      <h1 id="notebook-title">嵌入式技术笔记</h1>
      <p class="intro-description">从内存到时钟，从原理到工程。<br>动手操作模型，再读懂背后的原理、代码与适用边界。</p>
      <div class="intro-actions">
        <a class="notebook-button primary" href="#notes">浏览 20 篇笔记 <span aria-hidden="true">↓</span></a>
        <a class="intro-route" :href="withBase('/learn/')">从工程学习地图开始 <svg class="ui-arrow" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></a>
        <a class="intro-route" :href="withBase('/guide/memory-roadmap.html')">从 MCU 内存学习路线开始 <svg class="ui-arrow" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></a>
      </div>
    </section>

    <section class="home-section" aria-labelledby="notes">
      <div class="home-section-heading"><h2 id="notes">交互笔记</h2><span>20 篇 · 5 个主题</span></div>
      <div class="note-list">
        <article v-for="note in notes" :key="note.path" class="note-entry">
          <span class="note-number" aria-hidden="true">{{ note.n }}</span>
          <div class="note-copy">
            <p class="note-meta">{{ note.category }}</p>
            <h3><a :href="withBase(note.path)" data-no-router>{{ note.title }}</a></h3>
            <p class="note-description">{{ note.desc }}</p>
            <p class="note-detail">{{ note.detail }}</p>
          </div>
          <a class="note-arrow" :href="withBase(note.path)" data-no-router :aria-label="'阅读 ' + note.title"><svg class="ui-arrow" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></a>
        </article>
      </div>
    </section>

    <section class="home-section categories-section" aria-labelledby="categories">
      <div class="home-section-heading"><h2 id="categories">按主题查找</h2></div>
      <div class="category-list">
        <a v-for="category in categories" :key="category.path" :href="withBase(category.path)"><strong>{{ category.title }}</strong><span>{{ category.count }} <svg class="ui-arrow" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></span></a>
      </div>
      <p class="planned-topics">后续专题：<a :href="withBase('/freertos/')">FreeRTOS</a><span>（规划中）</span></p>
    </section>
    <aside class="reading-note"><strong>先观察，再验证。</strong><p>交互均为本地教学模型，不连接设备或真实账户。实际工程请结合芯片、工具版本和文中的官方资料核对。</p></aside>
  </div>
</template>
