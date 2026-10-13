<script setup>
import { withBase } from 'vitepress'
const categories = [
  { n: '01', title: 'C 语言与内存', desc: '从指针、生命周期到堆栈，建立清晰的内存模型。', path: '/c-memory/', label: '1 篇完整笔记', ready: true },
  { n: '02', title: 'MCU 外设', desc: 'GPIO、定时器、通信与 DMA，沿着数据流理解硬件。', path: '/mcu/', label: '规划中', ready: false },
  { n: '03', title: 'FreeRTOS', desc: '任务、调度与同步，从能运行走向可分析。', path: '/freertos/', label: '规划中', ready: false },
  { n: '04', title: '调试与实战', desc: '从现象找到证据，记录问题、实验和排查路径。', path: '/debug/', label: '规划中', ready: false }
]
</script>

<template>
  <div class="notebook-home">
    <section class="intro">
      <div class="intro-copy">
        <p class="eyebrow"><span></span> EMBEDDED / FIELD NOTES</p>
        <h1>嵌入式技术笔记</h1>
        <p class="intro-lead">把原理学清楚，<br><em>把证据留在工程里。</em></p>
        <p class="intro-description">从 C 语言与内存开始，逐步理解 MCU、实时系统与工程调试。一边学习，一边用代码和实验验证。</p>
        <div class="intro-actions">
          <a class="notebook-button primary" :href="withBase('/guide/memory-roadmap.html')">开始学习 <span aria-hidden="true">↗</span></a>
          <a class="notebook-button secondary" :href="withBase('/c-memory/heap-stack.html')">阅读第一篇笔记</a>
        </div>
      </div>
      <div class="memory-card" role="img" aria-label="Cortex-M 栈示意：栈从高地址向低地址增长，SP 指向当前栈顶。">
        <div class="memory-card-top"><span>MEMORY / 001</span><span class="board-led"></span></div>
        <div class="memory-diagram">
          <div class="address-label"><span>0x20001000</span><span>高地址</span></div>
          <div class="diagram-stack"><span>STACK</span><strong>函数现场</strong><i>栈向低地址增长 ↓</i></div>
          <div class="diagram-pointer"><span>SP →</span><div></div><span>当前栈顶</span></div>
          <div class="diagram-free"><span>预留空间</span><span>························</span></div>
          <div class="address-label bottom"><span>0x20000FE0</span><span>低地址</span></div>
        </div>
        <div class="memory-card-bottom"><span class="small-square"></span> 先看边界，再谈余量。<small>示意 · 非设备实测</small></div>
      </div>
    </section>

    <div class="notebook-strip"><span>理解原理</span><b aria-hidden="true">/</b><span>动手验证</span><b aria-hidden="true">/</b><span>记录边界</span><span class="strip-note">从一个问题，走到一个可复现的答案。</span></div>

    <section class="home-section" aria-labelledby="latest-heading">
      <div class="home-section-heading"><div><p class="eyebrow">LATEST NOTE</p><h2 id="latest-heading">从内存开始</h2></div><a :href="withBase('/c-memory/')">全部笔记 <span aria-hidden="true">→</span></a></div>
      <article class="featured-note">
        <div class="note-number" aria-hidden="true">01<span>STACK<br>&amp; HEAP</span></div>
        <div class="featured-copy"><p class="note-meta">C 语言与内存 <span>·</span> Cortex-M / Keil / FreeRTOS</p><h3><a :href="withBase('/c-memory/heap-stack.html')">MCU 堆栈原理与监测</a></h3><p>分清栈顶与地址方向，读懂指针与动态内存，再把栈水位、堆统计和异常现场接进工程。</p><div class="note-tags"><span>C 代码示例</span><span>工程检查清单</span><span>交互演示</span></div></div>
        <a class="note-arrow" :href="withBase('/c-memory/heap-stack.html')" aria-label="阅读 MCU 堆栈原理与监测">↗</a>
      </article>
      <a class="lab-link" :href="withBase('/demos/stack-heap.html')" data-no-router><span class="lab-icon" aria-hidden="true">⌘</span><div><strong>动手实验：把 MCU 堆栈看明白</strong><span>点几次压栈、分配与释放，观察 SP、碎片和泄漏如何变化。</span></div><span aria-hidden="true">↗</span></a>
    </section>

    <section class="home-section categories-section" aria-labelledby="categories-heading">
      <div class="home-section-heading"><div><p class="eyebrow">NOTEBOOK INDEX</p><h2 id="categories-heading">按主题慢慢积累</h2></div><p>先写透一篇，再扩展一类。</p></div>
      <div class="category-grid"><a v-for="category in categories" :key="category.n" class="category-card" :href="withBase(category.path)"><div class="category-top"><span>{{ category.n }}</span><span class="category-status" :class="{ ready: category.ready }">{{ category.label }}</span></div><h3>{{ category.title }}</h3><p>{{ category.desc }}</p><span class="category-more">{{ category.ready ? '查看笔记' : '查看专题计划' }} <span aria-hidden="true">→</span></span></a></div>
    </section>
    <section class="route-banner"><div><p class="eyebrow">LEARNING PATH</p><h2>不知道从哪里开始？</h2><p>沿着「对象与地址 → 链接布局 → 栈 → 堆 → RTOS → 压力测试」，搭建自己的内存知识地图。</p></div><a class="notebook-button secondary" :href="withBase('/guide/memory-roadmap.html')">查看 MCU 内存学习路线 <span aria-hidden="true">→</span></a></section>
  </div>
</template>

