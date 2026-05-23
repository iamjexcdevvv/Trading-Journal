
<script setup>
import { computed, watch, ref } from 'vue'

const props = defineProps({
  stats: { type: Object, required: true },
})

const flashTotal = ref(false)
watch(
  () => props.stats.total,
  () => {
    flashTotal.value = true
    setTimeout(() => (flashTotal.value = false), 650)
  }
)

const items = computed(() => [
  { label: 'Total', value: props.stats.total, testid: 'stat-total', tone: 'default', flash: flashTotal.value },
  { label: 'Long', value: props.stats.longs, testid: 'stat-long', tone: 'success' },
  { label: 'Short', value: props.stats.shorts, testid: 'stat-short', tone: 'danger' },
])
</script>

<template>
  <div class="hidden sm:flex items-stretch gap-0 border border-border" data-testid="stats-bar">
    <div
      v-for="(item, idx) in items"
      :key="item.label"
      :class="[
        'flex flex-col justify-center px-4 py-1.5 min-w-[88px]',
        idx !== 0 && 'border-l border-border',
        item.flash && 'stat-flash',
      ]"
      :data-testid="item.testid"
    >
      <span class="font-mono text-[9px] tracking-widest uppercase text-text-muted">
        {{ item.label }}
      </span>
      <span
        :class="[
          'font-mono font-bold text-lg tabular-nums leading-tight',
          item.tone === 'success' && 'text-success',
          item.tone === 'danger' && 'text-danger',
          item.tone === 'default' && 'text-primary',
        ]"
      >
        {{ String(item.value).padStart(2, '0') }}
      </span>
    </div>
  </div>
</template>