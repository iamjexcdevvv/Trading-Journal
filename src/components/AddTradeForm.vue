<script setup>
import { ref, computed } from 'vue'
import { ArrowUpRight, ArrowDownRight, Check } from 'lucide-vue-next'
import { STRATEGIES } from '../composables/useTrades.js'

const emit = defineEmits(['submit'])

const symbol = ref('')
const direction = ref('Long')
const strategy = ref('')
const notes = ref('')
const justSubmitted = ref(false)
const pnl = ref('')

const isValid = computed(() => symbol.value.trim().length > 0 && direction.value && strategy.value)

const onSubmit = () => {
  if (!isValid.value) return
  const parsedPnl = pnl.value === '' || pnl.value === '-' ? null : Number(pnl.value)
  emit('submit', {
    symbol: symbol.value.trim().toUpperCase(),
    direction: direction.value,
    strategy: strategy.value,
    notes: notes.value.trim(),
    pnl: Number.isFinite(parsedPnl) ? parsedPnl : null,
  })
  // Reset
  symbol.value = ''
  direction.value = 'Long'
  strategy.value = ''
  notes.value = ''
  justSubmitted.value = true
  pnl.value = ''
  setTimeout(() => (justSubmitted.value = false), 1200)
}
</script>

<template>
  <form
    @submit.prevent="onSubmit"
    class="p-6 flex flex-col gap-5 h-full"
    data-testid="add-trade-form"
    novalidate
  >
    <!-- Title -->
    <div class="flex items-baseline justify-between">
      <h2 class="font-heading font-black text-xl tracking-tight uppercase">New Trade</h2>
      <span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
        // INPUT
      </span>
    </div>

    <!-- Symbol -->
    <div class="flex flex-col gap-1.5">
      <label for="symbol" class="font-mono text-[10px] tracking-widest uppercase text-text-muted">
        Symbol
      </label>
      <input
        id="symbol"
        v-model="symbol"
        type="text"
        placeholder="e.g. AAPL, BTCUSDT"
        autocomplete="off"
        spellcheck="false"
        maxlength="16"
        class="bg-transparent border border-border px-3 py-2.5 font-mono text-base tracking-wider uppercase text-text-main placeholder:text-text-muted/50 placeholder:normal-case focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
        data-testid="trade-symbol-input"
      />
    </div>

    <!-- Direction toggle -->
    <div class="flex flex-col gap-1.5">
      <span class="font-mono text-[10px] tracking-widest uppercase text-text-muted">
        Direction
      </span>
      <div class="grid grid-cols-2 border border-border" data-testid="trade-direction-toggle">
        <button
          type="button"
          @click="direction = 'Long'"
          :class="[
            'flex items-center cursor-pointer justify-center gap-2 py-2.5 font-mono text-sm tracking-widest uppercase transition-colors duration-100 border-r border-border',
            direction === 'Long'
              ? 'bg-success/15 text-success'
              : 'text-text-muted hover:bg-surface-hover hover:text-text-main',
          ]"
          data-testid="direction-long-btn"
        >
          <ArrowUpRight :size="16" :stroke-width="2.5" />
          Long
        </button>
        <button
          type="button"
          @click="direction = 'Short'"
          :class="[
            'flex items-center cursor-pointer justify-center gap-2 py-2.5 font-mono text-sm tracking-widest uppercase transition-colors duration-100',
            direction === 'Short'
              ? 'bg-danger/15 text-danger'
              : 'text-text-muted hover:bg-surface-hover hover:text-text-main',
          ]"
          data-testid="direction-short-btn"
        >
          <ArrowDownRight :size="16" :stroke-width="2.5" />
          Short
        </button>
      </div>
    </div>

    <!-- Strategy -->
    <div class="flex flex-col gap-1.5">
      <label for="strategy" class="font-mono text-[10px] tracking-widest uppercase text-text-muted">
        Strategy
      </label>
      <select
        id="strategy"
        v-model="strategy"
        class="bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
        data-testid="trade-strategy-select"
      >
        <option value="" disabled class="bg-background">Select strategy…</option>
        <option v-for="s in STRATEGIES[direction]" :key="s" :value="s" class="bg-background text-text-main">
          {{ s }}
        </option>
      </select>
    </div>

    <!-- Realized PNL -->
    <div class="flex flex-col gap-1.5">
      <label for="pnl" class="font-mono text-[10px] tracking-widest uppercase text-text-muted">
        Realized PNL
      </label>
      <div class="relative">
        <span
          class="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-text-muted/60 pointer-events-none"
        >
          $
        </span>
        <input
          id="pnl"
          v-model="pnl"
          type="number"
          step="0.01"
          inputmode="decimal"
          placeholder="0.00"
          class="w-full bg-transparent border border-border pl-7 pr-3 py-2.5 font-mono text-sm tabular-nums text-text-main placeholder:text-text-muted/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
          data-testid="trade-pnl-input"
        />
      </div>
    </div>

    <!-- Notes -->
    <div class="flex flex-col gap-1.5">
      <label for="notes" class="font-mono text-[10px] tracking-widest uppercase text-text-muted">
        Notes
      </label>
      <textarea
        id="notes"
        v-model="notes"
        rows="4"
        placeholder="Setup, emotions, observations…"
        class="bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100 resize-none"
        data-testid="trade-notes-textarea"
      ></textarea>
    </div>

    <!-- Submit -->
    <button
      type="submit"
      :disabled="!isValid"
      :class="[
        'mt-auto w-full py-3.5 font-heading font-bold text-sm tracking-widest uppercase transition-all duration-100 flex items-center justify-center gap-2',
        isValid
          ? 'bg-primary text-primary-foreground hover:brightness-110 active:translate-y-px'
          : 'bg-border text-text-muted cursor-not-allowed',
      ]"
      data-testid="submit-trade-btn"
    >
      <template v-if="justSubmitted">
        <Check :size="16" :stroke-width="3" />
        Logged
      </template>
      <template v-else> Log Trade → </template>
    </button>
  </form>
</template>
