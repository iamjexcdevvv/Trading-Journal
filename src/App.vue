<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import NavigationSidebar from './components/NavigationSidebar.vue'
import StatsBar from './components/StatsBar.vue'
import { Menu } from 'lucide-vue-next'
import { useTrades } from './composables/useTrades.js'

const { stats } = useTrades()
const route = useRoute()

const showStatsBar = computed(() => route.path === '/trade-logging')
const isMobileSidebarOpen = ref(false)

const toggleMobileSidebar = () => {
  isMobileSidebarOpen.value = !isMobileSidebarOpen.value
}

const closeMobileSidebar = () => {
  isMobileSidebarOpen.value = false
}
</script>

<template>
  <div class="min-h-screen bg-background text-text-main flex flex-col">
    <!-- ===== TOP HEADER ===== -->
    <header
      class="h-16 border-b border-border flex items-center justify-between px-6 shrink-0"
      data-testid="app-header"
    >
      <div class="flex items-center gap-3">
        <!-- Hamburger Menu Button (Mobile) -->
        <button
          @click="toggleMobileSidebar"
          class="lg:hidden p-2 text-text-muted hover:text-text-main"
          data-testid="hamburger-menu-btn"
        >
          <Menu :size="24" :stroke-width="2" />
        </button>

        <div
          class="w-8 h-8 bg-primary text-primary-foreground font-heading font-black flex items-center justify-center text-lg"
          aria-hidden="true"
        >
          L
        </div>
        <div class="flex flex-col leading-tight">
          <span class="font-heading font-black tracking-tight text-base"> LEDGER </span>
          <span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
            Trading Journal · v0.1
          </span>
        </div>
      </div>

      <StatsBar v-if="showStatsBar" :stats="stats" />

      <div class="hidden md:flex items-center gap-2 font-mono text-xs text-text-muted">
        <span class="w-2 h-2 bg-success animate-pulse"></span>
        <span class="tracking-widest uppercase">Session Active</span>
      </div>
    </header>

    <!-- ===== MAIN GRID ===== -->
    <main class="flex-1 grid grid-cols-1 lg:grid-cols-11 min-h-0 relative">
      <!-- Mobile Overlay -->
      <div
        v-if="isMobileSidebarOpen"
        @click="closeMobileSidebar"
        class="fixed inset-0 bg-black/50 z-40 lg:hidden"
        data-testid="mobile-overlay"
      ></div>

      <!-- Navigation Sidebar -->
      <NavigationSidebar
        :is-mobile-open="isMobileSidebarOpen"
        @close="closeMobileSidebar"
      />

      <!-- Router View -->
      <section class="lg:col-span-10 min-h-0">
        <router-view />
      </section>
    </main>

    <!-- ===== FOOTER ===== -->
    <footer
      class="border-t border-border px-6 h-10 flex items-center justify-between text-[11px] font-mono text-text-muted tracking-widest uppercase"
      data-testid="app-footer"
    >
      <span>// In-Memory Mode · Data clears on refresh</span>
      <span class="hidden sm:inline">Made for traders who keep score</span>
    </footer>
  </div>
</template>
