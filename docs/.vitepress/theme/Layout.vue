<script setup>
import DefaultTheme from 'vitepress/theme'
import { onMounted, nextTick } from 'vue'

onMounted(async () => {
  if (new URLSearchParams(window.location.search).get('search') !== '1') return
  await nextTick()
  // Use the default theme's own local-search shortcut after the nav is mounted.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
})
</script>

<template>
  <DefaultTheme.Layout />
</template>
