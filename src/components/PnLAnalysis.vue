<script setup>
import { computed } from 'vue'
import { TrendingUp, TrendingDown, Target, DollarSign, BarChart3 } from 'lucide-vue-next'

const props = defineProps({
  trades: { type: Array, required: true },
})

const hasTrades = computed(() => props.trades.length > 0)

const pnlStats = computed(() => {
  const tradesWithPnl = props.trades.filter((t) => t.pnl !== null && t.pnl !== undefined)
  const totalTrades = tradesWithPnl.length
  
  if (totalTrades === 0) {
    return {
      totalPnl: 0,
      winRate: 0,
      averageWin: 0,
      averageLoss: 0,
      totalWins: 0,
      totalLosses: 0,
      largestWin: 0,
      largestLoss: 0,
    }
  }

  const wins = tradesWithPnl.filter((t) => t.pnl > 0)
  const losses = tradesWithPnl.filter((t) => t.pnl < 0)
  
  const totalPnl = tradesWithPnl.reduce((sum, t) => sum + t.pnl, 0)
  const totalWins = wins.length
  const totalLosses = losses.length
  const winRate = (totalWins / totalTrades) * 100
  
  const averageWin = totalWins > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / totalWins : 0
  const averageLoss = totalLosses > 0 ? losses.reduce((sum, t) => sum + t.pnl, 0) / totalLosses : 0
  
  const largestWin = wins.length > 0 ? Math.max(...wins.map((t) => t.pnl)) : 0
  const largestLoss = losses.length > 0 ? Math.min(...losses.map((t) => t.pnl)) : 0

  return {
    totalPnl,
    winRate,
    averageWin,
    averageLoss,
    totalWins,
    totalLosses,
    largestWin,
    largestLoss,
  }
})

const strategyBreakdown = computed(() => {
  const breakdown = {}
  props.trades.forEach((trade) => {
    if (!breakdown[trade.strategy]) {
      breakdown[trade.strategy] = {
        total: 0,
        pnl: 0,
        wins: 0,
        losses: 0,
      }
    }
    breakdown[trade.strategy].total++
    if (trade.pnl !== null && trade.pnl !== undefined) {
      breakdown[trade.strategy].pnl += trade.pnl
      if (trade.pnl > 0) breakdown[trade.strategy].wins++
      if (trade.pnl < 0) breakdown[trade.strategy].losses++
    }
  })
  return Object.entries(breakdown).map(([strategy, data]) => ({
    strategy,
    ...data,
    winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
  }))
})

const directionBreakdown = computed(() => {
  const longs = props.trades.filter((t) => t.direction === 'Long')
  const shorts = props.trades.filter((t) => t.direction === 'Short')
  
  const longPnl = longs.reduce((sum, t) => sum + (t.pnl || 0), 0)
  const shortPnl = shorts.reduce((sum, t) => sum + (t.pnl || 0), 0)
  
  return {
    long: { count: longs.length, pnl: longPnl },
    short: { count: shorts.length, pnl: shortPnl },
  }
})

const formatPnl = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '$0.00'
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sign}$${abs}`
}

const formatPercent = (n) => {
  return `${n.toFixed(1)}%`
}

const getBarWidth = (value, max) => {
  if (max === 0) return 0
  return Math.abs((value / max) * 100)
}

const maxStrategyPnl = computed(() => {
  const values = strategyBreakdown.value.map((s) => Math.abs(s.pnl))
  return values.length > 0 ? Math.max(...values) : 1
})
</script>

<template>
  <div class="h-full flex flex-col" data-testid="pnl-analysis">
    <!-- Header -->
    <div
      class="lg:ml-34 px-6 h-12 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur"
    >
      <div class="flex items-center gap-3">
        <span class="font-heading font-black text-sm tracking-widest uppercase"> PnL Analysis </span>
        <span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
          {{ trades.length }} {{ trades.length === 1 ? 'trade' : 'trades' }}
        </span>
      </div>
      <span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
        // ANALYTICS
      </span>
    </div>

    <!-- Empty state -->
    <div
      v-if="!hasTrades"
      class="flex-1 flex items-center justify-center px-6"
      data-testid="empty-state"
    >
      <div class="text-center max-w-md">
        <div
          class="font-mono text-xs text-text-muted tracking-widest mb-6 inline-block border border-border px-3 py-1 uppercase"
        >
          status :: no data
        </div>
        <pre
          class="font-mono text-[10px] sm:text-xs text-text-muted/60 leading-tight mb-8 select-none"
        >
 ┌─────────────────────────────┐
 │   NO TRADES TO ANALYZE       │
 │   LOG TRADES TO SEE STATS    │
 └─────────────────────────────┘</pre
        >
        <p class="font-mono text-sm text-primary cursor-blink tracking-wider">waiting</p>
        <p class="mt-6 font-sans text-sm text-text-muted">
          Navigate to Trade Logging to add trades.
          <br />
          Analytics will appear here automatically.
        </p>
      </div>
    </div>

    <!-- Content -->
    <div v-else class="lg:ml-34 flex-1 overflow-auto p-6">
      <!-- Overview Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <!-- Total PnL -->
        <div
          class="border border-border bg-surface/40 p-4"
          data-testid="stat-total-pnl"
        >
          <div class="flex items-center gap-2 mb-2">
            <DollarSign :size="16" :stroke-width="2" class="text-text-muted" />
            <span class="font-mono text-[10px] tracking-widest uppercase text-text-muted">
              Total PnL
            </span>
          </div>
          <span
            :class="[
              'font-mono font-bold text-2xl tabular-nums',
              pnlStats.totalPnl > 0 && 'text-success',
              pnlStats.totalPnl < 0 && 'text-danger',
              pnlStats.totalPnl === 0 && 'text-text-muted',
            ]"
          >
            {{ formatPnl(pnlStats.totalPnl) }}
          </span>
        </div>

        <!-- Win Rate -->
        <div class="border border-border bg-surface/40 p-4" data-testid="stat-win-rate">
          <div class="flex items-center gap-2 mb-2">
            <Target :size="16" :stroke-width="2" class="text-text-muted" />
            <span class="font-mono text-[10px] tracking-widest uppercase text-text-muted">
              Win Rate
            </span>
          </div>
          <span class="font-mono font-bold text-2xl tabular-nums text-primary">
            {{ formatPercent(pnlStats.winRate) }}
          </span>
        </div>

        <!-- Average Win -->
        <div class="border border-border bg-surface/40 p-4" data-testid="stat-avg-win">
          <div class="flex items-center gap-2 mb-2">
            <TrendingUp :size="16" :stroke-width="2" class="text-success" />
            <span class="font-mono text-[10px] tracking-widest uppercase text-text-muted">
              Avg Win
            </span>
          </div>
          <span class="font-mono font-bold text-2xl tabular-nums text-success">
            {{ formatPnl(pnlStats.averageWin) }}
          </span>
        </div>

        <!-- Average Loss -->
        <div class="border border-border bg-surface/40 p-4" data-testid="stat-avg-loss">
          <div class="flex items-center gap-2 mb-2">
            <TrendingDown :size="16" :stroke-width="2" class="text-danger" />
            <span class="font-mono text-[10px] tracking-widest uppercase text-text-muted">
              Avg Loss
            </span>
          </div>
          <span class="font-mono font-bold text-2xl tabular-nums text-danger">
            {{ formatPnl(pnlStats.averageLoss) }}
          </span>
        </div>
      </div>

      <!-- Additional Stats -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <!-- Direction Breakdown -->
        <div class="border border-border bg-surface/40 p-4" data-testid="direction-breakdown">
          <div class="flex items-center gap-2 mb-4">
            <BarChart3 :size="16" :stroke-width="2" class="text-text-muted" />
            <span class="font-heading font-black text-sm tracking-widest uppercase">
              Direction Breakdown
            </span>
          </div>
          <div class="space-y-4">
            <!-- Long -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="font-mono text-xs text-text-muted tracking-wider uppercase">
                  Long
                </span>
                <span class="font-mono text-xs text-text-muted">
                  {{ directionBreakdown.long.count }} trades
                </span>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex-1 h-2 bg-border rounded-full overflow-hidden">
                  <div
                    class="h-full bg-success transition-all duration-300"
                    :style="{
                      width: `${getBarWidth(directionBreakdown.long.pnl, maxStrategyPnl)}%`,
                    }"
                  ></div>
                </div>
                <span
                  :class="[
                    'font-mono text-xs tabular-nums',
                    directionBreakdown.long.pnl > 0 && 'text-success',
                    directionBreakdown.long.pnl < 0 && 'text-danger',
                  ]"
                >
                  {{ formatPnl(directionBreakdown.long.pnl) }}
                </span>
              </div>
            </div>
            <!-- Short -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="font-mono text-xs text-text-muted tracking-wider uppercase">
                  Short
                </span>
                <span class="font-mono text-xs text-text-muted">
                  {{ directionBreakdown.short.count }} trades
                </span>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex-1 h-2 bg-border rounded-full overflow-hidden">
                  <div
                    class="h-full bg-danger transition-all duration-300"
                    :style="{
                      width: `${getBarWidth(directionBreakdown.short.pnl, maxStrategyPnl)}%`,
                    }"
                  ></div>
                </div>
                <span
                  :class="[
                    'font-mono text-xs tabular-nums',
                    directionBreakdown.short.pnl > 0 && 'text-success',
                    directionBreakdown.short.pnl < 0 && 'text-danger',
                  ]"
                >
                  {{ formatPnl(directionBreakdown.short.pnl) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Performance Summary -->
        <div class="border border-border bg-surface/40 p-4" data-testid="performance-summary">
          <div class="flex items-center gap-2 mb-4">
            <Target :size="16" :stroke-width="2" class="text-text-muted" />
            <span class="font-heading font-black text-sm tracking-widest uppercase">
              Performance Summary
            </span>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <span class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1">
                Total Wins
              </span>
              <span class="font-mono font-bold text-lg tabular-nums text-success">
                {{ pnlStats.totalWins }}
              </span>
            </div>
            <div>
              <span class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1">
                Total Losses
              </span>
              <span class="font-mono font-bold text-lg tabular-nums text-danger">
                {{ pnlStats.totalLosses }}
              </span>
            </div>
            <div>
              <span class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1">
                Largest Win
              </span>
              <span class="font-mono font-bold text-lg tabular-nums text-success">
                {{ formatPnl(pnlStats.largestWin) }}
              </span>
            </div>
            <div>
              <span class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1">
                Largest Loss
              </span>
              <span class="font-mono font-bold text-lg tabular-nums text-danger">
                {{ formatPnl(pnlStats.largestLoss) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Strategy Breakdown -->
      <div class="border border-border bg-surface/40 p-4" data-testid="strategy-breakdown">
        <div class="flex items-center gap-2 mb-4">
          <BarChart3 :size="16" :stroke-width="2" class="text-text-muted" />
          <span class="font-heading font-black text-sm tracking-widest uppercase">
            Strategy Breakdown
          </span>
        </div>
        <div class="space-y-3">
          <div
            v-for="item in strategyBreakdown"
            :key="item.strategy"
            class="border-b border-border/60 pb-3 last:border-0 last:pb-0"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="font-sans text-sm text-text-main">{{ item.strategy }}</span>
              <div class="flex items-center gap-4">
                <span class="font-mono text-xs text-text-muted">
                  {{ item.total }} trades
                </span>
                <span class="font-mono text-xs text-text-muted">
                  {{ formatPercent(item.winRate) }} win rate
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex-1 h-2 bg-border rounded-full overflow-hidden">
                <div
                  :class="[
                    'h-full transition-all duration-300',
                    item.pnl > 0 ? 'bg-success' : 'bg-danger',
                  ]"
                  :style="{ width: `${getBarWidth(item.pnl, maxStrategyPnl)}%` }"
                ></div>
              </div>
              <span
                :class="[
                  'font-mono text-xs tabular-nums',
                  item.pnl > 0 && 'text-success',
                  item.pnl < 0 && 'text-danger',
                ]"
              >
                {{ formatPnl(item.pnl) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
