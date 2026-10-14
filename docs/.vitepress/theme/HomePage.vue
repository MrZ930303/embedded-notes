<script setup>
import { withBase } from 'vitepress'
const categories = [
  { n: '01', title: 'C 语言与内存', desc: '从指针、生命周期到堆栈，建立清晰的内存模型。', path: '/c-memory/', label: '1 篇交互笔记', ready: true },
  { n: '02', title: '工程工具与协作', desc: '任务依赖、工作流和项目边界，让执行与协作都有据可查。', path: '/tools/', label: '3 篇交互笔记', ready: true },
  { n: '03', title: 'MCU 外设', desc: 'GPIO、定时器、通信与 DMA，沿着数据流理解硬件。', path: '/mcu/', label: '规划中', ready: false },
  { n: '04', title: 'FreeRTOS', desc: '任务、调度与同步，从能运行走向可分析。', path: '/freertos/', label: '规划中', ready: false },
  { n: '05', title: '调试与实战', desc: '从现象找到证据，记录问题、实验和排查路径。', path: '/debug/', label: '规划中', ready: false }
]
</script>

<template>
  <div class="notebook-home">
    <section class="intro">
      <div class="intro-copy">
        <p class="eyebrow"><span></span> EMBEDDED / FIELD NOTES</p>
        <h1>嵌入式技术笔记</h1>
        <p class="intro-lead">把原理学清楚，<br><em>把证据留在工程里。</em></p>
        <p class="intro-description">以可操作的 HTML 笔记为主：看图、点击、观察变化，再展开完整原理和代码。从 C 语言与内存，逐步理解 MCU、实时系统与工程协作。</p>
        <div class="intro-actions">
          <a class="notebook-button primary" :href="withBase('/c-memory/heap-stack.html')" data-no-router>打开交互笔记 <span aria-hidden="true">↗</span></a>
          <a class="notebook-button secondary" :href="withBase('/guide/memory-roadmap.html')">查看学习路线</a>
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
        <div class="featured-copy"><p class="note-meta">C 语言与内存 <span>·</span> Cortex-M / Keil / FreeRTOS</p><h3><a :href="withBase('/c-memory/heap-stack.html')" data-no-router>MCU 堆栈原理与监测</a></h3><p>点一下压栈，观察 SP；逐步分配与释放，理解碎片和泄漏。完整原理、代码与工程清单，就在同一篇交互笔记里。</p><div class="note-tags"><span>交互式 HTML</span><span>完整原理与代码</span><span>工程检查清单</span></div></div>
        <a class="note-arrow" :href="withBase('/c-memory/heap-stack.html')" data-no-router aria-label="阅读 MCU 堆栈原理与监测">↗</a>
      </article>
    </section>

    <section class="home-section" aria-labelledby="tools-heading">
      <div class="home-section-heading"><div><p class="eyebrow">NEW / ENGINEERING TOOLS</p><h2 id="tools-heading">把工作组织起来</h2></div><a :href="withBase('/tools/')">工程工具与协作 <span aria-hidden="true">→</span></a></div>
      <article class="featured-note">
        <div class="note-number" aria-hidden="true">02<span>BEADS<br>DEPENDENCIES</span></div>
        <div class="featured-copy"><p class="note-meta">工程工具与协作 <span>·</span> AI Agent / CLI</p><h3><a :href="withBase('/tools/beads.html')" data-no-router>Beads：任务依赖与就绪队列</a></h3><p>沿着依赖图选择任务，领取并完成前置工作，观察 ready 队列如何变化。把「下一步做什么」从聊天记录变成可查询的状态。</p><div class="note-tags"><span>依赖图实验</span><span>CLI 工作流</span><span>存储与同步边界</span></div></div>
        <a class="note-arrow" :href="withBase('/tools/beads.html')" data-no-router aria-label="阅读 Beads：任务依赖与就绪队列">↗</a>
      </article>
      <article class="featured-note tools-next">
        <div class="note-number" aria-hidden="true">03<span>PLANE<br>WORKFLOW</span></div>
        <div class="featured-copy"><p class="note-meta">工程工具与协作 <span>·</span> 看板 / 项目管理</p><h3><a :href="withBase('/tools/plane.html')" data-no-router>Plane：项目协作与工作流</a></h3><p>移动工作项，区分状态、项目、周期与模块。用同一组样例理解团队看板的进度口径和范围边界。</p><div class="note-tags"><span>交互工作流看板</span><span>周期与模块</span><span>部署与许可</span></div></div>
        <a class="note-arrow" :href="withBase('/tools/plane.html')" data-no-router aria-label="阅读 Plane：项目协作与工作流">↗</a>
      </article>
      <article class="featured-note tools-next">
        <div class="note-number" aria-hidden="true">04<span>MATT POCOCK<br>SKILLS</span></div>
        <div class="featured-copy"><p class="note-meta">工程工具与协作 <span>·</span> AI Agent / 工程工作流</p><h3><a :href="withBase('/tools/matt-pocock-skills.html')" data-no-router>Matt Pocock Skills：AI 编程工作流</a></h3><p>从当前卡点选择一张工作卡，沿着需求、规格、实现和审查前进。看懂技能能指导什么，以及哪些动作仍需明确授权。</p><div class="note-tags"><span>交互技能选择器</span><span>工作流图解</span><span>执行与权限边界</span></div></div>
        <a class="note-arrow" :href="withBase('/tools/matt-pocock-skills.html')" data-no-router aria-label="阅读 Matt Pocock Skills：AI 编程工作流">↗</a>
      </article>
    </section>

    <section class="home-section categories-section" aria-labelledby="categories-heading">
      <div class="home-section-heading"><div><p class="eyebrow">NOTEBOOK INDEX</p><h2 id="categories-heading">按主题慢慢积累</h2></div><p>先写透一篇，再扩展一类。</p></div>
      <div class="category-grid"><a v-for="category in categories" :key="category.n" class="category-card" :href="withBase(category.path)"><div class="category-top"><span>{{ category.n }}</span><span class="category-status" :class="{ ready: category.ready }">{{ category.label }}</span></div><h3>{{ category.title }}</h3><p>{{ category.desc }}</p><span class="category-more">{{ category.ready ? '查看笔记' : '查看专题计划' }} <span aria-hidden="true">→</span></span></a></div>
    </section>
    <section class="route-banner"><div><p class="eyebrow">LEARNING PATH</p><h2>不知道从哪里开始？</h2><p>沿着「对象与地址 → 链接布局 → 栈 → 堆 → RTOS → 压力测试」，搭建自己的内存知识地图。</p></div><a class="notebook-button secondary" :href="withBase('/guide/memory-roadmap.html')">查看 MCU 内存学习路线 <span aria-hidden="true">→</span></a></section>
  </div>
</template>

