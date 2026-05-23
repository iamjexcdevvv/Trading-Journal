<script setup>
import { ref } from 'vue'
import AddTradeForm from './components/AddTradeForm.vue'
import TradesList from './components/TradesList.vue'
import StatsBar from './components/StatsBar.vue'
import { useTrades } from './composables/useTrades.js'

const { trades, addTrade, removeTrade, stats } = useTrades()
const lastAddedId = ref(null)

const handleAdd = (payload) => {
  addTrade(payload)
  lastAddedId.value = trades.value[0]?.id
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

      <StatsBar :stats="stats" />

      <div class="hidden md:flex items-center gap-2 font-mono text-xs text-text-muted">
        <span class="w-2 h-2 bg-success animate-pulse"></span>
        <span class="tracking-widest uppercase">Session Active</span>
      </div>
    </header>

    <!-- ===== MAIN GRID ===== -->
    <main class="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
      <!-- Sidebar / Action Zone -->
      <aside
        class="lg:col-span-4 xl:col-span-3 border-b lg:border-b-0 lg:border-r border-border bg-surface/40"
        data-testid="action-sidebar"
      >
        <AddTradeForm @submit="handleAdd" />
      </aside>

      <!-- Ledger -->
      <section class="lg:col-span-8 xl:col-span-9 grid-bg min-h-[60vh]" data-testid="ledger-area">
        <TradesList :trades="trades" :last-added-id="lastAddedId" @delete="removeTrade" />
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
