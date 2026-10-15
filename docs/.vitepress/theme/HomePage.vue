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
]
const categories = [
  { title: 'C 语言与内存', path: '/c-memory/', count: '1 篇' },
  { title: 'MCU 基础与外设', path: '/mcu/', count: '3 篇' },
  { title: '工程工具与协作', path: '/tools/', count: '3 篇' }
]
</script>

<template>
  <div class="notebook-home">
    <section class="intro" aria-labelledby="notebook-title">
      <p class="eyebrow">个人技术笔记 / 交互学习</p>
      <h1 id="notebook-title">嵌入式技术笔记</h1>
      <p class="intro-description">从内存到时钟，从原理到工程。<br>动手操作模型，再读懂背后的原理、代码与适用边界。</p>
      <div class="intro-actions">
        <a class="notebook-button primary" href="#notes">浏览 7 篇笔记 <span aria-hidden="true">↓</span></a>
        <a class="intro-route" :href="withBase('/guide/memory-roadmap.html')">从 MCU 内存学习路线开始 <svg class="ui-arrow" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></a>
      </div>
    </section>

    <section class="home-section" aria-labelledby="notes">
      <div class="home-section-heading"><h2 id="notes">交互笔记</h2><span>7 篇 · 3 个主题</span></div>
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
      <p class="planned-topics">后续专题：<a :href="withBase('/freertos/')">FreeRTOS</a>、<a :href="withBase('/debug/')">调试与实战</a><span>（规划中）</span></p>
    </section>
    <aside class="reading-note"><strong>先观察，再验证。</strong><p>交互均为本地教学模型，不连接设备或真实账户。实际工程请结合芯片、工具版本和文中的官方资料核对。</p></aside>
  </div>
</template>
