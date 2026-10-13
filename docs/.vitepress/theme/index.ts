import DefaultTheme from 'vitepress/theme'
import { inBrowser } from 'vitepress'
import HomePage from './HomePage.vue'
import Layout from './Layout.vue'
import { createInteractiveNoteGuard } from './interactive-routing.mjs'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app, router, siteData }) {
    app.component('HomePage', HomePage)
    if (inBrowser) {
      const guard = createInteractiveNoteGuard(siteData.value.base, window.location)
      router.onBeforeRouteChange = guard
      router.onBeforePageLoad = guard
    }
  }
}

